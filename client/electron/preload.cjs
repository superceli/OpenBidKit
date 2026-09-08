const { contextBridge, ipcRenderer, webUtils } = require('electron');

const bridge = {
  appName: '绿证报告工具箱',
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getGpuHardwareAccelerationStatus: () => ipcRenderer.invoke('app:get-gpu-hardware-acceleration-status'),
  saveGpuHardwareAccelerationPreference: (enabled) => ipcRenderer.invoke('app:save-gpu-hardware-acceleration-preference', enabled),
  startGpuHardwareAccelerationTrial: () => ipcRenderer.invoke('app:start-gpu-hardware-acceleration-trial'),
  relaunchWithGpuHardwareAccelerationDisabled: () => ipcRenderer.invoke('app:relaunch-with-gpu-hardware-acceleration-disabled'),
  requiredOnlineServices: {
    getStatus: () => ipcRenderer.invoke('required-online-services:get-status'),
  },
  donation: {
    getConfig: () => ipcRenderer.invoke('donation:get-config'),
    createTip: (request) => ipcRenderer.invoke('donation:create-tip', request),
    getOrderStatus: (merchantOrderNo) => ipcRenderer.invoke('donation:get-order-status', merchantOrderNo),
    finalizeOrderStatus: (merchantOrderNo) => ipcRenderer.invoke('donation:finalize-order-status', merchantOrderNo),
    onPrompt: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('donation:prompt', listener);
      return () => ipcRenderer.removeListener('donation:prompt', listener);
    },
    onPaid: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('donation:paid', listener);
      return () => ipcRenderer.removeListener('donation:paid', listener);
    },
  },
  getLatestVersion: () => ipcRenderer.invoke('app:get-latest-version'),
  getUpdateDownloadUrl: () => ipcRenderer.invoke('app:get-update-download-url'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  checkUpdate: () => ipcRenderer.invoke('app:check-update'),
  startUpdate: () => ipcRenderer.invoke('app:start-update'),
  quitAndInstall: () => ipcRenderer.invoke('app:quit-and-install'),
  onUpdateProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('app:update-progress', listener);
    return () => ipcRenderer.removeListener('app:update-progress', listener);
  },
  onUpdateDownloaded: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('app:update-downloaded', listener);
    return () => ipcRenderer.removeListener('app:update-downloaded', listener);
  },
  onUpdateError: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('app:update-error', listener);
    return () => ipcRenderer.removeListener('app:update-error', listener);
  },
  onPluginUpdatesAvailable: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('plugins:updates-available', listener);
    return () => ipcRenderer.removeListener('plugins:updates-available', listener);
  },
  database: {
    getStatus: () => ipcRenderer.invoke('workspace-database:get-status'),
    onStatus: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('workspace-database:status', listener);
      return () => ipcRenderer.removeListener('workspace-database:status', listener);
    },
  },
  ui: {
    setCurrentView: (view) => ipcRenderer.invoke('ui:set-current-view', view),
  },
  config: {
    load: () => ipcRenderer.invoke('config:load'),
    save: (config) => ipcRenderer.invoke('config:save', config),
    listModels: (config) => ipcRenderer.invoke('config:list-models', config),
    getModelInfo: (modelName) => ipcRenderer.invoke('config:get-model-info', modelName),
    openConfigFolder: () => ipcRenderer.invoke('config:open-config-folder'),
  },
  license: {
    getStatus: () => ipcRenderer.invoke('license:get-status'),
    refresh: () => ipcRenderer.invoke('license:refresh'),
    importOfflineFile: () => ipcRenderer.invoke('license:import-offline-file'),
    activateOfflineCode: (code) => ipcRenderer.invoke('license:activate-offline-code', code),
  },
  ai: {
    chat: (request) => ipcRenderer.invoke('ai:chat', request),
    requestJson: (request) => ipcRenderer.invoke('ai:request-json', request),
    testImageModel: (config) => ipcRenderer.invoke('ai:test-image-model', config),
    onHttpError: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('ai:http-error', listener);
      return () => ipcRenderer.removeListener('ai:http-error', listener);
    },
  },
  autoConfirmation: {
    getState: () => ipcRenderer.invoke('auto-confirmation:get-state'),
    setEnabled: (enabled) => ipcRenderer.invoke('auto-confirmation:set-enabled', enabled),
    onChanged: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('auto-confirmation:state', listener);
      ipcRenderer.send('auto-confirmation:subscribe');
      return () => ipcRenderer.removeListener('auto-confirmation:state', listener);
    },
  },
  agent: {
    run: (payload) => ipcRenderer.invoke('agent:run', payload),
    selfCheck: () => ipcRenderer.invoke('agent:self-check'),
    exportSelfCheckReport: (payload) => ipcRenderer.invoke('agent:export-self-check-report', payload),
    getStatus: () => ipcRenderer.invoke('agent:get-status'),
    restart: (reason) => ipcRenderer.invoke('agent:restart', reason),
    getPendingQuestion: () => ipcRenderer.invoke('agent:get-pending-question'),
    answerQuestion: (payload) => ipcRenderer.invoke('agent:answer-question', payload),
    suppressQuestionAutoAnswer: (payload) => ipcRenderer.invoke('agent:suppress-question-auto-answer', payload),
    onStatus: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('agent:status', listener);
      ipcRenderer.send('agent:subscribe');
      return () => ipcRenderer.removeListener('agent:status', listener);
    },
    onQuestion: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('agent:question-state', listener);
      ipcRenderer.send('agent:subscribe');
      return () => ipcRenderer.removeListener('agent:question-state', listener);
    },
  },
  developerTokenStats: {
    openWindow: () => ipcRenderer.invoke('developer-token-stats:open-window'),
    get: () => ipcRenderer.invoke('developer-token-stats:get'),
    reset: () => ipcRenderer.invoke('developer-token-stats:reset'),
    onChanged: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('developer-token-stats:changed', listener);
      return () => ipcRenderer.removeListener('developer-token-stats:changed', listener);
    },
  },
  developerAgentMonitor: {
    openWindow: () => ipcRenderer.invoke('developer-agent-monitor:open-window'),
    openWorkspace: (workspaceDir) => ipcRenderer.invoke('developer-agent-monitor:open-workspace', workspaceDir),
    attach: () => ipcRenderer.invoke('developer-agent-monitor:attach'),
    detach: () => ipcRenderer.invoke('developer-agent-monitor:detach'),
    onEvent: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('developer-agent-monitor:event', listener);
      return () => ipcRenderer.removeListener('developer-agent-monitor:event', listener);
    },
  },
  file: {
    /** 把拖拽进来的 File 对象换成本地绝对路径，供各上传区拖拽导入使用 */
    getPathForFile: (file) => webUtils.getPathForFile(file),
  },
  knowledgeBase: {
    list: () => ipcRenderer.invoke('knowledge-base:list'),
    createFolder: (name) => ipcRenderer.invoke('knowledge-base:create-folder', name),
    renameFolder: (folderId, name) => ipcRenderer.invoke('knowledge-base:rename-folder', folderId, name),
    reorderFolder: (draggedFolderId, targetFolderId, position) => ipcRenderer.invoke('knowledge-base:reorder-folder', draggedFolderId, targetFolderId, position),
    deleteFolder: (folderId) => ipcRenderer.invoke('knowledge-base:delete-folder', folderId),
    deleteDocument: (documentId) => ipcRenderer.invoke('knowledge-base:delete-document', documentId),
    moveDocument: (documentId, targetFolderId, targetDocumentId, position) => ipcRenderer.invoke('knowledge-base:move-document', documentId, targetFolderId, targetDocumentId, position),
    uploadDocuments: (folderId) => ipcRenderer.invoke('knowledge-base:upload-documents', folderId),
    retryDocument: (documentId) => ipcRenderer.invoke('knowledge-base:retry-document', documentId),
    startMatching: (documentId, batchSize) => ipcRenderer.invoke('knowledge-base:start-matching', documentId, batchSize), // batchSize 已忽略
    readMarkdown: (documentId) => ipcRenderer.invoke('knowledge-base:read-markdown', documentId),
    readItems: (documentId) => ipcRenderer.invoke('knowledge-base:read-items', documentId),
    readAnalysis: (documentId) => ipcRenderer.invoke('knowledge-base:read-analysis', documentId),
    searchItems: (keyword, options) => ipcRenderer.invoke('knowledge-base:search-items', keyword, options),
    onEvent: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('knowledge-base:event', listener);
      return () => ipcRenderer.removeListener('knowledge-base:event', listener);
    },
  },
  greenReport: {
    loadState: () => ipcRenderer.invoke('green-report:load-state'),
    updateStep: (step) => ipcRenderer.invoke('green-report:update-step', step),
    saveReportType: (reportType) => ipcRenderer.invoke('green-report:save-report-type', reportType),
    saveProjectInfo: (projectInfo) => ipcRenderer.invoke('green-report:save-project-info', projectInfo),
    saveOutlineConfig: (payload) => ipcRenderer.invoke('green-report:save-outline-config', payload),
    saveReportConfig: (payload) => ipcRenderer.invoke('green-report:save-report-config', payload),
    saveKnowledgeContext: (context) => ipcRenderer.invoke('green-report:save-knowledge-context', context),
    saveOutline: (payload) => ipcRenderer.invoke('green-report:save-outline', payload),
    saveChapterContent: (payload) => ipcRenderer.invoke('green-report:save-chapter-content', payload),
    clear: () => ipcRenderer.invoke('green-report:clear'),
    generateReportCode: () => ipcRenderer.invoke('green-report:generate-report-code'),
  },
  templates: {
    list: () => ipcRenderer.invoke('templates:list'),
    get: (templateId) => ipcRenderer.invoke('templates:get', templateId),
    create: (config) => ipcRenderer.invoke('templates:create', config),
    update: (templateId, config) => ipcRenderer.invoke('templates:update', templateId, config),
    delete: (templateId) => ipcRenderer.invoke('templates:delete', templateId),
  },
  tasks: {
    startGreenReportOutline: (payload) => ipcRenderer.invoke('tasks:start-green-report-outline', payload),
    startGreenReportContent: (payload) => ipcRenderer.invoke('tasks:start-green-report-content', payload),
    getActiveTasks: () => ipcRenderer.invoke('tasks:get-active'),
    onTaskEvent: (callback) => {
      ipcRenderer.send('tasks:subscribe');
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('tasks:event', listener);
      return () => ipcRenderer.removeListener('tasks:event', listener);
    },
  },
  export: {
    exportWord: (payload) => ipcRenderer.invoke('export:word', payload),
    exportPdf: (payload) => ipcRenderer.invoke('export:pdf', payload),
    openFile: (filePath) => ipcRenderer.invoke('export:open-file', filePath),
    onWordExportProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('export:word-progress', listener);
      return () => ipcRenderer.removeListener('export:word-progress', listener);
    },
    onPdfExportProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('export:pdf-progress', listener);
      return () => ipcRenderer.removeListener('export:pdf-progress', listener);
    },
  },
  systemFonts: {
    list: () => ipcRenderer.invoke('system-fonts:list'),
  },
  plugins: {
    getAvailablePlugins: () => ipcRenderer.invoke('plugins:getAvailablePlugins'),
    install: (pluginId) => ipcRenderer.invoke('plugins:install', pluginId),
    installOffline: () => ipcRenderer.invoke('plugins:installOffline'),
    uninstall: (pluginId) => ipcRenderer.invoke('plugins:uninstall', pluginId),
    enable: (pluginId) => ipcRenderer.invoke('plugins:enable', pluginId),
    disable: (pluginId) => ipcRenderer.invoke('plugins:disable', pluginId),
    update: (pluginId) => ipcRenderer.invoke('plugins:update', pluginId),
    checkUpdates: () => ipcRenderer.invoke('plugins:checkUpdates'),
    updateAll: () => ipcRenderer.invoke('plugins:updateAll'),
    openConfig: (pluginId) => ipcRenderer.invoke('plugins:openConfig', pluginId),
    refreshMarket: () => ipcRenderer.invoke('plugins:refreshMarket'),
    clearUpdateFailedState: (pluginId) => ipcRenderer.invoke('plugins:clearUpdateFailedState', pluginId),
    notifyEvent: (pluginId, event, payload) => ipcRenderer.invoke('plugins:notify-event', pluginId, event, payload),
  },
};

contextBridge.exposeInMainWorld('lvcert', bridge);

contextBridge.exposeInMainWorld('yibiaoClient', {
  appName: bridge.appName,
  platform: bridge.platform,
});
