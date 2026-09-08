import type { AiHttpErrorPayload, ChatCompletionRequest, JsonCompletionRequest } from './ai';
import type { ClientConfig, ConfigSaveResult, ImageModelTestResult, ModelInfoResult, ModelListResult, UpdateChannel } from './config';
import type { KnowledgeAnalysisSnapshot, KnowledgeBaseEvent, KnowledgeBaseIndex, KnowledgeBaseIndexMutationResult, KnowledgeBaseMutationResult, KnowledgeBaseRetryDocumentResult, KnowledgeBaseStartMatchingResult, KnowledgeBaseUploadResult, KnowledgeDocument, KnowledgeFolder, KnowledgeItem } from '../../features/knowledge-base/types';
import type { GreenDocumentStyle, GreenKnowledgeContext, GreenProjectInfo, GreenReportState, GreenReportStep, GreenReportType, GreenSaveOutlineRequest } from '../../features/green-report/types';
import type { ExportFormatConfig, ExportTemplateRecord } from './exportFormat';

export interface TaskEventTask {
  task_id: string;
  type: string;
  status: string;
  progress: number;
  progress_detail?: unknown;
  logs: string[];
  started_at: string;
  updated_at: string;
  error?: string;
  stats?: unknown;
}

export interface TaskEvent<TState = unknown> {
  task: TaskEventTask;
  greenReportPatch?: Partial<GreenReportState>;
}

export interface WordExportProgressEvent {
  requestId?: string;
  phase: 'running' | 'success' | 'error' | 'canceled';
  progress: number;
  message: string;
  warnings?: string[];
}

export interface PdfExportProgressEvent extends WordExportProgressEvent {}

export interface PdfExportResult extends WordExportResult {}

export interface KnowledgeSearchResultItem {
  documentId: string;
  documentName: string;
  itemId: string;
  title: string;
  resume: string;
  content: string;
}

export interface KnowledgeSearchResult {
  keyword: string;
  items: KnowledgeSearchResultItem[];
}

export interface WordExportResult {
  success: boolean;
  canceled?: boolean;
  path?: string;
  message?: string;
  warnings?: string[];
}

export interface CheckResultExportResult {
  success: boolean;
  canceled?: boolean;
  path?: string;
  message?: string;
}

export interface RequiredOnlineServiceStatus {
  id: string;
  label: string;
  domain: string;
  available: boolean;
  checked: boolean;
}

export interface RequiredOnlineServicesStatus {
  checked: boolean;
  services: RequiredOnlineServiceStatus[];
  unavailableServices: RequiredOnlineServiceStatus[];
}

export interface DeveloperTextTokenStats {
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_tokens: number;
  cache_ratio: number;
}

export interface LatestReleaseInfo {
  version: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  download_url?: string;
  channel?: UpdateChannel;
}

export interface UpdateCheckResult {
  enabled: boolean;
  updateAvailable: boolean;
  version?: string;
  downloaded?: boolean;
  failed?: boolean;
  message?: string;
  channel?: UpdateChannel;
}

export interface UpdateInstallResult {
  success: boolean;
  message?: string;
}

export interface PluginUpdateInfo {
  id: string;
  name: string;
  installedVersion: string;
  version: string;
}

export interface PluginUpdateResult extends PluginUpdateInfo {
  success: boolean;
  message?: string;
}

export interface PluginUpdateAllResult {
  updates: PluginUpdateInfo[];
  results: PluginUpdateResult[];
}

export interface GpuHardwareAccelerationStatus {
  configured: boolean;
  enabled: boolean;
  currentEnabled: boolean;
  trial: boolean;
  forcedDisabled: boolean;
}

export type WorkspaceDatabasePhase = 'checking' | 'repairing' | 'backing-up' | 'upgrading' | 'cleaning' | 'ready' | 'error';

export interface WorkspaceDatabaseStatus {
  phase: WorkspaceDatabasePhase;
  ready: boolean;
  message: string;
  updatedAt?: string;
  currentVersion?: number;
  targetVersion?: number;
  migrationVersion?: number;
  migrationDescription?: string;
}

export type AgentSelfCheckStepStatus = 'pending' | 'running' | 'success' | 'warning' | 'error' | 'skipped';
export type AgentSelfCheckStatus = 'normal' | 'error' | 'busy';

export type AgentRuntimePhase = 'stopped' | 'starting' | 'idle' | 'running' | 'aborting' | 'unhealthy' | 'restarting' | 'closing';

export interface AgentRuntimeActiveTask {
  task_id: string;
  session_id: string;
  title: string;
  stage: string;
  progress_text: string;
  started_at: string;
  last_activity_at: string;
  last_progress_at?: string;
  elapsed_seconds: number;
  idle_seconds: number;
  waiting_for_user?: boolean;
  workspace_dir?: string;
  is_primary?: boolean;
}

export interface AgentQuestionOption {
  id: string;
  label: string;
  description: string;
  recommended: boolean;
  custom: boolean;
}

export interface AgentQuestion {
  question_id: string;
  task_id: string;
  session_id?: string;
  task_title: string;
  question: string;
  options: AgentQuestionOption[];
  asked_at: string;
  auto_answer_at?: string;
  is_primary?: boolean;
}

export interface AutoConfirmationState {
  enabled: boolean;
}

export interface AgentQuestionAnswerPayload {
  question_id: string;
  option_id: string;
  custom_answer?: string;
}

export interface AgentQuestionAnswerResult {
  success: boolean;
}

export type LicenseStatusValue = 'missing' | 'active' | 'expired' | 'invalid' | 'invalidated' | 'machine_mismatch' | 'refresh_failed' | 'debug_disabled';

export interface LicenseRuntimeStatus {
  status: LicenseStatusValue | string;
  plan: 'free' | 'personal_premium' | 'enterprise_premium' | string;
  expiresAt: string;
  licenseExpiresAt: string;
  licenseStatus: string;
  activationMode: 'online' | 'offline' | 'debug_disabled' | string;
  sourceTrusted: boolean;
  sourceTrustedText: string;
  untrustedReason: string;
  machineFingerprintHash: string;
  fingerprintVersion: string;
  buildTrusted: boolean;
  buildChanged: boolean;
  buildId: string;
  keyId: string;
  lastCheckedAt: string;
  refreshError?: string;
  config: {
    freeLicenseDays: number;
    expirePopupEnabled: boolean;
    expirePopupDismissible: boolean;
  };
}

export interface LicenseOfflineActivationResult {
  success: boolean;
  canceled?: boolean;
  message: string;
  status: LicenseRuntimeStatus;
}

export interface AgentRuntimeStatus {
  runtime_id: 'pi';
  runtime_name: string;
  phase: AgentRuntimePhase;
  healthy: boolean;
  message: string;
  updated_at: string;
  last_health_at?: string;
  last_health_error?: string;
  restart_pending?: boolean;
  restart_pending_reason?: string;
  active_tasks?: AgentRuntimeActiveTask[];
  primary_session_id?: string;
  queued_count?: number;
  queued_tasks?: Array<{
    task_id: string;
    title: string;
    queued_at: string;
    position: number;
  }>;
  proxy?: {
    active: number;
    queued: number;
    limit: number;
  };
  runtime_details?: Record<string, unknown>;
}

export interface AgentRunFile {
  path: string;
  content: string;
}

export interface AgentRunPayload {
  task_id?: string;
  title?: string;
  task?: string;
  prompt?: string;
  output_file?: string;
  files?: AgentRunFile[];
  timeout_ms?: number;
  max_retries?: number;
}

export interface AgentRetryAttempt {
  attempt: number;
  at: string;
  error: string;
  output_chars: number;
}

export interface AgentRunResult {
  success: boolean;
  runtime_id: 'pi';
  status?: 'busy' | string;
  skipped?: boolean;
  message?: string;
  task_id?: string;
  title?: string;
  workspace_dir?: string;
  runtime_workspace_dir?: string;
  runtime_root?: string;
  output_file?: string;
  output_content?: string;
  assistant_text?: string;
  diff?: unknown[];
  session_id?: string;
  retry_count?: number;
  model_retry_count?: number;
  retry_attempts?: AgentRetryAttempt[];
  validation_result?: unknown;
  active_tasks?: AgentRuntimeActiveTask[];
  diagnostics?: Record<string, unknown>;
}

export type AgentMonitorEventType =
  | 'session_start'
  | 'primary_session_changed'
  | 'task_start'
  | 'task_input'
  | 'task_output'
  | 'assistant_delta'
  | 'assistant_end'
  | 'tool_start'
  | 'tool_update'
  | 'tool_end'
  | 'agent_start'
  | 'agent_end'
  | 'agent_settled'
  | 'turn_start'
  | 'turn_end'
  | 'compaction_start'
  | 'compaction_end'
  | 'auto_retry_start'
  | 'auto_retry_end'
  | 'retry'
  | 'task_end'
  | 'task_error';

export interface AgentMonitorEvent {
  sequence: number;
  at: string;
  type: AgentMonitorEventType;
  task_id: string;
  session_id?: string;
  task_key?: string;
  is_primary?: boolean;
  title?: string;
  workspace_dir?: string;
  stage_index?: number;
  workflow_stage?: string;
  prompt?: string;
  output_file?: string;
  files?: AgentRunFile[];
  delta?: string;
  text?: string;
  tool_call_id?: string;
  tool_name?: string;
  args?: unknown;
  partial_result?: unknown;
  result?: unknown;
  is_error?: boolean;
  attempt?: number;
  maximum?: number;
  delay_ms?: number;
  success?: boolean;
  final_error?: string;
  message?: string;
  output_content?: string;
  assistant_text?: string;
  retry_count?: number;
  model_retry_count?: number;
}

export interface AgentMonitorSnapshot {
  attached_at: string;
  active_tasks: AgentRuntimeActiveTask[];
  primary_session_id?: string;
}

export interface AgentSelfCheckStep {
  id: string;
  label: string;
  status: AgentSelfCheckStepStatus;
  message?: string;
  updated_at?: string;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
}

export interface AgentDiagnosticSection {
  id: string;
  title: string;
  status: AgentSelfCheckStepStatus | 'warning';
  summary?: string;
  details?: Array<{
    label: string;
    value: string;
  }>;
  items?: Array<{
    id: string;
    label: string;
    status: AgentSelfCheckStepStatus | 'warning';
    message?: string;
    detail?: string;
  }>;
}

export interface AgentSelfCheckResult {
  report_version?: number;
  check_id?: string;
  success: boolean;
  repaired?: boolean;
  runtime_id: 'pi';
  runtime_name: string;
  status: AgentSelfCheckStatus;
  message: string;
  checked_at: string;
  duration_ms: number;
  log_dir: string;
  log_file: string;
  runtime_root: string;
  workspace_dir: string;
  output_file: string;
  output_path: string;
  output_content?: string;
  conclusion?: string;
  steps: AgentSelfCheckStep[];
  sections: AgentDiagnosticSection[];
  diagnostics?: Record<string, unknown>;
  error?: Record<string, unknown>;
  model_config?: Record<string, unknown>;
  model_check?: Record<string, unknown>;
  environment?: Record<string, unknown>;
  loopback_check?: Record<string, unknown>;
  tool_check?: Record<string, unknown>;
  agent_check?: Record<string, unknown>;
  session_snapshot?: Record<string, unknown>;
  diagnosis?: Record<string, unknown>;
  repair?: Record<string, unknown>;
  detail_text: string;
  runtime_status?: AgentRuntimeStatus;
}

export interface AgentSelfCheckReportExportResult {
  success: boolean;
  canceled?: boolean;
  path?: string;
  message: string;
}

export interface DonationPaymentConfig {
  channel: 'xorpay' | 'afdian';
  xorpay_min_order_amount: string;
}

export interface DonationCreateRequest {
  amount: string;
  nickname?: string;
  email?: string;
}

export interface DonationIntent {
  channel: 'xorpay' | 'afdian';
  payment_url?: string | null;
  instructions: string;
  order_id?: number | null;
  merchant_order_no?: string | null;
  amount?: string | null;
  min_amount?: string | null;
  status?: string | null;
  qr?: string | null;
  qr_image_url?: string | null;
  expires_in?: number | null;
}

export interface DonationOrderStatus {
  merchant_order_no: string;
  amount: string;
  channel: 'xorpay' | 'afdian';
  status: string;
  paid_at: string | null;
}

export interface DonationPromptPayload {
  reason: 'runtime' | 'word-export';
  accumulatedRuntimeMs: number;
  wordExportClicks: number;
}

export interface LvcertBridge {
  appName: string;
  platform: string;
  getVersion: () => Promise<string>;
  getGpuHardwareAccelerationStatus: () => Promise<GpuHardwareAccelerationStatus>;
  saveGpuHardwareAccelerationPreference: (enabled: boolean) => Promise<ConfigSaveResult & { enabled: boolean; configured: boolean; restartRequired: boolean }>;
  startGpuHardwareAccelerationTrial: () => Promise<{ success: boolean }>;
  relaunchWithGpuHardwareAccelerationDisabled: () => Promise<{ success: boolean }>;
  requiredOnlineServices: {
    getStatus: () => Promise<RequiredOnlineServicesStatus>;
  };
  donation: {
    getConfig: () => Promise<DonationPaymentConfig>;
    createTip: (request: DonationCreateRequest) => Promise<DonationIntent>;
    getOrderStatus: (merchantOrderNo: string) => Promise<DonationOrderStatus>;
    finalizeOrderStatus: (merchantOrderNo: string) => Promise<DonationOrderStatus>;
    onPrompt: (callback: (payload: DonationPromptPayload) => void) => () => void;
    onPaid: (callback: () => void) => () => void;
  };
  getLatestVersion: () => Promise<LatestReleaseInfo>;
  getUpdateDownloadUrl: () => Promise<string>;
  openExternal: (url: string) => Promise<{ success: boolean; message?: string }>;
  checkUpdate: () => Promise<UpdateCheckResult>;
  startUpdate: () => Promise<UpdateCheckResult>;
  quitAndInstall: () => Promise<UpdateInstallResult>;
  onUpdateProgress: (callback: (event: { percent: number }) => void) => () => void;
  onUpdateDownloaded: (callback: (event: { version: string }) => void) => () => void;
  onUpdateError: (callback: (event: { message: string }) => void) => () => void;
  onPluginUpdatesAvailable: (callback: (updates: PluginUpdateInfo[]) => void) => () => void;
  database: {
    getStatus: () => Promise<WorkspaceDatabaseStatus>;
    onStatus: (callback: (status: WorkspaceDatabaseStatus) => void) => () => void;
  };
  ui: {
    setCurrentView: (view: { section: string; step?: string | null }) => Promise<{ success: boolean }>;
  };
  config: {
    load: () => Promise<ClientConfig>;
    save: (config: ClientConfig) => Promise<ConfigSaveResult>;
    listModels: (config?: ClientConfig) => Promise<ModelListResult>;
    getModelInfo: (modelName: string) => Promise<ModelInfoResult>;
    openConfigFolder: () => Promise<{ success: boolean; path: string }>;
  };
  license: {
    getStatus: () => Promise<LicenseRuntimeStatus>;
    refresh: () => Promise<LicenseRuntimeStatus>;
    importOfflineFile: () => Promise<LicenseOfflineActivationResult>;
    activateOfflineCode: (code: string) => Promise<LicenseOfflineActivationResult>;
  };
  ai: {
    chat: (request: ChatCompletionRequest) => Promise<string>;
    requestJson: <TResult = unknown>(request: JsonCompletionRequest) => Promise<TResult>;
    testImageModel: (config: ClientConfig) => Promise<ImageModelTestResult>;
    onHttpError: (callback: (event: AiHttpErrorPayload) => void) => () => void;
  };
  autoConfirmation: {
    getState: () => Promise<AutoConfirmationState>;
    setEnabled: (enabled: boolean) => Promise<ConfigSaveResult & AutoConfirmationState>;
    onChanged: (callback: (state: AutoConfirmationState) => void) => () => void;
  };
  agent: {
    run: (payload: AgentRunPayload) => Promise<AgentRunResult>;
    selfCheck: () => Promise<AgentSelfCheckResult>;
    exportSelfCheckReport: (payload: AgentSelfCheckResult) => Promise<AgentSelfCheckReportExportResult>;
    getStatus: () => Promise<AgentRuntimeStatus>;
    restart: (reason?: string) => Promise<AgentRuntimeStatus>;
    getPendingQuestion: () => Promise<AgentQuestion | null>;
    answerQuestion: (payload: AgentQuestionAnswerPayload) => Promise<AgentQuestionAnswerResult>;
    suppressQuestionAutoAnswer: (payload: { question_id: string }) => Promise<{ success: boolean }>;
    onStatus: (callback: (status: AgentRuntimeStatus) => void) => () => void;
    onQuestion: (callback: (question: AgentQuestion | null) => void) => () => void;
  };
  developerTokenStats: {
    openWindow: () => Promise<{ success: boolean }>;
    get: () => Promise<DeveloperTextTokenStats>;
    reset: () => Promise<DeveloperTextTokenStats>;
    onChanged: (callback: (stats: DeveloperTextTokenStats) => void) => () => void;
  };
  developerAgentMonitor: {
    openWindow: () => Promise<{ success: boolean }>;
    openWorkspace: (workspaceDir: string) => Promise<{ success: boolean; path: string }>;
    attach: () => Promise<AgentMonitorSnapshot>;
    detach: () => Promise<{ success: boolean }>;
    onEvent: (callback: (event: AgentMonitorEvent) => void) => () => void;
  };
  file: {
    /** 把拖拽进来的 File 对象换成本地绝对路径，供各上传区拖拽导入使用 */
    getPathForFile: (file: File) => string;
  };
  knowledgeBase: {
    list: () => Promise<KnowledgeBaseIndex>;
    createFolder: (name: string) => Promise<KnowledgeFolder>;
    renameFolder: (folderId: string, name: string) => Promise<KnowledgeFolder>;
    reorderFolder: (draggedFolderId: string, targetFolderId: string, position: 'before' | 'after') => Promise<KnowledgeBaseIndexMutationResult>;
    deleteFolder: (folderId: string) => Promise<KnowledgeBaseMutationResult>;
    deleteDocument: (documentId: string) => Promise<KnowledgeBaseMutationResult>;
    moveDocument: (documentId: string, targetFolderId: string, targetDocumentId?: string | null, position?: 'before' | 'after') => Promise<KnowledgeBaseIndexMutationResult>;
    uploadDocuments: (folderId: string) => Promise<KnowledgeBaseUploadResult>;
    retryDocument: (documentId: string) => Promise<KnowledgeBaseRetryDocumentResult>;
    startMatching: (documentId: string, batchSize?: number) => Promise<KnowledgeBaseStartMatchingResult>;
    readMarkdown: (documentId: string) => Promise<string>;
    readItems: (documentId: string) => Promise<KnowledgeItem[]>;
    readAnalysis: (documentId: string) => Promise<KnowledgeAnalysisSnapshot>;
    searchItems: (keyword: string, options?: { limit?: number; contentExcerptChars?: number }) => Promise<KnowledgeSearchResult>;
    onEvent: (callback: (event: KnowledgeBaseEvent) => void) => () => void;
  };
  greenReport: {
    loadState: () => Promise<GreenReportState>;
    updateStep: (step: GreenReportStep) => Promise<void>;
    saveReportType: (reportType: GreenReportType) => Promise<void>;
    saveProjectInfo: (projectInfo: GreenProjectInfo) => Promise<GreenReportState>;
    saveOutlineConfig: (payload: { targetWords?: number }) => Promise<GreenReportState>;
    saveReportConfig: (payload: { targetWords?: number; pageCount?: number; documentStyle?: GreenDocumentStyle }) => Promise<GreenReportState>;
    saveKnowledgeContext: (context: GreenKnowledgeContext | null) => Promise<GreenReportState>;
    saveOutline: (payload: GreenSaveOutlineRequest) => Promise<Partial<GreenReportState>>;
    saveChapterContent: (payload: { nodeId: string; content: string }) => Promise<Partial<GreenReportState>>;
    clear: () => Promise<{ success: boolean; message?: string }>;
  };
  templates: {
    list: () => Promise<ExportTemplateRecord[]>;
    get: (templateId: string) => Promise<ExportTemplateRecord | null>;
    create: (config: ExportFormatConfig) => Promise<ExportTemplateRecord>;
    update: (templateId: string, config: ExportFormatConfig) => Promise<ExportTemplateRecord>;
    delete: (templateId: string) => Promise<{ success: boolean; message: string }>;
  };
  tasks: {
    startGreenReportOutline: (payload?: unknown) => Promise<unknown>;
    startGreenReportContent: (payload?: unknown) => Promise<unknown>;
    getActiveTasks: () => Promise<TaskEventTask[]>;
    onTaskEvent: <TState = unknown>(callback: (event: TaskEvent<TState>) => void) => () => void;
  };
  export: {
    exportWord: (payload: unknown) => Promise<WordExportResult>;
    exportPdf: (payload: unknown) => Promise<PdfExportResult>;
    openFile: (filePath: string) => Promise<{ success: boolean }>;
    onWordExportProgress: (callback: (event: WordExportProgressEvent) => void) => () => void;
    onPdfExportProgress: (callback: (event: PdfExportProgressEvent) => void) => () => void;
  };
  systemFonts: {
    list: () => Promise<string[]>;
  };
  plugins: {
    getAvailablePlugins: () => Promise<AvailablePlugin[]>;
    install: (pluginId: string) => Promise<void>;
    installOffline: () => Promise<OfflinePluginInstallResult>;
    uninstall: (pluginId: string) => Promise<void>;
    enable: (pluginId: string) => Promise<void>;
    disable: (pluginId: string) => Promise<void>;
    update: (pluginId: string) => Promise<void>;
    checkUpdates: () => Promise<PluginUpdateInfo[]>;
    updateAll: () => Promise<PluginUpdateAllResult>;
    openConfig: (pluginId: string) => Promise<void>;
    refreshMarket: () => Promise<void>;
    clearUpdateFailedState: (pluginId: string) => Promise<boolean>;
    notifyEvent: (pluginId: string, event: string, payload?: unknown) => Promise<void>;
  };
}

export type OfflinePluginInstallResult =
  | { canceled: true }
  | {
      canceled: false;
      id: string;
      name: string;
      version: string;
      previousVersion: string | null;
      updated: boolean;
      enabled: boolean;
    };

export interface AvailablePlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  repository: string;
  releaseUrl: string;
  tags: string[];
  iconUrl: string;
  downloadCount: number;
  installed: boolean;
  installedVersion?: string;
  enabled: boolean;
  hasConfig: boolean;
  hasUpdate?: boolean;
  updating?: boolean;
  updateFailed?: {
    stage: string;
    message: string;
  };
}
