import { useCallback, useEffect, useRef, useState } from 'react';
import { trackPageView } from '../../../shared/analytics/analytics';
import { AppDialog, FloatingToolbar, ToolbarArrowLeftIcon, ToolbarArrowRightIcon, ToolbarDocumentIcon, useToast } from '../../../shared/ui';
import type { FloatingToolbarGroup } from '../../../shared/ui';
import type { SectionId } from '../../../shared/types/navigation';
import type { OutlineItem, WordExportProgressEvent } from '../../../shared/types';
import type { ExportTemplateRecord } from '../../../shared/types/exportFormat';
import { DEFAULT_EXPORT_FORMAT } from '../../../shared/types/exportFormat';
import CompanyInfoPage from './CompanyInfoPage';
import ReportConfigPage from './ReportConfigPage';
import OutlinePage from './OutlinePage';
import ContentPage from './ContentPage';
import GreenReportList from './GreenReportList';
import type { GreenBackgroundTaskState, GreenDocumentStyle, GreenProjectInfo, GreenReportState, GreenReportStep, GreenReportSummary, GreenReportType } from '../types';
import { DEFAULT_GREEN_PROJECT_INFO, GREEN_STEPS, GREEN_STEP_LABELS, getLocalDateString } from '../types';
import { resolveReportTypeName } from '../reportTypes';

interface GreenReportHomeProps {
  registerLeaveGuard?: (guard: ((nextSection?: string) => Promise<boolean>) | null) => void;
  onSectionChange?: (section: SectionId) => void;
}

const emptyState: GreenReportState = {
  reportId: '',
  step: 'company-info',
  reportType: 'esg',
  projectInfo: DEFAULT_GREEN_PROJECT_INFO,
  targetWords: 20000,
  pageCount: 30,
  documentStyle: 'standard',
  templateId: null,
  knowledgeContext: null,
  outlineData: null,
};

const initialExportProgress = {
  running: false,
  progress: 0,
  message: '',
  error: '',
  filePath: '',
};

const SKIP_COVER_FRONT_MATTER_KEY = 'green-report.skip-cover-frontmatter';

function readSkipCoverFrontMatter() {
  try {
    const raw = localStorage.getItem(SKIP_COVER_FRONT_MATTER_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

function withCompileDate(projectInfo?: Partial<GreenProjectInfo>): GreenProjectInfo {
  const merged = { ...DEFAULT_GREEN_PROJECT_INFO, ...(projectInfo || {}) };
  if (!merged.compileDate) merged.compileDate = getLocalDateString();
  // 历史报告未填写编制单位时，回显默认编制单位
  if (!merged.compileUnit) merged.compileUnit = DEFAULT_GREEN_PROJECT_INFO.compileUnit;
  return merged;
}

function GreenReportHome({ onSectionChange }: GreenReportHomeProps) {
  const { showToast } = useToast();
  const [view, setView] = useState<'list' | 'wizard'>('list');
  const [reports, setReports] = useState<GreenReportSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [reportId, setReportId] = useState('');
  const reportIdRef = useRef('');
  const [state, setState] = useState<GreenReportState>(emptyState);
  const [draftProjectInfo, setDraftProjectInfo] = useState<GreenProjectInfo>(DEFAULT_GREEN_PROJECT_INFO);
  const [draftPageCount, setDraftPageCount] = useState(30);
  const [draftDocumentStyle, setDraftDocumentStyle] = useState<GreenDocumentStyle>('standard');
  const [draftTargetWords, setDraftTargetWords] = useState(20000);
  const [draftTemplateId, setDraftTemplateId] = useState<string | null>(null);
  const [skipCoverFrontMatter, setSkipCoverFrontMatter] = useState(readSkipCoverFrontMatter);
  const [templates, setTemplates] = useState<ExportTemplateRecord[]>([]);
  const [wordExportProgress, setWordExportProgress] = useState(initialExportProgress);
  const [pdfExportProgress, setPdfExportProgress] = useState(initialExportProgress);
  const [pendingDeleteReport, setPendingDeleteReport] = useState<GreenReportSummary | null>(null);
  const [pendingGenerateReport, setPendingGenerateReport] = useState<GreenReportSummary | null>(null);
  const [exportingReportId, setExportingReportId] = useState('');
  const [generatingReportId, setGeneratingReportId] = useState('');

  useEffect(() => {
    trackPageView('green-report');
  }, []);

  const refreshReports = useCallback(async () => {
    try {
      const items = await window.lvcert?.greenReport?.list();
      setReports(items || []);
    } catch (error) {
      showToast(`读取报告列表失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setListLoading(false);
    }
  }, [showToast]);

  // 用主进程内存中的活动任务覆盖数据库里的旧进度，进入列表/详情无需等待事件响应即可回显。
  const overlayActiveTasks = useCallback(async () => {
    try {
      const active = await window.lvcert?.tasks?.getActiveTasks();
      if (!Array.isArray(active) || !active.length) return;
      const greenTasks = active.filter((task) => task?.report_id && String(task.type || '').startsWith('green-report-'));
      if (!greenTasks.length) return;
      setReports((prev) => prev.map((item) => {
        const related = greenTasks.filter((task) => task.report_id === item.id);
        if (!related.length) return item;
        const primary = related.find((task) => task.status === 'running') || related[0];
        const progress = related.reduce((max, task) => Math.max(max, Number(task.progress) || 0), 0);
        return {
          ...item,
          status: primary.status || item.status,
          progress,
          updatedAt: primary.updated_at || item.updatedAt,
        };
      }));
      const currentId = reportIdRef.current;
      if (!currentId) return;
      const related = greenTasks.filter((task) => task.report_id === currentId);
      if (!related.length) return;
      setState((prev) => {
        const patch: Partial<GreenReportState> = {};
        related.forEach((task) => {
          if (task.type === 'green-report-outline') patch.outlineTask = task as GreenBackgroundTaskState;
          if (task.type === 'green-report-content') patch.contentTask = task as GreenBackgroundTaskState;
        });
        return { ...prev, ...patch };
      });
    } catch {
      // 读取失败时保留数据库回显值
    }
  }, []);

  useEffect(() => {
    void refreshReports().then(() => overlayActiveTasks());
    window.lvcert?.templates?.list().then((items) => setTemplates(items || [])).catch(() => undefined);
  }, [refreshReports, overlayActiveTasks]);

  const hydrateState = useCallback((nextState: GreenReportState) => {
    const loadedProjectInfo = withCompileDate(nextState.projectInfo);
    setState({ ...nextState, projectInfo: loadedProjectInfo });
    setDraftProjectInfo(loadedProjectInfo);
    setDraftPageCount(nextState.pageCount ?? 30);
    setDraftDocumentStyle(nextState.documentStyle ?? 'standard');
    setDraftTargetWords(nextState.targetWords ?? 20000);
    setDraftTemplateId(nextState.templateId ?? null);
  }, []);

  const openReport = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const nextState = await window.lvcert?.greenReport?.loadState(id);
      if (!nextState) {
        showToast('报告不存在或已被删除', 'error');
        void refreshReports();
        return;
      }
      reportIdRef.current = id;
      setReportId(id);
      hydrateState(nextState);
      setView('wizard');
      // 立即用内存中的任务进度覆盖数据库回显，避免等待下一次任务事件
      void overlayActiveTasks();
    } catch (error) {
      showToast(`打开报告失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }, [hydrateState, overlayActiveTasks, refreshReports, showToast]);

  const handleCreateReport = useCallback(async () => {
    try {
      const nextState = await window.lvcert?.greenReport?.create({ reportType: 'esg' });
      if (!nextState?.reportId) {
        showToast('新建报告失败', 'error');
        return;
      }
      reportIdRef.current = nextState.reportId;
      setReportId(nextState.reportId);
      hydrateState(nextState);
      setView('wizard');
      void refreshReports();
    } catch (error) {
      showToast(`新建报告失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }, [hydrateState, refreshReports, showToast]);

  const handleBackToList = useCallback(() => {
    setView('list');
    setExportingReportId('');
    void refreshReports().then(() => overlayActiveTasks());
  }, [overlayActiveTasks, refreshReports]);

  useEffect(() => {
    const tasks = window.lvcert?.tasks;
    if (!tasks) return undefined;
    const off = tasks.onTaskEvent((event) => {
      const eventReportId = event.reportId || event.task?.report_id || '';
      if (eventReportId) {
        setReports((prev) => prev.map((item) => (item.id === eventReportId
          ? {
            ...item,
            status: event.task?.status || item.status,
            progress: event.task?.progress ?? item.progress,
            updatedAt: event.task?.updated_at || item.updatedAt,
          }
          : item)));
      }
      // 任何报告进入终态都刷新列表，确保后台完成的报告状态与按钮同步
      const status = event.task?.status;
      if (status === 'success' || status === 'error' || status === 'cancelled') {
        void refreshReports();
      }
      const patch = event.greenReportPatch;
      if (!patch || !eventReportId || eventReportId !== reportIdRef.current) return;
      setState((prev) => ({ ...prev, ...patch, reportId: eventReportId }));
    });
    return off;
  }, [refreshReports]);

  useEffect(() => {
    const ex = window.lvcert?.export;
    if (!ex) return undefined;
    const off = ex.onWordExportProgress((event: WordExportProgressEvent) => {
      setWordExportProgress({
        running: event.phase === 'running',
        progress: event.progress,
        message: event.message,
        error: event.phase === 'error' ? event.message : '',
        filePath: '',
      });
      if (event.phase === 'success') {
        showToast(event.message || 'Word 已导出', 'success');
      } else if (event.phase === 'error') {
        showToast(event.message || '导出失败', 'error');
      }
    });
    return off;
  }, [showToast]);

  useEffect(() => {
    const ex = window.lvcert?.export;
    if (!ex) return undefined;
    const off = ex.onPdfExportProgress((event: WordExportProgressEvent) => {
      setPdfExportProgress({
        running: event.phase === 'running',
        progress: event.progress,
        message: event.message,
        error: event.phase === 'error' ? event.message : '',
        filePath: '',
      });
      if (event.phase === 'success') {
        showToast(event.message || 'PDF 已导出', 'success');
      } else if (event.phase === 'error') {
        showToast(event.message || 'PDF 导出失败', 'error');
      }
    });
    return off;
  }, [showToast]);

  const stepIndex = GREEN_STEPS.indexOf(state.step);
  const canGoBack = stepIndex > 0;
  const canGoForward = stepIndex < GREEN_STEPS.length - 1;

  // 步骤切换：先更新本地状态保证 UI 立即响应，再异步 IPC 持久化
  const handleStepChange = useCallback((direction: 'prev' | 'next') => {
    const nextIndex = direction === 'next' ? stepIndex + 1 : stepIndex - 1;
    if (nextIndex < 0 || nextIndex >= GREEN_STEPS.length) return;
    const nextStep = GREEN_STEPS[nextIndex];
    setState((prev) => ({ ...prev, step: nextStep }));
    if (reportIdRef.current) {
      void window.lvcert?.greenReport?.updateStep(reportIdRef.current, nextStep).catch(() => undefined);
    }
  }, [stepIndex]);

  const handleSaveReportConfig = useCallback(async () => {
    const patch = {
      targetWords: draftTargetWords,
      pageCount: draftPageCount,
      documentStyle: draftDocumentStyle,
      templateId: draftTemplateId,
    };
    setState((prev) => ({ ...prev, ...patch }));
    if (!reportIdRef.current) return;
    try {
      await window.lvcert?.greenReport?.saveReportConfig(reportIdRef.current, patch);
      showToast('报告配置已保存', 'success');
    } catch (error) {
      showToast(`保存失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }, [draftTargetWords, draftPageCount, draftDocumentStyle, draftTemplateId, showToast]);

  // 生成前同步企业信息：用户可能改了委托单位但没点“保存信息”，
  // 若不落库，后台仍会按上一家公司的知识库文件夹取资料，导致跨企业串数据。
  const syncProjectInfoBeforeGenerate = useCallback(async (): Promise<{ projectInfo: GreenProjectInfo; outlineCleared: boolean }> => {
    const savedProjectInfo = state.projectInfo;
    if (!reportIdRef.current) return { projectInfo: savedProjectInfo, outlineCleared: false };
    const draft = draftProjectInfo;
    const normalize = (value?: string) => String(value || '').trim();
    const companyChanged = normalize(draft.companyName) !== normalize(savedProjectInfo.companyName);
    const industryChanged = normalize(draft.industry) !== normalize(savedProjectInfo.industry);
    if (!companyChanged && !industryChanged) {
      return { projectInfo: savedProjectInfo, outlineCleared: false };
    }
    setState((prev) => ({ ...prev, projectInfo: draft, knowledgeContext: null }));
    try {
      const saved = await window.lvcert?.greenReport?.saveProjectInfo(reportIdRef.current, draft);
      if (saved) {
        // 委托单位变更时后端会清空旧目录/正文，这里同步清空前端状态
        setState((prev) => ({
          ...prev,
          projectInfo: saved.projectInfo || draft,
          step: saved.step || prev.step,
          knowledgeContext: null,
          outlineData: saved.outlineData ?? null,
          outlineTask: saved.outlineTask,
          contentTask: saved.contentTask,
          status: saved.status,
          progress: saved.progress,
        }));
      }
      if (companyChanged) {
        showToast('委托单位已变更，旧目录和正文已自动清空', 'info');
      }
      return { projectInfo: saved?.projectInfo || draft, outlineCleared: companyChanged };
    } catch (error) {
      showToast(`保存企业信息失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    }
    return { projectInfo: draft, outlineCleared: false };
  }, [draftProjectInfo, state.projectInfo, showToast]);

  const handleSkipCoverFrontMatterChange = useCallback((value: boolean) => {
    setSkipCoverFrontMatter(value);
    try {
      localStorage.setItem(SKIP_COVER_FRONT_MATTER_KEY, String(value));
    } catch {
      // 本地偏好写入失败不影响导出
    }
  }, []);

  const buildExportPayload = useCallback(async (targetState: GreenReportState) => {
    // 报告标题用用户勾选的报告类型名称（自定义类型取用户输入的名称）
    const reportTitle = resolveReportTypeName(targetState.reportType) || '绿色报告';
    // 委托单位即企业名称（全局唯一企业标识字段，UI 上已合并）
    const clientUnit = targetState.projectInfo.companyName || '';

    // 若选中了模板，从模板库取完整 config；否则用绿色报告默认页眉页脚
    let exportFormat = DEFAULT_EXPORT_FORMAT;
    if (targetState.templateId) {
      const template = await window.lvcert?.templates?.get(targetState.templateId);
      if (template?.config) exportFormat = template.config;
    } else {
      exportFormat = {
        ...DEFAULT_EXPORT_FORMAT,
        page: {
          ...DEFAULT_EXPORT_FORMAT.page,
          header_enabled: true,
          header_text: [clientUnit, reportTitle].filter(Boolean).join('  '),
          footer_enabled: true,
          footer_text: '',
          page_number_enabled: true,
          page_number_format: '第{page}页，共{pages}页',
        },
      };
    }

    // 报告编号为空时自动生成；编制日期为空时默认今天
    let reportCode = targetState.projectInfo.reportCode;
    if (!reportCode) {
      reportCode = await window.lvcert?.greenReport?.generateReportCode();
    }
    // 编制日期格式为"YYYY年M月"（不到具体日）
    const rawDate = targetState.projectInfo.compileDate || getLocalDateString();
    const [rawYear, rawMonth] = rawDate.split('-').map(Number);
    const compileDate = Number.isFinite(rawYear) && Number.isFinite(rawMonth)
      ? `${rawYear}年${rawMonth}月`
      : rawDate;

    const publicityPlatforms = String(targetState.projectInfo.publicityPlatformsText || '')
      .split(/\r?\n/)
      .map((line) => {
        const [name, url] = line.split('|').map((part) => part.trim());
        return name ? { name, url: url || '' } : null;
      })
      .filter((item): item is { name: string; url: string } => Boolean(item));

    return {
      reportTitle,
      clientUnit,
      reportCode: reportCode || '',
      publicityPlatforms,
      payload: {
        project_name: targetState.projectInfo.companyName || '绿色报告',
        outline: targetState.outlineData?.outline || [],
        export_format: exportFormat,
        cover_template: 'green-report',
        skip_cover_frontmatter: skipCoverFrontMatter,
        cover_fields: {
          clientUnit,
          reportCode: reportCode || '',
          compileUnit: targetState.projectInfo.compileUnit || '',
          compileDate,
          reportTitle,
        },
        reporting_period: targetState.projectInfo.reportingPeriod || '',
        report_scope: targetState.projectInfo.reportScope || '',
        company_name: targetState.projectInfo.companyName || '',
        report_type_name: reportTitle,
        publicity_platforms: publicityPlatforms,
      },
    };
  }, [skipCoverFrontMatter]);

  const handleExportWord = useCallback(async () => {
    if (!state.outlineData?.outline?.length) {
      showToast('请先生成报告目录和正文', 'error');
      return;
    }
    setWordExportProgress({ ...initialExportProgress, running: true, message: '正在准备导出...' });
    try {
      const { payload } = await buildExportPayload(state);
      const result = await window.lvcert.export.exportWord(payload);
      if (result.success && result.path) {
        setWordExportProgress((prev) => ({ ...prev, filePath: result.path as string }));
      }
    } catch (error) {
      showToast(`导出 Word 失败：${error instanceof Error ? error.message : String(error)}`, 'error');
      setWordExportProgress(initialExportProgress);
    }
  }, [buildExportPayload, state, showToast]);

  const handleExportPdf = useCallback(async () => {
    if (!state.outlineData?.outline?.length) {
      showToast('请先生成报告目录和正文', 'error');
      return;
    }
    setPdfExportProgress({ ...initialExportProgress, running: true, message: '正在准备导出...' });
    try {
      const { payload } = await buildExportPayload(state);
      const result = await window.lvcert.export.exportPdf(payload);
      if (result.success && result.path) {
        setPdfExportProgress((prev) => ({ ...prev, filePath: result.path as string }));
      }
    } catch (error) {
      showToast(`导出 PDF 失败：${error instanceof Error ? error.message : String(error)}`, 'error');
      setPdfExportProgress(initialExportProgress);
    }
  }, [buildExportPayload, state, showToast]);

  const handleListExportWord = useCallback(async (report: GreenReportSummary) => {
    setExportingReportId(report.id);
    try {
      const targetState = await window.lvcert?.greenReport?.loadState(report.id);
      if (!targetState?.outlineData?.outline?.length) {
        showToast('该报告还没有生成正文', 'error');
        return;
      }
      const { payload } = await buildExportPayload({
        ...targetState,
        projectInfo: withCompileDate(targetState.projectInfo),
      });
      await window.lvcert.export.exportWord(payload);
    } catch (error) {
      showToast(`导出 Word 失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setExportingReportId('');
    }
  }, [buildExportPayload, showToast]);

  // 列表页直接提交正文生成：读取该报告目录后按原配置发起任务
  const runListGenerateContent = useCallback(async (report: GreenReportSummary) => {
    setGeneratingReportId(report.id);
    try {
      const targetState = await window.lvcert?.greenReport?.loadState(report.id);
      if (!targetState?.outlineData?.outline?.length) {
        showToast('该报告还没有目录，请打开后先生成目录', 'error');
        return;
      }
      await window.lvcert.tasks.startGreenReportContent({
        reportId: report.id,
        reportType: targetState.reportType,
        reportTypeName: resolveReportTypeName(targetState.reportType),
        projectInfo: withCompileDate(targetState.projectInfo),
        outlineData: targetState.outlineData,
        targetWords: targetState.targetWords,
        pageCount: targetState.pageCount,
        documentStyle: targetState.documentStyle,
        userRequirements: targetState.contentRequirements || '',
      });
      showToast('正文生成已提交，可继续操作其他报告', 'success');
      void refreshReports().then(() => overlayActiveTasks());
    } catch (error) {
      showToast(`提交生成失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setGeneratingReportId('');
    }
  }, [overlayActiveTasks, refreshReports, showToast]);

  const handleListGenerateContent = useCallback((report: GreenReportSummary) => {
    // 已完成报告重新生成会覆盖现有正文，先让用户确认
    if (report.status === 'success') {
      setPendingGenerateReport(report);
      return;
    }
    void runListGenerateContent(report);
  }, [runListGenerateContent]);

  const handleConfirmGenerateContent = useCallback(() => {
    const target = pendingGenerateReport;
    setPendingGenerateReport(null);
    if (target) void runListGenerateContent(target);
  }, [pendingGenerateReport, runListGenerateContent]);

  const handleCancelReport = useCallback(async (report: GreenReportSummary) => {
    try {
      const result = await window.lvcert?.tasks?.cancelGreenReport(report.id);
      if (result?.success) {
        showToast('已取消生成', 'success');
      } else if (result?.message) {
        showToast(result.message, 'info');
      }
      void refreshReports();
    } catch (error) {
      showToast(`取消失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }, [refreshReports, showToast]);

  const handleDeleteReport = useCallback(async () => {
    if (!pendingDeleteReport) return;
    try {
      const result = await window.lvcert?.greenReport?.delete(pendingDeleteReport.id);
      if (result?.success) {
        showToast('报告已删除', 'success');
        if (pendingDeleteReport.id === reportIdRef.current) {
          reportIdRef.current = '';
          setReportId('');
          setView('list');
        }
        void refreshReports();
      } else {
        showToast(result?.message || '删除失败', 'error');
      }
    } catch (error) {
      showToast(`删除失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setPendingDeleteReport(null);
    }
  }, [pendingDeleteReport, refreshReports, showToast]);

  if (view === 'list') {
    return (
      <>
        <GreenReportList
          reports={reports}
          loading={listLoading}
          exportingId={exportingReportId}
          generatingId={generatingReportId}
          onCreate={handleCreateReport}
          onOpen={openReport}
          onDelete={setPendingDeleteReport}
          onCancel={handleCancelReport}
          onExportWord={handleListExportWord}
          onGenerateContent={handleListGenerateContent}
        />
        <AppDialog
          open={Boolean(pendingGenerateReport)}
          onOpenChange={(open) => { if (!open) setPendingGenerateReport(null); }}
          title="重新生成正文"
          description={pendingGenerateReport
            ? `该报告已生成过正文，重新生成会清空并覆盖现有内容，确定继续吗？`
            : ''}
          actions={(
            <>
              <button className="secondary-action" onClick={() => setPendingGenerateReport(null)}>取消</button>
              <button className="primary-action" onClick={handleConfirmGenerateContent}>确认生成</button>
            </>
          )}
        />
        <AppDialog
          open={Boolean(pendingDeleteReport)}
          onOpenChange={(open) => { if (!open) setPendingDeleteReport(null); }}
          title="删除报告"
          description={pendingDeleteReport
            ? `确定删除“${pendingDeleteReport.companyName || '未填写委托单位'}”这份报告吗？目录和正文会一并删除，且不可恢复。`
            : ''}
          actions={(
            <>
              <button className="secondary-action" onClick={() => setPendingDeleteReport(null)}>取消</button>
              <button className="danger-action" onClick={() => void handleDeleteReport()}>删除</button>
            </>
          )}
        />
      </>
    );
  }

  const toolbarGroups: FloatingToolbarGroup[] = [
    {
      id: 'navigation',
      actions: [
        {
          id: 'back-to-list',
          label: '返回列表',
          icon: <ToolbarArrowLeftIcon />,
          onClick: handleBackToList,
        },
        {
          id: 'prev',
          label: '上一步',
          icon: <ToolbarArrowLeftIcon />,
          disabled: !canGoBack,
          onClick: () => handleStepChange('prev'),
        },
        {
          id: 'next',
          label: '下一步',
          icon: <ToolbarArrowRightIcon />,
          disabled: !canGoForward,
          onClick: () => handleStepChange('next'),
        },
      ],
    },
    {
      id: 'export',
      actions: [
        {
          id: 'export-word',
          label: '导出 Word',
          icon: <ToolbarDocumentIcon />,
          disabled: !state.outlineData?.outline?.length || wordExportProgress.running || pdfExportProgress.running,
          onClick: handleExportWord,
        },
        {
          id: 'export-pdf',
          label: '导出 PDF',
          icon: <ToolbarDocumentIcon />,
          disabled: !state.outlineData?.outline?.length || wordExportProgress.running || pdfExportProgress.running,
          onClick: handleExportPdf,
        },
      ],
    },
  ];

  return (
    <div className="green-report">
      <div className="green-report-stepper">
        {GREEN_STEPS.map((step, i) => {
          const isCurrent = i === stepIndex;
          const isDone = i < stepIndex;
          return (
            <div
              key={step}
              className={[
                'green-report-step',
                isCurrent ? 'is-current' : '',
                isDone ? 'is-done' : '',
                'is-clickable',
              ].filter(Boolean).join(' ')}
              onClick={() => {
                if (isCurrent) return;
                setState((prev) => ({ ...prev, step }));
                if (reportIdRef.current) {
                  void window.lvcert?.greenReport?.updateStep(reportIdRef.current, step).catch(() => undefined);
                }
              }}
            >
              <span className="green-report-step-number">{isDone ? '✓' : i + 1}</span>
              {GREEN_STEP_LABELS[step]}
            </div>
          );
        })}
      </div>

      <div className="green-report-body">
        {state.step === 'company-info' && (
          <CompanyInfoPage
            state={state}
            draftProjectInfo={draftProjectInfo}
            onDraftChange={setDraftProjectInfo}
            onReportTypeChange={(reportType: GreenReportType) => {
              setState((prev) => ({ ...prev, reportType }));
              if (reportIdRef.current) {
                void window.lvcert?.greenReport?.saveReportType(reportIdRef.current, reportType).catch(() => undefined);
              }
              // 切换报告类型时自动刷新报告编号
              void window.lvcert?.greenReport?.generateReportCode().then((newCode) => {
                if (newCode) {
                  setDraftProjectInfo((prev) => ({ ...prev, reportCode: newCode }));
                }
              });
            }}
            onSaveProjectInfo={async () => {
              if (!draftProjectInfo.companyName?.trim()) {
                showToast('请填写委托单位（必填）', 'error');
                return;
              }
              if (!draftProjectInfo.compileUnit?.trim()) {
                showToast('请填写编制单位（必填）', 'error');
                return;
              }
              if (!draftProjectInfo.compileDate) {
                showToast('请选择编制日期（必填）', 'error');
                return;
              }
              // 每次保存企业信息都自动刷新报告编号，确保每份报告唯一
              const newCode = await window.lvcert?.greenReport?.generateReportCode();
              const finalProjectInfo = newCode
                ? { ...draftProjectInfo, reportCode: newCode }
                : draftProjectInfo;
              setState((prev) => ({ ...prev, projectInfo: finalProjectInfo, knowledgeContext: null }));
              setDraftProjectInfo(finalProjectInfo);
              try {
                if (reportIdRef.current) {
                  const saved = await window.lvcert?.greenReport?.saveProjectInfo(reportIdRef.current, finalProjectInfo);
                  if (saved) {
                    // 委托单位变更时后端会清空旧目录/正文，这里同步清空前端状态
                    setState((prev) => ({
                      ...prev,
                      projectInfo: saved.projectInfo || prev.projectInfo,
                      step: saved.step || prev.step,
                      knowledgeContext: null,
                      outlineData: saved.outlineData ?? null,
                      outlineTask: saved.outlineTask,
                      contentTask: saved.contentTask,
                      status: saved.status,
                      progress: saved.progress,
                    }));
                  }
                }
                showToast('企业信息已保存', 'success');
                void refreshReports();
              } catch (error) {
                showToast(`保存失败：${error instanceof Error ? error.message : String(error)}`, 'error');
              }
            }}
          />
        )}
        {state.step === 'report-config' && (
          <ReportConfigPage
            state={state}
            draftPageCount={draftPageCount}
            draftDocumentStyle={draftDocumentStyle}
            draftTargetWords={draftTargetWords}
            draftTemplateId={draftTemplateId}
            skipCoverFrontMatter={skipCoverFrontMatter}
            templates={templates}
            onDraftPageCountChange={setDraftPageCount}
            onDraftDocumentStyleChange={setDraftDocumentStyle}
            onDraftTargetWordsChange={setDraftTargetWords}
            onDraftTemplateIdChange={setDraftTemplateId}
            onSkipCoverFrontMatterChange={handleSkipCoverFrontMatterChange}
            onSave={handleSaveReportConfig}
          />
        )}
        {state.step === 'outline' && (
          <OutlinePage
            state={state}
            onOutlineChange={(patch) => {
              setState((prev) => ({ ...prev, ...patch }));
              if (patch.targetWords) setDraftTargetWords(patch.targetWords);
              if (reportIdRef.current) {
                void window.lvcert?.greenReport?.saveOutlineConfig(reportIdRef.current, patch).catch(() => undefined);
              }
            }}
            onGenerateOutline={async () => {
              if (!reportIdRef.current) {
                showToast('报告不存在，请返回列表重新打开', 'error');
                return;
              }
              const { projectInfo } = await syncProjectInfoBeforeGenerate();
              await window.lvcert.tasks.startGreenReportOutline({
                reportId: reportIdRef.current,
                reportType: state.reportType,
                reportTypeName: resolveReportTypeName(state.reportType),
                projectInfo,
                targetWords: state.targetWords,
                pageCount: state.pageCount,
                documentStyle: state.documentStyle,
                userRequirements: state.outlineRequirements,
              });
              showToast('目录生成已提交，可返回列表继续新建报告', 'success');
              void refreshReports();
            }}
            onSaveOutline={async (request) => {
              setState((prev) => ({
                ...prev,
                outlineData: request.outlineData,
              }) as GreenReportState);
              try {
                if (!reportIdRef.current) return;
                const patch = await window.lvcert?.greenReport?.saveOutline(reportIdRef.current, request);
                if (patch) setState((prev) => ({ ...prev, ...patch }) as GreenReportState);
              } catch (error) {
                showToast(`保存目录失败：${error instanceof Error ? error.message : String(error)}`, 'error');
              }
            }}
          />
        )}
        {state.step === 'content' && (
          <ContentPage
            state={state}
            onContentRequirementsChange={(req) => setState((prev) => ({ ...prev, contentRequirements: req }))}
            onGenerate={async () => {
              if (!reportIdRef.current) {
                showToast('报告不存在，请返回列表重新打开', 'error');
                return;
              }
              const { projectInfo, outlineCleared } = await syncProjectInfoBeforeGenerate();
              if (outlineCleared) {
                showToast('委托单位已变更，旧目录和正文已清空，请先重新生成目录', 'error');
                return;
              }
              await window.lvcert.tasks.startGreenReportContent({
                reportId: reportIdRef.current,
                reportType: state.reportType,
                reportTypeName: resolveReportTypeName(state.reportType),
                projectInfo,
                outlineData: state.outlineData,
                targetWords: state.targetWords,
                pageCount: state.pageCount,
                documentStyle: state.documentStyle,
                userRequirements: state.contentRequirements,
              });
              showToast('正文生成已提交，可返回列表继续新建报告', 'success');
              void refreshReports();
            }}
            onSaveChapter={async (nodeId, content) => {
              setState((prev) => {
                if (!prev.outlineData) return prev;
                const next = JSON.parse(JSON.stringify(prev.outlineData)) as typeof prev.outlineData;
                const updateNode = (items: OutlineItem[]) => {
                  for (const item of items) {
                    if (item.id === nodeId) {
                      item.content = content;
                    }
                    if (item.children?.length) updateNode(item.children);
                  }
                };
                if (next?.outline) updateNode(next.outline);
                return { ...prev, outlineData: next };
              });
              try {
                if (!reportIdRef.current) return;
                const patch = await window.lvcert?.greenReport?.saveChapterContent(reportIdRef.current, { nodeId, content });
                if (patch) setState((prev) => ({ ...prev, ...patch }));
              } catch (error) {
                showToast(`保存章节失败：${error instanceof Error ? error.message : String(error)}`, 'error');
              }
            }}
            wordExportProgress={wordExportProgress}
            pdfExportProgress={pdfExportProgress}
            onExportWord={handleExportWord}
            onExportPdf={handleExportPdf}
          />
        )}
      </div>

      <FloatingToolbar groups={toolbarGroups} />
    </div>
  );
}

export default GreenReportHome;
