import type { OutlineData, OutlineItem } from '../../shared/types';

export type GreenReportStep = 'company-info' | 'report-config' | 'outline' | 'content';

/** 报告类型标识，对应 reportTypes.ts 中的 id */
export type GreenReportType = string;

export type GreenDocumentStyle = 'standard' | 'narrative' | 'data-driven' | 'academic';

export type GreenTaskType =
  | 'green-report-outline'
  | 'green-report-content';

export type GreenTaskStatus = 'running' | 'paused' | 'success' | 'error';

export type GreenSaveOutlineReason = 'sort' | 'edit' | 'delete' | 'add-root' | 'add-child' | 'replace';

export interface GreenProjectInfo {
  companyName: string;
  industry: string;
  reportingPeriod: string;
  reportScope: string;
  keyTopics: string;
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
  step: GreenReportStep;
  reportType: GreenReportType;
  projectInfo: GreenProjectInfo;
  targetWords: number;
  pageCount: number;
  documentStyle: GreenDocumentStyle;
  knowledgeContext: GreenKnowledgeContext | null;
  outlineData: OutlineData | null;
  outlineTask?: GreenBackgroundTaskState;
  contentTask?: GreenBackgroundTaskState;
  /** 目录生成时用户附加的自定义要求 */
  outlineRequirements?: string;
  /** 正文生成时用户附加的自定义要求 */
  contentRequirements?: string;
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

export const DEFAULT_GREEN_PROJECT_INFO: GreenProjectInfo = {
  companyName: '',
  industry: '',
  reportingPeriod: '',
  reportScope: '',
  keyTopics: '',
};

export const DEFAULT_GREEN_REPORT_CONFIG = {
  targetWords: 20000,
  pageCount: 30,
  documentStyle: 'standard' as GreenDocumentStyle,
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
