'use strict';

const { buildReferenceStandardsMarkdown, buildIndustryTopicsMarkdown } = require('./esgReferenceData.cjs');

const REPORT_TYPE_LABELS = {
  esg: 'ESG报告（环境、社会与治理）',
  sustainability: '可持续发展报告',
  csr: '社会责任报告',
  'carbon-footprint': '碳足迹报告',
  'green-finance': '绿色金融报告',
  'environmental-impact': '环境影响评价报告',
};

function resolveReportTypeLabel(reportType, reportTypeName) {
  if (reportTypeName) return String(reportTypeName);
  return REPORT_TYPE_LABELS[reportType] || '绿色报告';
}

const DOCUMENT_STYLE_GUIDANCE = {
  standard: '采用标准正式报告文体，语言严谨规范，结构清晰，适当使用表格和列表增强可读性。',
  narrative: '采用叙事型写作风格，注重逻辑连贯和可读性，用故事化方式呈现企业履责实践和成果。',
  'data-driven': '采用数据驱动型写作风格，重点呈现量化指标、数据对比和趋势分析，大量使用表格和图表描述。',
  academic: '采用学术规范型写作风格，引用国内外标准和研究，注重方法论说明和文献引用，语言客观严谨。',
};

const OUTLINE_TEMPLATES = {
  esg: [
    { title: '报告前言', description: '报告编制背景、目的与适用范围' },
    { title: '公司概况', description: '企业简介、业务范围、组织架构' },
    { title: 'ESG治理架构', description: 'ESG管理委员会、职责分工、决策机制' },
    { title: '环境（E）绩效', description: '能源消耗、温室气体排放、水资源、废弃物管理、生物多样性' },
    { title: '社会（S）绩效', description: '员工权益与发展、供应链管理、社区参与、客户权益' },
    { title: '治理（G）绩效', description: '公司治理结构、商业道德、风险管理、信息披露' },
    { title: 'ESG目标与展望', description: '下一年度ESG目标、改进计划与实施路径' },
    { title: '附录', description: 'ESG指标数据表、GRI索引、审验声明' },
  ],
  sustainability: [
    { title: '报告前言', description: '编制背景、报告范围与依据标准' },
    { title: '组织概况', description: '企业简介、战略方向、利益相关方' },
    { title: '可持续发展战略', description: '战略框架、目标体系、实施路径' },
    { title: '经济绩效', description: '经营成果、经济效益、创新投入' },
    { title: '环境绩效', description: '能源、排放、水资源、循环经济' },
    { title: '社会绩效', description: '员工、社区、客户、供应链' },
    { title: '利益相关方参与', description: '识别、沟通、回应机制' },
    { title: '未来展望与承诺', description: '可持续发展目标与行动计划' },
    { title: '附录', description: '指标对照表、审验报告、GRI索引' },
  ],
  csr: [
    { title: '报告前言', description: '编制说明、报告范围与时间边界' },
    { title: '企业概况', description: '企业简介、使命愿景、发展历程' },
    { title: '社会责任战略与管理', description: '社会责任理念、组织体系、管理制度' },
    { title: '股东权益保护', description: '公司治理、投资者关系、信息披露' },
    { title: '员工权益与发展', description: '劳动合同、薪酬福利、职业健康、培训发展' },
    { title: '客户与消费者权益', description: '产品质量、客户服务、消费者保护' },
    { title: '供应链责任', description: '供应商管理、采购合规、合作共赢' },
    { title: '社区参与与公益', description: '社区建设、公益捐赠、志愿服务' },
    { title: '环境保护责任', description: '节能减排、绿色运营、环保投入' },
    { title: '未来展望', description: '下一年度社会责任目标与计划' },
    { title: '附录', description: '社会责任指标数据表' },
  ],
  'carbon-footprint': [
    { title: '报告前言', description: '编制目的、范围边界与核算标准' },
    { title: '组织与运营概况', description: '企业简介、业务边界、组织结构' },
    { title: '核算方法与标准', description: 'GHG Protocol、ISO 14064标准说明' },
    { title: 'Scope 1 直接排放', description: '固定燃烧、移动燃烧、过程排放、 fugitive排放' },
    { title: 'Scope 2 间接排放', description: '外购电力、热力、蒸汽排放' },
    { title: 'Scope 3 其他间接排放', description: '上下游排放、出差、废弃物处理等' },
    { title: '排放总量与结构分析', description: '排放汇总、结构占比、趋势分析' },
    { title: '减排目标与路径', description: '碳中和目标、减排措施、实施计划' },
    { title: '数据质量管理', description: '数据来源、质量评估、不确定性分析' },
    { title: '附录', description: '排放因子表、活动数据表、审验声明' },
  ],
  'green-finance': [
    { title: '报告前言', description: '报告目的、适用范围与编制依据' },
    { title: '发行人概况', description: '机构简介、治理结构、可持续发展战略' },
    { title: '绿色金融框架', description: '募集资金用途、项目评估与筛选、资金管理' },
    { title: '募集资金使用情况', description: '资金分配、投建项目清单、投放进度' },
    { title: '项目环境影响', description: '节能减排量、环境效益测算、对比分析' },
    { title: '资金管理与监控', description: '专户管理、台账记录、内部控制' },
    { title: '第三方评估与认证', description: '评估机构意见、认证报告摘要' },
    { title: '未来展望', description: '后续绿色项目计划与资金安排' },
    { title: '附录', description: '项目清单明细表、环境效益数据表' },
  ],
  'environmental-impact': [
    { title: '总论', description: '项目背景、编制依据、评价标准、评价范围' },
    { title: '建设项目概况', description: '项目名称、建设内容、工艺流程、选址比选' },
    { title: '环境质量现状', description: '大气环境、水环境、声环境、生态环境现状' },
    { title: '工程分析', description: '污染源强核算、物料平衡、水平衡分析' },
    { title: '环境影响预测与评价', description: '大气影响、地表水影响、地下水影响、噪声影响' },
    { title: '污染防治措施', description: '废气、废水、固废、噪声防治措施及技术可行性' },
    { title: '环境风险评价', description: '风险识别、源项分析、预测与评价、防范措施' },
    { title: '总量控制与排污许可', description: '总量指标核算与申请' },
    { title: '环境影响经济损益分析', description: '环保投资、运行费用、经济效益、社会效益' },
    { title: '环境管理与监测计划', description: '施工期与运营期管理、监测方案' },
    { title: '评价结论与建议', description: '总结论、建议措施' },
    { title: '附录', description: '监测数据、计算模式、图件' },
  ],
};

function buildOutlineTemplateMarkdown(reportType, reportTypeName) {
  const template = OUTLINE_TEMPLATES[reportType] || OUTLINE_TEMPLATES.esg;
  const label = resolveReportTypeLabel(reportType, reportTypeName);
  const lines = [`# ${label}参考大纲`];
  template.forEach((item, i) => {
    lines.push(`${i + 1}. ${item.title}`);
    if (item.description) lines.push(`   - ${item.description}`);
  });
  return lines.join('\n');
}

function buildKnowledgeContextBlock(knowledgeContext) {
  if (!knowledgeContext?.items?.length) return '';
  const lines = ['\n以下是从知识库检索到的企业相关资料，请在生成时参考这些信息：'];
  knowledgeContext.items.forEach((item, i) => {
    lines.push(`--- [${i + 1}] ${item.title} ---`);
    if (item.resume) lines.push(item.resume);
    if (item.content) lines.push(item.content);
    if (item.documentName) lines.push(`（来源：${item.documentName}）`);
  });
  lines.push('---');
  return lines.join('\n');
}

function buildOutlineSystemPrompt(reportType, documentStyle, reportTypeName) {
  const label = resolveReportTypeLabel(reportType, reportTypeName);
  const styleGuidance = DOCUMENT_STYLE_GUIDANCE[documentStyle] || DOCUMENT_STYLE_GUIDANCE.standard;
  return `你是一名专业的${label}撰写专家。根据用户提供的企业信息和报告类型，生成一份结构完整、内容专业的${label}目录。

要求：
1. 参考提供的大纲模板，但可根据企业特点和行业特性灵活调整
2. 目录层级不超过三级，每个节点包含 title 和 description
3. 章节编号使用 1、1.1、1.1.1 格式
4. 每个叶子节点的 description 应说明该章节应涵盖的具体内容
5. 目录应符合国内外主流报告标准（如GRI、SASB、TCFD等），优先覆盖下方列出的核心指标和行业重大议题
6. 写作风格要求：${styleGuidance}`;
}

function buildOutlineUserInstruction(reportType, projectInfo, options = {}, reportTypeName) {
  const label = resolveReportTypeLabel(reportType, reportTypeName);
  const parts = [`请为以下企业生成一份${label}目录。\n`];
  if (projectInfo.companyName) parts.push(`企业名称：${projectInfo.companyName}`);
  if (projectInfo.industry) parts.push(`所属行业：${projectInfo.industry}`);
  if (projectInfo.reportingPeriod) parts.push(`报告期：${projectInfo.reportingPeriod}`);
  if (projectInfo.reportScope) parts.push(`报告范围：${projectInfo.reportScope}`);
  if (projectInfo.keyTopics) parts.push(`重点关注议题：${projectInfo.keyTopics}`);
  if (options.pageCount) parts.push(`生成页数：${options.pageCount} 页（请据此控制目录章节数量和深度）`);
  parts.push(`\n参考大纲模板：\n${buildOutlineTemplateMarkdown(reportType, reportTypeName)}`);
  const standardsBlock = buildReferenceStandardsMarkdown(reportType, projectInfo.industry);
  if (standardsBlock) parts.push(`\n${standardsBlock}`);
  const kbBlock = buildKnowledgeContextBlock(options.knowledgeContext);
  if (kbBlock) parts.push(kbBlock);
  if (options.userRequirements) {
    parts.push(`\n用户附加要求：\n${options.userRequirements}`);
  }
  parts.push(`\n请输出JSON格式，结构为：{"project_name":"企业名","project_overview":"一句话描述","outline":[{"id":"1","title":"章节标题","description":"章节内容说明","children":[{"id":"1.1","title":"子章节","description":"说明"}]}]}`);
  return parts.join('\n');
}

function buildContentSystemPrompt(reportType, documentStyle, reportTypeName) {
  const label = resolveReportTypeLabel(reportType, reportTypeName);
  const styleGuidance = DOCUMENT_STYLE_GUIDANCE[documentStyle] || DOCUMENT_STYLE_GUIDANCE.standard;
  return `你是一名专业的${label}写作专家。请根据目录节点标题和描述，生成专业、详实的报告正文。

写作规则：
1. 使用 Markdown 格式
2. 语言正式、专业，符合报告文体
3. 信息来源策略（重要）：
   - 如果下方提供了知识库资料，必须优先使用其中的真实数据、案例和表述，不得编造与资料冲突的内容
   - 对于资料中已有的具体数值（如排放量、营收、人数等），直接引用资料数据
   - 只有在资料中确实没有相关数据时，才使用占位符（如[XX]吨、[XX]%）供用户后续填入，并在占位符旁标注需要填入的数据类型
   - 严禁凭空编造企业的具体经营数据、排放数据、人员数据等事实性信息
4. 每个章节不少于800字
5. 适当使用表格、列表增强可读性
6. 如涉及标准引用，标注标准名称（如GRI 305、ISO 14064等）；如涉及行业议题，结合下方提供的行业议题说明进行展开
7. 即使没有具体数据，也要写出该章节应包含的内容框架、管理措施、政策机制、目标设定等定性描述，避免整篇只有占位符
8. 写作风格：${styleGuidance}`;
}

function buildContentUserInstruction(node, projectInfo, reportType, options = {}, reportTypeName) {
  const label = resolveReportTypeLabel(reportType, reportTypeName);
  const parts = [`请为以下${label}章节生成正文。\n`];
  parts.push(`章节标题：${node.title}`);
  parts.push(`章节描述：${node.description || ''}`);
  if (projectInfo.companyName) parts.push(`企业名称：${projectInfo.companyName}`);
  if (projectInfo.industry) parts.push(`所属行业：${projectInfo.industry}`);
  if (projectInfo.reportingPeriod) parts.push(`报告期：${projectInfo.reportingPeriod}`);
  if (options.pageCount) parts.push(`目标生成页数：${options.pageCount} 页`);
  // 注入行业议题，帮助 AI 理解该章节应涵盖的内容
  const industryTopicsBlock = buildIndustryTopicsMarkdown(projectInfo.industry);
  if (industryTopicsBlock) parts.push(`\n${industryTopicsBlock}`);
  const kbBlock = buildKnowledgeContextBlock(options.knowledgeContext);
  if (kbBlock) parts.push(kbBlock);
  if (options.userRequirements) {
    parts.push(`\n用户附加要求：\n${options.userRequirements}`);
  }
  return parts.join('\n');
}

module.exports = {
  REPORT_TYPE_LABELS,
  OUTLINE_TEMPLATES,
  DOCUMENT_STYLE_GUIDANCE,
  buildOutlineTemplateMarkdown,
  buildOutlineSystemPrompt,
  buildOutlineUserInstruction,
  buildContentSystemPrompt,
  buildContentUserInstruction,
};
