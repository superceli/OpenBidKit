import { useCallback, useEffect, useState } from 'react';
import { trackPageView } from '../../../shared/analytics/analytics';
import { FloatingToolbar, ToolbarArrowLeftIcon, ToolbarArrowRightIcon, ToolbarDocumentIcon, useToast } from '../../../shared/ui';
import type { FloatingToolbarGroup } from '../../../shared/ui';
import type { SectionId } from '../../../shared/types/navigation';
import type { OutlineItem, WordExportProgressEvent } from '../../../shared/types';
import type { ExportTemplateRecord } from '../../../shared/types/exportFormat';
import { DEFAULT_EXPORT_FORMAT } from '../../../shared/types/exportFormat';
import CompanyInfoPage from './CompanyInfoPage';
import ReportConfigPage from './ReportConfigPage';
import OutlinePage from './OutlinePage';
import ContentPage from './ContentPage';
import type { GreenDocumentStyle, GreenProjectInfo, GreenReportState, GreenReportStep, GreenReportType } from '../types';
import { DEFAULT_GREEN_PROJECT_INFO, GREEN_STEPS, GREEN_STEP_LABELS, getLocalDateString } from '../types';
import { resolveReportTypeName } from '../reportTypes';

interface GreenReportHomeProps {
  registerLeaveGuard?: (guard: ((nextSection?: string) => Promise<boolean>) | null) => void;
  onSectionChange?: (section: SectionId) => void;
}

const emptyState: GreenReportState = {
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

function GreenReportHome({ onSectionChange }: GreenReportHomeProps) {
  const { showToast } = useToast();
  const [state, setState] = useState<GreenReportState>(emptyState);
  const [draftProjectInfo, setDraftProjectInfo] = useState<GreenProjectInfo>(DEFAULT_GREEN_PROJECT_INFO);
  const [draftPageCount, setDraftPageCount] = useState(30);
  const [draftDocumentStyle, setDraftDocumentStyle] = useState<GreenDocumentStyle>('standard');
  const [draftTargetWords, setDraftTargetWords] = useState(20000);
  const [draftTemplateId, setDraftTemplateId] = useState<string | null>(null);
  const [skipCoverFrontMatter, setSkipCoverFrontMatter] = useState(readSkipCoverFrontMatter);
  const [templates, setTemplates] = useState<ExportTemplateRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [wordExportProgress, setWordExportProgress] = useState(initialExportProgress);
  const [pdfExportProgress, setPdfExportProgress] = useState(initialExportProgress);

  useEffect(() => {
    trackPageView('green-report');
  }, []);

  useEffect(() => {
    if (loaded) return;
    const greenReport = window.lvcert?.greenReport;
    if (!greenReport) {
      setLoaded(true);
      return;
    }
    greenReport.loadState().then((s) => {
      const loadedProjectInfo = { ...DEFAULT_GREEN_PROJECT_INFO, ...(s.projectInfo || {}) };
      // 老数据可能没有 compileDate，回退为今天（本地时区）
      if (!loadedProjectInfo.compileDate) {
        loadedProjectInfo.compileDate = getLocalDateString();
      }
      setState({ ...s, projectInfo: loadedProjectInfo });
      setDraftProjectInfo(loadedProjectInfo);
      setDraftPageCount(s.pageCount ?? 30);
      setDraftDocumentStyle(s.documentStyle ?? 'standard');
      setDraftTargetWords(s.targetWords ?? 20000);
      setDraftTemplateId(s.templateId ?? null);
      setLoaded(true);
    }).catch(() => setLoaded(true));
    window.lvcert?.templates?.list().then((items) => {
      setTemplates(items || []);
    }).catch(() => undefined);
  }, [loaded]);

  useEffect(() => {
    const tasks = window.lvcert?.tasks;
    if (!tasks) return undefined;
    const off = tasks.onTaskEvent((event) => {
      const patch = (event as { greenReportPatch?: Partial<GreenReportState> }).greenReportPatch;
      if (!patch) return;
      setState((prev) => ({ ...prev, ...patch }));
    });
    return off;
  }, []);

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
    void window.lvcert?.greenReport?.updateStep(nextStep).catch(() => undefined);
  }, [stepIndex]);

  const handleSaveReportConfig = useCallback(async () => {
    const patch = {
      targetWords: draftTargetWords,
      pageCount: draftPageCount,
      documentStyle: draftDocumentStyle,
      templateId: draftTemplateId,
    };
    setState((prev) => ({ ...prev, ...patch }));
    try {
      await window.lvcert?.greenReport?.saveReportConfig(patch);
      showToast('报告配置已保存', 'success');
    } catch (error) {
      showToast(`保存失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }, [draftTargetWords, draftPageCount, draftDocumentStyle, draftTemplateId, showToast]);

  const handleSkipCoverFrontMatterChange = useCallback((value: boolean) => {
    setSkipCoverFrontMatter(value);
    try {
      localStorage.setItem(SKIP_COVER_FRONT_MATTER_KEY, String(value));
    } catch {
      // 本地偏好写入失败不影响导出
    }
  }, []);

  const buildExportPayload = useCallback(async () => {
    // 报告标题用用户勾选的报告类型名称（自定义类型取用户输入的名称）
    const reportTitle = resolveReportTypeName(state.reportType) || '绿色报告';
    // 委托单位即企业名称（全局唯一企业标识字段，UI 上已合并）
    const clientUnit = state.projectInfo.companyName || '';

    // 若选中了模板，从模板库取完整 config；否则用绿色报告默认页眉页脚
    let exportFormat = DEFAULT_EXPORT_FORMAT;
    if (state.templateId) {
      const template = await window.lvcert?.templates?.get(state.templateId);
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
    let reportCode = state.projectInfo.reportCode;
    if (!reportCode) {
      reportCode = await window.lvcert?.greenReport?.generateReportCode();
    }
    // 编制日期格式为"YYYY年M月"（不到具体日）
    const rawDate = state.projectInfo.compileDate || getLocalDateString();
    const [rawYear, rawMonth] = rawDate.split('-').map(Number);
    const compileDate = Number.isFinite(rawYear) && Number.isFinite(rawMonth)
      ? `${rawYear}年${rawMonth}月`
      : rawDate;

    const publicityPlatforms = String(state.projectInfo.publicityPlatformsText || '')
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
        project_name: state.projectInfo.companyName || '绿色报告',
        outline: state.outlineData?.outline || [],
        export_format: exportFormat,
        cover_template: 'green-report',
        skip_cover_frontmatter: skipCoverFrontMatter,
        cover_fields: {
          clientUnit,
          reportCode: reportCode || '',
          compileUnit: state.projectInfo.compileUnit || '',
          compileDate,
          reportTitle,
        },
        reporting_period: state.projectInfo.reportingPeriod || '',
        report_scope: state.projectInfo.reportScope || '',
        company_name: state.projectInfo.companyName || '',
        report_type_name: reportTitle,
        publicity_platforms: publicityPlatforms,
      },
    };
  }, [state.outlineData, state.projectInfo, state.reportType, state.templateId, skipCoverFrontMatter]);

  const handleExportWord = useCallback(async () => {
    if (!state.outlineData?.outline?.length) {
      showToast('请先生成报告目录和正文', 'error');
      return;
    }
    setWordExportProgress({ ...initialExportProgress, running: true, message: '正在准备导出...' });
    try {
      const { payload } = await buildExportPayload();
      const result = await window.lvcert.export.exportWord(payload);
      if (result.success && result.path) {
        setWordExportProgress((prev) => ({ ...prev, filePath: result.path as string }));
      }
    } catch (error) {
      showToast(`导出 Word 失败：${error instanceof Error ? error.message : String(error)}`, 'error');
      setWordExportProgress(initialExportProgress);
    }
  }, [buildExportPayload, state.outlineData, showToast]);

  const handleExportPdf = useCallback(async () => {
    if (!state.outlineData?.outline?.length) {
      showToast('请先生成报告目录和正文', 'error');
      return;
    }
    setPdfExportProgress({ ...initialExportProgress, running: true, message: '正在准备导出...' });
    try {
      const { payload } = await buildExportPayload();
      const result = await window.lvcert.export.exportPdf(payload);
      if (result.success && result.path) {
        setPdfExportProgress((prev) => ({ ...prev, filePath: result.path as string }));
      }
    } catch (error) {
      showToast(`导出 PDF 失败：${error instanceof Error ? error.message : String(error)}`, 'error');
      setPdfExportProgress(initialExportProgress);
    }
  }, [buildExportPayload, state.outlineData, showToast]);

  const toolbarGroups: FloatingToolbarGroup[] = [
    {
      id: 'navigation',
      actions: [
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
          const isClickable = i <= stepIndex;
          return (
            <div
              key={step}
              className={[
                'green-report-step',
                isCurrent ? 'is-current' : '',
                isDone ? 'is-done' : '',
                isClickable ? 'is-clickable' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => {
                if (!isClickable) return;
                setState((prev) => ({ ...prev, step }));
                void window.lvcert?.greenReport?.updateStep(step).catch(() => undefined);
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
              void window.lvcert?.greenReport?.saveReportType(reportType).catch(() => undefined);
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
                await window.lvcert?.greenReport?.saveProjectInfo(finalProjectInfo);
                showToast('企业信息已保存', 'success');
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
              void window.lvcert?.greenReport?.saveOutlineConfig(patch).catch(() => undefined);
            }}
            onGenerateOutline={async () => {
              await window.lvcert.tasks.startGreenReportOutline({
                reportType: state.reportType,
                reportTypeName: resolveReportTypeName(state.reportType),
                projectInfo: state.projectInfo,
                targetWords: state.targetWords,
                pageCount: state.pageCount,
                documentStyle: state.documentStyle,
                knowledgeContext: state.knowledgeContext,
                userRequirements: state.outlineRequirements,
              });
            }}
            onSaveOutline={async (request) => {
              setState((prev) => ({
                ...prev,
                outlineData: request.outlineData,
              }) as GreenReportState);
              try {
                const patch = await window.lvcert?.greenReport?.saveOutline(request);
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
              await window.lvcert.tasks.startGreenReportContent({
                reportType: state.reportType,
                reportTypeName: resolveReportTypeName(state.reportType),
                projectInfo: state.projectInfo,
                outlineData: state.outlineData,
                targetWords: state.targetWords,
                pageCount: state.pageCount,
                documentStyle: state.documentStyle,
                knowledgeContext: state.knowledgeContext,
                userRequirements: state.contentRequirements,
              });
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
                const patch = await window.lvcert?.greenReport?.saveChapterContent({ nodeId, content });
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
