'use strict';

const { ipcMain } = require('electron');

function registerGreenReportIpc({ greenReportStore, greenReportImageService, taskService }) {
  ipcMain.handle('green-report:list', () => {
    return greenReportStore.listReports();
  });

  ipcMain.handle('green-report:create', (_event, payload) => {
    return greenReportStore.createReport(payload || {});
  });

  ipcMain.handle('green-report:delete', (_event, reportId) => {
    if (taskService.hasActiveTask(reportId)) {
      return { success: false, message: '该报告正在生成，请先取消生成后再删除' };
    }
    return greenReportStore.deleteReport(reportId);
  });

  ipcMain.handle('green-report:load-state', (_event, reportId) => {
    return greenReportStore.reportExists(reportId) ? greenReportStore.loadState(reportId) : null;
  });

  ipcMain.handle('green-report:update-step', (_event, reportId, step) => {
    greenReportStore.updateStep(reportId, step);
  });

  ipcMain.handle('green-report:save-report-type', (_event, reportId, reportType) => {
    greenReportStore.saveReportType(reportId, reportType);
  });

  ipcMain.handle('green-report:save-project-info', (_event, reportId, projectInfo) => {
    return greenReportStore.saveProjectInfo(reportId, projectInfo);
  });

  ipcMain.handle('green-report:save-outline-config', (_event, reportId, payload) => {
    return greenReportStore.saveOutlineConfig(reportId, payload);
  });

  ipcMain.handle('green-report:save-report-config', (_event, reportId, payload) => {
    return greenReportStore.saveReportConfig(reportId, payload);
  });

  ipcMain.handle('green-report:save-knowledge-context', (_event, reportId, context) => {
    return greenReportStore.saveKnowledgeContext(reportId, context);
  });

  ipcMain.handle('green-report:save-outline', (_event, reportId, payload) => {
    return greenReportStore.saveOutline(reportId, payload);
  });

  ipcMain.handle('green-report:save-chapter-content', (_event, reportId, payload) => {
    return greenReportStore.saveChapterContent(reportId, payload);
  });

  ipcMain.handle('green-report:clear', (_event, reportId) => {
    return greenReportStore.clear(reportId);
  });

  ipcMain.handle('green-report:generate-report-code', () => {
    return greenReportStore.generateReportCode();
  });

  ipcMain.handle('green-report:list-images', (_event, folderId) => {
    return greenReportImageService.list(folderId);
  });

  ipcMain.handle('green-report:add-images', (_event, folderId) => {
    return greenReportImageService.addImages(folderId);
  });

  ipcMain.handle('green-report:update-image', (_event, payload) => {
    return greenReportImageService.updateImage(payload);
  });

  ipcMain.handle('green-report:delete-image', (_event, imageId) => {
    return greenReportImageService.deleteImage(imageId);
  });

  ipcMain.handle('tasks:start-green-report-outline', async (event, payload) => {
    taskService.subscribe(event.sender);
    return taskService.startGreenReportOutline(payload);
  });

  ipcMain.handle('tasks:start-green-report-content', async (event, payload) => {
    taskService.subscribe(event.sender);
    return taskService.startGreenReportContent({
      ...payload,
      imageAssets: greenReportImageService.listForGeneration(payload?.projectInfo?.companyName),
    });
  });

  ipcMain.handle('tasks:cancel-green-report-outline', (event, reportId) => {
    taskService.subscribe(event.sender);
    return taskService.cancelGreenReportOutline(reportId);
  });

  ipcMain.handle('tasks:cancel-green-report-content', (event, reportId) => {
    taskService.subscribe(event.sender);
    return taskService.cancelGreenReportContent(reportId);
  });

  ipcMain.handle('tasks:cancel-green-report', (event, reportId) => {
    taskService.subscribe(event.sender);
    return taskService.cancelReportTasks(reportId);
  });
}

module.exports = { registerGreenReportIpc };
