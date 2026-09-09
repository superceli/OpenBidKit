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

// ============ 报告大纲模板 ============
// 说明：
// - 非评价类报告（esg、sustainability、csr、carbon-footprint、green-finance）按市面通用披露流程组织，
//   不含 A级/AA级/AAA级 综合评价结论，最后一章统一为"附录"。
// - 环境影响评价报告（environmental-impact）按建设项目环评标准流程组织，
//   含"评价结论与建议"（工程可行性结论，不是分级评价）。
// - 绿色评价类报告（绿色工厂评价、绿色供应链评价、绿色设计产品评价等）使用 EVALUATION_OUTLINE_TEMPLATE，
//   按市面绿色制造体系评价标准流程组织，须含综合评价等级（A级/AA级/AAA级）和附录。
const OUTLINE_TEMPLATES = {
  esg: [
    { title: '报告前言', description: '编制背景、报告范围、时间边界与编制依据（GRI、SASB、TCFD等）' },
    { title: '公司概况', description: '企业简介、业务范围、组织架构、报告期内重大变化' },
    { title: 'ESG治理架构', description: 'ESG管理委员会、职责分工、决策机制、信息披露' },
    { title: '环境（E）绩效', description: '能源消耗、温室气体排放、水资源、废弃物管理、生物多样性' },
    { title: '社会（S）绩效', description: '员工权益与发展、供应链管理、社区参与、客户权益' },
    { title: '治理（G）绩效', description: '公司治理结构、商业道德、风险管理、信息披露' },
    { title: 'ESG目标与展望', description: '下一年度ESG目标、改进计划与实施路径' },
    { title: '附录', description: 'ESG指标数据表、GRI标准索引表、第三方审验声明' },
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
    { title: '附录', description: '指标对照表、GRI索引表、第三方审验报告' },
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
    { title: '附录', description: '社会责任指标数据表、标准索引、审验声明' },
  ],
  'carbon-footprint': [
    { title: '报告前言', description: '编制目的、范围边界与核算标准' },
    { title: '组织与运营概况', description: '企业简介、业务边界、组织结构' },
    { title: '核算方法与标准', description: 'GHG Protocol、ISO 14064标准说明' },
    { title: 'Scope 1 直接排放', description: '固定燃烧、移动燃烧、过程排放、fugitive排放' },
    { title: 'Scope 2 间接排放', description: '外购电力、热力、蒸汽排放' },
    { title: 'Scope 3 其他间接排放', description: '上下游排放、出差、废弃物处理等' },
    { title: '排放总量与结构分析', description: '排放汇总、结构占比、趋势分析' },
    { title: '减排目标与路径', description: '碳中和目标、减排措施、实施计划' },
    { title: '数据质量管理', description: '数据来源、质量评估、不确定性分析' },
    { title: '附录', description: '排放因子表、活动数据表、第三方核证声明' },
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
    { title: '附录', description: '项目清单明细表、环境效益数据表、第三方认证报告' },
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
    { title: '评价结论与建议', description: '工程环境可行性总结论、主要环境影响结论、污染防治措施可行性结论、建议措施' },
    { title: '附录', description: '监测数据、计算模式说明、相关图件、环评资质证书' },
  ],
};

// ============ 绿色评价类报告通用大纲模板 ============
// 适用于绿色工厂评价、绿色供应链评价、绿色设计产品评价、绿色园区评价、
// 绿色制造评价、智能制造示范工厂评价等工信部绿色制造体系评价报告，
// 以及其他需要给出 A级/AA级/AAA级 综合评价等级的绿色评价报告。
const EVALUATION_OUTLINE_TEMPLATE = [
  { title: '报告前言', description: '评价目的、评价对象、评价范围、评价期、评价依据（法规、政策、标准）' },
  { title: '企业概况', description: '企业简介、组织架构、生产规模、主要产品、工艺路线、地理位置' },
  { title: '评价依据', description: '相关法律法规、政策文件、国家标准与行业标准、企业内部管理制度清单' },
  { title: '评价指标体系', description: '按评价指标框架逐项说明各一级指标、二级指标及权重；通常覆盖基础设施、管理体系、能源资源投入、产品、环境排放等维度' },
  { title: '自评价结果', description: '企业对照评价指标体系逐项自评、提供佐证材料、汇总自评得分' },
  { title: '第三方评价', description: '评价流程、评价方法、现场核查、各维度得分及扣分项、关键问题与重大不符合项' },
  { title: '综合评价结论', description: '给出综合评价等级（A级 / AA级 / AAA级），并列出各维度评分依据、扣分项和改进建议' },
  { title: '改进建议', description: '针对扣分项与短板提出可执行的整改路径、责任部门与时间表' },
  { title: '附录', description: '评价指标评分明细表、评价依据标准索引、第三方评价机构资质证明、企业自评表、关键佐证材料清单' },
];

/**
 * 判断是否为环境影响评价报告。
 * 环境影响评价报告（环评）属于评价类，但其结论是工程环境可行性结论，不是 A级/AA级/AAA级 分级评价。
 */
function isEnvironmentalImpactReport(reportType, reportTypeName) {
  const name = String(reportTypeName || '').toLowerCase();
  const id = String(reportType || '').toLowerCase();
  return id === 'environmental-impact'
    || name.includes('环境影响评价')
    || name.includes('环评')
    || (name.includes('环境影响') && name.includes('评价'));
}

/**
 * 判断是否为绿色评价类报告（需给出 A级/AA级/AAA级 综合评价等级）。
 * 覆盖工信部绿色制造体系评价（绿色工厂/园区/供应链/设计产品/制造评价）等，
 * 排除环境影响评价报告（环评结论为工程可行性，非分级评价）。
 */
function isEvaluationReport(reportType, reportTypeName) {
  if (isEnvironmentalImpactReport(reportType, reportTypeName)) return false;
  const name = String(reportTypeName || '').toLowerCase();
  const id = String(reportType || '').toLowerCase();
  // 优先识别工信部绿色制造体系评价类报告 id
  const greenMfgEvalIds = [
    'green-factory-eval', 'green-manufacturing-eval', 'green-supply-chain-eval',
    'green-design-product-eval-statement', 'green-park-eval', 'green-enterprise-eval',
    'green-comprehensive-eval', 'green-logistics-eval', 'green-packaging-eval',
    'green-recovery-eval', 'smart-manufacturing-demo-factory-eval', 'digital-pilot-eval',
    'enterprise-digital-pilot-eval', 'digital-green-low-carbon-comprehensive-eval',
    'green-low-carbon-production-eval', 'green-environmental-measures-eval',
    'green-power-eval', 'green-power-certificate-eval', 'green-development-plan-eval',
    'green-development-appraisal', 'energy-saving-carbon-reduction-eval',
    'energy-saving-assessment', 'energy-evaluation', 'energy-assessment',
    'enterprise-energy-assessment', 'energy-consumption-eval', 'energy-technology-eval',
    'err-energy-eval', 'water-saving-eval', 'industrial-solid-waste-utilization-eval',
    'raw-material-selection-eval', 'raw-material-capability-eval',
    'equipment-process-optimization-eval', 'product-process-optimization-eval',
    'production-tech-innovation-eval', 'production-tech-renovation-eval',
    'purification-workshop-eval', 'digital-evaluation', 'digital-green-low-carbon-system-eval',
    'digital-nc-manufacturing-eval', 'digital-pilot-eval-report',
    'green-supply-chain-eval-statement', 'enterprise-green-transport-eval',
    'green-packaging-transport-eval', 'enterprise-green-packaging-eval',
    'product-design-rationality-eval', 'product-design-advanced-eval', 'product-upgrade-eval',
    'technological-innovation-eval', 'tech-achievement-comprehensive-eval',
    'innovation-achievement-eval', 'innovation-incentive-eval',
    'smart-management-system-eval', 'tooling-equipment-eval', 'capacity-assessment',
    'safety-status-eval', 'safety-reliability-eval', 'bid-response-comprehensive-eval',
    'enterprise-operation-eval', 'quality-evaluation', 'scale-service-eval',
    'performance-comprehensive-eval', 'institution-system-eval', 'integrity-evaluation',
    'energy-consumption-reduction-eval', 'after-sales-service-eval',
    'after-sales-service-comprehensive-eval', 'emergency-supply-eval',
    'four-wastes-eval', 'gtr-waste-eval', 'waste-gas-water-solid-eval',
    'green-low-carbon-digital-enterprise-eval',
  ];
  if (greenMfgEvalIds.includes(id)) return true;
  // 名称兜底判断：含"评价/评估"且不是环评
  if (name.includes('评价') || name.includes('评估')) return true;
  // 英文 id 兜底
  if (id.includes('eval') || id.includes('assessment')) return true;
  return false;
}

function buildOutlineTemplateMarkdown(reportType, reportTypeName) {
  const label = resolveReportTypeLabel(reportType, reportTypeName);
  const lines = [`# ${label}参考大纲`];
  let template;
  if (isEvaluationReport(reportType, reportTypeName) && !OUTLINE_TEMPLATES[reportType]) {
    template = EVALUATION_OUTLINE_TEMPLATE;
  } else {
    template = OUTLINE_TEMPLATES[reportType] || OUTLINE_TEMPLATES.esg;
  }
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
  const isEval = isEvaluationReport(reportType, reportTypeName);
  const isEia = isEnvironmentalImpactReport(reportType, reportTypeName);

  let structureRule;
  if (isEval) {
    structureRule = `\n7. 本报告为绿色评价类报告，必须按市面绿色评价报告标准流程组织目录，目录须包含以下章节（可按行业细化调整顺序与子项）：
   - 报告前言（评价目的、对象、范围、评价期、评价依据）
   - 企业概况
   - 评价依据（法律法规、政策文件、国家与行业标准、企业内部制度）
   - 评价指标体系（按一级/二级指标与权重列出，通常覆盖基础设施、管理体系、能源资源投入、产品、环境排放等维度）
   - 自评价结果（企业逐项自评、佐证材料、自评得分）
   - 第三方评价（评价流程、方法、现场核查、各维度得分与扣分项、重大不符合项）
   - 综合评价结论（明确给出 A级 / AA级 / AAA级 综合评价等级，附评级依据与改进建议）
   - 改进建议（针对扣分项的整改路径、责任部门与时间表）
   - 附录（评价指标评分明细表、评价依据标准索引、第三方评价机构资质证明、企业自评表、关键佐证材料清单）`;
  } else if (isEia) {
    structureRule = `\n7. 本报告为环境影响评价报告，按建设项目环评标准流程组织目录，须包含"评价结论与建议"章节（工程环境可行性总结论、主要环境影响结论、污染防治措施可行性结论与建议措施），最后一章为"附录"（监测数据、计算模式说明、相关图件、环评资质证书）`;
  } else {
    structureRule = `\n7. 本报告为非评价类绿色披露报告，按市面通用披露流程组织目录（报告前言→公司概况→治理与战略→核心议题绩效→目标与展望→附录），不要包含 A级/AA级/AAA级 评级结论章节；目录最后一章必须是"附录"，收录指标数据表、GRI/SASB/TCFD 标准索引、第三方审验声明等支撑材料`;
  }

  return `你是一名专业的${label}撰写专家。根据用户提供的企业信息和报告类型，生成一份结构完整、内容专业的${label}目录。

要求：
1. 参考提供的大纲模板，但可根据企业特点和行业特性灵活调整
2. 目录层级不超过三级，每个节点包含 title 和 description
3. 章节编号使用 1、1.1、1.1.1 格式
4. 每个叶子节点的 description 应说明该章节应涵盖的具体内容
5. 目录应符合国内外主流报告标准（如GRI、SASB、TCFD等），优先覆盖下方列出的核心指标和行业重大议题
6. 写作风格要求：${styleGuidance}${structureRule}`;
}

function buildOutlineUserInstruction(reportType, projectInfo, options = {}, reportTypeName) {
  const label = resolveReportTypeLabel(reportType, reportTypeName);
  const parts = [`请为以下企业生成一份${label}目录。\n`];
  if (projectInfo.companyName) parts.push(`企业名称：${projectInfo.companyName}`);
  if (projectInfo.industry) parts.push(`所属行业：${projectInfo.industry}`);
  if (projectInfo.reportingPeriod) parts.push(`报告期：${projectInfo.reportingPeriod}`);
  if (projectInfo.reportScope) parts.push(`报告范围：${projectInfo.reportScope}`);
  if (projectInfo.keyTopics) parts.push(`重点关注议题：${projectInfo.keyTopics}`);
  // 目标字数 + 页数：让 AI 据此控制目录章节数量和每章深度，避免章节过多导致内容稀释或过少导致每章过长
  const estimatedFromPages = options.pageCount ? options.pageCount * 800 : 0;
  const estimatedTotal = options.targetWords || estimatedFromPages;
  if (options.pageCount) {
    parts.push(`目标页数：约 ${options.pageCount} 页（按每页约 800 字估算，全篇约 ${estimatedFromPages} 字）`);
  }
  if (options.targetWords) {
    parts.push(`全篇目标字数：约 ${options.targetWords} 字`);
  }
  if (estimatedTotal) {
    // 按每章约 1000-1500 字估算叶子节点数量范围，给 AI 明确的章节体量指引
    const minLeaves = Math.max(3, Math.ceil(estimatedTotal / 1500));
    const maxLeaves = Math.max(minLeaves, Math.ceil(estimatedTotal / 800));
    parts.push(`篇幅规划：请控制目录叶子节点数量在 ${minLeaves}-${maxLeaves} 个之间，使每章正文字数约 ${Math.floor(estimatedTotal / Math.max(minLeaves, 1))}-${Math.floor(estimatedTotal / Math.max(maxLeaves, 1))} 字，避免章节过碎或过粗`);
  }
  parts.push(`\n参考大纲模板：\n${buildOutlineTemplateMarkdown(reportType, reportTypeName)}`);
  const standardsBlock = buildReferenceStandardsMarkdown(reportType, projectInfo.industry);
  if (standardsBlock) parts.push(`\n${standardsBlock}`);
  const kbBlock = buildKnowledgeContextBlock(options.knowledgeContext);
  if (kbBlock) parts.push(kbBlock);

  if (isEvaluationReport(reportType, reportTypeName)) {
    parts.push(`\n报告结构要求：本报告为绿色评价类报告，目录须严格按市面绿色评价报告标准流程组织，必须包含：评价依据、评价指标体系、自评价结果、第三方评价、综合评价结论（明确给出 A级/AA级/AAA级 综合评价等级，附评级依据、各维度评分、扣分项与改进建议）、改进建议；最后一章必须是"附录"（评价指标评分明细表、评价依据标准索引、第三方评价机构资质证明、企业自评表、关键佐证材料清单）`);
  } else if (isEnvironmentalImpactReport(reportType, reportTypeName)) {
    parts.push(`\n报告结构要求：本报告为环境影响评价报告，按建设项目环评标准流程组织，目录须包含"评价结论与建议"章节（工程环境可行性总结论，不是 A级/AA级/AAA级 分级评价），最后一章为"附录"（监测数据、计算模式说明、相关图件、环评资质证书）`);
  } else {
    parts.push(`\n报告结构要求：本报告为非评价类绿色披露报告，不要包含 A级/AA级/AAA级 评级结论章节；目录最后一章必须是"附录"，收录指标数据表、GRI/SASB/TCFD 标准索引、第三方审验声明等支撑材料`);
  }

  if (options.userRequirements) {
    parts.push(`\n用户附加要求：\n${options.userRequirements}`);
  }
  parts.push(`\n请输出JSON格式，结构为：{"project_name":"企业名","project_overview":"一句话描述","outline":[{"id":"1","title":"章节标题","description":"章节内容说明","children":[{"id":"1.1","title":"子章节","description":"说明"}]}]}`);
  return parts.join('\n');
}

function buildContentSystemPrompt(reportType, documentStyle, reportTypeName, minWords) {
  const label = resolveReportTypeLabel(reportType, reportTypeName);
  const styleGuidance = DOCUMENT_STYLE_GUIDANCE[documentStyle] || DOCUMENT_STYLE_GUIDANCE.standard;
  const floor = Number.isFinite(minWords) && minWords > 0 ? minWords : 800;
  const isEval = isEvaluationReport(reportType, reportTypeName);
  const isEia = isEnvironmentalImpactReport(reportType, reportTypeName);

  let conclusionRule;
  if (isEval) {
    conclusionRule = `\n9. 若章节标题含"评价结论"或"综合评价结论"，必须按市面绿色评价报告规范生成：
   - 必须明确给出综合评价等级（A级 / AA级 / AAA级，仅从这三档中选一，不得自创等级名称）
   - 等级判定须有据可依：列出各一级指标（如基础设施、管理体系、能源资源投入、产品、环境排放）的得分及加权汇总
   - 列明扣分项、重大不符合项及其影响
   - 不得随意给分或凑分；评级与得分须前后一致
   - 末尾给出改进建议要点，与"改进建议"章节呼应`;
  } else if (isEia) {
    conclusionRule = `\n9. 若章节标题含"评价结论"或"评价结论与建议"，按建设项目环评规范生成工程环境可行性总结论（明确给出"从环境保护角度，项目建设可行/不可行"的结论性意见），并附主要环境影响结论、污染防治措施可行性结论与建议措施；本报告为环境影响评价报告，不适用 A级/AA级/AAA级 分级评价`;
  } else {
    conclusionRule = `\n9. 本报告为非评价类绿色披露报告，正文中不得出现 A级/AA级/AAA级 综合评价等级、综合评分或类似分级评价结论；可在各议题章节内给出阶段性目标完成度、绩效达成情况等定性或量化描述，但不要做整体评级`;
  }

  return `你是一名专业的${label}写作专家。请根据目录节点标题和描述，生成专业、详实的报告正文。

写作规则：
1. 使用 Markdown 格式
2. 语言正式、专业，符合报告文体
3. 章节编号规则（非常重要）：
   - 章节编号（如"第一章""1.1""2.1"等）已由报告大纲统一管理，正文不要重复输出章节级编号标题
   - 正文内部如需细分小标题，使用 Markdown 三级标题（###）或加粗短语，不要手动添加"1.1""2.1"等数字编号
   - 若必须使用编号，须以前置给定的"本章编号"为前缀逐级递增（如本章编号为 1.1，则内部子项为 1.1.1、1.1.2），严禁每个章节都从 1.1 开始
4. 信息来源策略（重要）：
   - 优先级：知识库资料 > 模型联网查询结果 > AI 行业经验预估
   - 如果下方提供了知识库资料，必须优先引用其中的真实数据、案例和表述，不得编造与资料冲突的内容
   - 对于资料中已有的具体数值（如排放量、营收、人数等），直接引用资料数据
   - 若知识库无相关数据且已启用联网搜索，调用联网工具核实企业基本信息（工商信息、行业地位、规模量级等），引用查询结果
   - 若知识库与联网均无该数据，基于行业经验给出合理预估数值写入正文
   - 严禁使用 [XX]、[待填]、XXX、xXX 等占位符或假占位文本
   - 严禁编造精确到个位数的具体数字伪装成真实数据；估算值应给出量级（如「约 5000 吨」）而非虚假精确值
   - 对于企业联系方式（地址、电话、邮箱等），必须通过联网搜索查询真实信息后填入；若联网确实查不到，写出定性描述（如"可通过公司官方网站获取联系方式"），不得使用 XXX 或虚假占位
5. 字数控制（最高优先级，违反将导致全篇严重超篇幅）：
   - 系统已为每章设定字数上限，须严格遵守"本章目标字数"和"本章字数上限"
   - 每章正文字数不得超过上限（不含表格中的纯数据、代码块），超出 20% 以上将被判定为失控
   - 允许在上下限之间浮动（如目标 666 字、上限 732 字，则写 600-732 字均可）
   - 不要为了凑字数而堆砌废话、重复论证；内容充实度以覆盖章节要点为准
   - 若章节内容可在较少字数内充分表达，不必强行拉满字数
6. 适当使用表格、列表增强可读性
7. 如涉及标准引用，标注标准名称（如GRI 305、ISO 14064等）；如涉及行业议题，结合下方提供的行业议题说明进行展开
8. 即使没有具体数据，也要写出该章节应包含的内容框架、管理措施、政策机制、目标设定等定性描述，避免整篇只有估算值${conclusionRule}
10. 若章节标题含"附录"，正文可使用表格罗列指标数据、标准索引、评分明细表、资质证明清单等内容，不强制字数下限
11. 写作风格：${styleGuidance}`;
}

function buildContentUserInstruction(node, projectInfo, reportType, options = {}, reportTypeName) {
  const label = resolveReportTypeLabel(reportType, reportTypeName);
  const parts = [`请为以下${label}章节生成正文。\n`];
  // node.id 形如 "1"、"1.1"、"2.1"，本身就是大纲层级编号，直接作为本章编号告知 AI
  const chapterNo = node.id || '';
  if (chapterNo) parts.push(`本章编号：${chapterNo}（正文内部子项编号须此前缀递增，如 ${chapterNo}.1、${chapterNo}.2）`);
  parts.push(`章节标题：${node.title}`);
  parts.push(`章节描述：${node.description || ''}`);
  if (projectInfo.companyName) parts.push(`企业名称：${projectInfo.companyName}`);
  if (projectInfo.industry) parts.push(`所属行业：${projectInfo.industry}`);
  if (projectInfo.reportingPeriod) parts.push(`报告期：${projectInfo.reportingPeriod}`);
  // 篇幅约束：每章目标字数 + 字数上限（硬护栏）+ 页数指引
  if (options.chapterTargetWords && options.chapterMaxWords) {
    parts.push(`本章目标字数：${options.chapterTargetWords} 字（字数上限 ${options.chapterMaxWords} 字，严禁超出上限；允许略低于目标，不必强行凑字）`);
  } else if (options.chapterTargetWords) {
    parts.push(`本章目标字数：约 ${options.chapterTargetWords} 字（严格控制在目标区间内，不得大幅超出）`);
  } else if (options.targetWords) {
    parts.push(`全篇目标字数：约 ${options.targetWords} 字（请严格按比例控制本章篇幅，不要大幅超出）`);
  }
  if (options.pageCount) {
    parts.push(`全篇目标页数：约 ${options.pageCount} 页（正文总篇幅须严格控制在此页数范围内，超出时必须精简冗余表述）`);
  }
  // 注入行业议题，帮助 AI 理解该章节应涵盖的内容
  const industryTopicsBlock = buildIndustryTopicsMarkdown(projectInfo.industry);
  if (industryTopicsBlock) parts.push(`\n${industryTopicsBlock}`);
  const kbBlock = buildKnowledgeContextBlock(options.knowledgeContext);
  if (kbBlock) parts.push(kbBlock);

  // 评价结论/环评结论章节的明确指引
  const nodeTitle = String(node.title || '');
  if (isEvaluationReport(reportType, reportTypeName) && (nodeTitle.includes('评价结论') || nodeTitle.includes('综合评价'))) {
    parts.push(`\n本章为综合评价结论章节，必须按市面绿色评价报告规范输出：
- 在章节开头明确给出综合评价等级（A级 / AA级 / AAA级，仅从这三档中选一）
- 列出各一级指标得分及加权汇总（如基础设施、管理体系、能源资源投入、产品、环境排放）
- 列明扣分项、重大不符合项及其影响
- 评级须与各维度得分前后一致，不得随意给分
- 末尾给出改进建议要点`);
  } else if (isEnvironmentalImpactReport(reportType, reportTypeName) && nodeTitle.includes('评价结论')) {
    parts.push(`\n本章为环境影响评价结论章节，按建设项目环评规范输出工程环境可行性总结论（明确"从环境保护角度，项目建设可行/不可行"），并附主要环境影响结论、污染防治措施可行性结论与建议措施；本报告为环评报告，不适用 A级/AA级/AAA级 分级评价`);
  } else if (nodeTitle.includes('附录')) {
    parts.push(`\n本章为附录章节，可使用表格、清单等形式罗列指标数据、标准索引、评分明细表、资质证明等支撑材料，不强制字数下限`);
  }

  if (options.userRequirements) {
    parts.push(`\n用户附加要求：\n${options.userRequirements}`);
  }
  return parts.join('\n');
}

module.exports = {
  REPORT_TYPE_LABELS,
  OUTLINE_TEMPLATES,
  EVALUATION_OUTLINE_TEMPLATE,
  DOCUMENT_STYLE_GUIDANCE,
  isEnvironmentalImpactReport,
  isEvaluationReport,
  buildOutlineTemplateMarkdown,
  buildOutlineSystemPrompt,
  buildOutlineUserInstruction,
  buildContentSystemPrompt,
  buildContentUserInstruction,
};
