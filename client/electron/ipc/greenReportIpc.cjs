'use strict';

const { ipcMain } = require('electron');

function registerGreenReportIpc({ greenReportStore, taskService }) {
  ipcMain.handle('green-report:load-state', () => {
    return greenReportStore.loadState();
  });

  ipcMain.handle('green-report:update-step', (_event, step) => {
    greenReportStore.updateStep(step);
  });

  ipcMain.handle('green-report:save-report-type', (_event, reportType) => {
    greenReportStore.saveReportType(reportType);
  });

  ipcMain.handle('green-report:save-project-info', (_event, projectInfo) => {
    return greenReportStore.saveProjectInfo(projectInfo);
  });

  ipcMain.handle('green-report:save-outline-config', (_event, payload) => {
    return greenReportStore.saveOutlineConfig(payload);
  });

  ipcMain.handle('green-report:save-report-config', (_event, payload) => {
    return greenReportStore.saveReportConfig(payload);
  });

  ipcMain.handle('green-report:save-knowledge-context', (_event, context) => {
    return greenReportStore.saveKnowledgeContext(context);
  });

  ipcMain.handle('green-report:save-outline', (_event, payload) => {
    return greenReportStore.saveOutline(payload);
  });

  ipcMain.handle('green-report:save-chapter-content', (_event, payload) => {
    return greenReportStore.saveChapterContent(payload);
  });

  ipcMain.handle('green-report:clear', () => {
    return greenReportStore.clear();
  });

  ipcMain.handle('green-report:generate-report-code', () => {
    return greenReportStore.generateReportCode();
  });

  ipcMain.handle('tasks:start-green-report-outline', async (event, payload) => {
    taskService.subscribe(event.sender);
    return taskService.startGreenReportOutline(payload);
  });

  ipcMain.handle('tasks:start-green-report-content', async (event, payload) => {
    taskService.subscribe(event.sender);
    return taskService.startGreenReportContent(payload);
  });
}

module.exports = { registerGreenReportIpc };
