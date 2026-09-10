'use strict';

const crypto = require('node:crypto');
const { runGreenReportOutlineTask, runGreenReportContentTask } = require('./greenReportTasks.cjs');
const { normalizeLogs } = require('./taskLogStore.cjs');

const taskDefinitions = {
  'green-report-outline': {
    label: '绿色报告目录生成',
    group: 'green-report',
    groupLabel: '绿色报告',
    step: 3,
    lockPolicy: 'group-exclusive',
    stateKey: 'greenReport',
    field: 'outlineTask',
  },
  'green-report-content': {
    label: '绿色报告正文生成',
    group: 'green-report',
    groupLabel: '绿色报告',
    step: 4,
    lockPolicy: 'group-exclusive',
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

function getScopeId(payload) {
  const scopeId = payload?.scopeId ?? payload?.scope_id;
  return scopeId === undefined || scopeId === null ? '' : String(scopeId);
}

function getPayloadSignature() {
  return undefined;
}

function isActiveTaskStatus(status) {
  return status === 'running' || status === 'pausing';
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

function createTask(type, payload) {
  const definition = getTaskDefinition(type);
  const scopeId = getScopeId(payload);
  const payloadSignature = getPayloadSignature(type, payload);
  return {
    task_id: crypto.randomUUID(),
    type,
    group: definition.group,
    step: definition.step,
    lock_policy: definition.lockPolicy,
    scope_id: scopeId || undefined,
    payload_signature: payloadSignature,
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

  function buildSnapshot(definition, state) {
    if (definition.stateKey === 'greenReport') {
      return { greenReportPatch: state };
    }
    return {};
  }

  function getSnapshotForTask(task) {
    const definition = getTaskDefinition(task.type);
    if (definition.stateKey === 'greenReport') {
      return buildSnapshot(definition, greenReportStore.loadState());
    }
    return {};
  }

  function subscribe(webContents) {
    subscribers.add(webContents);
    for (const task of activeTasks.values()) {
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
    for (const task of activeTasks.values()) {
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
    for (const task of activeTasks.values()) {
      if (!isActiveTaskStatus(task.status) || task.type === type) {
        continue;
      }

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
        && getScopeId(task.payload || {}) === nextScopeId
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
        ? `当前${nextDefinition.groupLabel}正在执行“${nextDefinition.label}”，请等待当前任务完成。`
        : '当前任务组正在执行其他任务，请等待完成。';
      throw new Error(message);
    }
  }

  function updateWorkspaceStateWithoutReload(definition, partial) {
    if (definition.stateKey === 'greenReport') {
      greenReportStore.updateGreenReportWithoutReload(partial);
    }
  }

  function loadWorkspaceState(definition) {
    if (definition.stateKey === 'greenReport') {
      return greenReportStore.loadState();
    }
    return null;
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
        payload,
        state: currentTask,
      },
      workflow_settings: {},
    };
  }

  function startManagedTask(type, payload, runner, initialPartial = {}, startOptions = {}) {
    const existingTask = activeTasks.get(type);
    if (existingTask && isActiveTaskStatus(existingTask.status)) {
      const nextPayloadSignature = getPayloadSignature(type, payload);
      if (existingTask.payload_signature && nextPayloadSignature && existingTask.payload_signature !== nextPayloadSignature) {
        const definition = getTaskDefinition(type);
        throw new Error(`当前${definition.groupLabel || '任务组'}正在执行“${definition.label || type}”，请等待当前任务完成后再重新分析新的文件集合。`);
      }
      emit(existingTask, getSnapshotForTask(existingTask));
      return existingTask;
    }

    assertTaskCanStart(type, payload);
    startOptions.beforeStart?.();

    const definition = getTaskDefinition(type);
    const task = startOptions.existingTask || createTask(type, payload);
    const queueScopeId = `${type}:${task.task_id}`;
    activeTasks.set(type, task);
    const taskField = getTaskField(type);
    let currentTask = task;
    const abortController = new AbortController();
    let resolveSettled;
    const settledPromise = new Promise((resolve) => {
      resolveSettled = resolve;
    });
    const taskControl = {
      queueScopeId,
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
    activeTaskControls.set(type, taskControl);

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
      activeTasks.set(type, currentTask);
      return currentTask;
    };

    // 仅更新内存并推送 Renderer，用于无恢复价值的高频展示状态。
    const updateTask = (partial, workspaceState = {}, eventPatch) => {
      const nextTask = applyTaskPatch(partial);
      emit(nextTask, buildSnapshot(definition, { ...(workspaceState || {}), [taskField]: nextTask }));
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
      updateWorkspaceStateWithoutReload(definition, persistedPatch);
      emit(nextTask, buildSnapshot(definition, persistedPatch));
      return { task: nextTask };
    };

    const previousState = loadWorkspaceState(definition) || {};
    // 互斥任务：启动当前任务时清除同组的另一个任务状态，避免旧进度条残留
    const siblingReset = {};
    if (definition.stateKey === 'greenReport') {
      if (taskField === 'outlineTask') {
        siblingReset.contentTask = null;
      } else if (taskField === 'contentTask') {
        siblingReset.outlineTask = null;
      }
    }
    const initialState = startOptions.skipInitialStateUpdate
      ? previousState
      : { ...siblingReset, ...initialPartial, [taskField]: currentTask };
    if (!startOptions.skipInitialStateUpdate) {
      updateWorkspaceStateWithoutReload(definition, initialState);
    }
    emit(currentTask, buildSnapshot(definition, initialState));

    const runnerWorkspaceStore = greenReportStore;
    const runnerAiService = aiService?.withQueueScope ? aiService.withQueueScope(queueScopeId, taskControl.signal) : aiService;
    const agentTaskContextProvider = () => createAgentUserTaskContext(type, definition, payload, currentTask);
    const runnerAgentService = agentService.bindTaskContext(
      agentTaskContextProvider,
      {
        queueScopeId,
        signal: taskControl.signal,
        primary_session: startOptions.primarySession === true,
      },
    );
    const runnerOrdinaryAgentService = agentService.bindTaskContext(
      agentTaskContextProvider,
      {
        queueScopeId,
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
        aiService.resumeQueueScope(queueScopeId);
      }
      activeTasks.delete(type);
      activeTaskControls.delete(type);
      resolveSettled();
    });

    return currentTask;
  }

  // 恢复应用异常关闭时仍在运行的绿色报告任务，将其标记为 error 状态。
  function recoverInterruptedGreenReportTasks() {
    const state = greenReportStore.loadState() || {};
    const partial = {};
    if (!activeTasks.has('green-report-outline') && isActiveTaskStatus(state.outlineTask?.status)) {
      partial.outlineTask = {
        ...state.outlineTask,
        status: 'error',
        error: '上次任务因应用关闭而中断，请重新生成。',
        updated_at: now(),
      };
    }
    if (!activeTasks.has('green-report-content') && isActiveTaskStatus(state.contentTask?.status)) {
      partial.contentTask = {
        ...state.contentTask,
        status: 'error',
        error: '上次任务因应用关闭而中断，请重新生成。',
        updated_at: now(),
      };
    }
    if (Object.keys(partial).length) {
      greenReportStore.updateGreenReportWithoutReload(partial);
    }
  }

  recoverInterruptedGreenReportTasks();

  return {
    subscribe,
    subscribeCallback,
    startGreenReportOutline(payload) {
      return startManagedTask('green-report-outline', payload, runGreenReportOutlineTask);
    },
    startGreenReportContent(payload) {
      return startManagedTask('green-report-content', payload, runGreenReportContentTask);
    },
    getActiveTasks() {
      return Array.from(activeTasks.values());
    },
  };
}

module.exports = { createTaskService };
