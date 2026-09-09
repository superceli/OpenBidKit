const path = require('node:path');

function getUserDataPath(app) {
  return app.getPath('userData');
}

function getConfigFilePath(app) {
  return path.join(getUserDataPath(app), 'user_config.json');
}

function getLicenseFilePath(app) {
  return path.join(getUserDataPath(app), 'license.json');
}

function getDonationStateFilePath(app) {
  return path.join(getUserDataPath(app), 'donation_state.json');
}

function getGpuStartupProbePath(app) {
  return path.join(getUserDataPath(app), 'gpu_startup_probe.json');
}

function getWorkspaceDir(app) {
  return path.join(getUserDataPath(app), 'workspace');
}

/** 强制删除失败时的回收目录;放在 workspace 外,避免被工作区扫描看到。 */
function getWorkspaceTrashDir(app) {
  return path.join(getUserDataPath(app), 'workspace-trash');
}

function getWorkspaceDatabasePath(app) {
  return path.join(getWorkspaceDir(app), 'yibiao.sqlite');
}

function getGeneratedImagesDir(app) {
  return path.join(getWorkspaceDir(app), 'generated-images');
}

function getImportedImagesDir(app) {
  return path.join(getWorkspaceDir(app), 'imported-images');
}

function getKnowledgeBaseDir(app) {
  return path.join(getWorkspaceDir(app), 'knowledge-base');
}

function getAiLogsDir(app) {
  return path.join(getUserDataPath(app), 'logs', 'ai');
}

function getDeveloperLogsDir(app, moduleName) {
  return path.join(getUserDataPath(app), 'logs', String(moduleName || 'app'));
}

function getAgentRuntimeDir(app) {
  return path.join(getUserDataPath(app), 'agent-runtime');
}

function getPlatformArchKey() {
  return `${process.platform}-${process.arch}`;
}

function getBundledAgentToolsBinDir(app) {
  if (process.env.LVCERT_AGENT_TOOLS_BIN_DIR) {
    return process.env.LVCERT_AGENT_TOOLS_BIN_DIR;
  }

  const platformArch = getPlatformArchKey();
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'agent-tools', platformArch, 'bin');
  }

  return path.join(__dirname, '..', '..', 'vendor', 'agent-tools', platformArch, 'bin');
}

/** Open XML 助手任务根目录。 */
function getOpenXmlJobsDir(app) {
  return path.join(getWorkspaceDir(app), 'openxml-jobs');
}

/** 单个 Open XML 任务目录。 */
function getOpenXmlJobDir(app, jobId) {
  return path.join(getOpenXmlJobsDir(app), String(jobId || ''));
}

/** 绿色报告封面 docx 模板路径；打包后在 resources/assets，开发时在 client/assets。 */
function getGreenReportCoverTemplatePath(app) {
  if (process.env.LVCERT_GREEN_REPORT_COVER_TEMPLATE) {
    return process.env.LVCERT_GREEN_REPORT_COVER_TEMPLATE;
  }
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'assets', 'green-report-cover.docx');
  }
  return path.join(__dirname, '..', '..', 'assets', 'green-report-cover.docx');
}

/** 绿色报告签章页 docx 模板路径。 */
function getSigningPageTemplatePath(app) {
  if (process.env.LVCERT_SIGNING_PAGE_TEMPLATE) {
    return process.env.LVCERT_SIGNING_PAGE_TEMPLATE;
  }
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'assets', 'signing-page-template.docx');
  }
  return path.join(__dirname, '..', '..', 'assets', 'signing-page-template.docx');
}

/** 开发时编译用的助手工程路径。 */
function getOpenXmlHelperProjectPath() {
  return path.join(__dirname, '..', '..', '..', 'openxmlhelper', 'src', 'OpenXmlHelper', 'OpenXmlHelper.csproj');
}

/** 开发编译后的助手可执行文件。 */
function getOpenXmlHelperDebugExecutablePath() {
  const fileName = process.platform === 'win32' ? 'openxmlhelper.exe' : 'openxmlhelper';
  return path.join(__dirname, '..', '..', '..', 'openxmlhelper', 'src', 'OpenXmlHelper', 'bin', 'Debug', 'net10.0', fileName);
}

/** 安装包或本地 vendor 中的自包含助手目录。 */
function getBundledOpenXmlHelperDir(app) {
  if (process.env.LVCERT_OPENXML_HELPER_DIR) {
    return process.env.LVCERT_OPENXML_HELPER_DIR;
  }

  const platformArch = getPlatformArchKey();
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'openxml-tools', platformArch);
  }

  return path.join(__dirname, '..', '..', 'vendor', 'openxml-tools', platformArch);
}

/** 安装包内的助手可执行文件。 */
function getBundledOpenXmlHelperPath(app) {
  const fileName = process.platform === 'win32' ? 'openxmlhelper.exe' : 'openxmlhelper';
  return path.join(getBundledOpenXmlHelperDir(app), fileName);
}

module.exports = {
  getAgentRuntimeDir,
  getAiLogsDir,
  getBundledAgentToolsBinDir,
  getBundledOpenXmlHelperDir,
  getBundledOpenXmlHelperPath,
  getDeveloperLogsDir,
  getConfigFilePath,
  getDonationStateFilePath,
  getGpuStartupProbePath,
  getGreenReportCoverTemplatePath,
  getSigningPageTemplatePath,
  getGeneratedImagesDir,
  getImportedImagesDir,
  getKnowledgeBaseDir,
  getLicenseFilePath,
  getOpenXmlHelperDebugExecutablePath,
  getOpenXmlHelperProjectPath,
  getOpenXmlJobDir,
  getOpenXmlJobsDir,
  getWorkspaceDir,
  getWorkspaceDatabasePath,
  getWorkspaceTrashDir,
  getUserDataPath,
};
