'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');

function now() {
  return new Date().toISOString();
}

function hasOwn(value, field) {
  return Object.prototype.hasOwnProperty.call(value || {}, field);
}

const DEFAULT_PROJECT_INFO = {
  companyName: '',
  industry: '',
  reportingPeriod: '',
  reportScope: '',
  keyTopics: '',
  compileStaffText: '',
  keyIndicatorsText: '',
  publicityPlatformsText: '',
  compileUnit: '安徽蔚碳环保科技有限公司',
  compileDate: '',
  reportCode: '',
};

const INTERRUPTED_STATUSES = new Set(['running', 'pausing', 'queued']);

function createGreenReportStore({ app, db, taskLogStore }) {
  const tableName = 'green_report_meta';
  const tasksTable = 'green_report_tasks';
  const nodesTable = 'green_report_outline_nodes';

  function requireReportId(reportId) {
    const value = String(reportId || '').trim();
    if (!value) throw new Error('缺少报告 ID');
    return value;
  }

  function reportExists(reportId) {
    const id = String(reportId || '').trim();
    if (!id) return false;
    return Boolean(db.prepare(`SELECT 1 FROM ${tableName} WHERE id = ?`).get(id));
  }

  function loadMeta(reportId) {
    const id = requireReportId(reportId);
    const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
    if (!row) return null;
    const projectInfo = (() => {
      if (!row.project_info_json) return { ...DEFAULT_PROJECT_INFO };
      const parsed = JSON.parse(row.project_info_json);
      if (parsed && Object.prototype.hasOwnProperty.call(parsed, 'clientUnit')) {
        delete parsed.clientUnit;
      }
      if (parsed && /^WTHB-/.test(String(parsed.reportCode || ''))) {
        parsed.reportCode = generateReportCode();
        saveMeta(id, { project_info_json: JSON.stringify(parsed) });
      }
      return parsed;
    })();
    return {
      id,
      step: row.step || 'company-info',
      reportType: row.report_type || 'esg',
      projectInfo,
      targetWords: row.target_words || 20000,
      pageCount: row.page_count || 30,
      documentStyle: row.document_style || 'standard',
      templateId: row.template_id || null,
      knowledgeContext: row.knowledge_context_json ? JSON.parse(row.knowledge_context_json) : null,
      outlineProjectName: row.outline_project_name || '',
      outlineProjectOverview: row.outline_project_overview || '',
      status: row.status || 'draft',
      progress: row.progress || 0,
      outlineData: loadOutlineTree(id),
    };
  }

  function loadOutlineTree(reportId) {
    const id = requireReportId(reportId);
    const nodes = db.prepare(`SELECT * FROM ${nodesTable} WHERE report_id = ? ORDER BY sort_order`).all(id);
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

  function saveOutlineTree(reportId, outlineData) {
    const id = requireReportId(reportId);
    db.prepare(`DELETE FROM ${nodesTable} WHERE report_id = ?`).run(id);
    const ts = now();
    const flat = [];
    function flatten(items, parentId, level) {
      items.forEach((item, i) => {
        flat.push({
          report_id: id,
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
    const stmt = db.prepare(`INSERT INTO ${nodesTable} (report_id, node_id, parent_node_id, sort_order, level, title, description, content, created_at, updated_at) VALUES (@report_id, @node_id, @parent_node_id, @sort_order, @level, @title, @description, @content, @created_at, @updated_at)`);
    for (const row of flat) stmt.run(row);
  }

  function loadTasks(reportId) {
    const id = requireReportId(reportId);
    const rows = db.prepare(`SELECT * FROM ${tasksTable} WHERE report_id = ?`).all(id);
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

  function loadState(reportId) {
    const id = String(reportId || '').trim();
    if (!id) {
      return {
        reportId: '',
        step: 'company-info',
        reportType: 'esg',
        projectInfo: { ...DEFAULT_PROJECT_INFO },
        targetWords: 20000,
        pageCount: 30,
        documentStyle: 'standard',
        templateId: null,
        knowledgeContext: null,
        outlineData: null,
      };
    }
    const meta = loadMeta(id);
    const tasks = loadTasks(id);
    return {
      reportId: id,
      step: meta?.step || 'company-info',
      reportType: meta?.reportType || 'esg',
      projectInfo: meta?.projectInfo || { ...DEFAULT_PROJECT_INFO },
      targetWords: meta?.targetWords || 20000,
      pageCount: meta?.pageCount || 30,
      documentStyle: meta?.documentStyle || 'standard',
      templateId: meta?.templateId || null,
      knowledgeContext: meta?.knowledgeContext || null,
      outlineData: meta?.outlineData || null,
      status: meta?.status || 'draft',
      progress: meta?.progress || 0,
      ...tasks,
    };
  }

  function saveMeta(reportId, fields) {
    const id = requireReportId(reportId);
    const existing = db.prepare(`SELECT id FROM ${tableName} WHERE id = ?`).get(id);
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
      db.prepare(`UPDATE ${tableName} SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
      return;
    }
    db.prepare(`
      INSERT INTO ${tableName} (id, step, report_type, project_info_json, target_words, page_count, document_style, template_id, knowledge_context_json, outline_project_name, outline_project_overview, report_seq, status, progress, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      fields.step || 'company-info',
      fields.report_type || 'esg',
      fields.project_info_json || JSON.stringify({ ...DEFAULT_PROJECT_INFO, compileDate: new Date().toISOString().slice(0, 10) }),
      fields.target_words || 20000,
      fields.page_count ?? 30,
      fields.document_style || 'standard',
      fields.template_id ?? null,
      fields.knowledge_context_json || null,
      fields.outline_project_name || '',
      fields.outline_project_overview || '',
      fields.report_seq ?? 0,
      fields.status || 'draft',
      fields.progress ?? 0,
      ts,
      ts,
    );
  }

  /** 汇总该报告的任务状态，写回报告级 status/progress。 */
  function syncReportStatus(reportId) {
    const id = requireReportId(reportId);
    const rows = db.prepare(`SELECT type, status, progress FROM ${tasksTable} WHERE report_id = ?`).all(id);
    let status = 'draft';
    if (rows.some((row) => row.status === 'running' || row.status === 'pausing')) {
      status = 'running';
    } else if (rows.some((row) => row.status === 'queued')) {
      status = 'queued';
    } else if (rows.some((row) => row.status === 'error')) {
      status = 'error';
    } else if (rows.some((row) => row.status === 'cancelled')) {
      status = 'cancelled';
    } else if (rows.some((row) => row.type === 'green-report-content' && row.status === 'success')) {
      status = 'success';
    }
    const progress = status === 'success'
      ? 100
      : rows.reduce((max, row) => Math.max(max, Number(row.progress) || 0), 0);
    db.prepare(`UPDATE ${tableName} SET status = ?, progress = ?, updated_at = ? WHERE id = ?`).run(status, progress, now(), id);
  }

  function updateStep(reportId, step) {
    saveMeta(reportId, { step });
  }

  function saveReportType(reportId, reportType) {
    saveMeta(reportId, { report_type: reportType });
  }

  function saveProjectInfo(reportId, projectInfo) {
    const id = requireReportId(reportId);
    const current = loadState(id);
    const previous = current.projectInfo || {};
    const fields = { project_info_json: JSON.stringify(projectInfo) };
    const companyChanged = String(previous.companyName || '').trim() !== String(projectInfo?.companyName || '').trim();
    const industryChanged = String(previous.industry || '').trim() !== String(projectInfo?.industry || '').trim();
    if (companyChanged || industryChanged) {
      fields.knowledge_context_json = null;
    }
    if (companyChanged) {
      // 委托单位变更即换了一家企业：清空上一家的目录/正文与任务状态，避免旧内容被误当成新公司数据。
      db.prepare(`DELETE FROM ${nodesTable} WHERE report_id = ?`).run(id);
      db.prepare(`DELETE FROM ${tasksTable} WHERE report_id = ?`).run(id);
      fields.outline_project_name = '';
      fields.outline_project_overview = '';
      fields.status = 'draft';
      fields.progress = 0;
      if (current.step === 'content') fields.step = 'outline';
    }
    saveMeta(id, fields);
    return loadState(id);
  }

  function saveOutlineConfig(reportId, { targetWords }) {
    const fields = {};
    if (targetWords !== undefined) fields.target_words = targetWords;
    if (Object.keys(fields).length) saveMeta(reportId, fields);
    return loadState(reportId);
  }

  function saveReportConfig(reportId, { targetWords, pageCount, documentStyle, templateId }) {
    const fields = {};
    if (targetWords !== undefined) fields.target_words = targetWords;
    if (pageCount !== undefined) fields.page_count = pageCount;
    if (documentStyle !== undefined) fields.document_style = documentStyle;
    if (templateId !== undefined) fields.template_id = templateId;
    if (Object.keys(fields).length) saveMeta(reportId, fields);
    return loadState(reportId);
  }

  function saveKnowledgeContext(reportId, context) {
    saveMeta(reportId, { knowledge_context_json: context ? JSON.stringify(context) : null });
    return loadState(reportId);
  }

  function saveOutline(reportId, payload) {
    const id = requireReportId(reportId);
    const { outlineData, reason, affectedNodeIds } = payload;
    if (reason === 'replace') {
      saveOutlineTree(id, outlineData);
    } else if (reason === 'edit' && affectedNodeIds?.length) {
      for (const nodeId of affectedNodeIds) {
        const node = findNode(outlineData.outline, nodeId);
        if (node) {
          db.prepare(`UPDATE ${nodesTable} SET title = ?, description = ?, content = ?, updated_at = ? WHERE report_id = ? AND node_id = ?`).run(
            node.title, node.description || '', node.content || '', now(), id, nodeId,
          );
        }
      }
    } else {
      saveOutlineTree(id, outlineData);
    }
    if (outlineData.project_name) saveMeta(id, { outline_project_name: outlineData.project_name });
    if (outlineData.project_overview) saveMeta(id, { outline_project_overview: outlineData.project_overview });
    const state = loadState(id);
    return { outlineData: state.outlineData };
  }

  function saveChapterContent(reportId, { nodeId, content }) {
    const id = requireReportId(reportId);
    db.prepare(`UPDATE ${nodesTable} SET content = ?, updated_at = ? WHERE report_id = ? AND node_id = ?`).run(content, now(), id, nodeId);
    const state = loadState(id);
    return { outlineData: state.outlineData };
  }

  /** 清空该报告所有节点的 content 字段，用于重新生成目录/正文前清除旧数据。 */
  function clearAllChapterContent(reportId) {
    const id = requireReportId(reportId);
    db.prepare(`UPDATE ${nodesTable} SET content = ?, updated_at = ? WHERE report_id = ?`).run('', now(), id);
    const state = loadState(id);
    return { outlineData: state.outlineData };
  }

  function saveOutlineFromResult(reportId, outlineData) {
    const id = requireReportId(reportId);
    assignIds(outlineData.outline || [], null, '');
    if (outlineData.project_name) saveMeta(id, { outline_project_name: outlineData.project_name });
    if (outlineData.project_overview) saveMeta(id, { outline_project_overview: outlineData.project_overview });
    saveOutlineTree(id, outlineData);
    return loadState(id);
  }

  function saveTaskState(reportId, type, taskState) {
    const id = requireReportId(reportId);
    const ts = now();
    db.prepare(`
      INSERT INTO ${tasksTable} (report_id, type, task_id, status, progress, stats_json, error, started_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(report_id, type) DO UPDATE SET
        task_id = excluded.task_id,
        status = excluded.status,
        progress = excluded.progress,
        stats_json = excluded.stats_json,
        error = excluded.error,
        updated_at = excluded.updated_at
    `).run(
      id,
      type,
      taskState.task_id || '',
      taskState.status || 'running',
      taskState.progress || 0,
      taskState.stats ? JSON.stringify(taskState.stats) : null,
      taskState.error || null,
      taskState.started_at || ts,
      ts,
    );
    syncReportStatus(id);
  }

  function deleteTaskState(reportId, type) {
    const id = requireReportId(reportId);
    db.prepare(`DELETE FROM ${tasksTable} WHERE report_id = ? AND type = ?`).run(id, type);
    syncReportStatus(id);
  }

  function updateGreenReportWithoutReload(reportId, partial = {}) {
    const id = requireReportId(reportId);
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
      if (partial.outlineData) saveOutlineTree(id, partial.outlineData);
      else db.prepare(`DELETE FROM ${nodesTable} WHERE report_id = ?`).run(id);
    }
    if (Object.keys(metaPatch).length) saveMeta(id, metaPatch);
    if (hasOwn(partial, 'outlineTask')) {
      saveTaskState(id, 'green-report-outline', partial.outlineTask || { task_id: '', status: 'idle', progress: 0, started_at: now() });
    }
    if (hasOwn(partial, 'contentTask')) {
      saveTaskState(id, 'green-report-content', partial.contentTask || { task_id: '', status: 'idle', progress: 0, started_at: now() });
    }
  }

  /** 报告列表摘要。 */
  function listReports() {
    const rows = db.prepare(`
      SELECT m.id, m.report_type, m.project_info_json, m.step, m.status, m.progress, m.created_at, m.updated_at,
        EXISTS(SELECT 1 FROM ${nodesTable} n WHERE n.report_id = m.id) AS has_outline
      FROM ${tableName} m
      ORDER BY m.updated_at DESC
    `).all();
    return rows.map((row) => {
      let companyName = '';
      try {
        companyName = JSON.parse(row.project_info_json || '{}')?.companyName || '';
      } catch (error) {
        companyName = '';
      }
      return {
        id: row.id,
        companyName,
        reportType: row.report_type || 'esg',
        step: row.step || 'company-info',
        status: row.status || 'draft',
        progress: row.progress || 0,
        hasOutline: Boolean(row.has_outline),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }

  function createReport({ reportType = 'esg' } = {}) {
    const id = crypto.randomUUID();
    const ts = now();
    const projectInfo = {
      ...DEFAULT_PROJECT_INFO,
      compileDate: new Date().toISOString().slice(0, 10),
    };
    db.prepare(`
      INSERT INTO ${tableName} (id, step, report_type, project_info_json, target_words, page_count, document_style, template_id, knowledge_context_json, outline_project_name, outline_project_overview, report_seq, status, progress, created_at, updated_at)
      VALUES (?, 'company-info', ?, ?, 20000, 30, 'standard', NULL, NULL, '', '', 0, 'draft', 0, ?, ?)
    `).run(id, String(reportType || 'esg'), JSON.stringify(projectInfo), ts, ts);
    return loadState(id);
  }

  function deleteReport(reportId) {
    const id = requireReportId(reportId);
    const transaction = db.transaction(() => {
      db.prepare(`DELETE FROM ${tasksTable} WHERE report_id = ?`).run(id);
      db.prepare(`DELETE FROM ${nodesTable} WHERE report_id = ?`).run(id);
      db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(id);
    });
    transaction();
    return { success: true };
  }

  function clear(reportId) {
    if (reportId) {
      return deleteReport(reportId);
    }
    db.prepare(`DELETE FROM ${tableName}`).run();
    db.prepare(`DELETE FROM ${tasksTable}`).run();
    db.prepare(`DELETE FROM ${nodesTable}`).run();
    return { success: true };
  }

  // 生成唯一报告编号 ZHYX+年月日+BID+6位数字，例如 ZHYX20261109BID481286。
  function generateReportCode() {
    const nowDate = new Date();
    const yyyy = nowDate.getFullYear();
    const mm = String(nowDate.getMonth() + 1).padStart(2, '0');
    const dd = String(nowDate.getDate()).padStart(2, '0');
    let suffix = '';
    for (let i = 0; i < 6; i++) {
      suffix += String(Math.floor(Math.random() * 10));
    }
    return `ZHYX${yyyy}${mm}${dd}BID${suffix}`;
  }

  return {
    loadState,
    listReports,
    createReport,
    deleteReport,
    reportExists,
    updateStep,
    saveReportType,
    saveProjectInfo,
    saveOutlineConfig,
    saveReportConfig,
    saveKnowledgeContext,
    saveOutline,
    saveChapterContent,
    clearAllChapterContent,
    saveOutlineFromResult,
    saveTaskState,
    deleteTaskState,
    syncReportStatus,
    updateGreenReportWithoutReload,
    generateReportCode,
    clear,
  };
}

module.exports = { createGreenReportStore };
