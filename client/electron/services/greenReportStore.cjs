'use strict';

const fs = require('fs');
const path = require('path');

function now() {
  return new Date().toISOString();
}

function hasOwn(value, field) {
  return Object.prototype.hasOwnProperty.call(value || {}, field);
}

function createGreenReportStore({ app, db, taskLogStore }) {
  const tableName = 'green_report_meta';
  const tasksTable = 'green_report_tasks';
  const nodesTable = 'green_report_outline_nodes';

  function loadMeta() {
    const row = db.prepare('SELECT * FROM green_report_meta WHERE id = 1').get();
    if (!row) return null;
    return {
      step: row.step || 'company-info',
      reportType: row.report_type || 'esg',
      projectInfo: row.project_info_json ? JSON.parse(row.project_info_json) : { companyName: '', industry: '', reportingPeriod: '', reportScope: '', keyTopics: '', clientUnit: '', compileUnit: '', compileDate: '', reportCode: '' },
      targetWords: row.target_words || 20000,
      pageCount: row.page_count || 30,
      documentStyle: row.document_style || 'standard',
      templateId: row.template_id || null,
      knowledgeContext: row.knowledge_context_json ? JSON.parse(row.knowledge_context_json) : null,
      outlineProjectName: row.outline_project_name || '',
      outlineProjectOverview: row.outline_project_overview || '',
      outlineData: loadOutlineTree(),
    };
  }

  function loadOutlineTree() {
    const nodes = db.prepare('SELECT * FROM green_report_outline_nodes ORDER BY sort_order').all();
    if (!nodes.length) return null;
    const childrenMap = {};
    const roots = [];
    for (const n of nodes) {
      const node = {
        id: n.node_id,
        title: n.title,
        description: n.description || '',
        content: n.content || '',
        children: [],
      };
      if (n.parent_node_id) {
        if (!childrenMap[n.parent_node_id]) childrenMap[n.parent_node_id] = [];
        childrenMap[n.parent_node_id].push(node);
      } else {
        roots.push(node);
      }
    }
    for (const n of nodes) {
      if (childrenMap[n.node_id]) {
        const parent = findNode(roots, n.node_id);
        if (parent) parent.children = childrenMap[n.node_id];
      }
    }
    return { outline: roots, project_name: undefined, project_overview: undefined };
  }

  function findNode(items, id) {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.children?.length) {
        const found = findNode(item.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  function assignIds(items, parentId, prefix) {
    items.forEach((item, i) => {
      const id = parentId ? `${parentId}.${i + 1}` : String(i + 1);
      item.id = id;
      if (item.children?.length) assignIds(item.children, id, prefix);
    });
  }

  function saveOutlineTree(outlineData) {
    db.prepare('DELETE FROM green_report_outline_nodes').run();
    const ts = now();
    const flat = [];
    function flatten(items, parentId, level) {
      items.forEach((item, i) => {
        flat.push({
          node_id: item.id,
          parent_node_id: parentId,
          sort_order: i,
          level,
          title: item.title || '',
          description: item.description || '',
          content: item.content || '',
          created_at: ts,
          updated_at: ts,
        });
        if (item.children?.length) flatten(item.children, item.id, level + 1);
      });
    }
    flatten(outlineData.outline || [], null, 0);
    const stmt = db.prepare(`INSERT INTO green_report_outline_nodes (node_id, parent_node_id, sort_order, level, title, description, content, created_at, updated_at) VALUES (@node_id, @parent_node_id, @sort_order, @level, @title, @description, @content, @created_at, @updated_at)`);
    for (const row of flat) stmt.run(row);
  }

  function loadTasks() {
    const rows = db.prepare('SELECT * FROM green_report_tasks').all();
    const tasks = {};
    for (const row of rows) {
      const key = row.type === 'green-report-outline' ? 'outlineTask' : 'contentTask';
      tasks[key] = {
        task_id: row.task_id,
        type: row.type,
        status: row.status,
        progress: row.progress || 0,
        logs: [],
        started_at: row.started_at,
        updated_at: row.updated_at,
        error: row.error || undefined,
        stats: row.stats_json ? JSON.parse(row.stats_json) : undefined,
      };
    }
    return tasks;
  }

  function loadState() {
    const meta = loadMeta();
    const tasks = loadTasks();
    return {
      step: meta?.step || 'company-info',
      reportType: meta?.reportType || 'esg',
      projectInfo: meta?.projectInfo || { companyName: '', industry: '', reportingPeriod: '', reportScope: '', keyTopics: '', clientUnit: '', compileUnit: '', compileDate: '', reportCode: '' },
      targetWords: meta?.targetWords || 20000,
      pageCount: meta?.pageCount || 30,
      documentStyle: meta?.documentStyle || 'standard',
      templateId: meta?.templateId || null,
      knowledgeContext: meta?.knowledgeContext || null,
      outlineData: meta?.outlineData || null,
      ...tasks,
    };
  }

  function saveMeta(fields) {
    const existing = db.prepare('SELECT id FROM green_report_meta WHERE id = 1').get();
    const ts = now();
    if (existing) {
      const sets = [];
      const values = [];
      for (const [k, v] of Object.entries(fields)) {
        sets.push(`${k} = ?`);
        values.push(v);
      }
      sets.push('updated_at = ?');
      values.push(ts);
      db.prepare(`UPDATE green_report_meta SET ${sets.join(', ')} WHERE id = 1`).run(...values);
    } else {
      db.prepare('INSERT INTO green_report_meta (id, step, report_type, project_info_json, target_words, page_count, document_style, template_id, knowledge_context_json, outline_project_name, outline_project_overview, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        fields.step || 'company-info',
        fields.report_type || 'esg',
        fields.project_info_json || '{}',
        fields.target_words || 20000,
        fields.page_count ?? 30,
        fields.document_style || 'standard',
        fields.template_id ?? null,
        fields.knowledge_context_json || null,
        fields.outline_project_name || '',
        fields.outline_project_overview || '',
        ts,
        ts,
      );
    }
  }

  function updateStep(step) {
    saveMeta({ step });
  }

  function saveReportType(reportType) {
    saveMeta({ report_type: reportType });
  }

  function saveProjectInfo(projectInfo) {
    saveMeta({ project_info_json: JSON.stringify(projectInfo) });
    return loadState();
  }

  function saveOutlineConfig({ targetWords }) {
    const fields = {};
    if (targetWords !== undefined) fields.target_words = targetWords;
    if (Object.keys(fields).length) saveMeta(fields);
    return loadState();
  }

  function saveReportConfig({ targetWords, pageCount, documentStyle, templateId }) {
    const fields = {};
    if (targetWords !== undefined) fields.target_words = targetWords;
    if (pageCount !== undefined) fields.page_count = pageCount;
    if (documentStyle !== undefined) fields.document_style = documentStyle;
    if (templateId !== undefined) fields.template_id = templateId;
    if (Object.keys(fields).length) saveMeta(fields);
    return loadState();
  }

  function saveKnowledgeContext(context) {
    saveMeta({ knowledge_context_json: context ? JSON.stringify(context) : null });
    return loadState();
  }

  function saveOutline(payload) {
    const { outlineData, reason, affectedNodeIds } = payload;
    if (reason === 'replace') {
      saveOutlineTree(outlineData);
    } else if (reason === 'edit' && affectedNodeIds?.length) {
      for (const nodeId of affectedNodeIds) {
        const node = findNode(outlineData.outline, nodeId);
        if (node) {
          db.prepare('UPDATE green_report_outline_nodes SET title = ?, description = ?, content = ?, updated_at = ? WHERE node_id = ?').run(
            node.title, node.description || '', node.content || '', now(), nodeId,
          );
        }
      }
    } else {
      saveOutlineTree(outlineData);
    }
    if (outlineData.project_name) saveMeta({ outline_project_name: outlineData.project_name });
    if (outlineData.project_overview) saveMeta({ outline_project_overview: outlineData.project_overview });
    const state = loadState();
    return { outlineData: state.outlineData };
  }

  function saveChapterContent({ nodeId, content }) {
    db.prepare('UPDATE green_report_outline_nodes SET content = ?, updated_at = ? WHERE node_id = ?').run(content, now(), nodeId);
    const state = loadState();
    return { outlineData: state.outlineData };
  }

  function saveOutlineFromResult(outlineData) {
    assignIds(outlineData.outline || [], null, '');
    if (outlineData.project_name) saveMeta({ outline_project_name: outlineData.project_name });
    if (outlineData.project_overview) saveMeta({ outline_project_overview: outlineData.project_overview });
    saveOutlineTree(outlineData);
    return loadState();
  }

  function saveTaskState(type, taskState) {
    const ts = now();
    const existing = db.prepare('SELECT type FROM green_report_tasks WHERE type = ?').get(type);
    if (existing) {
      db.prepare('UPDATE green_report_tasks SET task_id = ?, status = ?, progress = ?, stats_json = ?, error = ?, started_at = ?, updated_at = ? WHERE type = ?').run(
        taskState.task_id || '', taskState.status || 'running', taskState.progress || 0,
        taskState.stats ? JSON.stringify(taskState.stats) : null, taskState.error || null,
        taskState.started_at || ts, ts, type,
      );
    } else {
      db.prepare('INSERT INTO green_report_tasks (type, task_id, status, progress, stats_json, error, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        type, taskState.task_id || '', taskState.status || 'running', taskState.progress || 0,
        taskState.stats ? JSON.stringify(taskState.stats) : null, taskState.error || null,
        taskState.started_at || ts, ts,
      );
    }
  }

  function updateGreenReportWithoutReload(partial = {}) {
    const metaPatch = {};
    if (hasOwn(partial, 'step')) metaPatch.step = partial.step;
    if (hasOwn(partial, 'reportType')) metaPatch.report_type = partial.reportType;
    if (hasOwn(partial, 'projectInfo')) metaPatch.project_info_json = JSON.stringify(partial.projectInfo);
    if (hasOwn(partial, 'targetWords')) metaPatch.target_words = partial.targetWords;
    if (hasOwn(partial, 'pageCount')) metaPatch.page_count = partial.pageCount;
    if (hasOwn(partial, 'documentStyle')) metaPatch.document_style = partial.documentStyle;
    if (hasOwn(partial, 'templateId')) metaPatch.template_id = partial.templateId;
    if (hasOwn(partial, 'knowledgeContext')) metaPatch.knowledge_context_json = partial.knowledgeContext ? JSON.stringify(partial.knowledgeContext) : null;
    if (hasOwn(partial, 'outlineData')) {
      if (partial.outlineData) saveOutlineTree(partial.outlineData);
      else db.prepare('DELETE FROM green_report_outline_nodes').run();
    }
    if (Object.keys(metaPatch).length) saveMeta(metaPatch);
    if (hasOwn(partial, 'outlineTask')) saveTaskState('green-report-outline', partial.outlineTask || { task_id: '', status: 'idle', progress: 0, started_at: now() });
    if (hasOwn(partial, 'contentTask')) saveTaskState('green-report-content', partial.contentTask || { task_id: '', status: 'idle', progress: 0, started_at: now() });
  }

  function clear() {
    db.prepare('DELETE FROM green_report_meta').run();
    db.prepare('DELETE FROM green_report_tasks').run();
    db.prepare('DELETE FROM green_report_outline_nodes').run();
    return { success: true };
  }

  // 生成唯一报告编号 WTHB-YYYYMMDD-XXXXXX，日期+6位随机编号防碰撞。
  // 格式参考市面上绿色报告通用编号：WTHB-20260908-A7F3K9
  function generateReportCode() {
    const nowDate = new Date();
    const yyyy = nowDate.getFullYear();
    const mm = String(nowDate.getMonth() + 1).padStart(2, '0');
    const dd = String(nowDate.getDate()).padStart(2, '0');
    // 随机6位后缀（大写字母+数字），防碰撞
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let suffix = '';
    for (let i = 0; i < 6; i++) {
      suffix += chars[Math.floor(Math.random() * chars.length)];
    }
    return `WTHB-${yyyy}${mm}${dd}-${suffix}`;
  }

  return {
    loadState,
    updateStep,
    saveReportType,
    saveProjectInfo,
    saveOutlineConfig,
    saveReportConfig,
    saveKnowledgeContext,
    saveOutline,
    saveChapterContent,
    saveOutlineFromResult,
    saveTaskState,
    updateGreenReportWithoutReload,
    generateReportCode,
    clear,
  };
}

module.exports = { createGreenReportStore };
