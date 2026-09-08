'use strict';

const {
  buildOutlineSystemPrompt,
  buildOutlineUserInstruction,
  buildContentSystemPrompt,
  buildContentUserInstruction,
} = require('./greenReportPrompts.cjs');

function collectLeaves(items = [], leaves = []) {
  items.forEach((item) => {
    if (item.children?.length) {
      collectLeaves(item.children, leaves);
      return;
    }
    leaves.push(item);
  });
  return leaves;
}

/**
 * 获取知识库上下文：优先使用 payload 中已有的，否则根据企业名称和行业自动检索。
 */
async function resolveKnowledgeContext({ payload, knowledgeBaseService, publish }) {
  if (payload.knowledgeContext?.items?.length) {
    return payload.knowledgeContext;
  }
  if (!knowledgeBaseService?.searchItems) return null;

  const companyName = payload.projectInfo?.companyName || '';
  const industry = payload.projectInfo?.industry || '';
  const keywords = [companyName, industry].filter(Boolean);
  if (!keywords.length) return null;

  const searchKeyword = keywords.join(' ');
  try {
    publish?.(`正在检索知识库：${searchKeyword}`, 12);
    const result = await knowledgeBaseService.searchItems(searchKeyword, { limit: 15, contentExcerptChars: 1200 });
    if (result?.items?.length) {
      return {
        keyword: searchKeyword,
        items: result.items,
        searchedAt: new Date().toISOString(),
      };
    }
  } catch (error) {
    // 知识库检索失败不阻塞生成流程
  }
  return null;
}

async function runGreenReportOutlineTask({
  aiService,
  workspaceStore,
  knowledgeBaseService,
  payload,
  updateTask,
  checkpointTask,
  taskControl,
}) {
  const { reportType, reportTypeName, projectInfo, pageCount, documentStyle, userRequirements } = payload;

  let logs = ['正在生成目录...'];
  let task = checkpointTask({ status: 'running', progress: 5, logs }).task;

  function publish(message, progress) {
    const text = String(message || '').trim();
    if (text && text !== logs[logs.length - 1]) logs = [...logs, text];
    const nextProgress = Math.max(task.progress || 0, progress || task.progress || 0);
    task = updateTask({ status: 'running', progress: nextProgress, logs });
  }

  // 自动检索知识库
  const knowledgeContext = await resolveKnowledgeContext({ payload, knowledgeBaseService, publish });
  if (knowledgeContext?.items?.length) {
    publish(`已从知识库匹配 ${knowledgeContext.items.length} 条资料`, 15);
  } else {
    publish('未检索到知识库资料，将基于通用模板生成', 15);
  }

  publish('正在调用AI生成目录...', 20);

  const systemPrompt = buildOutlineSystemPrompt(reportType, documentStyle, reportTypeName);
  const userPrompt = buildOutlineUserInstruction(reportType, projectInfo, {
    pageCount,
    documentStyle,
    knowledgeContext,
    userRequirements,
  }, reportTypeName);

  const outlineData = await aiService.requestJson({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    progressLabel: '绿色报告目录',
  });

  if (taskControl.signal.aborted) {
    throw taskControl.signal.reason || new Error('任务已取消');
  }

  if (!outlineData || !Array.isArray(outlineData.outline)) {
    throw new Error('AI返回的目录结构无效');
  }

  publish('正在保存目录...', 70);
  const savedState = workspaceStore.saveOutlineFromResult(outlineData);

  checkpointTask(
    { status: 'success', progress: 100, logs: [...logs, '目录生成完成'] },
    { outlineData: savedState?.outlineData || outlineData },
  );
}

async function runGreenReportContentTask({
  aiService,
  workspaceStore,
  knowledgeBaseService,
  payload,
  updateTask,
  checkpointTask,
  taskControl,
}) {
  const { reportType, reportTypeName, projectInfo, pageCount, documentStyle, userRequirements } = payload;
  const state = workspaceStore.loadState();
  const leaves = collectLeaves(state.outlineData?.outline || []);

  if (!leaves.length) {
    throw new Error('目录中没有可生成正文的叶子节点');
  }

  let logs = [`开始生成正文，共 ${leaves.length} 个章节。`];
  let task = checkpointTask({ status: 'running', progress: 0, logs }).task;

  function publish(message, progress) {
    const text = String(message || '').trim();
    if (text && text !== logs[logs.length - 1]) logs = [...logs, text];
    const nextProgress = Math.max(task.progress || 0, progress || task.progress || 0);
    task = updateTask({ status: 'running', progress: nextProgress, logs });
  }

  // 自动检索知识库
  const knowledgeContext = await resolveKnowledgeContext({ payload, knowledgeBaseService, publish });
  if (knowledgeContext?.items?.length) {
    publish(`已从知识库匹配 ${knowledgeContext.items.length} 条资料`, 5);
  } else {
    publish('未检索到知识库资料，生成内容将使用占位符供后续填写', 5);
  }

  const systemPrompt = buildContentSystemPrompt(reportType, documentStyle, reportTypeName);
  const total = leaves.length;
  let completed = 0;

  for (const leaf of leaves) {
    if (taskControl.signal.aborted) {
      throw taskControl.signal.reason || new Error('任务已取消');
    }

    publish(`正在生成: ${leaf.title} (${completed + 1}/${total})`, Math.round((completed / total) * 100));

    const userPrompt = buildContentUserInstruction(leaf, projectInfo, reportType, {
      documentStyle,
      knowledgeContext,
      pageCount,
      userRequirements,
    }, reportTypeName);
    const result = await aiService.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const content = typeof result === 'string'
      ? result
      : (result?.content || result?.message?.content || '');

    workspaceStore.saveChapterContent({ nodeId: leaf.id, content });
    completed++;
    publish(`已完成: ${leaf.title} (${completed}/${total})`, Math.round((completed / total) * 100));
  }

  const finalState = workspaceStore.loadState();
  checkpointTask(
    { status: 'success', progress: 100, logs: [...logs, '正文生成完成'] },
    { outlineData: finalState?.outlineData || state.outlineData },
  );
}

module.exports = {
  runGreenReportOutlineTask,
  runGreenReportContentTask,
};
