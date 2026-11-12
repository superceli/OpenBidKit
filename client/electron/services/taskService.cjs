'use strict';

const crypto = require('node:crypto');
const { runGreenReportOutlineTask, runGreenReportContentTask } = require('./greenReportTasks.cjs');
const { normalizeLogs } = require('./taskLogStore.cjs');

// 最多同时生成的报告份数，超出排队等待。
const MAX_CONCURRENT_REPORTS = 2;

const taskDefinitions = {
  'green-report-outline': {
    label: '绿色报告目录生成',
    group: 'green-report',
    groupLabel: '绿色报告',
    step: 3,
    lockPolicy: 'scope-exclusive',
    stateKey: 'greenReport',
    field: 'outlineTask',
  },
  'green-report-content': {
    label: '绿色报告正文生成',
    group: 'green-report',
    groupLabel: '绿色报告',
    step: 4,
    lockPolicy: 'scope-exclusive',
    stateKey: 'greenReport',
    field: 'contentTask',
  },
};

function now() {
  return new Date().toISOString();
}

function getTaskDefinition(type) {
  return taskDefinitions[type] || { label: type, stateKey: 'greenReport', field: undefined, lockPolicy: 'none' };
}

function getReportId(payload) {
  return String(payload?.reportId ?? payload?.report_id ?? '').trim();
}

function getScopeId(payload) {
  return getReportId(payload);
}

function getPayloadSignature() {
  return undefined;
}

function isActiveTaskStatus(status) {
  return status === 'running' || status === 'pausing';
}

function isQueuedTaskStatus(status) {
  return status === 'queued';
}

function hasOwn(value, field) {
  return Object.prototype.hasOwnProperty.call(value || {}, field);
}

function copyPatchFields(target, source, fields) {
  for (const field of fields) {
    if (hasOwn(source, field)) {
      target[field] = source[field];
    }
  }
}

function taskKey(type, reportId) {
  return `${type}:${reportId}`;
}

function createTask(type, payload) {
  const definition = getTaskDefinition(type);
  const reportId = getReportId(payload);
  return {
    task_id: crypto.randomUUID(),
    type,
    group: definition.group,
    step: definition.step,
    lock_policy: definition.lockPolicy,
    report_id: reportId,
    scope_id: reportId || undefined,
    payload_signature: getPayloadSignature(type, payload),
    status: 'running',
    progress: 0,
    logs: [],
    started_at: now(),
    updated_at: now(),
  };
}

function createTaskService({ aiService, agentService, autoConfirmationService, knowledgeBaseService, openXmlHelperService, greenReportStore }) {
  const subscribers = new Set();
  const callbackSubscribers = new Set();
  const activeTasks = new Map();
  const activeTaskControls = new Map();
  const queuedTasks = new Map();

  function emit(task, snapshot) {
    const event = { task, ...snapshot };
    for (const webContents of subscribers) {
      if (!webContents.isDestroyed()) {
        webContents.send('tasks:event', event);
      }
    }
    for (const callback of callbackSubscribers) {
      callback(event);
    }
  }

  function buildSnapshot(definition, reportId, state) {
    if (definition.stateKey === 'greenReport') {
      return { reportId, greenReportPatch: state };
    }
    return {};
  }

  function getSnapshotForTask(task) {
    const definition = getTaskDefinition(task.type);
    if (definition.stateKey !== 'greenReport') return {};
    const reportId = task.report_id || '';
    if (!reportId || !greenReportStore.reportExists(reportId)) {
      return { reportId };
    }
    return buildSnapshot(definition, reportId, greenReportStore.loadState(reportId));
  }

  function subscribe(webContents) {
    subscribers.add(webContents);
    for (const task of [...activeTasks.values(), ...queuedTasks.values()]) {
      if (!webContents.isDestroyed()) {
        webContents.send('tasks:event', { task, ...getSnapshotForTask(task) });
      }
    }
    webContents.once('destroyed', () => subscribers.delete(webContents));
  }

  /**
   * 订阅 Main 进程中的任务事件，并返回取消订阅函数
   */
  function subscribeCallback(callback) {
    callbackSubscribers.add(callback);
    for (const task of [...activeTasks.values(), ...queuedTasks.values()]) {
      callback({ task, ...getSnapshotForTask(task) });
    }
    return () => callbackSubscribers.delete(callback);
  }

  function getTaskField(type) {
    return getTaskDefinition(type).field;
  }

  function getActiveTaskConflict(type, payload) {
    const definition = getTaskDefinition(type);
    if (definition.lockPolicy === 'none' || !definition.group) {
      return null;
    }

    const nextScopeId = getScopeId(payload);
    const allTasks = [
      ...activeTasks.values(),
      ...[...queuedTasks.values()].map((entry) => entry.task),
    ];
    for (const task of allTasks) {
      if (!isActiveTaskStatus(task.status) && !isQueuedTaskStatus(task.status)) {
        continue;
      }
      if (task.type === type) continue;

      const activeDefinition = getTaskDefinition(task.type);
      if (activeDefinition.group !== definition.group) {
        continue;
      }

      if (definition.lockPolicy === 'group-exclusive') {
        return { task, definition: activeDefinition };
      }

      if (
        definition.lockPolicy === 'scope-exclusive'
        && nextScopeId
        && (task.report_id || getScopeId(task.payload || {})) === nextScopeId
      ) {
        return { task, definition: activeDefinition };
      }
    }
    return null;
  }

  function assertTaskCanStart(type, payload) {
    const conflict = getActiveTaskConflict(type, payload);
    if (conflict) {
      const nextDefinition = getTaskDefinition(type);
      const message = nextDefinition.groupLabel && nextDefinition.label
        ? `该报告正在执行“${conflict.definition.label || conflict.task.type}”，请等待完成或先取消。`
        : '该任务组正在执行其他任务，请等待完成。';
      throw new Error(message);
    }
  }

  function updateWorkspaceStateWithoutReload(reportId, partial) {
    greenReportStore.updateGreenReportWithoutReload(reportId, partial);
  }

  function loadWorkspaceState(reportId) {
    return greenReportStore.loadState(reportId);
  }

  function createScopedWorkspaceStore(reportId) {
    return {
      ...greenReportStore,
      loadState: () => greenReportStore.loadState(reportId),
      saveOutlineFromResult: (outlineData) => greenReportStore.saveOutlineFromResult(reportId, outlineData),
      saveChapterContent: (payload) => greenReportStore.saveChapterContent(reportId, payload),
      clearAllChapterContent: () => greenReportStore.clearAllChapterContent(reportId),
      saveTaskState: (type, taskState) => greenReportStore.saveTaskState(reportId, type, taskState),
    };
  }

  function createAgentUserTaskContext(type, definition, payload, currentTask) {
    return {
      managed_task: {
        type,
        label: definition.label || type,
        group: definition.group || '',
        group_label: definition.groupLabel || '',
        step: definition.step,
        state_key: definition.stateKey || '',
        report_id: getReportId(payload),
        payload,
        state: currentTask,
      },
      workflow_settings: {},
    };
  }

  function countRunningReports() {
    const reportIds = new Set();
    for (const task of activeTasks.values()) {
      if (isActiveTaskStatus(task.status) && task.report_id) {
        reportIds.add(task.report_id);
      }
    }
    return reportIds.size;
  }

  function launchManagedTask({ type, task, payload, runner, initialPartial = {}, startOptions = {} }) {
    const definition = getTaskDefinition(type);
    const reportId = task.report_id;
    const key = taskKey(type, reportId);
    startOptions.beforeStart?.();

    const queuedControl = queuedTasks.get(key);
    if (queuedControl) queuedTasks.delete(key);

    task = { ...task, status: 'running', updated_at: now() };
    activeTasks.set(key, task);
    const taskField = getTaskField(type);
    let currentTask = task;
    const abortController = new AbortController();
    let resolveSettled;
    const settledPromise = new Promise((resolve) => {
      resolveSettled = resolve;
    });
    const taskControl = {
      queueScopeId: `${type}:${task.task_id}`,
      signal: abortController.signal,
      pauseRequested: false,
      isPauseRequested() {
        return this.pauseRequested;
      },
      requestPause() {
        this.pauseRequested = true;
        const pausedLogs = currentTask.logs?.length
          ? currentTask.logs
          : ['已请求暂停，正在等待当前 AI 请求完成。'];
        return checkpointTask({ status: 'pausing', pause_requested: true, logs: pausedLogs }).task;
      },
      cancel(reason = '后台任务已取消') {
        const error = new Error(reason);
        error.code = 'TASK_CANCELLED';
        autoConfirmationService.unregister?.(this.outlineSelectionAutoConfirmationId);
        this.outlineSelectionAutoConfirmationId = null;
        if (!abortController.signal.aborted) abortController.abort(error);
      },
      waitForSettlement() {
        return settledPromise;
      },
      dispose() {
        autoConfirmationService.unregister?.(this.outlineSelectionAutoConfirmationId);
        this.outlineSelectionAutoConfirmationId = null;
      },
    };
    activeTaskControls.set(key, taskControl);

    const applyTaskPatch = (partial) => {
      const nextStatus = currentTask.status === 'pausing' && partial.status === 'running'
        ? 'pausing'
        : partial.status || currentTask.status;
      currentTask = {
        ...currentTask,
        ...partial,
        status: nextStatus,
        pause_requested: partial.pause_requested === false ? false : taskControl.pauseRequested || partial.pause_requested,
        logs: partial.logs ? normalizeLogs(partial.logs) : currentTask.logs,
        updated_at: now(),
      };
      activeTasks.set(key, currentTask);
      return currentTask;
    };

    // 高频展示状态：立即推送 Renderer；同时节流落库，保证列表/详情重新进入时能直接回显最新进度。
    let lastProgressPersistAt = 0;
    const updateTask = (partial, workspaceState = {}, eventPatch) => {
      const nextTask = applyTaskPatch(partial);
      emit(nextTask, buildSnapshot(definition, reportId, { ...(workspaceState || {}), [taskField]: nextTask }));
      const ts = Date.now();
      if (!lastProgressPersistAt || ts - lastProgressPersistAt >= 1200) {
        lastProgressPersistAt = ts;
        try {
          greenReportStore.saveTaskState(reportId, type, nextTask);
        } catch (error) {
          // 进度落库失败不影响任务执行
        }
      }
      return nextTask;
    };

    // 将业务状态和任务状态作为同一个 checkpoint 落库，并在提交后统一推送事件。
    const checkpointTask = (taskPartial, workspacePartial = {}) => {
      if (taskControl.signal.aborted) {
        throw taskControl.signal.reason || new Error('后台任务已取消');
      }
      const nextTask = applyTaskPatch(taskPartial);
      const persistedPatch = {
        ...(workspacePartial || {}),
        [taskField]: nextTask,
      };
      updateWorkspaceStateWithoutReload(reportId, persistedPatch);
      emit(nextTask, buildSnapshot(definition, reportId, persistedPatch));
      return { task: nextTask };
    };

    const previousState = loadWorkspaceState(reportId) || {};
    // 互斥任务：启动当前任务时清除同报告的另一个任务状态，避免旧进度条残留
    const siblingReset = {};
    if (definition.stateKey === 'greenReport') {
      if (taskField === 'outlineTask') {
        siblingReset.contentTask = null;
        Object.assign(siblingReset, greenReportStore.clearAllChapterContent(reportId));
      } else if (taskField === 'contentTask') {
        siblingReset.outlineTask = null;
        Object.assign(siblingReset, greenReportStore.clearAllChapterContent(reportId));
      }
    }
    const initialState = startOptions.skipInitialStateUpdate
      ? previousState
      : { ...siblingReset, ...initialPartial, [taskField]: currentTask };
    if (!startOptions.skipInitialStateUpdate) {
      updateWorkspaceStateWithoutReload(reportId, initialState);
    }
    // 首次启动时把 running 状态落库，保证重启后能识别中断任务
    greenReportStore.saveTaskState(reportId, type, currentTask);
    emit(currentTask, buildSnapshot(definition, reportId, initialState));

    const runnerWorkspaceStore = createScopedWorkspaceStore(reportId);
    const runnerAiService = aiService?.withQueueScope ? aiService.withQueueScope(taskControl.queueScopeId, taskControl.signal) : aiService;
    const agentTaskContextProvider = () => createAgentUserTaskContext(type, definition, payload, currentTask);
    const runnerAgentService = agentService.bindTaskContext(
      agentTaskContextProvider,
      {
        queueScopeId: taskControl.queueScopeId,
        signal: taskControl.signal,
        primary_session: startOptions.primarySession === true,
      },
    );
    const runnerOrdinaryAgentService = agentService.bindTaskContext(
      agentTaskContextProvider,
      {
        queueScopeId: taskControl.queueScopeId,
        signal: taskControl.signal,
      },
    );
    runner({ aiService: runnerAiService, agentService: runnerAgentService, ordinaryAgentService: runnerOrdinaryAgentService, workspaceStore: runnerWorkspaceStore, knowledgeBaseService, openXmlHelperService, updateTask, checkpointTask, payload, taskControl, previousState }).catch((error) => {
      if (!taskControl.signal.aborted) {
        checkpointTask({ status: 'error', error: error.message || '任务执行失败' });
      }
    }).finally(() => {
      taskControl.dispose();
      if (aiService?.resumeQueueScope) {
        aiService.resumeQueueScope(taskControl.queueScopeId);
      }
      activeTasks.delete(key);
      activeTaskControls.delete(key);
      resolveSettled();
      pumpQueue();
    });

    return currentTask;
  }

  function pumpQueue() {
    while (queuedTasks.size && countRunningReports() < MAX_CONCURRENT_REPORTS) {
      const [key, entry] = queuedTasks.entries().next().value;
      queuedTasks.delete(key);
      try {
        launchManagedTask(entry);
      } catch (error) {
        const task = { ...entry.task, status: 'error', error: error.message || '任务启动失败', updated_at: now() };
        greenReportStore.saveTaskState(entry.task.report_id, entry.type, task);
        emit(task, buildSnapshot(getTaskDefinition(entry.type), entry.task.report_id, null));
      }
    }
  }

  function startManagedTask(type, payload, runner, initialPartial = {}, startOptions = {}) {
    const reportId = getReportId(payload);
    if (!reportId) {
      throw new Error('缺少报告 ID，无法启动生成任务');
    }
    const key = taskKey(type, reportId);
    const existingTask = activeTasks.get(key) || queuedTasks.get(key)?.task;
    if (existingTask) {
      emit(existingTask, getSnapshotForTask(existingTask));
      return existingTask;
    }

    assertTaskCanStart(type, payload);

    const definition = getTaskDefinition(type);
    const task = startOptions.existingTask || createTask(type, payload);

    if (countRunningReports() >= MAX_CONCURRENT_REPORTS) {
      const queuedTask = { ...task, status: 'queued', updated_at: now() };
      queuedTasks.set(key, { type, task: queuedTask, payload, runner, initialPartial, startOptions });
      greenReportStore.saveTaskState(reportId, type, queuedTask);
      emit(queuedTask, buildSnapshot(definition, reportId, null));
      return queuedTask;
    }

    return launchManagedTask({ type, task, payload, runner, initialPartial, startOptions });
  }

  // 恢复应用异常关闭时仍在运行的绿色报告任务，将其标记为 error 状态。
  function recoverInterruptedGreenReportTasks() {
    for (const summary of greenReportStore.listReports()) {
      const reportId = summary.id;
      const state = greenReportStore.loadState(reportId) || {};
      for (const [taskField, taskType] of [['outlineTask', 'green-report-outline'], ['contentTask', 'green-report-content']]) {
        const task = state[taskField];
        if (!task) continue;
        if (!isActiveTaskStatus(task.status) && !isQueuedTaskStatus(task.status)) continue;
        if (activeTasks.has(taskKey(taskType, reportId))) continue;
        greenReportStore.saveTaskState(reportId, taskType, {
          ...task,
          status: 'error',
          error: '上次任务因应用关闭而中断，请重新生成。',
          updated_at: now(),
        });
      }
    }
  }

  recoverInterruptedGreenReportTasks();

  function markTaskCancelled(type, reportId, task) {
    const definition = getTaskDefinition(type);
    const taskField = getTaskField(type);
    const nextStatus = { ...task, status: 'cancelled', error: '任务已被用户取消', updated_at: now() };
    greenReportStore.updateGreenReportWithoutReload(reportId, { [taskField]: nextStatus });
    emit(nextStatus, buildSnapshot(definition, reportId, { [taskField]: nextStatus }));
    return nextStatus;
  }

  function cancelTask(type, reportId) {
    const id = String(reportId || '').trim();
    if (!id) return { success: false, message: '缺少报告 ID' };
    const key = taskKey(type, id);
    const queued = queuedTasks.get(key);
    if (queued) {
      queuedTasks.delete(key);
      markTaskCancelled(type, id, queued.task);
      return { success: true };
    }
    const control = activeTaskControls.get(key);
    if (!control) return { success: false, message: '当前没有正在执行的任务' };
    const task = activeTasks.get(key);
    if (task) {
      markTaskCancelled(type, id, task);
    }
    control.cancel();
    return { success: true };
  }

  function cancelReportTasks(reportId) {
    const id = String(reportId || '').trim();
    if (!id) return { success: false, message: '缺少报告 ID' };
    let cancelled = false;
    for (const type of Object.keys(taskDefinitions)) {
      const result = cancelTask(type, id);
      if (result.success) cancelled = true;
    }
    return cancelled
      ? { success: true }
      : { success: false, message: '该报告当前没有正在执行的任务' };
  }

  function hasActiveTask(reportId) {
    const id = String(reportId || '').trim();
    if (!id) return false;
    for (const task of activeTasks.values()) {
      if (task.report_id === id && isActiveTaskStatus(task.status)) return true;
    }
    for (const entry of queuedTasks.values()) {
      if (entry.task.report_id === id) return true;
    }
    return false;
  }

  return {
    subscribe,
    subscribeCallback,
    startGreenReportOutline(payload) {
      return startManagedTask('green-report-outline', payload, runGreenReportOutlineTask);
    },
    startGreenReportContent(payload) {
      return startManagedTask('green-report-content', payload, runGreenReportContentTask);
    },
    cancelGreenReportOutline(reportId) { return cancelTask('green-report-outline', reportId); },
    cancelGreenReportContent(reportId) { return cancelTask('green-report-content', reportId); },
    cancelReportTasks,
    hasActiveTask,
    getActiveTasks() {
      return [...activeTasks.values(), ...queuedTasks.values()].map((entry) => (entry.task ? entry.task : entry));
    },
  };
}

module.exports = { createTaskService };
