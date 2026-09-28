const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { countReadableWords } = require('../utils/wordCount.cjs');
const { extractAiSource } = require('../utils/aiSourceExtraction.cjs');
const { originalImageReferences } = require('./originalPlanRestoration.cjs');
const { createContentGenerationImageTools, validateContentImageReferences } = require('./contentGenerationImageTools.cjs');
const { AI_IMAGE_STYLES } = require('./aiImageStyles.cjs');
const { countHtmlWords, checkWordCount, createContentGenerationWordTools } = require('./contentGenerationWordTools.cjs');
const { createContentImageProtection } = require('./contentGenerationEditTools.cjs');
const { CONSISTENCY_TOOLS, refreshConsistencyInput, buildConsistencyPrompt, createContentGenerationConsistencyTools } = require('./contentGenerationConsistencyTools.cjs');
const { TABLE_CLEANUP_TOOLS, buildTableCleanupPrompt, createContentGenerationTableTools } = require('./contentGenerationTableTools.cjs');
const { LAYOUT_TOOLS, buildLayoutPrompt, createContentGenerationLayoutTools } = require('./contentGenerationLayoutTools.cjs');

const CONTENT_GENERATION_AGENT_TASK_KEY = 'technical-plan-content-generation';
const RESULT_FILE = '正文生成结果.json';
const PREFIX_WARMUP_SETTLE_MS = 1500;
const RESOURCE_DIR = path.join(__dirname, '../resources/content-generation');
const INPUT_FILES = {
  overview: '项目概述.md',
  decisions: '正文编排决策.json',
  outline: '正文完整目录.json',
  rules: '受限HTML生成规范.md',
  imageTypes: '配图类型对照表.md',
  template: '正文模板.html',
  config: '所选模板配置.json',
  facts: '全局事实设定.md',
};
const RESULT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['sections'],
  properties: { sections: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['section_id', 'file', 'words'],
    properties: { section_id: { type: 'string' }, file: { type: 'string' }, words: { type: 'integer', minimum: 1 } },
  } } },
};

// 小节文件名由目录 ID 确定，避免中文标题重名或包含 Windows 路径字符。
function sectionFile(id) {
  return `正文/${encodeURIComponent(id)}.html`;
}

// 每个写作模型只承担本节目标；全文字数由主会话统一统计。
function wordInstructions(control, checkTotalWords) {
  return `全文最少字数：${control.minimumWords || '不限制'}；全文最多字数：${control.maximumWords || '不限制'}。\n每节按 content_plan.target_words 指定的目标字数安排篇幅，0 表示不设目标；尽量接近目标，不为凑字数重复表达或删除必要信息。目标已经在编排阶段分配，不再自行分摊全文目标，也不让单个小节承担全文目标。${checkTotalWords ? '本轮全部目标生成完成后，由主 Agent 统一检查总字数。' : '本次仅统计目标小节字数，不承担全文字数达标。'}字数统计不含 HTML 标签及配图提示词。`;
}

// 将当前事实模式翻译为统一中文要求，主会话与并发任务共用输入快照。
function globalFactsInstructions(mode) {
  const requirement = mode === 'placeholder'
    ? '事实缺失处理方式：保留正文中需要说明的事项；核对相关参考材料后仍无法确定的具体事实，以“【待填写】”标记。已有占位符保持原样，不自行补入具体值。'
    : mode === 'omit'
      ? '事实缺失处理方式：保留必要事项，并采用不依赖未知具体值的概括性表述。未经参考材料提供，不得补入具体人员、时间、地点、业绩、证书或规格型号。'
      : '事实缺失处理方式：核对相关参考材料后仍缺少必要信息时，允许结合项目背景补充设定。新增设定应符合项目语境，并在各小节中保持一致。';
  return `${requirement} 补充事实前，应先核对相关参考材料和全局事实设定。只有未找到明确依据时，才适用当前事实缺失处理方式；材料与全局事实冲突时，以全局事实为准。允许补充设定只适用于缺失信息，不得覆盖或改变全局事实。禁止生成没有实际依据的引用。`;
}

// 正文写作共用规则，事实要求由编排决策中的同一段中文说明提供。
function writingInstructions(hasKnowledgeBase) {
  return `根据项目背景、章节描述和编排重点编写投标正文。明确说明与本节相关的实施措施、执行条件、责任分工或交付成果。内容应准确、具体、可执行，使用正式、简洁的书面语言，避免宣传性表述、缺少具体内容的概括和重复表达。\n使用参考资料时，应将适用内容整理为当前项目的方案表述，不在正文中提及${hasKnowledgeBase ? '知识库、' : ''}历史文档或素材来源。全局事实设定用于统一项目事实口径，不是本节必须逐项覆盖的写作清单。本节内容范围以标题、章节描述和编排重点为准。仅在说明本节内容确有需要时使用相关事实，不为覆盖全局事实增加无关段落，也不在各节重复罗列项目概况、人员、设备或制度。写作内容和全局事实不冲突即可，不要求完全引用全局事实。全局事实未明确的信息，按本次事实缺失处理要求执行。\n只输出受限 HTML 正文，不输出 Markdown、代码围栏、外层章节标题或解释。内部层次用普通段落、列表或无编号加粗引导语；有序列表仅用于步骤、流程和时间顺序。\n正文禁止使用 LaTeX 语法，包括 $...$、$$...$$、\\(...\\)、\\[...\\] 及 \\frac、\\text、\\circ 等命令。公式、参数和单位使用普通文字、Unicode 数学符号及受限 HTML 的 <sup>、<sub> 表达，例如 22 ℃ ± 2 ℃、40%～65%、≥30 m<sup>3</sup>/(h·人)。参考材料中的 LaTeX 在写入正文时也须转换为上述表达，保持数值、单位和含义不变。`;
}

// 按本轮可配图目标分配布局组数；整数余数避免浮点误差改变同分顺序。
function buildImageLayoutQuota(sections, options) {
  const total = options.imageQuantity !== 'none' && (options.useAiImages || options.useHtmlImages || options.useMermaidImages)
    ? sections.filter(section => section.content_plan?.image_needed === true).length : 0;
  const layouts = ['single', 'imageText', 'threeImages', 'fourImages'];
  const weights = options.imageQuantity === 'heavy' ? [2, 2, 3, 3] : [4, 4, 2, 0];
  const groups = weights.map(weight => Math.floor(total * weight / 10));
  const remaining = total - groups.reduce((sum, count) => sum + count, 0);
  const order = weights.map((weight, index) => ({ index, remainder: total * weight % 10 }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (const { index } of order.slice(0, remaining)) groups[index] += 1;
  return { total_groups: total, ...Object.fromEntries(layouts.map((layout, index) => [layout, groups[index]])) };
}

// 共用配图规则说明布局分工；全局名额只供主 Agent 分配，不交给各并发小节重复承担。
function imageInstructions(options) {
  const mode = {
    none: '无图：不安排配图、不留图片占位、不调用配图工具。',
    light: '少图：按本轮布局名额安排单张图片、图片表格和三列图片。',
    heavy: '多图：按本轮布局名额安排单张图片、图片表格、三列图片和四宫格。',
  }[options.imageQuantity];
  const aiPreference = options.imageQuantity !== 'none' && options.useAiImages
    ? '本轮批量生成的新增配图以 AI 生成为主，AI 图片目标占比为 60%。主 Agent 在并发写作前统筹本轮目标，不要求每个小节分别达到该比例；并发写作模型只执行本节分配，不独立承担占比目标。优先从正文中寻找适合实物、场景、效果、物理结构、工艺、操作等可视化表达的主题，再按配图类型对照表确定生成方式。需要准确表达流程、逻辑或数据时继续使用对照表规定的 HTML/Mermaid，不将这些图强行改为 AI 图片。占比按实际新增图片张数计算：单张图片和图片表格各 1 张，三列图片 3 张，四宫格 4 张；原方案图片不计入分子或分母，即使格式属性为 aiImage，也不视为本轮 AI 生图。60% 是整体规划目标，不是上限，不要求精确命中；保持布局名额，不额外加图凑比例。暂停重试沿用本轮安排，已完成的新图计入本轮统计；局部生成只统计本轮新增图片，单节修改不追补全文比例。'
    : '本轮不应用 AI 图片占比目标，按已开启的生成方式及配图类型对照表安排图片；无图时不新增配图。';
  // 画面差异化只约束 AI 图片画什么、怎么画，不改变数量、占比和布局名额。
  const aiDiversity = options.imageQuantity !== 'none' && options.useAiImages
    ? `\nAI 图片画面差异化：每张新增 AI 图片确定画面类型（配图类型对照表中的 AI 类型）、主体、视角景别（特写、中景、全景、鸟瞰、轴测、剖切等）和画面形式。画面形式可选：${Object.values(AI_IMAGE_STYLES).map(({ label, usage }) => `${label}（${usage}）`).join('、')}。全文 AI 图片在画面类型、主体、视角景别和画面形式上分散，避免多数图片都表现人员在工位或现场作业；管理、值守、协同类内容可改为表现设备实物、系统构成、空间全貌、作业对象细节或成果状态，相邻小节不重复相同组合。图组内的 AI 图片围绕共同主题，至少在主体或视角景别上明显不同；按步骤拆分时同时变换景别和主体，例如作业全景、部件特写、终端或仪表特写、完成状态，不能同一场景同一构图只换动作。同一图组使用同一画面形式，全文按内容选用多种画面形式。AI 图片提示词按主体、可见元素、视角景别与构图、环境光线正向描述画面，写出区分本图的具体视觉元素；不虚构的范围是数值、型号、品牌、单位名称和可读文字，设备外形、材质、空间、光线等示意性细节应具体描述，不堆叠否定约束。`
    : '';
  return `${mode}\n允许使用的类型：AI 图片（aiImage）${options.useAiImages ? '允许' : '不允许'}；HTML 图片（htmlImage）${options.useHtmlImages ? '允许' : '不允许'}；Mermaid 图片（mermaid）${options.useMermaidImages ? '允许' : '不允许'}。无图要求优先于类型开关；有图模式下仅使用允许的类型，三类均不允许时不安排配图或占位。\nHTML 图片允许的类型：${options.htmlImageTypes}。\nimage_needed 表示本节是否进入新增配图范围：为 false 时不新增图片；为 true 时可承接主 Agent 分配的布局。image_suitability_score 为 0～10 分的配图适配评分，用于选择更合适的布局承接小节，不用于取消本轮名额。不要求每个入选小节恰好一组，不设每节图片张数上限。\n批量生成时，主 Agent 按 image_layout_quota 完成本轮新增布局分配；并发写作模型只执行本节配图安排中的布局、组数、表达目的和生成方式，不自行改变生成方式，不自行承担或重新分配全局名额，未分配布局时不新增配图。single 为单张图片，图片本身应能表达意图；imageText 为左图右文，右侧文字解释左侧图片，仅含一张图。两者可按说明文字的必要性互换，合计组数保持不变。threeImages 为三列图片，fourImages 为四宫格，分别按分配组数执行，不自行拆成单张。组内图片围绕共同主题表达不同信息，避免重复。布局名额仅用于本轮批量生成，后续单节修改按用户要求执行，不重新分配全文名额。图片类型开关定义允许使用的生成方式，AI 占比目标用于本轮整体配图规划，各小节及全文均无须覆盖全部已开启类型。\n${aiPreference}${aiDiversity}\n根据新增图片要表达的内容和结构查阅配图类型对照表.md。未找到对应类型时，优先采用用途、结构相近类型所对应的生成方式；仍无法归类时，使用 AI 生图。始终遵守用户的图片类型开关设置：对照表仅用于确定生成方式，不代表该方式已获允许；无图模式下不新增图片；对应生成方式被关闭时，不生成该图，也不因该方式被关闭而改用其他方式。上述规则仅用于新增图片；已有原图按提供的对应关系复用，不受无图、类型开关或新增布局名额限制。`;
}

// 将整理扩写规则和当前字数交给模型，不增加程序缩写或内容审计流程。
function restorationInstructions(control, existingTotalWords) {
  return `小节包含 restored_content 时，先完整核对对应底稿，再依据当前项目、章节职责和编排重点整理正文。输出应保留底稿中的实质信息，并转换为受限 HTML；不得以重新撰写的内容替代底稿中应保留的信息。没有底稿的小节按正常流程生成，不搬用其他小节材料。\n本次启动时全文已有正文共 ${existingTotalWords} 字，全文上限 ${control.maximumWords || '不限制'}；每小节目标见本节 content_plan.target_words，0 表示不限制；本节还原字数见 restored_content.words。若本节还原字数已超过小节目标，或全文已有正文已超过全文上限，则本节只整理，不扩写，不为压字数删除实质内容；未超过时按现有要求适当扩写。仅对已设置的字数目标进行比较。全文字数上限用于判断全文已有内容是否超限，不作为单个小节的目标字数；未设置的小节目标或全文上限不参与相应判断。\n保留底稿中的实质信息、技术参数、措施和承诺；与全局事实设定冲突时，以全局事实设定为准，必要时读取并核对相关事实，无依据时不擅自改动。\n保留所有原表格的数据及含义，并保留本节原图片和引用顺序。表格编排和配图设置只指导新增内容：原表格不受 table.needed 限制，原图不受无图、image_needed、类型开关限制，也不占新增布局名额。原图按 restored_content.images 中的对应关系直接使用 asset_ref，不重新生成，不留待生图占位。原图 figure 必须保留 data-yb-generation="aiImage" 以及唯一、非空的 template data-yb-role="prompt"，模板写“复用原方案图片，不重新生成”并可补充图片说明。原图统一使用 data-yb-generation="aiImage" 作为受限 HTML 格式标记。原图身份及资源路径以 restored_content.images 为准；该标记不构成调用 AI 生图的指令。保留 img、图注及其他必需属性。`;
}

// 每轮新目标更新输入快照；暂停恢复不重写，已有小节 HTML 和图片始终保留。
function buildContentGenerationFiles({ outline, targets, plans, sectionStates = {}, projectOverview, globalFacts, globalFactsMode, wordControl, generationOptions, hasOriginalPlan, restoredContents, existingTotalWords, requirement, template, knowledgeBaseService, documentIds, checkTotalWords = true }) {
  if (!template) throw new Error('请先在“长嘛样”选择有效的正文模板');
  const targetIds = new Set(targets.map(({ item }) => item.id));
  const sections = [];
  const completedSections = [];
  let totalAiSections = 0;
  const restoredFiles = [];
  function visit(items, parents = []) {
    return items.map(item => {
      const node = { id: item.id, number: item.number, title: item.title, description: item.description || '', content_mode: item.content_mode };
      if (item.children?.length) node.children = visit(item.children, [...parents, item.title]);
      else if (item.content_mode === 'ai-generate') {
        totalAiSections++;
        if (targetIds.has(item.id)) {
          const section = { ...node, content_plan: plans[item.id]?.plan, chapter_path: [...parents, item.title].join(' > '), file: sectionFile(item.id) };
          const content = hasOriginalPlan && restoredContents[item.id];
          if (content) {
            const file = `已还原内容/${encodeURIComponent(item.id)}.md`;
            restoredFiles.push({ path: file, content });
            section.restored_content = {
              file, words: countReadableWords(content),
              images: [...new Set(originalImageReferences(content))].map(source_ref => ({
                source_ref,
                asset_ref: `原图/${crypto.createHash('sha256').update(source_ref).digest('hex')}${path.posix.extname(decodeURIComponent(new URL(source_ref).pathname))}`,
              })),
            };
          }
          sections.push(section);
        } else {
          node.content_plan = plans[item.id]?.plan;
          if (sectionStates[item.id]?.status === 'success') {
            completedSections.push({ id: item.id, number: item.number, title: item.title, file: sectionFile(item.id) });
          }
        }
      }
      return node;
    });
  }
  const tree = visit(outline);
  // 只汇总已保存的编排，不重新分配字数、表格或图片；完成列表是本轮启动前的快照。
  const executionSummary = {
    total_ai_sections: totalAiSections,
    target_sections: sections.length,
    completed_before_run: completedSections.length,
    target_words: sections.reduce((sum, section) => sum + (section.content_plan?.target_words || 0), 0),
    unspecified_word_target_sections: sections.filter(section => !section.content_plan?.target_words).length,
    image_candidate_ids: sections.filter(section => section.content_plan?.image_needed === true).map(section => section.id),
    table_section_ids: sections.filter(section => section.content_plan?.table?.needed === true).map(section => section.id),
  };
  const referenceFiles = {
    ...INPUT_FILES,
    ...(documentIds.length ? { knowledge_index: '知识库/索引.json' } : {}),
  };
  const files = [
    { path: INPUT_FILES.outline, content: JSON.stringify({ outline: tree }, null, 2) },
    { path: INPUT_FILES.overview, content: projectOverview || '未提供项目概述。' },
    { path: INPUT_FILES.decisions, content: JSON.stringify({ targets: sections, execution_summary: executionSummary, completed_sections: completedSections, reference_files: referenceFiles, has_knowledge_base: documentIds.length > 0, table_requirement: generationOptions.tableRequirement, word_requirements: wordInstructions(wordControl, checkTotalWords), word_control: { minimumWords: wordControl.minimumWords, maximumWords: wordControl.maximumWords, checkTotalWords }, image_layout_quota: buildImageLayoutQuota(sections, generationOptions), image_requirements: imageInstructions(generationOptions), ...(hasOriginalPlan ? { restoration_requirements: restorationInstructions(wordControl, existingTotalWords) } : {}), global_facts_mode: globalFactsMode, global_facts_requirements: globalFactsInstructions(globalFactsMode), user_requirement: requirement || '' }, null, 2) },
    { path: INPUT_FILES.rules, content: fs.readFileSync(path.join(RESOURCE_DIR, INPUT_FILES.rules), 'utf8') },
    { path: INPUT_FILES.imageTypes, content: fs.readFileSync(path.join(RESOURCE_DIR, INPUT_FILES.imageTypes), 'utf8') },
    // 与模板预览共用样张，只移除示例图片引用，保留图组结构和配图提示词。
    { path: INPUT_FILES.template, content: fs.readFileSync(path.join(RESOURCE_DIR, INPUT_FILES.template), 'utf8')
      .replace(/<img\b[^>]*>/gi, tag => tag.replace(/\s+(?:src|data-yb-asset-ref)="[^"]*"/gi, '')) },
    { path: INPUT_FILES.config, content: JSON.stringify(template, null, 2) },
    { path: INPUT_FILES.facts, content: globalFacts.map(group => `## ${group.title}\n${group.content}`).join('\n\n') || '未设定全局事实。' },
    ...restoredFiles,
  ];
  if (!documentIds.length) return files;
  const references = knowledgeBaseService.readReferences(documentIds, { includeMarkdown: true, includeItems: true });
  const index = [];
  for (const id of documentIds) {
    const reference = references.find(entry => entry.document.id === id);
    if (!reference?.markdown?.trim()) throw new Error(`选中的知识库缺少完整正文：${reference?.document?.file_name || id}`);
    const file = `知识库/${encodeURIComponent(id)}.md`;
    files.push({ path: file, content: reference.markdown });
    index.push({ document_id: id, file, document: reference.document, items: reference.items.map(item => ({ id: `${id}::${item.id}`, title: item.title, resume: item.resume })) });
  }
  files.push({ path: '知识库/索引.json', content: JSON.stringify(index, null, 2) });
  return files;
}

// 首次创建会话时复制原图；恢复沿用工作区副本，不依赖原文件再次读取。
function copyRestoredImages(workspaceDir, resolveOriginalImagePath) {
  const decisions = JSON.parse(fs.readFileSync(path.join(workspaceDir, INPUT_FILES.decisions), 'utf8'));
  const copied = new Set();
  for (const section of decisions.targets) {
    for (const { source_ref, asset_ref } of section.restored_content?.images || []) {
      if (copied.has(asset_ref)) continue;
      const target = path.join(workspaceDir, asset_ref);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(resolveOriginalImagePath(source_ref), target);
      copied.add(asset_ref);
    }
  }
}

// 输出边界只检查文件类型与有效正文，具体 HTML 结构按输入规范生成。
function checkSectionHtml(html) {
  const content = String(html).trim();
  if (!content.startsWith('<!-- yibiao:block -->') || content.includes('```') || !/<(?:p|ol|ul|table)\b/i.test(content) || !countHtmlWords(content)) {
    throw new Error('必须输出带 yibiao:block 分隔的有效受限 HTML 正文，不得输出 Markdown 或代码围栏');
  }
  return content;
}

// 读取实际小节文件，校验结果清单覆盖范围并重新统计字数。
function readContentGenerationResult(workspaceDir) {
  const decisions = JSON.parse(fs.readFileSync(path.join(workspaceDir, INPUT_FILES.decisions), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(workspaceDir, RESULT_FILE), 'utf8'));
  const entries = new Map((manifest.sections || []).map(item => [item.section_id, item]));
  if (entries.size !== decisions.targets.length || manifest.sections.length !== decisions.targets.length) throw new Error('正文生成结果清单与本次目标小节不一致');
  const sections = decisions.targets.map(section => {
    if (entries.get(section.id)?.file !== section.file) throw new Error(`正文结果缺少小节或文件路径不匹配：${section.id}`);
    const html = checkSectionHtml(fs.readFileSync(path.join(workspaceDir, section.file), 'utf8'));
    validateContentImageReferences(workspaceDir, html);
    return { section_id: section.id, number: section.number, title: section.title, file: section.file, words: countHtmlWords(html) };
  });
  return { workspaceDir, sections };
}

// Agent 批量提交写作任务；复用 scoped AI 队列实现真实并发和统一取消。
function createContentGenerationTools({ aiService, agentService, generationOptions = {}, hasKnowledgeBase = false, signal, onActivity, imageProtection, consistency, tableCleanup, onProgress = () => {} }, { Type, workspaceDir, setActiveTools }) {
  const activity = { pending: 0 };
  const read = file => fs.readFileSync(path.join(workspaceDir, file), 'utf8');
  const wordAdjustmentEnabled = generationOptions.wordCountRepair === true;
  let input;
  // 工具可在基础编排阶段注册，首次写作时才读取程序处理后的正文输入。
  function loadInput() {
    if (!input) {
      const decisions = JSON.parse(read(INPUT_FILES.decisions));
      input = { decisions, targets: new Map(decisions.targets.map(section => [section.id, section])),
        savedIds: new Set(decisions.targets.filter(section => {
          const filePath = path.join(workspaceDir, section.file);
          return fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8').trim();
        }).map(section => section.id)),
        overview: read(INPUT_FILES.overview), facts: read(INPUT_FILES.facts), rules: read(INPUT_FILES.rules),
        imageTypes: read(INPUT_FILES.imageTypes), template: read(INPUT_FILES.template), config: read(INPUT_FILES.config) };
    }
    return input;
  }
  const validateHtml = (root, html) => { checkSectionHtml(html); validateContentImageReferences(root, html); };
  // 并发请求同时到达时互相用不上缓存；先用只含公共前缀的短请求写入缓存，失败不影响正文生成。
  async function warmSharedPrefix(system, sharedInput, combinedSignal) {
    onActivity?.({ message: '正在预热正文公共材料缓存' });
    try {
      await aiService.chat({ signal: combinedSignal, logTitle: 'Agent HTML正文-公共前缀预热', output_token_limit: 1,
        messages: [{ role: 'system', content: system }, { role: 'user', content: sharedInput }] });
      // 部分服务在请求结束后才异步构建前缀缓存，稍候再放开并发。
      await delay(PREFIX_WARMUP_SETTLE_MS, undefined, { signal: combinedSignal });
    } catch (error) {
      combinedSignal.throwIfAborted();
      onActivity?.({ message: `公共材料缓存预热失败，直接并发生成：${error.message}` });
    }
  }
  return [{
    name: 'generate-sections', label: '批量生成正文小节',
    description: `将本轮全部待生成目标小节放入一次调用的 sections 数组，统一提交生成受限 HTML；程序队列按用户配置控制实际并发，超出上限的任务自动排队，各节独立落盘。instructions 只补充本节配图安排和必要的特殊或纠错要求，没有时填空字符串。程序自动提供本节编排、完整全局事实及公共材料，无需复述目标字数、写作重点、表格安排和格式规则；按需检索${hasKnowledgeBase ? '知识库等' : ''}补充资料，将相关原文摘录传入。失败小节可单独重试。`,
    executionMode: 'sequential',
    parameters: Type.Object({ sections: Type.Array(Type.Object({
      section_id: Type.String({ description: '必填，原样填写正文编排决策 targets 中本节的 id，不使用 number，不省略。' }), instructions: Type.String({ description: '仅填写本节新增配图安排，以及已有编排和公共规则之外确有必要的补充要求。配图安排包含布局、组数、逐图表达目的、图片类型和生成方式（aiImage/htmlImage/mermaid）；AI 图片另写明画面类型、主体、视角景别和画面形式。已有编排及公共材料由程序自动提供，无需复述目标字数、写作重点、表格安排、全局事实或 HTML 格式规则。没有新增配图和补充要求时填空字符串；失败重试时可填写具体纠错要求。' }), references: Type.String({ description: `${hasKnowledgeBase ? '知识库等' : ''}补充资料的相关原文摘录，注明来源；完整全局事实由程序提供，无补充资料时填空字符串。` }),
    }, { additionalProperties: false }), { minItems: 1 }) }, { additionalProperties: false }),
    async execute(_callId, params, toolSignal, onUpdate) {
      const { decisions, targets, savedIds, overview, facts, rules, imageTypes, template, config } = loadInput();
      const combinedSignal = AbortSignal.any([signal, toolSignal].filter(Boolean));
      const ids = params.sections.map(section => section.section_id);
      if (new Set(ids).size !== ids.length || ids.some(id => !targets.has(id))) throw new Error('只能提交本次目标小节，同一批不能重复提交相同小节');
      onActivity?.({ progress: { step: 'writing', label: '正在生成小节正文', unit: '节', total: targets.size, items: ids.map(id => ({ id, status: 'running' })) } });
      activity.pending += 1;
      // 全轮相同的规则和材料排在本节内容之前，便于模型服务复用请求前缀缓存。
      const system = `${writingInstructions(decisions.has_knowledge_base)}\n\n本次事实处理要求：\n${decisions.global_facts_requirements}\n\n${rules}\n\n配图类型对照表（据此确定新增图片的生成类型）：\n${imageTypes}\n\n本次配图要求：\n${decisions.image_requirements}\n\n写作执行要求：\n按本节 content_plan.target_words 的目标字数生成正文，0 表示不设目标；不能用全文上下限或其他小节字数代替本节目标。按本节 content_plan 执行：table.needed=false 时不新增数据表格；仅按本节配图安排与补充要求中主 Agent 分配的布局、组数、表达目的和生成方式新增图片，不自行改变生成方式；AI 图片的 template 按分配的画面类型、主体、视角景别正向描述画面，并注明画面形式名称，不自行分配全局名额或独立承担 AI 图片占比目标；未分配布局时不新增配图；无图、无允许类型或 image_needed=false 时不留新增配图块，并发正文写作阶段只生成新增图片的受限 HTML 结构，填写生成类型、用途说明、替代文本及必要图注，暂不填写图片资源引用。主 Agent 生成图片后补入工具返回的 asset_ref；已有原图直接使用提供的资源引用。你没有文件检索或图片生成工具，仅核对本次请求提供的材料；规范中要求主 Agent 读取文件、生成图片及提交结果清单的操作不由你执行，只返回本节 HTML，不虚构图片路径。`;
      const sharedInput = `项目概述：
${overview}

全局事实设定（完整内容）：
${facts}

字数要求：
${decisions.word_requirements}

用户额外要求：
${decisions.user_requirement}

受限 HTML 模板：
${template}

所选模板配置：
${config}`;
      try {
        if (params.sections.length > 1) await warmSharedPrefix(system, sharedInput, combinedSignal);
        const results = await Promise.all(params.sections.map(async job => {
          const section = targets.get(job.section_id);
          try {
            combinedSignal.throwIfAborted();
            const restoredContext = section.restored_content
              ? `\n\n本节还原处理要求（原表格、原图保留规则优先于新增限制）：\n${decisions.restoration_requirements}\n\n本节已还原底稿（完整内容）：\n${read(section.restored_content.file)}`
              : '';
            const html = checkSectionHtml(extractAiSource(await aiService.chat({
              signal: combinedSignal, logTitle: `Agent HTML正文-${section.number}-${section.title}`,
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: `${sharedInput}

本节编排决策：
${JSON.stringify(section, null, 2)}${restoredContext}

本节配图安排与补充要求：
${job.instructions.trim() || '无补充要求，未分配新增配图；已有原图按本节底稿要求保留。'}

补充参考资料摘录：
${job.references || '未提供'}` },
              ],
            }), 'html'));
            combinedSignal.throwIfAborted();
            const target = path.join(workspaceDir, section.file);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(`${target}.tmp`, html, 'utf8');
            fs.renameSync(`${target}.tmp`, target);
            savedIds.add(section.id);
            onActivity?.({ progress: { step: 'writing', label: '正在生成小节正文', unit: '节', items: [{ id: section.id, status: 'success' }] } });
            const result = { section_id: section.id, file: section.file, words: countHtmlWords(html), status: 'success' };
            onProgress({ ...result, completed: savedIds.size, total: targets.size });
            onUpdate?.({ content: [{ type: 'text', text: `已保存 ${section.file}（${savedIds.size}/${targets.size}）` }], details: result });
            return result;
          } catch (error) {
            onActivity?.({ progress: { step: 'writing', label: '正在生成小节正文', unit: '节', items: [{ id: section.id, status: combinedSignal.aborted ? 'cancelled' : 'error' }] } });
            return { section_id: section.id, status: 'error', error: error.message };
          }
        }));
        combinedSignal.throwIfAborted();
        return { content: [{ type: 'text', text: JSON.stringify(results) }], details: { results } };
      } finally { activity.pending -= 1; }
    },
  },
  ...createContentGenerationConsistencyTools({ agentService, signal, activity, onActivity, consistency, validateHtml, validateResult: () => readContentGenerationResult(workspaceDir) }, { Type, workspaceDir }),
  ...createContentGenerationTableTools({ agentService, signal, activity, onActivity, tableCleanup, validateHtml, validateResult: () => readContentGenerationResult(workspaceDir) }, { Type, workspaceDir }),
  ...createContentGenerationWordTools({ agentService, signal, activity, onActivity, imageProtection, validateHtml }, {
    Type, workspaceDir, setActiveTools: names => setActiveTools?.(names.filter(name => wordAdjustmentEnabled || name !== 'adjust-sections')),
  }).filter(tool => wordAdjustmentEnabled || tool.name !== 'adjust-sections'),
  ...createContentGenerationImageTools({ aiService, signal, onActivity, getSections: () => JSON.parse(read(INPUT_FILES.decisions)).targets, htmlImageOptimization: generationOptions.htmlImageOptimization === true,
    beforeApply: () => imageProtection?.beforeToolCall({ toolCall: { name: 'apply-section-images' } }),
  }, { Type, workspaceDir })];
}

// 单个持久 Agent 负责阅读、检索、批量调度及最终文件清单。
function buildContentGenerationPrompt(resuming, hasKnowledgeBase, hasOriginalPlan, wordAdjustmentEnabled, handoffInput) {
  return `你负责本次投标文件受限 HTML 正文生成，使用一个持久会话完成任务。
1. ${handoffInput ? `基础编排已由程序处理并保存，下面是程序处理后的生效编排及本轮执行要求，覆盖本轮全部目标，以这里的最终字数、表格和配图结果为准，不沿用基础编排中的候选建议。继续本会话已有的写作重点和知识条目，不重新编排，也无需重复通读未变化的目录和招标资料；复用的编排、目标详情或上下文有疑问时，按需读取正文编排决策.json。先完整阅读受限HTML生成规范.md，并按需读取项目概述.md。\n${JSON.stringify(handoffInput)}\n` : '先阅读正文编排决策.json（本轮执行清单）、项目概述.md和受限HTML生成规范.md，三个文件必须完整阅读；'}执行清单中的 reference_files 提供完整目录及资料位置，正文完整目录.json 按需读取。参考正文模板.html和所选模板配置.json。模板只是结构示例，不照抄示例正文，不要求每节套用全部元素。
2. ${hasKnowledgeBase ? '已选择知识库，可通过知识库/索引.json定位参考文档。编排中的 knowledge.item_ids 对应索引条目的 id；根据条目所属文档读取相关原文。索引标题和简介用于定位，具体内容以文档原文为准。' : ''}程序自动向每个小节写作请求提供全局事实设定.md的完整内容，无需为传递事实重复摘录；你可按需阅读，以核实相关要求和安排配图。主 Agent 负责按需检索并提供补充资料摘录，并发正文模型核对请求中提供的材料；编辑子 Agent 按需读取工作区文件。一致性审计阶段的阅读范围按审计指令执行。遵守正文编排决策.json中的 global_facts_requirements（当前事实模式的中文要求）。
3. 只生成正文编排决策.json中 targets 列出的 AI 生成叶子小节，完整目录按需用于了解上下级和相邻章节。execution_summary 已汇总全文 AI 小节数、本轮目标数与目标字数、未设置字数目标的小节数、配图候选及表格入选 ID；image_layout_quota 已计算本轮布局名额，直接使用这些结果。如发现信息不一致，可读取相关文件核实。统计与检查使用程序工具的结果：布局组数、生成方式分布、缺少图注、data-yb-fit 或有效引用的图片以 list-section-images 返回的 summary 为准，字数以 check-word-count 为准，HTML 结构由程序在保存和提交时校验。不要编写临时脚本，也不要输出中间 JSON 或 TXT 文件来重复这些统计和格式检查；bash 只用于工具结果无法覆盖的异常排查。completed_sections 仅记录本轮启动前已成功完成的非目标小节，不是实时进度；本轮暂停恢复时结合工具结果和实际文件继续，不能仅因 HTML 存在就认定图片、审计等步骤全部完成。遵守写作重点、表格和配图标记、全文及每小节字数要求、用户额外要求。各小节严格按照编排结果中的 content_plan.target_words 目标字数安排生成，不自行调整目标，不重新分配全文目标。字数校验可按约10%的容差判断，但该容差仅用于结果校验，不得写入 generate-sections 的补充要求或传递给正文生成模型。每节输出路径已给定，禁止修改输入文件和业务数据库。保留非目标小节的 HTML、图片及源码，新增配图源码使用新文件名，不覆盖已有文件。${hasOriginalPlan ? '本次使用已还原底稿：阅读 restoration_requirements，并在生成每节前完整阅读其 restored_content.file；工具会自动加入本节完整底稿、原图引用对应关系和全局事实。已超过生效字数要求的底稿只整理、不扩写；冲突以全局事实设定为准。保留原表格和原图，以下配图与表格限制仅用于新增内容；原图直接引用已复制文件，不重新生图。无底稿小节按正常流程生成。' : ''}
4. 先完整阅读配图类型对照表.md及 image_requirements（用户配图要求），读取 image_layout_quota（本轮新增布局名额）：total_groups 为总组数，single、imageText、threeImages、fourImages 分别为单张图片、图片表格、三列图片、四宫格的组数。结合本轮 targets 中 image_needed=true 小节的主题、写作重点和适配评分统一分配布局，并按 image_requirements 的本轮 AI 图片占比要求，在并发写作前规划每张图的表达目的、图片类型及生成方式；AI 图片按 image_requirements 的画面差异化要求逐图确定画面类型、主体、视角景别和画面形式，保证全文及图组内画面分散；名额为零时不安排新增配图。可在合适小节安排多组，不要求逐节平均分配；单张图片与图片表格可互换，但合计组数不变，三列图片和四宫格保持各自组数。暂停、失败重试沿用本轮名额，已完成的布局计入完成数量，只补未完成部分，不重新分配一整轮。检索需要的参考资料并完成本轮安排后，调用一次 generate-sections，将本轮全部待生成小节一次性放入 sections 数组提交，不自行按章节或固定小批次拆分调用，也不等待一部分小节完成后再提交其余小节。程序中的 AI 服务队列会按用户设置的并发上限运行，超出上限的任务自动排队，空出名额后自动启动后续任务，无需你控制批次。每项都必须包含 section_id、instructions 和 references，section_id 原样使用 targets 中对应小节的 id；无参考摘录时 references 填空字符串，不省略字段。暂停恢复时一次提交剩余待生成小节，失败重试只提交失败项，保留已完成内容；工具会自动加入本节编排、项目概述、HTML规范、模板、配图类型对照表、字数及配图要求，直接使用已保存编排，不逐节重写写作重点或扩展详细提纲，段落组织由正文写作模型根据编排完成。instructions 只补充本节配图布局、组数、逐图表达目的、图片类型和生成方式（aiImage/htmlImage/mermaid），AI 图片另含画面类型、主体、视角景别和画面形式，以及确有必要的特殊要求；无需复述目标字数、写作重点、表格安排、全局事实和公共格式规则，也不重复编写图片标签、属性、编号或完整生图提示词，这些由正文写作模型按规范生成。没有新增配图和补充要求时 instructions 填空字符串，程序将其解释为无补充要求、未分配新增配图，已有原图仍按原规则保留。references 只提供实际需要的补充资料摘录。发现具体问题时仍可核实资料并提供针对性的修正要求，失败重试只说明需要纠正的问题。全局名额由你统筹，不得让每个并发任务自行分配或承担整轮名额。文本并发遵循用户现有模型配置，不要使用bash或脚本直接调用外部模型。
5. 正文布局保存后，调用 list-section-images 获取本轮最新图片清单及 summary；不编写扫描脚本，发现结构或提示词问题仍可 read/edit 修复后按 section_ids 重新提取。清单提供小节、figure、生成方式、比例、提示词及当前引用，image_id 原样沿用到图片工具和回填工具，不能自行重编；reused_original=true 的图片直接复用，文件缺失时修复原引用，不重新生图。已有有效图片无需重复生成。配图前完整阅读配图类型对照表.md，并遵守正文编排决策.json 的 image_requirements（用户配图要求）。无图不安排图片或占位，不调用配图工具；有图时按已分配的布局及逐图确定的生成方式完成配图；生成方式遵守类型开关和对照表，布局本身不绑定 AI、HTML 或 Mermaid，无须覆盖全部已开启类型。在当前会话中完成所需图片：通过 generate-section-images 的 images 一次提交本轮全部待生成 AI、HTML、Mermaid 图片，不按章节、类型或固定小批次拆分；每项提供清单 image_id、kind（ai/html/mermaid）、prompt。AI 项 size 必填，逐图读取对应 figure 的 data-yb-size，按 square=1:1、wide=3:2、tall=3:4、panorama=16:9 选择匹配的具体生图尺寸；当前金龙 gpt-image-2-1k 的 tall 使用已验证的 768x1024。不能把画框名称作为尺寸，不得省略 size 或整批统一使用默认方图；prompt 中保留相同的宽高比例和横向/竖向构图方向。AI 项 style 必填，按 template 注明的画面形式选择对应值；prompt 正向描述画面，不写与 style 冲突的风格，也不重复罗列品牌、水印、无关文字等由程序统一追加的限制。HTML 项必填 frame_size，与正文画框一致。HTML/Mermaid 的 prompt 写明图片类型、表达目的、准确内容和数据，不只给文件路径或要求并发模型自行检索。程序同时向既有生图和文本队列提交任务，超限自动排队；每张源码生成完成立即本地转图，不等其他源码或 AI 图完成。每张成功图片由程序立即回填正文；整批结束后按返回的 unresolved 逐项检查 status、stage 和 error，按工具说明处理未成功项。有 source_file 的失败或未完成项直接读取、必要时修改源码后调用 render-html-image 或 render-mermaid-image，不重复生成成功源码；无源码的失败项才重新调用生成工具。两个 render 工具都使用 images 数组，每项必填 image_id 和 source_file，HTML 另填 frame_size，单张也使用一项数组；将需要重新渲染的项按类型分别批量提交。设计宽度1240px，square/wide/tall/panorama对应高度1240/827/1653/698px，尺寸包含程序统一设置的四周40px内边距；以 body 为画布，用 Flex/Grid 合理铺满内部区域，不额外包一层画布或重复添加外层边距。采用正式简洁的配色和清晰层次，不在底部留下大块空白，不靠无意义文字或空卡片填满；Mermaid 图的语法问题通过修改已保存的 .mmd 源文件并调用 render-mermaid-image 修复。源码保存在图片/目录，配图 HTML 可使用 CSS，不受正文受限 HTML 标签限制。图片工具成功后由程序直接更新对应 img 的引用，无须再调用 apply-section-images，也不必手工编辑正文。仅对返回 applied=false 的项，按 apply_error 刷新清单后调用 apply-section-images 重试，每项传 image_id、图片工具返回的 asset_ref 和 previous_asset_ref。不要回填状态非 success 的项，不填写 src，不虚构路径，不把源码嵌入正文。图组中每张图片均须生成。暂停恢复时先核对最新图片清单（成功图片已回填）与会话中工具返回的未完成项，复用已保存源码；只将无源码的剩余生成任务混合提交，已有源码的剩余项使用对应 render 工具。执行错误按工具反馈修复，失败不得默认为成功或改换生成方式。
6. ${resuming ? '本次继续原会话。先检查正文/已完成文件，保留有效正文、图片和源码，复用已存在且符合内容的图片引用；只补齐未完成、失败或明确需要修正的小节及图片。' : '每个小节保存为正文/下的独立HTML文件。'} 工具返回每节文件、字数和错误；对失败小节修正要求后重试，可用read/edit检查和修正已有HTML。不要删除已完成的小节。
小节 id 是固定身份，number 才是显示编号。generate-sections 的 section_id、结果清单及文件名均使用 id；不得根据显示编号改写文件路径。
7. 所有并发生成任务及配图全部完成后，再次调用 list-section-images，依据 summary 核对本轮实际新增布局与名额一致、图注及图片引用完整，并按 image_requirements 核对本轮新增图片的生成方式分布及 AI 图片画面是否分散；AI 占比是规划目标，不因比例偏差新增失败条件或额外加图。原方案图片及布局不占新增名额，也不计入 AI 占比。核对完成后，再调用 check-word-count 统一检查实际字数，不能一边生成一边按部分结果调整。完整检查后进入图片保护阶段：只用 edit 修改正文文字，write 仅可保存正文生成结果.json；不能再调用命令、正文生成或配图工具。已插入的所有图片块（包括原图、新图、图注及提示词）、图片顺序和图片表格布局不可修改；图文表格中的普通说明文字可以调整。工具因图片保护拒绝编辑时，本次修改未写入文件。重新读取目标文件，将编辑范围限定为允许修改的普通文字，并原样保留受保护的图片块、引用、顺序和布局后重试。${wordAdjustmentEnabled ? `word_control.checkTotalWords=false 时，本次仅统计目标小节字数，不依据全文上下限扩缩写本次小节；两个边界都未设置时不做字数调整。
检查完整且尚未达标时，以字数检查工具返回的 difference 判断调整方式，该值表示实际字数距离有效上下限的不足量或超出量，不是实际总字数。差额大于10000字时调用 adjust-sections；差额为1～10000字时由主 Agent 使用 read/edit 调整；差额为0且目标完整时，无须扩缩写。根据各节内容和篇幅分配本轮增减字数，各子任务只承担分配给本节的调整量。等待本轮全部任务结束后重新检查总字数，再依据最新差额安排下一轮。并发编辑期间你不得同时修改这些文件；等本轮所有任务结束后再调用 check-word-count。可以多轮调整，每轮按最新差额重新选择方式，直到进入要求范围，不设固定轮数。不删除原表格、原图、实质信息或承诺来凑字数；无法在保留要求下达标时明确调用 report-failure，不得伪报完成。不要再使用 generate-sections 重写整节进行字数调整。` : '统计完成后保持正文不变，如实提交实际字数和结果清单，进入一致性审计。'}
8. 检查小节覆盖、字数及所有 img 的 data-yb-asset-ref 对应图片文件已存在，图片占位全部完成后将所有本次目标写入正文生成结果.json，格式为{"sections":[{"section_id":"小节ID","file":"正文/小节ID.html","words":实际正文统计字数}]}。该JSON已预置Schema并开启自动校验；用write/edit完成，无需重复独立JSON校验。正文内容仅保存于各小节 HTML 文件。结果清单只记录小节 ID、文件路径和实际字数。完成当前正文生成阶段的全部目标和检查后，在结果清单最后一次写入或更新操作上设置 task_complete=true。
9. 提交本阶段结果后，程序会在同一会话中发出一致性审计任务；等待下一阶段要求，不自行转换 Word。
以下写作规则仅适用于小节 HTML 文件，不适用于结果清单：\n${writingInstructions(hasKnowledgeBase)}`;
}

// 基础编排、正文与后处理共用一次主调用；暂停后仍从持久 Session 和已保存阶段恢复。
async function runContentGenerationAgent({ agentService, aiService, generationOptions = {}, resume, hasKnowledgeBase, hasOriginalPlan, resolveOriginalImagePath,
  signal, planning, prepareGeneration, buildFiles, checkLayout, onLayoutProgress = () => {}, onCheckpoint = () => {}, onActivity, onProgress,
  onConsistencyProgress = () => {}, onTableCleanupProgress = () => {}, onWorkspaceReady = () => {} }) {
  const reuseSession = agentService.hasPersistentTaskSession(CONTENT_GENERATION_AGENT_TASK_KEY);
  const persistent = reuseSession ? agentService.loadPersistentTask(CONTENT_GENERATION_AGENT_TASK_KEY) : null;
  const persistentState = persistent?.state || {};
  const planningHandoff = Boolean(planning) || ['content-planning', 'restoring'].includes(persistentState.phase);
  const resuming = Boolean(resume && reuseSession && !planningHandoff);
  const savedState = resuming ? persistentState : {};
  const wordAdjustmentEnabled = generationOptions.wordCountRepair === true;
  const protectionActive = savedState.word_adjustment_started === true;
  let consistencyState = savedState.consistency || null;
  let tableCleanupState = savedState.table_cleanup || null;
  let layoutState = savedState.layout_check || null;
  let stage = planning ? 'content-planning' : layoutState ? 'layout-checking' : tableCleanupState ? 'table-cleaning' : consistencyState ? 'auditing' : 'generating';
  let toolContext;
  let imageProtection;
  let generationTools;
  let handoffInput;
  const layoutActivity = { pending: 0 };
  const localContext = { signal, onActivity, workspace_dir: persistent?.paths?.workspaceDir };
  const consistency = { get: () => consistencyState, save(state) {
    consistencyState = state;
    agentService.updatePersistentTask(CONTENT_GENERATION_AGENT_TASK_KEY, { consistency: state });
    onConsistencyProgress(state);
  } };
  const tableCleanup = { get: () => tableCleanupState, save(state) {
    tableCleanupState = state;
    agentService.updatePersistentTask(CONTENT_GENERATION_AGENT_TASK_KEY, { table_cleanup: state });
    onTableCleanupProgress(state);
  } };
  const layout = { get: () => layoutState, save(state) {
    layoutState = state;
    stage = 'layout-checking';
    agentService.updatePersistentTask(CONTENT_GENERATION_AGENT_TASK_KEY, { layout_check: state, phase: stage });
    onLayoutProgress(state);
  } };
  // 注册时传入稳定的保护入口，实际规则在阶段切换后更新。
  const protection = {
    enter: names => imageProtection.enter(names),
    beforeToolCall: context => imageProtection.beforeToolCall(context),
    beforeWrite: context => imageProtection.beforeWrite(context),
  };
  const planningTools = ['read', 'edit', 'write', 'find', 'ls', 'json-validation', 'ask-user', 'report-failure'];
  const generationToolNames = () => [...planningTools, 'bash', ...generationTools.map(tool => tool.name)];
  const prepareFiles = context => prepareGeneration ? prepareGeneration(context) : buildFiles();
  // 仅提供程序已确定的字段，避免再次输出完整编排。
  function prepareHandoff(files) {
    if (!planningHandoff) return;
    const { targets, ...requirements } = JSON.parse(files.find(file => file.path === INPUT_FILES.decisions).content);
    handoffInput = { ...requirements, targets: targets.map(({ id, file, content_plan, restored_content }) => ({
      id, file, content_plan: { target_words: content_plan.target_words, table: content_plan.table, image_needed: content_plan.image_needed },
      ...(restored_content ? { restored_content } : {}),
    })) };
  }
  // 只有正文输入已落盘后才建立目标与图片保护；格式补写限于检测分配的小节。
  function initializeContent() {
    const { workspaceDir } = toolContext;
    const decisions = JSON.parse(fs.readFileSync(path.join(workspaceDir, INPUT_FILES.decisions), 'utf8'));
    const isLayout = stage === 'layout-checking';
    imageProtection = createContentImageProtection({
      workspaceDir, files: isLayout ? layoutState.jobs.map(job => job.file) : decisions.targets.map(section => section.file),
      active: isLayout || protectionActive || Boolean(consistencyState) || Boolean(tableCleanupState),
      allowManifest: !isLayout,
      ...(isLayout ? { toolNames: LAYOUT_TOOLS } : tableCleanupState ? { toolNames: TABLE_CLEANUP_TOOLS } : consistencyState ? { toolNames: CONSISTENCY_TOOLS } : {}),
      setActiveTools: names => toolContext.setActiveTools?.(names.filter(name => wordAdjustmentEnabled || name !== 'adjust-sections')),
      onEnter: () => agentService.updatePersistentTask(CONTENT_GENERATION_AGENT_TASK_KEY, { word_adjustment_started: true }),
    });
    if (isLayout) return;
    if (!resuming && hasOriginalPlan) copyRestoredImages(workspaceDir, resolveOriginalImagePath);
    if (!protectionActive && !consistencyState && !tableCleanupState) toolContext.setActiveTools?.(generationToolNames());
    if (!tableCleanupState && consistencyState?.status === 'running') refreshConsistencyInput(workspaceDir);
    onWorkspaceReady(workspaceDir);
    if (tableCleanupState) onTableCleanupProgress(tableCleanupState);
    else if (consistencyState) onConsistencyProgress(consistencyState);
  }
  function assertLayoutCorrectionAllowed() {
    if (layoutState.status !== 'supplementing') throw new Error('格式补写已提交完成，不能继续编辑正文');
    if (layoutActivity.pending || layoutState.jobs.some(job => !layoutState.completed_section_ids.includes(job.section_id))) {
      throw new Error('请等待全部格式补写任务成功后，再修正新增内容');
    }
  }
  function next(nextStage, prompt, compaction) {
    stage = nextStage;
    return { stage, prompt, ...(compaction ? {
      compact_before_prompt: true, compaction_optional: true, compaction_stage: `${nextStage}-compaction`,
      compaction_message: '正在压缩上下文', compaction_complete_message: '上下文压缩完成', compaction_instructions: compaction,
    } : {}) };
  }
  // 进入读写量大的后续阶段前压缩历史；正文以工作区文件为准，摘要只保留流程结论。
  function compactionInstructions(nextStageName) {
    return `请用简体中文总结，供下一阶段「${nextStageName}」继续使用。保留：本轮目标小节范围及正文、图片文件的位置约定；各阶段已完成情况和程序反馈的结论；已确定的统一事实口径；尚未解决的问题、失败或待重试的小节及原因。正文、图片和汇总文件以工作区文件为准，不在摘要中摘录正文、HTML 或汇总文件原文，也不复述已结束阶段的操作细节。`;
  }
  function generationPrompt() {
    return `${reuseSession && !resuming && !planningHandoff ? '本次为目录变更后的局部生成任务，在原会话中执行。重新读取已更新的输入文件，仅对当前 targets 执行生成和审计修复；本轮完成状态根据当前目标重新确认，不沿用上一轮的完成结论。保留其他小节的 HTML、图片及源码，新增配图源码使用新文件名，不覆盖已有文件。\n' : ''}${buildContentGenerationPrompt(resuming, hasKnowledgeBase, hasOriginalPlan, wordAdjustmentEnabled, handoffInput)}${protectionActive ? (wordAdjustmentEnabled ? '\n本次恢复时已处于图片保护阶段，正文和配图已经就绪，只继续文字调整及结果清单保存，不重新生成正文或图片。' : '\n本次恢复时已处于图片保护阶段，正文和配图已经就绪，保持现有正文和图片，核对并保存结果清单，随后进入一致性审计。') : ''}`;
  }
  // 初检及复查均由程序完成，只有明确的补写任务才继续请求主模型。
  function finishLayout(context) {
    if (!checkLayout) return { complete: true };
    return (async () => {
      const result = readContentGenerationResult(context.workspace_dir);
      await checkLayout(result, layout, context);
      context.signal?.throwIfAborted();
      if (layoutState.status === 'supplementing') {
        stage = 'layout-checking';
        if (toolContext) initializeContent();
        return next(stage, buildLayoutPrompt(layoutState), compactionInstructions('格式自检补写'));
      }
      return { complete: true };
    })();
  }
  // 审计结束后按既有配置去表格，随后进入本地格式检测。
  function finishConsistency(context) {
    const decisions = JSON.parse(fs.readFileSync(path.join(context.workspace_dir, INPUT_FILES.decisions), 'utf8'));
    if (decisions.table_requirement !== 'none') return finishLayout(context);
    tableCleanup.save({ status: 'running', section_ids: [], completed_section_ids: [] });
    imageProtection.enter(TABLE_CLEANUP_TOOLS);
    return next('table-cleaning', buildTableCleanupPrompt(tableCleanupState), compactionInstructions('正文去表格'));
  }

  onActivity?.(resuming ? { message: '正在恢复任务与输入资料' } : { progress: { step: 'preparing', label: planning ? '正在准备基础编排资料' : '正在准备正文输入资料' } });
  const files = planning ? planning.files : resuming ? [] : await prepareFiles(localContext);
  if (!planning && !resuming) prepareHandoff(files);
  // 格式检测被暂停时先继续程序工作，不为跳过已完成补写再请求一次模型。
  if (stage === 'layout-checking' && layoutState.status !== 'supplementing') {
    const continuation = await finishLayout(localContext);
    if (continuation.complete) {
      agentService.updatePersistentTask(CONTENT_GENERATION_AGENT_TASK_KEY, { status: 'success', phase: 'completed', agent_connection: 'idle', error: null });
      return readContentGenerationResult(localContext.workspace_dir);
    }
  }
  const runId = crypto.randomUUID();
  if (reuseSession) agentService.updatePersistentTask(CONTENT_GENERATION_AGENT_TASK_KEY, {
    run_id: runId, status: 'running', phase: stage, agent_connection: 'running', error: null,
    ...(!resuming ? { word_adjustment_started: false, consistency: null, table_cleanup: null, layout_check: null } : {}),
  });
  const result = await agentService.runTask({
    task_id: runId, title: '投标文件正文生成', primary_session: true, summary_enabled: false, fixed_tool_list: true,
    prompt: planning ? planning.prompt : layoutState ? buildLayoutPrompt(layoutState) : tableCleanupState ? buildTableCleanupPrompt(tableCleanupState) : consistencyState ? buildConsistencyPrompt(consistencyState, hasKnowledgeBase, hasOriginalPlan) : generationPrompt(),
    output_file: RESULT_FILE, files, signal,
    persistent_task: { task_key: CONTENT_GENERATION_AGENT_TASK_KEY, mode: reuseSession ? 'resume' : 'create' },
    initial_stage: stage, active_tools: planning ? planningTools : layoutState ? LAYOUT_TOOLS : undefined,
    prepare_output_files: planning ? [planning.outputFile] : [],
    max_retries: 1, timeout_ms: 30 * 60 * 1000,
    // 基础编排沿用原有不自动重试策略；正文仍保留一次当前阶段修复机会。
    buildRetryPrompt: (error, meta) => stage === 'content-planning' ? null
      : `上一轮执行未通过程序校验或执行失败：${String(error?.message || error).slice(0, 800)}\n本次结果文件：${RESULT_FILE}。按当前阶段要求修复，保留已完成内容及工具权限，不重新执行已完成阶段。这是第 ${meta.attempt}/${meta.max_retries} 次自动修复机会。`,
    json_validation_schemas: { [RESULT_FILE]: RESULT_SCHEMA, ...(planning ? { [planning.outputFile]: planning.schema } : {}) }, auto_validate_json: true,
    before_tool_call: context => {
      if (stage === 'content-planning') {
        if (!planningTools.includes(context.toolCall.name)) throw new Error('基础编排尚未完成，请先提交编排结果');
      } else {
        if (stage === 'layout-checking') {
          if (context.toolCall.name === 'edit') assertLayoutCorrectionAllowed();
        } else {
          if (!wordAdjustmentEnabled && context.toolCall.name === 'adjust-sections') throw new Error('当前阶段仅统计字数，请提交实际字数和结果清单');
          if (tableCleanupState?.status === 'completed' && ['edit', 'write', 'remove-section-tables'].includes(context.toolCall.name)) throw new Error('去表格已经完成，请标记任务完成，不再修改正文');
          if (!tableCleanupState && consistencyState && consistencyState.status !== 'running' && ['edit', 'write', 'repair-sections'].includes(context.toolCall.name)) throw new Error('本轮审计结论已经提交，请标记任务完成并等待程序进入下一阶段');
        }
        imageProtection.beforeToolCall(context);
      }
      const { name } = context.toolCall;
      const args = context.args || {};
      if (['read', 'edit', 'write', 'find', 'ls'].includes(name)) onActivity?.({ operation: name,
        message: `${({ read: '正在读取', edit: '正在修改', write: '正在保存', find: '正在查找', ls: '正在查看目录' })[name]}：${args.path || args.file_path || args.pattern || name}` });
    },
    before_file_write: context => {
      if (stage === 'content-planning') {
        const target = path.resolve(context.filePath);
        const allowed = path.resolve(toolContext.workspaceDir, planning.outputFile);
        if (process.platform === 'win32' ? target.toLowerCase() !== allowed.toLowerCase() : target !== allowed) throw new Error(`基础编排阶段只能修改 ${planning.outputFile}`);
        return;
      }
      if (stage === 'layout-checking') assertLayoutCorrectionAllowed();
      imageProtection.beforeWrite(context);
    },
    create_tools: context => {
      toolContext = context;
      generationTools = createContentGenerationTools({ aiService, agentService, generationOptions, hasKnowledgeBase, signal, onProgress, onActivity,
        imageProtection: protection, consistency, tableCleanup }, context);
      const layoutTools = createContentGenerationLayoutTools({ agentService, signal, layout, activity: layoutActivity, onActivity,
        validateHtml(root, html) { checkSectionHtml(html); validateContentImageReferences(root, html); },
        validateResult: () => readContentGenerationResult(context.workspaceDir),
      }, context);
      if (stage !== 'content-planning') initializeContent();
      return [...generationTools, ...layoutTools];
    },
    validateOutput: (_result, context) => {
      if (stage === 'content-planning') return planning.validate(fs.readFileSync(path.join(context.workspace_dir, planning.outputFile), 'utf8'));
      onActivity?.({ progress: { step: 'result-check', label: '正在核对正文结果与图片引用' } });
      const checked = readContentGenerationResult(context.workspace_dir);
      onActivity?.({ progress: { step: 'result-check', label: '正文结果与图片引用核对完成', done: true } });
      return checked;
    },
    continueTask: (_result, context) => {
      if (stage === 'content-planning') return (async () => {
        await planning.complete(context.validation_result, context);
        const nextFiles = await prepareFiles(context);
        await context.writeFiles(nextFiles);
        prepareHandoff(nextFiles);
        stage = 'generating';
        initializeContent();
        return next(stage, generationPrompt());
      })();
      if (stage === 'layout-checking') return layoutState.status === 'rechecking' ? finishLayout(context)
        : next(stage, buildLayoutPrompt(layoutState));
      if (tableCleanupState) return tableCleanupState.status === 'completed' ? finishLayout(context)
        : next('table-cleaning', buildTableCleanupPrompt(tableCleanupState));
      if (consistencyState) {
        if (consistencyState.status === 'completed') return finishConsistency(context);
        if (consistencyState.status === 'round-completed') {
          if (!consistencyState.remaining_issues.length || consistencyState.round >= 3) {
            consistency.save({ ...consistencyState, status: 'completed' });
            return finishConsistency(context);
          }
          refreshConsistencyInput(context.workspace_dir);
          consistency.save({ ...consistencyState, round: consistencyState.round + 1, status: 'running', summary: '' });
          return next('auditing', buildConsistencyPrompt(consistencyState, hasKnowledgeBase, hasOriginalPlan), compactionInstructions(`第 ${consistencyState.round} 轮一致性审计`));
        }
        return next('auditing', buildConsistencyPrompt(consistencyState, hasKnowledgeBase, hasOriginalPlan));
      }
      const words = checkWordCount(context.workspace_dir);
      if (!words.complete) return next('generating', `正文目标尚未完整：${JSON.stringify(words.missing_section_ids)}。补齐缺失小节和配图并更新结果清单，保留已完成内容。`);
      if (words.in_range || !wordAdjustmentEnabled) {
        readContentGenerationResult(context.workspace_dir);
        const decisions = JSON.parse(fs.readFileSync(path.join(context.workspace_dir, INPUT_FILES.decisions), 'utf8'));
        const targetWords = decisions.targets.reduce((sum, section) => sum + (section.content_plan?.target_words || 0), 0);
        onActivity?.({ message: `首次正文生成：本轮目标 ${targetWords || '未设置'} 字，实际 ${words.total_words} 字；${wordAdjustmentEnabled ? '' : '暂不扩缩写，'}进入一致性审计。` });
        refreshConsistencyInput(context.workspace_dir);
        consistency.save({ round: 1, status: 'running', remaining_issues: [], failed_sections: [], summary: '' });
        imageProtection.enter(CONSISTENCY_TOOLS);
        return next('auditing', buildConsistencyPrompt(consistencyState, hasKnowledgeBase, hasOriginalPlan), compactionInstructions('第 1 轮一致性审计'));
      }
      imageProtection.enter();
      return next('generating', `正文尚未满足总字数要求：${JSON.stringify(words)}。所有并发任务结束后复查；以检查结果 difference（距离有效字数范围的差额，不是实际总字数）决定调整方式：大于10000字调用 adjust-sections，为1～10000字时由主 Agent 用原生 edit 调整。继续调整并更新结果清单；不得改变输入要求或删除实质内容，确实无法满足时调用 report-failure。`);
    },
    onCheckpoint: checkpoint => onCheckpoint({ ...checkpoint, task_key: CONTENT_GENERATION_AGENT_TASK_KEY, run_id: runId }),
    onActivity,
  });
  signal.throwIfAborted();
  onActivity?.({ progress: { step: 'result-check', label: '正在核对最终结果' } });
  const output = readContentGenerationResult(result.workspace_dir);
  onActivity?.({ progress: { step: 'result-check', label: '结果核对完成', done: true } });
  return output;
}

module.exports = { CONTENT_GENERATION_AGENT_TASK_KEY, buildContentGenerationFiles, createContentGenerationTools, runContentGenerationAgent, readContentGenerationResult, checkSectionHtml };
