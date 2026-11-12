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
function collectOutlineSkeleton(items = [], flat = [], topTitle = '') {
  items.forEach((item) => {
    const currentTopTitle = topTitle || item.title || '';
    if (item.children?.length) {
      collectOutlineSkeleton(item.children, flat, currentTopTitle);
      return;
    }
    flat.push({ id: item.id || '', title: item.title || '', topTitle: currentTopTitle });
  });
  return flat;
}

/**
 * 把 AI 输出的 [[IMG-001]] 占位符替换为真实图片 Markdown。
 * 只允许使用素材清单内的图片，同一图片全篇只保留第一次使用。
 */
function replaceImagePlaceholders(content, imageAssets, usedImageIds) {
  if (!content || !Array.isArray(imageAssets) || !imageAssets.length) return content;
  const byKey = new Map(imageAssets.map((item) => [item.key, item]));
  return content.replace(/\[\[\s*IMG-(\d+)\s*\]\]/gi, (_match, num) => {
    const key = `IMG-${String(Number(num)).padStart(3, '0')}`;
    const asset = byKey.get(key);
    if (!asset || usedImageIds.has(asset.id)) return '';
    usedImageIds.add(asset.id);
    const alt = String(asset.description || asset.fileName || '图片').replace(/[\]\r\n]/g, ' ').trim();
    return `![${alt}](${asset.assetUrl})`;
  });
}

// 常见实景照片关键词与章节关键词的对应关系，用于给 AI 未引用的图片找合适章节
const IMAGE_SCENE_HINTS = [
  { scenes: ['门头', '前台', '办公', '公司', '厂区', '外景', '全景', '招牌'], chapters: ['企业基本信息', '关于本报告', '企业概况'] },
  { scenes: ['生产', '车间', '施工', '设备', '工艺', '流水线', '项目现场'], chapters: ['投入', '产出', '管理'] },
  { scenes: ['仓储', '仓库', '库房', '物流', '运输'], chapters: ['管理', '保障', '产出'] },
  { scenes: ['员工', '团队', '培训', '人才', '会议'], chapters: ['保障', '管理'] },
  { scenes: ['资质', '荣誉', '证书', '奖牌', '专利'], chapters: ['企业基本信息', '产出', '关于本报告'] },
  { scenes: ['售后', '客服', '客户', '服务'], chapters: ['产出', '效益'] },
  { scenes: ['环保', '节能', '减排', '光伏', '绿化'], chapters: ['效益', '保障', '投入'] },
];

function scoreImageForChapter(asset, leaf, topTitle) {
  const description = String(asset?.description || '');
  if (!description) return 0;
  const chapterText = `${topTitle || ''} ${leaf?.title || ''}`;
  let score = 0;
  IMAGE_SCENE_HINTS.forEach((hint) => {
    if (!hint.scenes.some((word) => description.includes(word))) return;
    if (hint.chapters.some((word) => chapterText.includes(word))) score += 10;
  });
  String(leaf?.title || '')
    .split(/[^\u4e00-\u9fa5A-Za-z0-9]+/)
    .filter((token) => token.length >= 2)
    .forEach((token) => {
      if (description.includes(token)) score += 6;
    });
  return score;
}

function countChapterImages(content) {
  return (String(content || '').match(/!\[[^\]]*\]\([^)]+\)/g) || []).length;
}

/**
 * 强制使用全部已描述图片：把 AI 未主动引用的图片按描述与章节相关性补充到正文。
 * 需要传入生成完成后的最新叶子节点内容，避免覆盖已生成正文。
 */
function insertRemainingImages({ leaves, outlineSkeleton, imageAssets, usedImageIds, workspaceStore, publish }) {
  const remaining = imageAssets.filter((asset) => !usedImageIds.has(asset.id));
  if (!remaining.length) return;

  const topTitleById = new Map((outlineSkeleton || []).map((item) => [item.id, item.topTitle]));
  const chapterState = leaves
    .filter((leaf) => !/前言|附录/.test(`${topTitleById.get(leaf.id) || ''} ${leaf.title || ''}`))
    .map((leaf) => ({ leaf, count: countChapterImages(leaf.content) }));
  if (!chapterState.length) return;

  let inserted = 0;
  remaining.forEach((asset) => {
    let best = null;
    let bestScore = -1;
    let bestCount = Infinity;
    chapterState.forEach((item) => {
      // 每章优先不超过 2 张，已满时仍可作为兜底目标
      const score = scoreImageForChapter(asset, item.leaf, topTitleById.get(item.leaf.id)) + (item.count < 2 ? 1 : 0);
      if (score > bestScore || (score === bestScore && item.count < bestCount)) {
        best = item;
        bestScore = score;
        bestCount = item.count;
      }
    });
    if (!best) return;
    const alt = String(asset.description || asset.fileName || '图片').replace(/[\]\r\n]/g, ' ').trim();
    best.leaf.content = `${String(best.leaf.content || '').trim()}\n\n![${alt}](${asset.assetUrl})`;
    best.count += 1;
    usedImageIds.add(asset.id);
    workspaceStore.saveChapterContent({ nodeId: best.leaf.id, content: best.leaf.content });
    inserted += 1;
  });

  if (inserted) publish(`已补充 ${inserted} 张未被引用的图片素材`, 99);
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
 * 获取知识库上下文：每次按当前委托单位名称精确匹配知识库文件夹，不跨企业复用资料。
 */
async function resolveKnowledgeContext({ payload, knowledgeBaseService, publish }) {
  // 始终按当前委托单位重新读取知识库，避免复用上一家公司的缓存资料
  if (!knowledgeBaseService) return null;

  const companyName = String(payload.projectInfo?.companyName || '').trim();
  if (!companyName) return null;
  if (typeof knowledgeBaseService.readItemsByFolderName !== 'function') return null;

  publish?.(`正在读取知识库文件夹：${companyName}`, 12);
  try {
    const folderResult = await knowledgeBaseService.readItemsByFolderName(companyName, { limit: 15, contentExcerptChars: 1200 });
    if (folderResult?.items?.length) {
      const documentNames = [...new Set(folderResult.items.map((item) => String(item.documentName || '').trim()).filter(Boolean))];
      if (documentNames.length) {
        publish?.(`知识库命中文件夹“${companyName}”：${documentNames.join('、')}`, 13);
      }
      return {
        keyword: companyName,
        companyName,
        folderName: companyName,
        source: 'folder',
        items: folderResult.items,
        searchedAt: new Date().toISOString(),
      };
    }
    publish?.(`未找到与委托单位“${companyName}”同名的知识库文件夹，本次不引用其他企业资料`, 12);
  } catch (error) {
    // 知识库读取失败不阻塞生成流程
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
  } else {
    // 区分两种场景给出准确提示：
    // 1) 模型支持原生 web_search（如 Kimi/文心/GPT-4）+ 用户开启联网 → AI 自行联网查询
    // 2) 用户未开启联网或模型不支持原生联网 → 基于模型知识和行业经验生成
    const webSearchEnabled = aiService.isWebSearchEnabled?.();
    if (webSearchEnabled) {
      publish('未检索到知识库资料，AI 将联网查询相关资料', 15);
    } else {
      publish('未检索到知识库资料，将基于模型知识和行业经验生成', 15);
    }
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

  // AI 调用期间的模拟进度：从 20% 逐步涨到 65%，让用户看到持续推进
  let aiProgressTimer = null;
  let simulatedProgress = 20;
  const startSimulatedProgress = () => {
    aiProgressTimer = setInterval(() => {
      if (taskControl.signal.aborted || simulatedProgress >= 65) {
        clearInterval(aiProgressTimer);
        aiProgressTimer = null;
        return;
      }
      simulatedProgress += Math.random() * 3 + 1; // 每次涨 1~4
      if (simulatedProgress > 65) simulatedProgress = 65;
      task = updateTask({ status: 'running', progress: Math.round(simulatedProgress), logs });
    }, 800);
  };
  startSimulatedProgress();

  let outlineData;
  try {
    outlineData = await aiService.requestJson({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      progressLabel: '绿色报告目录',
    });
  } finally {
    // AI 返回或抛错都必须清掉模拟进度，否则失败后计时器仍会持续把 status 改回 running
    if (aiProgressTimer) {
      clearInterval(aiProgressTimer);
      aiProgressTimer = null;
    }
  }

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
    // 每次进度推送都带上最新 outlineData，让前端实时回显已完成章节内容
    const currentState = workspaceStore.loadState();
    task = updateTask(
      { status: 'running', progress: nextProgress, logs },
      { outlineData: currentState.outlineData },
    );
  }

  // 自动检索知识库
  const knowledgeContext = await resolveKnowledgeContext({ payload, knowledgeBaseService, publish });
  if (knowledgeContext?.items?.length) {
    publish(`已从知识库匹配 ${knowledgeContext.items.length} 条资料`, 5);
  } else {
    // 区分两种场景给出准确提示：
    // 1) 模型支持原生 web_search（如 Kimi/文心/GPT-4）+ 用户开启联网 → AI 自行联网查询新闻、政策、行业数据等
    // 2) 用户未开启联网或模型不支持原生联网 → 基于模型知识和行业经验生成
    const webSearchEnabled = aiService.isWebSearchEnabled?.();
    if (webSearchEnabled) {
      publish('未检索到知识库资料，AI 将联网查询相关资料', 5);
    } else {
      publish('未检索到知识库资料，将基于模型知识和行业经验生成', 5);
    }
  }

  // 图片素材：只使用用户已填写描述的图片，按清单顺序生成 IMG-001 形式的引用编号
  const imageAssets = (Array.isArray(payload.imageAssets) ? payload.imageAssets : [])
    .filter((item) => String(item?.description || '').trim())
    .map((item, index) => ({
      key: `IMG-${String(index + 1).padStart(3, '0')}`,
      id: item.id,
      fileName: item.fileName || '',
      description: String(item.description).trim(),
      assetUrl: item.assetUrl || '',
    }))
    .filter((item) => item.id && item.assetUrl);
  const usedImageIds = new Set();
  if (imageAssets.length) {
    publish(`已加载 ${imageAssets.length} 张图片素材，将按描述自动配图`, 7);
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
      imageAssets: imageAssets.map((item) => ({ key: item.key, description: item.description })),
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

    // 关键指标章节强制图表：模型偶尔退回 Markdown 表格，这里检测到没有 Mermaid 图时重试一次
    const chapterTopTitle = outlineSkeleton.find((item) => item.id === leaf.id)?.topTitle || leaf.title || '';
    const isKeyIndicatorChapter = /关键指标|指标总览/.test(chapterTopTitle);
    if (isKeyIndicatorChapter && content && !/```mermaid/i.test(content)) {
      publish(`${leaf.title} 未按要求输出图表，正在重新生成图表…`, Math.round((completed / total) * 100));
      try {
        const retryHint = '\n\n【重要】上一次输出使用了 Markdown 表格，违反了本章要求。请重新输出本章完整内容：整章不得出现任何 Markdown 表格，所有指标数据必须改用 ```mermaid 代码块（xychart-beta 柱形图 / pie 饼图）呈现，数据与口径保持不变。';
        const retryResult = await aiService.chat({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `${userPrompt}${retryHint}` },
          ],
        });
        const retryContent = typeof retryResult === 'string'
          ? retryResult
          : (retryResult?.content || retryResult?.message?.content || '');
        if (retryContent && /```mermaid/i.test(retryContent)) {
          content = retryContent;
        }
      } catch (error) {
        // 重试失败时保留原内容
      }
      if (taskControl.signal.aborted) {
        throw taskControl.signal.reason || new Error('任务已取消');
      }
    }

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

    content = replaceImagePlaceholders(content, imageAssets, usedImageIds);

    workspaceStore.saveChapterContent({ nodeId: leaf.id, content });

    // 原子完成计数（并发安全：JS 单线程，自增无竞争）
    completed++;
    publish(`已完成: ${leaf.title} (${completed}/${total})`, Math.round((completed / total) * 100));
  }

  // 并发调度所有章节
  await parallelLimit(leaves, CONCURRENCY, generateOneChapter);

  // AI 未主动引用的图片按相关性强制补入正文，确保已填写描述的图片全部使用
  if (imageAssets.length) {
    const generatedState = workspaceStore.loadState();
    insertRemainingImages({
      leaves: collectLeaves(generatedState.outlineData?.outline || []),
      outlineSkeleton,
      imageAssets,
      usedImageIds,
      workspaceStore,
      publish,
    });
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
