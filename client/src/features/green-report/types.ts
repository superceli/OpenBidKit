import type { OutlineData, OutlineItem } from '../../shared/types';

export type GreenReportStep = 'company-info' | 'report-config' | 'outline' | 'content';

/** 报告类型标识，对应 reportTypes.ts 中的 id */
export type GreenReportType = string;

export type GreenDocumentStyle = 'standard' | 'narrative' | 'data-driven' | 'academic';

export type GreenTaskType =
  | 'green-report-outline'
  | 'green-report-content';

export type GreenTaskStatus = 'running' | 'paused' | 'success' | 'error' | 'cancelled';

export type GreenSaveOutlineReason = 'sort' | 'edit' | 'delete' | 'add-root' | 'add-child' | 'replace';

export interface GreenProjectInfo {
  /** 委托单位（即被评价企业名称），全局唯一企业标识字段 */
  companyName: string;
  industry: string;
  reportingPeriod: string;
  reportScope: string;
  keyTopics: string;
  /** 编制人员，每行“姓名|职称” */
  compileStaffText: string;
  /** 关键指标，每行“指标类别|指标名称|现状值|目标值|单位|对应章节” */
  keyIndicatorsText: string;
  /** 公示平台，每行“平台名称|网址” */
  publicityPlatformsText: string;
  /** 封面回显字段：编制单位 */
  compileUnit: string;
  /** 封面回显字段：编制日期 YYYY-MM-DD */
  compileDate: string;
  /** 封面回显字段：报告编号，空字符串表示自动生成 */
  reportCode: string;
}

export interface GreenKnowledgeContextItem {
  documentId: string;
  documentName: string;
  itemId: string;
  title: string;
  resume: string;
  content: string;
}

export interface GreenKnowledgeContext {
  keyword: string;
  /** 资料所属企业（用于约束 AI 不得混用其他企业数据） */
  companyName?: string;
  /** 命中的知识库文件夹名称 */
  folderName?: string;
  items: GreenKnowledgeContextItem[];
  searchedAt: string;
}

export interface GreenBackgroundTaskState {
  task_id: string;
  type: GreenTaskType;
  status: GreenTaskStatus;
  progress: number;
  logs: string[];
  started_at: string;
  updated_at: string;
  error?: string;
  stats?: unknown;
}

export interface GreenSaveOutlineRequest {
  outlineData: OutlineData;
  reason: GreenSaveOutlineReason;
  idMap?: Record<string, string>;
  affectedNodeIds?: string[];
}

export interface GreenReportState {
  /** 报告实例 ID；新建报告后由主进程生成 */
  reportId?: string;
  step: GreenReportStep;
  reportType: GreenReportType;
  projectInfo: GreenProjectInfo;
  targetWords: number;
  pageCount: number;
  documentStyle: GreenDocumentStyle;
  /** 导出时使用的报告模板 ID；为空表示使用默认导出格式 */
  templateId: string | null;
  knowledgeContext: GreenKnowledgeContext | null;
  outlineData: OutlineData | null;
  /** 报告级运行状态：draft / queued / running / success / error / cancelled */
  status?: string;
  progress?: number;
  outlineTask?: GreenBackgroundTaskState;
  contentTask?: GreenBackgroundTaskState;
  /** 目录生成时用户附加的自定义要求 */
  outlineRequirements?: string;
  /** 正文生成时用户附加的自定义要求 */
  contentRequirements?: string;
}

/** 报告列表摘要 */
export interface GreenReportSummary {
  id: string;
  companyName: string;
  reportType: GreenReportType;
  step: GreenReportStep;
  status: string;
  progress: number;
  /** 是否已生成目录，决定列表上能否直接生成正文 */
  hasOutline?: boolean;
  createdAt: string;
  updatedAt: string;
}

export const GREEN_STEPS: GreenReportStep[] = ['company-info', 'report-config', 'outline', 'content'];

export const GREEN_STEP_LABELS: Record<GreenReportStep, string> = {
  'company-info': '企业信息',
  'report-config': '报告配置',
  outline: '报告目录',
  content: '正文生成',
};

export const GREEN_DOCUMENT_STYLE_LABELS: Record<GreenDocumentStyle, string> = {
  standard: '标准正式',
  narrative: '叙事型',
  'data-driven': '数据驱动型',
  academic: '学术规范型',
};

/** 按本地时区返回 YYYY-MM-DD，避免 toISOString 在早上 8 点前返回前一天。 */
export function getLocalDateString(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export const DEFAULT_GREEN_PROJECT_INFO: GreenProjectInfo = {
  companyName: '',
  industry: '',
  reportingPeriod: '',
  reportScope: '',
  keyTopics: '',
  compileStaffText: '',
  keyIndicatorsText: '',
  publicityPlatformsText: '',
  compileUnit: '安徽蔚碳环保科技有限公司',
  compileDate: getLocalDateString(),
  reportCode: '',
};

export const DEFAULT_GREEN_REPORT_CONFIG = {
  targetWords: 20000,
  pageCount: 30,
  documentStyle: 'standard' as GreenDocumentStyle,
  templateId: null as string | null,
};

export function collectGreenLeaves(items: OutlineItem[] = [], leaves: OutlineItem[] = []): OutlineItem[] {
  items.forEach((item) => {
    if (item.children?.length) {
      collectGreenLeaves(item.children, leaves);
      return;
    }
    leaves.push(item);
  });
  return leaves;
}
