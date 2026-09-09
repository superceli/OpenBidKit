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

/** 把嵌套 outline 拍平成叶子骨架列表，用于构建跨章节去重上下文。 */
function collectOutlineSkeleton(items = [], flat = []) {
  items.forEach((item) => {
    if (item.children?.length) {
      collectOutlineSkeleton(item.children, flat);
      return;
    }
    flat.push({ id: item.id || '', title: item.title || '' });
  });
  return flat;
}

/**
 * 简易并发限流：同时最多 limit 个任务在飞。
 * 返回的 Promise 会在所有任务 resolve 后 resolve；任何一个 task reject 都会让整体 reject。
 */
async function parallelLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await mapper(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runner());
  await Promise.all(workers);
  return results;
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
  const { reportType, reportTypeName, projectInfo, pageCount, documentStyle, targetWords, userRequirements } = payload;

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
  } else if (aiService.isWebSearchEnabled?.()) {
    publish('未检索到知识库资料，AI 将联网查询企业资料', 15);
  } else {
    publish('未检索到知识库资料，将基于通用模板生成', 15);
  }

  publish('正在调用AI生成目录...', 20);

  const systemPrompt = buildOutlineSystemPrompt(reportType, documentStyle, reportTypeName);
  const userPrompt = buildOutlineUserInstruction(reportType, projectInfo, {
    pageCount,
    documentStyle,
    targetWords,
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
  const { reportType, reportTypeName, projectInfo, pageCount, documentStyle, targetWords, userRequirements } = payload;
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
  } else if (aiService.isWebSearchEnabled?.()) {
    publish('未检索到知识库资料，AI 将联网查询企业资料', 5);
  } else {
    publish('未检索到知识库资料，将基于行业经验预估生成内容', 5);
  }

  // 按全篇目标字数 / 叶子节点数 摊分每章目标字数，同时计算上下限
  // 上限 = 摊分 * 1.1（允许小幅浮动），下限 = max(300, 摊分 * 0.7)（给低篇幅章节留空间）
  const numericTargetWords = Number(targetWords);
  const basePerChapter = Number.isFinite(numericTargetWords) && numericTargetWords > 0 && leaves.length > 0
    ? Math.floor(numericTargetWords / leaves.length)
    : 0;
  const perChapterMin = basePerChapter > 0 ? Math.max(300, Math.floor(basePerChapter * 0.7)) : 0;
  const perChapterMax = basePerChapter > 0 ? Math.round(basePerChapter * 1.1) : 0;
  if (basePerChapter > 0) {
    publish(`全篇目标 ${numericTargetWords} 字，共 ${leaves.length} 章，每章目标 ${basePerChapter} 字（上限 ${perChapterMax} 字）`, 6);
  }

  const systemPrompt = buildContentSystemPrompt(reportType, documentStyle, reportTypeName, perChapterMin);
  const total = leaves.length;
  let completed = 0;
  let webSearchDowngradePublished = false;
  // 构建全篇目录骨架，注入每个章节的 user prompt，实现跨章节去重
  const outlineSkeleton = collectOutlineSkeleton(state.outlineData?.outline || []);
  publish(`全篇目录骨架已准备（共 ${outlineSkeleton.length} 个章节）`, 8);

  // 粗估正文字数：统计中文字符 + 数字/英文字符（排除 Markdown 标记和代码块）
  function countWords(text) {
    if (!text) return 0;
    const stripped = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]*`/g, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[#>*_`~\-]/g, '')
      .replace(/\s+/g, '');
    return stripped.length;
  }

  // 调用 AI 对超长章节进行精简
  async function trimContent(originalContent, chapterTitle, targetMax, aiServiceRef) {
    try {
      const trimSystem = '你是一名专业的报告内容编辑。请对提供的章节正文进行精简压缩，保留核心论点、关键数据和结构框架，删除冗余表述、重复论证和次要细节。精简后字数须严格不超过目标上限，保持 Markdown 格式和报告文体。只输出精简后的正文，不要解释。';
      const trimUser = `请精简以下"${chapterTitle}"章节正文，精简后字数严格不超过 ${targetMax} 字。\n\n原文：\n${originalContent}`;
      const result = await aiServiceRef.chat({
        messages: [
          { role: 'system', content: trimSystem },
          { role: 'user', content: trimUser },
        ],
      });
      const trimmed = typeof result === 'string' ? result : (result?.content || result?.message?.content || '');
      return trimmed || originalContent;
    } catch (_err) {
      return originalContent;
    }
  }

  // 并发数：根据章节数动态调节，章节少就不用并发
  const CONCURRENCY = total <= 4 ? 1 : 4;
  if (CONCURRENCY > 1) {
    publish(`启动 ${CONCURRENCY} 路并发生成，预计耗时大幅缩短`, 10);
  }

  // 单章节生成任务（会被并行调度）
  async function generateOneChapter(leaf, _idx) {
    if (taskControl.signal.aborted) {
      throw taskControl.signal.reason || new Error('任务已取消');
    }

    // 在骨架中找到本章位置（用于 publish 日志）
    const skeletonIdx = outlineSkeleton.findIndex((s) => s.id === leaf.id);
    const seq = skeletonIdx >= 0 ? skeletonIdx + 1 : 0;
    publish(`正在生成: ${leaf.title}${seq ? ` (${seq}/${total})` : ''}`, Math.round((completed / total) * 100));

    const userPrompt = buildContentUserInstruction(leaf, projectInfo, reportType, {
      documentStyle,
      knowledgeContext,
      pageCount,
      targetWords,
      chapterTargetWords: basePerChapter,
      chapterMaxWords: perChapterMax,
      userRequirements,
      outlineSkeleton, // 跨章节去重上下文
    }, reportTypeName);
    const result = await aiService.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      onWebSearchDowngrade: () => {
        if (!webSearchDowngradePublished) {
          webSearchDowngradePublished = true;
          publish('联网查询失败，将基于行业经验预估生成内容', Math.round((completed / total) * 100));
        }
      },
    });

    // **取消护栏**：请求可能已经在飞，但用户中途点了取消。此时不要保存结果。
    if (taskControl.signal.aborted) {
      throw taskControl.signal.reason || new Error('任务已取消');
    }

    let content = typeof result === 'string'
      ? result
      : (result?.content || result?.message?.content || '');

    // 后处理：如果章节超上限，调用 AI 精简一次
    if (perChapterMax > 0 && content) {
      const currentWords = countWords(content);
      if (currentWords > perChapterMax * 1.2) {
        publish(`${leaf.title} 实际 ${currentWords} 字，超过上限 ${perChapterMax}，正在精简...`, Math.round((completed / total) * 100));
        content = await trimContent(content, leaf.title, perChapterMax, aiService);
        // 精简后再检查一次取消标志（精简本身也是一次异步调用）
        if (taskControl.signal.aborted) {
          throw taskControl.signal.reason || new Error('任务已取消');
        }
        const afterTrim = countWords(content);
        publish(`${leaf.title} 精简后 ${afterTrim} 字`, Math.round((completed / total) * 100));
      }
    }

    workspaceStore.saveChapterContent({ nodeId: leaf.id, content });

    // 原子完成计数（并发安全：JS 单线程，自增无竞争）
    completed++;
    publish(`已完成: ${leaf.title} (${completed}/${total})`, Math.round((completed / total) * 100));
  }

  // 并发调度所有章节
  await parallelLimit(leaves, CONCURRENCY, generateOneChapter);

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
