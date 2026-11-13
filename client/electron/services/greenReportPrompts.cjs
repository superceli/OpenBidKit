'use strict';

const { buildIndustryTopicsMarkdown } = require('./esgReferenceData.cjs');
const { buildPolicyReferenceMarkdown } = require('./greenPolicyReferenceData.cjs');

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

// ============ 报告框架类型 ============
// dual-track：制度规范 + 第三方评价双轨（默认，含前言/关于本报告/附录，封面目录由导出模板生成）
// evaluation：专项评价报告（旧版写法，八章结构，直接从第一章开始，不生成封面/目录/签章页/尾页）
// esg-disclosure：ESG 披露报告（十章结构，直接从第一章开始，不生成封面/目录/签章页/尾页）
const REPORT_FRAMEWORKS = { 'dual-track': '双轨制框架', evaluation: '评价报告框架', 'esg-disclosure': 'ESG披露框架' };

function resolveFrameworkLabel(framework) {
  return REPORT_FRAMEWORKS[framework] || REPORT_FRAMEWORKS['dual-track'];
}

// ============ 报告大纲模板（制度规范 + 第三方评价双轨） ============
// 所有报告统一使用该框架，覆盖 13 个标准模块，结论使用"优秀"。
// 封面与目录由导出模板生成，不作为目录章节。
const DUAL_TRACK_OUTLINE_TEMPLATE = [
  { title: '前言', description: '以"尊敬的各利益相关方"开篇，按治理结构确定致辞人（董事长/企业负责人/企业代表）署名；用4个"以……"排比段阐述核心理念；结尾展望与致谢' },
  { title: '关于本报告', description: '报告说明、编制参考（8-9项国家政策法规）、报告范围、时间范围、称谓说明、报告特点、核心理念表、编制人员表；不得包含"编制机构与数据来源""编制流程"小节' },
  { title: '企业基本信息', description: '企业名称、简称、法定代表人、注册资本、成立日期、企业类型、登记状态、注册地址、主营业务、服务对象、联系电话（表格呈现）' },
  { title: '关键指标总览', description: '财务数据与关键指标用 Mermaid 柱形图、饼图展示：覆盖经营、投入、质量合规、人才、环境等类别，不再用表格罗列' },
  { title: '制度规范', description: '以"第X条"公文体撰写：总则、规范依据与编制背景、评价范围与期限、指导思想与基本原则、战略定位与总体目标、实施路径与阶段规划、组织架构与职责分工、专项领域条款、考核与评价、监督检查与持续改进、附则；每个条文后附1张表格' },
  { title: '投入维度评价', description: '第三方视角评价资源投入：投入规模、结构占比、行业对标、投入保障机制，配数据表；章节标题须结合报告主题命名，如“研发投入评价”“创新投入评价”' },
  { title: '管理维度评价', description: '第三方视角评价过程管理：组织体系、制度执行、流程管控、监督考核，配管理分析表；章节标题须结合报告主题命名' },
  { title: '产出维度评价', description: '第三方视角评价产出成果：数量、质量、成果转化、知识产权，配产出统计表；章节标题须结合报告主题命名' },
  { title: '效益维度评价', description: '第三方视角评价综合效益：经济效益、社会效益、环境效益、行业带动，配效益分析表；章节标题须结合报告主题命名' },
  { title: '保障维度评价', description: '第三方视角评价保障能力：人才、资金、平台、风险防控、持续改进，配保障能力表；章节标题须结合报告主题命名' },
  { title: '综合评价', description: '评价概述（评价方法、依据、周期）、分维度评价、综合评价表，给出"优秀"结论；不得包含"评价机构与委托关系"小节' },
  { title: '报告结论', description: '总体概述、综合评价表（各维度评价结果均为"优秀"）、未来展望' },
  { title: '附录1 索引', description: '编制索引（序号 | 编制内容 | 所在章节）和评价索引（序号 | 评价维度 | 评价内容 | 所在章节）' },
  { title: '附录2 法律法规与政策参考清单', description: '15-22项法律法规与政策，含实施时间和主要内容，覆盖国家法律、规划、部门规章、地方政策、国家标准、国际议程（SDGs）' },
];

// ============ 专项评价报告大纲模板（旧版写法，八章结构） ============
// 直接从第一章开始，不生成封面、目录、签章页、尾页；章节标题可按报告主题调整。
const EVALUATION_OUTLINE_TEMPLATE = [
  { title: '企业概况', description: '公司简介（工商登记信息、成立时间、注册资本、注册地址、主营业务）、业务范围与经营模式、组织架构与人员配置' },
  { title: '评价目的与依据', description: '评价背景与目标（摸清现状、判断匹配、提出路径）、评价依据与标准（评价方法、口径、可比性与务实性原则）' },
  { title: '评价对象现状', description: '围绕报告主题展开：总量与构成、岗位设置与分工、资历与能力结构、近年变化情况' },
  { title: '业务需求与匹配分析', description: '结合企业主营业务与实际场景逐项分析需求（如技术支撑、交付响应、项目管理），判断现有条件与业务需求的匹配程度' },
  { title: '投入与产出效率', description: '经费与资源投入水平、成果与绩效表现、人均产出与效率分析' },
  { title: '适配性评价', description: '与业务规模的匹配度、与同行业一般水平对比、不足与冗余分析' },
  { title: '问题识别与优化建议', description: '主要问题、优化路径与建设方案、人才引进与培养机制' },
  { title: '评价结论', description: '总体评价结论、后续改进方向' },
];

// ============ ESG 披露报告大纲模板（十章结构，所有报告类型通用） ============
// 直接从第一章开始，不生成封面、目录、签章页、尾页；章节标题按报告主题调整。
const ESG_OUTLINE_TEMPLATE = [
  { title: '编制说明', description: '编制目的、编制依据、编制范围与期间、编制方法（资料核查/访谈/问卷/对标）、数据口径与说明' },
  { title: '公司概况与治理管理', description: '公司概况（工商登记信息，表格呈现）、治理架构、管理体系与职责分工、利益相关方沟通、实质性议题' },
  { title: '合规经营与风险管理', description: '合规体系、廉洁与商业道德、信息安全与客户隐私、风险管理（风险识别、评估、应对）' },
  { title: '环境与专项绩效', description: '按报告主题命名：ESG 报告写环境绩效（环境管理、能源与气候、水资源与废弃物、绿色服务）；碳足迹报告写核算边界与排放源、排放结果；专项报告写对应主题的现状与绩效' },
  { title: '社会绩效：员工', description: '员工结构、员工权益、职业健康与安全、培训与发展' },
  { title: '社会绩效：客户与社区', description: '服务质量、客户满意与投诉、供应链责任、社会公益' },
  { title: '创新与高质量发展', description: '研发投入、知识产权、创新成果与转化' },
  { title: '关键绩效', description: '按报告主题汇总关键指标（ESG 报告为环境/社会/治理绩效；其他报告为主题关键指标），用 Mermaid 图表 + 表格呈现，并写明资质与外部认可' },
  { title: '差距分析与改进计划', description: '差距分析、改进计划（措施、时限、责任部门）、披露与跟踪机制' },
  { title: '结论', description: '主要结论（分条）、总体评价、建议摘要（近期/中期/长期）' },
];

function buildOutlineTemplateMarkdown(reportType, reportTypeName, framework) {
  const label = resolveReportTypeLabel(reportType, reportTypeName);
  const lines = [`# ${label}参考大纲`];
  const template = framework === 'evaluation'
    ? EVALUATION_OUTLINE_TEMPLATE
    : (framework === 'esg-disclosure' ? ESG_OUTLINE_TEMPLATE : DUAL_TRACK_OUTLINE_TEMPLATE);
  template.forEach((item, i) => {
    lines.push(`${i + 1}. ${item.title}`);
    if (item.description) lines.push(`   - ${item.description}`);
  });
  return lines.join('\n');
}

/** 用户填写的编制人员、补充关键指标和公示平台；企业工商信息与关键指标优先由知识库提供。 */
function buildProjectFactsBlock(projectInfo = {}) {
  const parts = [];
  if (String(projectInfo.compileStaffText || '').trim()) {
    parts.push(`\n报告编制人员（用户填写，必须按“姓名|职称”原样列成表格，至少保留全部人员）：
${String(projectInfo.compileStaffText).trim()}`);
  }
  if (String(projectInfo.keyIndicatorsText || '').trim()) {
    parts.push(`\n关键指标（用户补充，作为知识库资料的补充与兜底；与知识库实际数据冲突时以知识库为准，不得改写或编造）：
${String(projectInfo.keyIndicatorsText).trim()}`);
  }
  if (String(projectInfo.publicityPlatformsText || '').trim()) {
    parts.push(`\n公示平台（用户填写）：
${String(projectInfo.publicityPlatformsText).trim()}`);
  }
  return parts.join('\n');
}

function buildKnowledgeContextBlock(knowledgeContext) {
  if (!knowledgeContext?.items?.length) return '';
  const companyName = String(knowledgeContext.companyName || knowledgeContext.keyword || '').trim();
  const header = companyName
    ? `\n以下资料来自知识库中与委托单位“${companyName}”对应的文件夹，仅属于“${companyName}”。严禁混用其他企业的资料或数据；如与本次委托单位不一致，请忽略：`
    : '\n以下是从知识库检索到的企业相关资料，请在生成时优先采用；其中的工商信息、财务数据、环境能耗、员工与社会责任、公司治理、产品服务、荣誉资质、知识产权等字段均为权威数据，对应章节必须逐项引用，不得省略或改写：';
  const lines = [header];
  knowledgeContext.items.forEach((item, i) => {
    lines.push(`--- [${i + 1}] ${item.title} ---`);
    if (item.resume) lines.push(item.resume);
    if (item.content) lines.push(item.content);
  });
  lines.push('---');
  return lines.join('\n');
}

function buildOutlineSystemPrompt(reportType, documentStyle, reportTypeName, framework) {
  const label = resolveReportTypeLabel(reportType, reportTypeName);
  const styleGuidance = DOCUMENT_STYLE_GUIDANCE[documentStyle] || DOCUMENT_STYLE_GUIDANCE.standard;
  const isEvaluation = framework === 'evaluation';
  const isEsgDisclosure = framework === 'esg-disclosure';
  const structureRule = isEvaluation
    ? `\n7. 本报告采用"专项评价报告"结构，必须覆盖以下8个一级章节（章节标题可结合报告主题命名，但模块不可缺失）：
   - 企业概况（公司简介、业务与组织架构）
   - 评价目的与依据（评价背景与目标、评价依据与标准）
   - 评价对象现状（总量与构成、岗位与分工、资历与能力结构、近年变化）
   - 业务需求与匹配分析（结合主营业务逐项分析，判断匹配程度）
   - 投入与产出效率（资金与资源投入、成果绩效、人均产出）
   - 适配性评价（与业务规模匹配度、同行水平对比、不足与冗余）
   - 问题识别与优化建议（主要问题、优化路径、人才引进与培养机制）
   - 评价结论（总体结论、后续改进方向）
   要求：一级章节即整篇主体，直接从第一章开始；不生成前言、关于本报告、制度规范、附录、致谢、封面、目录、签章页和尾页；每个一级章节下设 2-4 个二级小节，合计约 8 章、24-32 个叶子节点。`
    : (isEsgDisclosure
      ? `\n7. 本报告采用"可持续披露"通用结构（适用于 ESG、碳足迹、绿色金融、专项评价等所有报告类型），必须覆盖以下10个一级章节（章节标题须结合报告类型与主题命名，但模块不可缺失）：
   - 编制说明（编制目的、编制依据、编制范围与期间、编制方法、数据口径与说明）
   - 公司概况与治理管理（公司概况、治理架构、管理体系与职责分工、利益相关方沟通、实质性议题）
   - 合规经营与风险管理（合规体系、廉洁与商业道德、信息安全与客户隐私、风险管理）
   - 环境与专项绩效（ESG 报告写环境绩效；碳足迹报告写核算边界与排放源、排放结果；其他报告写该主题的现状与绩效）
   - 社会绩效：员工（员工结构、员工权益、职业健康与安全、培训与发展）
   - 社会绩效：客户与社区（服务质量、客户满意与投诉、供应链责任、社会公益）
   - 创新与高质量发展（研发投入、知识产权、创新成果与转化）
   - 关键绩效（按报告主题汇总关键指标，配 Mermaid 图表与表格，并写明资质与外部认可）
   - 差距分析与改进计划（差距分析、改进计划、披露与跟踪机制）
   - 结论（主要结论、总体评价、建议摘要）
   要求：直接以"编制说明"作为第一章，不生成封面、目录、前言致辞、关于本报告、制度规范、附录、签章页和尾页；每个一级章节下设 3-5 个二级小节，合计约 10 章、35-45 个叶子节点。章节标题要贴合作业主题：例如碳足迹报告可用"核算边界与排放源""排放结果与强度"；社会责任报告可保留"社会绩效"表述。`
      : `\n7. 本报告采用"制度规范 + 第三方评价"双轨结构，必须覆盖以下13个标准模块（可按行业细化子项，但模块不可缺失）：
   - 前言（"尊敬的各利益相关方"开篇，按治理结构确定致辞人署名：设立董事会由董事长致辞，未设立董事会由企业负责人或企业代表致辞，结尾展望与致谢）
   - 关于本报告（报告说明、编制参考、报告范围、时间范围、称谓说明、报告特点、核心理念表）
   - 企业基本信息
   - 关键指标总览（财务数据与关键指标用 Mermaid 柱形图、饼图展示，不用表格罗列）
   - 制度规范（以"第X条"公文体撰写：总则、依据、范围与期限、指导思想、战略目标、实施路径、组织职责、专项条款、考核评价、监督检查、附则；每个条文后附1张表格）
   - 五个评价维度章节（第二章起，按“投入→管理→产出→效益→保障”展开）；章节标题必须结合报告主题命名，不要直接照抄“投入维度评价”等通用词，例如创新激励报告可用“研发与技术创新激励方案”“成果转化与知识产权激励方案”；每章须有章首引导段和 X.1 总述
   - 综合评价（评价概述、分维度评价、综合评价表，给出"优秀"结论）
   - 报告结论（总体概述、综合评价表、未来展望）
   - 附录1 索引（编制索引、评价索引）
   - 附录2 法律法规与政策参考清单（15-22项，含实施时间和主要内容）
   - 禁止生成"编制机构与数据来源""编制流程""评价机构与委托关系"这三类小节
   封面与目录由导出模板自动生成，不要作为目录章节。`);

  const standardsRule = isEvaluation || isEsgDisclosure
    ? '5. 编制依据可对标国家"十四五""十五五"规划、行业政策与国家标准，但不要把政策清单单列为附录章节；不要以 GRI/SASB/TCFD 作为主要框架'
    : '5. 目录须对标国家"十四五""十五五"规划、行业政策与国家标准，在附录中列出政策依据清单；不要以 GRI/SASB/TCFD 作为主要框架';

  return `你是一名专业的${label}撰写专家。根据用户提供的企业信息和报告类型，生成一份结构完整、内容专业的${label}目录。

要求：
1. 参考提供的大纲模板，但可根据企业特点和行业特性灵活调整
2. 目录层级不超过三级，每个节点包含 title 和 description
3. 章节编号使用 1、1.1、1.1.1 格式
4. 每个叶子节点的 description 应说明该章节应涵盖的具体内容
${standardsRule}
6. 写作风格要求：${styleGuidance}${structureRule}`;
}

function buildOutlineUserInstruction(reportType, projectInfo, options = {}, reportTypeName) {
  const label = resolveReportTypeLabel(reportType, reportTypeName);
  const parts = [`请为以下企业生成一份${label}目录。\n`];
  // 委托单位即企业名称（UI 上已合并为唯一字段）
  if (projectInfo.companyName) parts.push(`委托单位：${projectInfo.companyName}`);
  if (projectInfo.industry) parts.push(`所属行业：${projectInfo.industry}`);
  if (projectInfo.reportingPeriod) parts.push(`报告期：${projectInfo.reportingPeriod}`);
  if (projectInfo.reportScope) parts.push(`报告范围：${projectInfo.reportScope}`);
  if (projectInfo.keyTopics) parts.push(`重点关注议题：${projectInfo.keyTopics}`);
  const factsBlock = buildProjectFactsBlock(projectInfo);
  if (factsBlock) parts.push(factsBlock);
  // 目标字数 + 页数：让 AI 据此控制目录章节数量和每章深度
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
  parts.push(`\n参考大纲模板：\n${buildOutlineTemplateMarkdown(reportType, reportTypeName, options.framework)}`);
  // 框架只注入行业议题，不注入 GRI/TCFD 标准指标
  const standardsBlock = buildIndustryTopicsMarkdown(projectInfo.industry);
  if (standardsBlock) parts.push(`\n${standardsBlock}`);
  parts.push(buildPolicyReferenceMarkdown({ title: '报告编制参考政策清单', min: 8, max: 9 }));
  const kbBlock = buildKnowledgeContextBlock(options.knowledgeContext);
  if (kbBlock) parts.push(kbBlock);

  parts.push(`\n报告结构要求：本报告采用"制度规范 + 第三方评价"双轨结构，目录必须覆盖前言、关于本报告、企业基本信息、关键指标总览、制度规范（第X条公文体）、五个评价维度章节（按投入→管理→产出→效益→保障展开，标题结合报告主题命名）、综合评价（给出"优秀"结论）、报告结论、附录1索引、附录2法律法规与政策参考清单；封面与目录由导出模板生成，不要列入目录`);

  if (options.userRequirements) {
    parts.push(`\n用户附加要求：\n${options.userRequirements}`);
  }
  parts.push(`\n请输出JSON格式，结构为：{"project_name":"企业名","project_overview":"一句话描述","outline":[{"id":"1","title":"章节标题","description":"章节内容说明","children":[{"id":"1.1","title":"子章节","description":"说明"}]}]}`);
  return parts.join('\n');
}

function buildContentSystemPrompt(reportType, documentStyle, reportTypeName, minWords, framework) {
  const label = resolveReportTypeLabel(reportType, reportTypeName);
  const styleGuidance = DOCUMENT_STYLE_GUIDANCE[documentStyle] || DOCUMENT_STYLE_GUIDANCE.standard;
  const isEvaluation = framework === 'evaluation';
  const isEsgDisclosure = framework === 'esg-disclosure';
  const conclusionRule = isEvaluation
    ? `\n9. 本报告采用"专项评价报告"结构，必须遵守：
   - 统一使用"该公司""企业"第三方评价视角，语言客观、务实
   - 按"现状—需求—匹配—问题—建议—结论"的逻辑推进，前后数据与结论一致
   - 每个小节以连贯论述为主，可按需配合数据/分析表格（每章 1-3 张），不要堆砌表格
   - 财务数据与关键指标优先用 Mermaid 图表（柱形图 xchart-beta、占比 pie）呈现，不得用 Markdown 表格罗列
   - 不输出章节标语、前言、关于本报告、制度条文、附录索引等双轨制内容；不写致谢
   - 政策法规仅作为评价依据引用，不单列政策清单章节
   - 关键数据（营业收入、研发费用、研发投入占比等）在全篇保持一致`
    : (isEsgDisclosure
      ? `\n9. 本报告采用"可持续披露"通用结构（适用于所有报告类型），必须遵守：
   - 统一使用"公司""该公司"第三人称，客观陈述、数据驱动，不写"我们"式致辞
   - 每个小节按"现状—数据—管理措施—改进方向"组织，重要数据配表格或 Mermaid 图表
   - 按报告类型组织内容：ESG 报告覆盖环境/社会/治理；碳足迹报告围绕核算边界、排放源、排放结果；专项报告围绕该主题现状与绩效
   - 财务、能耗、碳排放、员工、知识产权、证书等事实数据严禁编造；缺失时写管理措施与未来规划
   - 关键绩效章节中的量化指标优先用 Mermaid 图表（xychart-beta / pie）呈现
   - 不输出章节标语、致辞式前言、关于本报告、制度条文、附录索引等双轨制内容
   - 政策法规作为编制依据引用，不单列政策清单章节
   - 关键数据（营业收入、研发费用、能耗、碳排放、员工人数等）在全篇保持一致`
      : `\n9. 本报告采用"制度规范 + 第三方评价"双轨结构，必须遵守：
   - 称谓切换：前言用第一人称"我们"；制度章节用"本公司""公司"公文体；评价章节用"该企业"第三方视角
   - 制度章节条文用加粗的"第一条、第二条……"开头（不使用标题级编号），每个条文后附1张结构化表格（职责分工表、阶段规划表、投入方向表等）
   - 评价章节按"投入→管理→产出→效益→保障"组织，每个分节为"一段文字说明 + 一张数据/分析表格"，每章3-5张表格
   - 综合评价表、附录索引、政策清单必须用 Markdown 表格呈现；财务数据与关键指标改用 Mermaid 图表
   - 综合评价与报告结论章节必须给出"评价结果：优秀"，各维度评价结果均为"优秀"
   - 每章可加一行加粗的对仗式主题标语（引号内），必须写成 <p align="center"><strong>“标语”</strong></p> 以居中展示，不要使用标题级编号
   - 政策对标：引用国家法律法规、"十四五""十五五"规划、部门规章、地方政策和国家标准，不以 GRI/SASB/TCFD 作为主要依据
   - 关键数据（营业收入、研发费用、研发投入占比等）在全篇保持一致`);

  return `你是一名专业的${label}写作专家。你的唯一任务是直接输出一份写好的${label}正文。

⚠️ 绝对禁止（违反将直接导致输出不合格）：
- 禁止输出任何关于你如何写的内容：写作计划、策略分析、字数估算、精简思路、结构规划、草稿说明、步骤拆解等元内容
- 禁止输出"我需要""我们需要""让我们""策略：""分析：""下面我将"这类元叙述
- 禁止在正文前加任何前言、说明或注释
- 禁止把报告写成对话或自问自答形式
- 输出必须从报告内容本身的第一句开始，读者看到的就是一份完整的报告正文，完全感受不到你作为写作者的存在

写作规则：
1. 使用 Markdown 格式；语言正式、专业，符合报告文体
2. 本章开头必须先写 2-3 句话的章节摘要（这是内容摘要，不是写作计划）：概括本章核心议题、关键数据或结论，直接作为正文首段。示例："本章介绍公司 2025 年度能源消耗与温室气体排放情况。全年碳排放总量约 5.2 万吨 CO₂e，同比下降 8.3%，主要得益于生产工艺节能改造。" 摘要后直接展开具体内容；例外：前言、关于本报告章节不写章节摘要，直接进入正文
3. 章节编号规则（非常重要）：
   - 章节编号（如"第一章""1.1""2.1"等）已由报告大纲统一管理，正文不要重复输出章节级编号标题
   - 正文内部如需细分小标题，**只能使用 Markdown 三级标题（###）或加粗短语**，严禁使用 # 或 ## 开头的标题（渲染层已降级但会丢失格式），不要手动添加"1.1""2.1"等数字编号
   - 若必须使用编号，须以前置给定的"本章编号"为前缀逐级递增（如本章编号为 1.1，则内部子项为 1.1.1、1.1.2），严禁每个章节都从 1.1 开始
4. 信息来源策略（重要）：
   - 优先级：知识库资料 > 用户填写的编制人员/关键指标（补充与兜底） > 模型联网查询结果 > 模型知识
   - 企业工商登记信息必须优先从知识库资料中提取；知识库缺失时才允许联网核实，仍缺失则写"以工商登记为准"，严禁编造
   - 关键指标必须优先从知识库资料中提取现状值、目标值、单位和对应章节；知识库缺少时才使用用户填写的关键指标清单兜底；两者都没有的指标，不得编造具体数值
   - 财务数据（营业收入、成本、利润、纳税、资产、负债、研发费用等）、员工人数与结构、知识产权数量、资质证书与荣誉、审计/检测结论等事实性数据，严禁编造或估算；缺失时改写为展望、未来规划类表述（如"将持续加大研发投入""不断完善知识产权布局"），不得写"暂无数据"或"待补充"
   - 环境、能源、碳排放等量化指标同样优先使用知识库真实数据；确实缺失时以管理措施与改进方向表述为主，不得虚构具体数值；已提供的真实数据不得改写
   - 若下方提供了"报告编制人员"清单，这是权威数据，必须原样采用；用户填写的关键指标清单作为兜底数据，采用时不得改写数值
   - 政策法规引用必须从下方提供的政策清单中选择，不得编造清单外的法规；未提供政策清单时，只引用确有把握的法规
   - 如果下方提供了知识库资料，必须优先引用其中的真实数据、案例和表述，不得编造与资料冲突的内容
   - 对于资料中已有的具体数值（如排放量、营收、人数等），直接引用资料数据
   - 若知识库无相关数据且已启用联网搜索，调用联网工具核实企业信息，包括：
     * 工商登记字段：企业名称、法定代表人、注册资本、成立日期、注册地址、统一社会信用代码、企业类型、经营范围、联系电话
     * 定性信息：行业地位、规模量级、近年动态等
     引用查询结果，并在涉及工商字段时优先采用国家企业信用信息公示系统（gsxt.gov.cn）、企查查、爱企查、天眼查等权威来源的数据
   - 若知识库 + 联网搜索 + 模型知识均无法获取工商登记字段的具体值，则在正文中以"以工商登记信息为准"代替该字段值，严禁编造或猜测
   - 工商登记字段必须以 Markdown 表格形式展示（强制，违反将导致输出不合格）：
     适用章节：含"企业基本信息""企业基本情况""企业概况""公司概况""组织与运营概况""工商登记""报告前言"等标题的章节
     必须列出的字段及顺序：企业名称、统一社会信用代码、法定代表人、注册资本、成立日期、注册地址、企业类型、经营范围、联系电话、经营期限
     字段值规则（重要）：
     - 字段值在知识库/联网/模型知识中能找到 → 填入真实值
     - 字段值缺失 → 一律填"以工商登记为准"，不得留空、不得编造、不得写 XXX 或占位
     - 每个字段必须独占一行，按上述顺序完整列出全部字段；严禁把多个字段合并到同一行（例如把"统一社会信用代码、法定代表人、注册资本、成立日期"写成一行），严禁省略字段
     格式范例（假设注册资本和联系电话缺失）：
     | 字段 | 内容 |
     | --- | --- |
     | 企业名称 | XX科技有限公司 |
     | 统一社会信用代码 | 91110108XXXXXXXXXX |
     | 法定代表人 | 张三 |
     | 注册资本 | 以工商登记为准 |
     | 成立日期 | 2010-01-01 |
     | 注册地址 | XX市XX区XX路XX号 |
     | 企业类型 | 有限责任公司 |
     | 经营范围 | 技术开发、技术服务、技术咨询 |
     | 联系电话 | 以工商登记为准 |
     | 经营期限 | 2010-01-01 至长期 |
     表格后可补一段企业简介文字（200-400 字），不要把工商字段拆成散文段落或列表项
   - 严禁使用 [XX]、[待填]、XXX、xXX 等占位符或假占位文本
   - 正文中的数值必须来自知识库或用户填写；不得虚构审计机构、会计师事务所、报告编号、证书编号、检测结论等事实信息
   - 正文不得输出任何数据来源说明，如"数据取自…""资料来源…""据…统计""摘自…""来源：…"等，直接陈述数据本身
   - 不得提及审计报告、审计意见、审计机构、会计政策变更或"与审计报告一致"等表述；确需说明数据依据时，统一写作"关键数据源于企业提供支撑性材料，口径一致、可核验"
   - 严禁生成"编制机构与数据来源""编制流程""评价机构与委托关系"这三类小节或段落，也不要写独立性声明、审核过程、保密管理等说明；编制单位、编制人员等正常信息可以按需出现
   - 对于企业联系方式（地址、电话、邮箱等），若知识库或联网查询已提供则直接使用；否则在正文中以"以工商登记信息为准"代替，不得使用 XXX 或虚假占位
5. 字数控制：严格遵守"本章目标字数"和"本章字数上限"，不要为了凑字数堆砌废话，也不要因为字数限制而输出你的压缩策略分析——直接写出符合字数的内容即可
6. 关键指标、财务类数据必须用 Mermaid 图表展示（柱形图用 xychart-beta，占比用 pie），不得用 Markdown 表格罗列；其他定性或清单类内容可用表格
7. 如涉及标准引用，标注标准名称（如GRI 305、ISO 14064等）；如涉及行业议题，结合下方提供的行业议题说明进行展开
8. 即使没有具体数据，也要写出该章节应包含的内容框架、管理措施、政策机制、目标设定等定性描述；没有真实数据时用管理现状与未来规划表述，不得为了凑齐数据而虚构数值
${conclusionRule}
10. 若章节标题含"附录"，正文可使用表格罗列指标数据、标准索引、评分明细表、资质证明清单等内容，不强制字数下限，也不强制写章节摘要（规则 #2 对附录章节豁免）
11. 写作风格：${styleGuidance}
12. 跨章节数据一致性（并发生成时极其重要）：
    - 同一数据（如全年碳排放总量、能耗总量、员工人数等）在所有章节中必须保持一致，不得出现在 A 章是 5.2 万吨、在 B 章变成 3.8 万吨的情况
    - 同一数据在所有章节中必须使用完全一致的数值，不得虚构或前后矛盾
    - 需要引用其他章节的数据时，写"详见 X.X 章节"并保持数值一致
    - 跨章节去重（极其重要，违反将导致全篇大量重复内容）：
    - 下方会提供本篇报告的完整目录骨架和本章位置，你只写本章负责的内容，严禁跨章节重复
    - "公司概况""企业概况""组织与运营概况""报告前言"这类开篇章节已经介绍了企业背景、行业定位、业务范围等信息，后续所有章节（ESG治理、环境绩效、社会绩效、治理绩效等）一律不要再重复写这些基础信息
    - 环境绩效章节写能源消耗、温室气体排放，治理绩效章节写公司治理结构、商业道德，社会绩效章节写员工权益、社区参与——各管各的议题，不要交叉复述
    - 同一数据（如"全年能耗 10 万吨标准煤"）只在最合适的章节（如环境绩效）详细展开，其他章节如要引用只写"详见 X.X 章节"
    - 若本章处于全篇末尾（如展望、附录），也不要回头重述前文已讲过的论点，保持与前文呼应但不重复
13. 图片素材使用规则：
    - 若下方提供"可用图片素材"清单，只有在图片与本章内容直接相关时才配图
    - 配图位置单独一行输出 [[IMG-001]] 形式的占位符，禁止输出图片 URL、Markdown 图片语法或 base64
    - 每章最多 2 张；不得引用清单外的图片，不得编造图片
    - 图片与本章内容无关时不要插入`;
}

function buildContentUserInstruction(node, projectInfo, reportType, options = {}, reportTypeName) {
  const label = resolveReportTypeLabel(reportType, reportTypeName);
  const parts = [`请为以下${label}章节生成正文。\n`];

  // —— 全篇目录骨架 & 本章位置（用于跨章节去重）——
  const outlineSkeleton = options.outlineSkeleton; // [{ id, title }]
  if (Array.isArray(outlineSkeleton) && outlineSkeleton.length > 0) {
    const currentIdx = outlineSkeleton.findIndex((item) => item.id === node.id);
    const currentTitle = node.title;
    let dedupHint = '';
    if (currentIdx >= 0) {
      const leadingContext = outlineSkeleton.slice(0, currentIdx).map((item) => `  ${item.id}. ${item.title}`).join('\n');
      const trailingContext = outlineSkeleton.slice(currentIdx + 1).map((item) => `  ${item.id}. ${item.title}`).join('\n');
      dedupHint = `\n\n—— 全篇目录骨架与本章议题分工（严格遵守，禁止跨章节重复）——
全篇共 ${outlineSkeleton.length} 个正文章节，完整目录如下：
${outlineSkeleton.map((item, i) => `  ${i + 1}. ${item.id}. ${item.title}`).join('\n')}

当前正在生成：第 ${currentIdx + 1} 章「${currentTitle}」

议题分工（极其重要，违反将导致全篇大量重复内容）：
- 下面列出的"前置章节"按大纲顺序排在你之前，**它们专门负责相关的议题**，你写本章时严禁复述它们应该负责的内容。例如：前置章节含"企业概况"时，你不要再写企业简介、业务范围、组织架构等基础信息
- 下面列出的"后置章节"按大纲顺序排在你之后，**那些议题留给它们来写**，你不要在本章提前展开。例如：后置章节含"ESG目标与展望"时，你不要在本章写未来目标和改进计划
- 同一数据（如"全年能耗 10 万吨"）只在最相关的那一章详细展开，其他章节如需引用只写"详见 X.X 章节"

前置章节（以下议题不在本章负责范围内，严禁重复）：
${leadingContext || '  （本章是第一章，开篇章节负责企业背景和报告框架介绍，可以写）'}

后置章节（以下议题留给后续章节，不要提前展开）：
${trailingContext || '  （本章是最后一章）'}`;
    }
    parts.push(dedupHint);
  }

  // node.id 形如 "1"、"1.1"、"2.1"，本身就是大纲层级编号，直接作为本章编号告知 AI
  const chapterNo = node.id || '';
  if (chapterNo) parts.push(`本章编号：${chapterNo}（正文内部子项编号须此前缀递增，如 ${chapterNo}.1、${chapterNo}.2）`);
  parts.push(`章节标题：${node.title}`);
  parts.push(`章节描述：${node.description || ''}`);
  // 委托单位即企业名称（UI 上已合并为唯一字段）
  if (projectInfo.companyName) parts.push(`委托单位：${projectInfo.companyName}`);
  if (projectInfo.industry) parts.push(`所属行业：${projectInfo.industry}`);
  if (projectInfo.reportingPeriod) parts.push(`报告期：${projectInfo.reportingPeriod}`);
  if (projectInfo.compileUnit) parts.push(`编制单位：${projectInfo.compileUnit}`);
  const compileDateText = String(projectInfo.compileDate || '').trim();
  if (compileDateText) {
    const dateMatch = compileDateText.match(/^(\d{4})-(\d{1,2})/);
    parts.push(`编制日期：${dateMatch ? `${dateMatch[1]}年${Number(dateMatch[2])}月` : compileDateText}`);
  }
  const factsBlock = buildProjectFactsBlock(projectInfo);
  if (factsBlock) parts.push(factsBlock);
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

  if (Array.isArray(options.imageAssets) && options.imageAssets.length) {
    parts.push(`\n可用图片素材（只能引用以下编号）：
${options.imageAssets.map((item) => `- ${item.key}：${item.description}`).join('\n')}

配图要求：
- 只在图片与本章内容直接相关时插入，每章最多 2 张
- 在需要插图的位置单独一行输出 [[编号]]，例如 [[IMG-001]]
- 禁止输出图片 URL、Markdown 图片语法或清单外编号
- 同一图片全篇只使用一次`);
  }

  // 评价结论/环评结论章节的明确指引
  const nodeTitle = String(node.title || '');
  // 双轨框架按"一级章节"识别章节类型，避免把"制度规范"下的子条款误判为评价章节
  const chapterTopTitle = Array.isArray(options.outlineSkeleton)
    ? (options.outlineSkeleton.find((item) => item.id === node.id)?.topTitle || '')
    : '';
  const chapterTitle = chapterTopTitle || nodeTitle;
  const isEvaluation = options.framework === 'evaluation';
  const isEsgDisclosure = options.framework === 'esg-disclosure';
  // 关键指标章节用 Mermaid 图表呈现，必须排除“每节一张表格”的通用要求，避免指令冲突
  const isKeyIndicatorChapter = !isEsgDisclosure && (chapterTitle.includes('关键指标') || chapterTitle.includes('指标总览'));
  const isPrefaceChapter = !isEvaluation && !isEsgDisclosure && chapterTitle.includes('前言');
  const chapterTableRule = isKeyIndicatorChapter
    ? '- 本章为关键指标总览：禁止输出任何 Markdown 表格（包括指标清单、指标明细表），指标数据一律改用 Mermaid 图表呈现'
    : (isPrefaceChapter
      ? '- 本章为前言：整章不要使用任何 Markdown 表格（含核心理念表、年度举措表、管理导向表），全部用连贯段落呈现'
      : (isEvaluation || isEsgDisclosure
        ? '- 以连贯论述为主，可按需配合 1-3 张数据/分析表格，不要堆砌表格'
        : '- 每个分节采用"一段文字说明 + 一张数据/分析表格"，本章合计 3-5 张 Markdown 表格'));
  parts.push(isEvaluation
    ? `\n本章写作要求（专项评价报告框架）：
- 称谓：统一使用"该公司""企业"第三方评价视角
${chapterTableRule}
- 关键数据（营业收入、研发费用、研发投入占比等）须与全篇其他章节保持一致
- 不要输出章节标语、<p align="center"> 标语或章节级编号标题`
    : (isEsgDisclosure
      ? `\n本章写作要求（可持续披露框架）：
- 称谓：统一使用"公司""该公司"第三人称
${chapterTableRule}
- 关键数据（营业收入、能耗、碳排放、员工人数等）须与全篇其他章节保持一致
- 章节标题与内容须贴合当前报告类型，不要套用不相关的主题表述
- 不要输出章节标语、致辞式前言或章节级编号标题`
      : `\n本章写作要求（通用绿色专项报告框架）：
- 称谓：前言用第一人称"我们"；制度章节用"本公司""公司"；评价章节用"该企业"第三方视角
${chapterTableRule}
- 关键数据（营业收入、研发费用、研发投入占比等）须与全篇其他章节保持一致
- 本章开头须加一行加粗的对仗式主题标语（引号内），并写成 <p align="center"><strong>“标语”</strong></p>，不要输出章节级编号标题`));
    if (!isEvaluation && !isEsgDisclosure && chapterTitle.includes('前言')) {
      parts.push(`\n本章为前言：不要写章节摘要、导语或"本前言简要回顾……"之类的说明性文字，直接从"尊敬的各利益相关方"开篇；不罗列财务数据和经营指标；用4个"以……"排比段阐述核心理念（如以制度建设筑牢根基、以技术研发驱动升级、以客户需求为导向、以人才发展为抓手）；结尾写展望与致谢，使用第一人称"我们"。
整章严禁输出任何 Markdown 表格（不要核心理念表、年度举措表、管理导向表），核心理念一律用"以……"排比段落表达，不要出现表头或表格线。
致辞人署名必须依据知识库资料中的治理结构判断，不得默认写"企业负责人"，也不得臆造头衔：
- 资料显示"设立董事会"或提供"董事长姓名" → 由董事长致辞，署名为"董事长 姓名"；未提供姓名时只写"董事长"，不得编造姓名
- 资料显示"未设立董事会" → 由企业负责人致辞，署名为"企业负责人 姓名"（有法定代表人姓名时使用该姓名）；没有可用姓名时写"企业负责人"或"企业代表"
- 资料未提及治理结构 → 统一以"企业代表"署名
署名单独成行放在正文末尾，格式为"职务 姓名"，下一行写落款日期（使用上方提供的编制日期），两行均右对齐，例如：
<p align="right">企业负责人 阳娜</p>
<p align="right">2026年11月</p>
不得出现 XXX、[姓名] 等占位内容`);
    }
    if (!isEvaluation && !isEsgDisclosure && chapterTitle.includes('关于本报告')) {
      parts.push(`\n本章为"关于本报告"：分小节说明报告说明、编制参考（从下方政策清单中选择8-9项）、报告范围、时间范围、称谓说明、报告特点；数据依据统一写作"关键数据源于企业提供支撑性材料，口径一致、可核验"；"核心理念"用 Markdown 表格列出5项价值观及其内涵；编制人员须用 Markdown 表格列出"姓名 | 职称"；不得生成"编制机构与数据来源""编制流程"小节；不得写审计报告、审计意见、审计机构、会计政策变更、"与审计报告一致"等表述；不得写编制分工或人员分工说明；也不得写评价机构与委托关系、独立性、审核过程、保密等说明`);
    }
    if (chapterTitle.includes('企业基本信息')) {
      parts.push(`\n本章为企业基本信息：用 Markdown 表格列出企业名称、企业简称、统一社会信用代码、法定代表人、注册资本、成立日期、企业类型、登记状态、注册地址、主营业务、服务对象、联系电话；必须一行一个字段、按上述顺序完整列出，严禁合并字段（如把信用代码、法定代表人、注册资本写在同一行）或省略字段；已提供的字段原样使用，未提供的字段填"以工商登记为准"，不得编造；如本章补充财务数据，须用 Mermaid 柱形图呈现，不得用表格罗列`);
    }
    if (chapterTitle.includes('关键指标') || chapterTitle.includes('指标总览')) {
      parts.push(`\n本章为关键指标总览：整章禁止出现任何 Markdown 表格（包括指标清单表、指标明细表），财务类与非财务类指标全部改用 Mermaid 图表呈现。请按指标类别分别成图，至少输出 3 个图表，每个图表后写 2-3 句解读。
【重要】下方代码块中的数值仅为格式示意，严禁照抄；所有图表数值必须取自知识库资料或用户填写的关键指标清单：
- 财务类（营业收入、营业成本、利润总额、净利润、纳税额等）用柱形图，y 轴上限按真实数据自动调整：
\`\`\`mermaid
xychart-beta
    title "报告期财务数据（万元）"
    x-axis ["营业收入", "营业成本", "利润总额", "净利润", "纳税额"]
    y-axis "金额（万元）" 0 --> 100
    bar [0, 0, 0, 0, 0]
\`\`\`
- 投入、质量合规、人才、环境等非财务类指标的现状值与目标值对比，分组柱形图（两条 bar 分别表示现状值与目标值）：
\`\`\`mermaid
xychart-beta
    title "关键指标现状值与目标值"
    x-axis ["指标A", "指标B", "指标C", "指标D"]
    y-axis "指标值" 0 --> 100
    bar [0, 0, 0, 0]
    bar [0, 0, 0, 0]
\`\`\`
- 指标构成、占比、结构类用饼图：
\`\`\`mermaid
pie title 关键指标构成
    "经营指标" : 40
    "环境指标" : 30
    "社会责任" : 20
    "公司治理" : 10
\`\`\`
饼图权重如无真实来源，按报告类型合理设定即可；柱形图数值必须来自知识库资料或用户填写的关键指标清单。数据不足以成图时不得虚构数值，改用文字描述现状与未来规划，绝对不得退回 Markdown 表格；严禁虚构财务、人数、知识产权、证书类数据`);
    }
    if (!isEvaluation && (chapterTitle.includes('制度') || chapterTitle.includes('规范'))) {
      parts.push(`\n本章为制度规范章节：以公文体撰写，条文用加粗的"第一条、第二条……"开头（不使用标题级编号），至少包含总则、规范依据与编制背景、评价范围与期限、指导思想与基本原则、战略定位与总体目标、实施路径与阶段规划（基础建设期→深化推进期→巩固提升期）、组织架构与职责分工、专项领域条款、考核与评价、监督检查与持续改进、附则；每个条文后附1张表格；专项条款须紧扣企业主营业务；本章使用"本公司""公司"称谓；规范依据须从下方政策清单中选择，不得编造`);
    }
    if (!isEvaluation && chapterTitle.includes('综合评价')) {
      parts.push(`\n本章为综合评价章节，是整份报告的核心结论：先写评价概述（评价方法、评价依据、评价周期，不得出现评价机构名称、委托关系、独立性声明或保密条款），再分维度评价，最后用 Markdown 表格汇总各维度评价结果，明确给出"评价结果：优秀"；结论须与前文制度、投入、管理、产出、效益、保障章节的数据一致，不得输出 A级/AA级/AAA级 分级`);
    }
    if (!isEvaluation && chapterTitle.includes('报告结论')) {
      parts.push(`\n本章为报告结论：总体概述 + 各维度综合评价表（评价结果均为"优秀"）+ 未来展望；不得输出 A级/AA级/AAA级 分级`);
    }
    if (isEvaluation && (chapterTitle.includes('评价结论') || chapterTitle.includes('结论'))) {
      parts.push(`\n本章为评价结论章节：先给出总体评价结论（结合前文现状、匹配、投入产出、适配性分析），再分条列出后续改进方向；结论须与前文数据一致；不使用"优秀/AAA"等分级表述，语言客观务实`);
    }
    if (!isEvaluation && chapterTitle.includes('附录') && chapterTitle.includes('索引')) {
      parts.push(`\n本章为附录1索引：分别用 Markdown 表格输出"编制索引"（序号 | 编制内容 | 所在章节）和"评价索引"（序号 | 评价维度 | 评价内容 | 所在章节），不强制章节摘要`);
    }
    if (!isEvaluation && chapterTitle.includes('附录') && (chapterTitle.includes('政策') || chapterTitle.includes('法规'))) {
      parts.push(`\n本章为附录2政策清单：用 Markdown 表格列出15-22项法律法规与政策，字段包含序号、名称、实施时间、主要内容；必须优先从下方政策清单中选择，不得编造清单外的法规；覆盖国家法律、五年规划、部门规章、地方政策、国家标准及国际议程（SDGs），须与报告主题和行业匹配`);
    }

  if (isEsgDisclosure && (chapterTitle.includes('编制说明') || chapterTitle.includes('编制目的'))) {
    parts.push(`\n本章为编制说明：分小节写编制目的、编制依据、编制范围与期间（报告主体、边界、时间范围）、编制方法（资料核查、访谈、问卷、标杆对比）、数据口径与说明（财务、环境、社会数据的来源与单位）；语言客观，不写致辞、致谢或报告亮点罗列；
本章只作说明性文字，不铺陈企业成绩，不重复后续章节内容`);
  }
  if (isEsgDisclosure && (chapterTitle.includes('公司治理') || chapterTitle.includes('治理管理') || chapterTitle.includes('ESG管理') || chapterTitle.includes('公司概况'))) {
    parts.push(`\n本章为公司概况与治理管理：公司概况用 Markdown 表格列出工商登记字段（缺失填"以工商登记为准"）；再写治理架构（股东会/执行董事/监事/经营层及决策机制）、管理体系与职责分工（含 ESG 或专项工作小组）、利益相关方沟通（识别对象、沟通方式、诉求回应）、实质性议题（议题识别方法与重要性排序）；不写审计意见与评价机构关系`);
  }
  if (isEsgDisclosure && (chapterTitle.includes('合规') || chapterTitle.includes('风险'))) {
    parts.push(`\n本章为合规经营与风险管理：合规体系（法规清单、合规性评价、合同审查、培训）、廉洁与商业道德、信息安全与客户隐私、风险管理（识别—评估—应对—监控，列出重大风险与应对策略）；避免编造处罚记录，缺失时写制度建设与防控措施`);
  }
  if (isEsgDisclosure && (chapterTitle.includes('环境') || chapterTitle.includes('碳') || chapterTitle.includes('能源') || chapterTitle.includes('专项绩效'))) {
    parts.push(`\n本章为环境与专项绩效，按报告类型组织内容：
- ESG / 环境类报告：环境管理、能源与气候（能耗、碳排放必须用 Mermaid 柱形图/饼图并分析强度变化）、水资源与废弃物、绿色服务
- 碳足迹报告：核算边界与排放源、活动数据与排放因子、排放结果与强度
- 其他专项报告：该主题的现状、数据与绩效表现
数据缺失时写计量与改进计划，不得虚构`);
  }
  if (isEsgDisclosure && (chapterTitle.includes('员工') || chapterTitle.includes('人才'))) {
    parts.push(`\n本章为社会绩效（员工）：员工结构（人数、性别、年龄、学历，用表格）、员工权益（合同、社保、工时、诉求渠道）、职业健康与安全（体系认证、安全投入、培训演练、事故指标）、培训与发展（培训场次/人次/投入、双通道晋升）；事实数据缺失时写制度与规划`);
  }
  if (isEsgDisclosure && (chapterTitle.includes('客户') || chapterTitle.includes('社区') || chapterTitle.includes('供应链'))) {
    parts.push(`\n本章为社会绩效（客户与社区）：服务质量（项目数量、一次交付合格率、报告时效）、客户满意与投诉（满意度调查、投诉处理闭环）、供应链责任（供应商数量、本地化与体系认证比例、廉洁协议）、社会公益（活动场次、覆盖人次、投入）；数据缺失时写管理机制与改进方向`);
  }
  if (isEsgDisclosure && (chapterTitle.includes('创新') || chapterTitle.includes('研发'))) {
    parts.push(`\n本章为创新与高质量发展：研发投入（费用、占营收比例、研发人员与工时）、知识产权（有效数量与类型、新增数量）、创新成果与转化（新产品新服务收入、转化率、研发投入产出比）；严禁编造知识产权数量与研发费用，缺失时写布局与规划`);
  }
  if (isEsgDisclosure && (chapterTitle.includes('关键绩效') || chapterTitle.includes('关键指标'))) {
    parts.push(`\n本章为关键绩效：按报告主题汇总关键指标（ESG 报告为环境/社会/治理三个维度；其他报告为主题核心指标），量化指标必须用 Mermaid 图表呈现，可再配 1-2 张 Markdown 汇总表；最后写资质与外部认可（体系认证、行业荣誉、政府认定）。数值必须与前文章节一致，缺失指标如实标注统计范围，不得虚构`);
  }
  if (isEsgDisclosure && (chapterTitle.includes('差距') || chapterTitle.includes('改进'))) {
    parts.push(`\n本章为差距分析与改进计划：先列出主要差距（不涉及重大违规），再用表格给出改进计划（措施、时限、责任部门、投入预算），最后说明披露与跟踪机制（披露周期、渠道、后续第三方审验计划）；改进计划须可执行、可检查`);
  }
  if (isEsgDisclosure && chapterTitle.includes('结论')) {
    parts.push(`\n本章为结论：先分条输出主要结论（覆盖报告主题各主要维度），再作总体评价（所处阶段判断），最后给出近期/中期/长期建议摘要；结论须与前文数据一致，不使用"优秀/AAA"等分级表述`);
  }

  const isAboutReportChapter = !isEvaluation && !isEsgDisclosure && chapterTitle.includes('关于本报告');
  const isPolicyAppendix = !isEvaluation && !isEsgDisclosure && chapterTitle.includes('附录') && (chapterTitle.includes('政策') || chapterTitle.includes('法规'));
  if (isAboutReportChapter || (!isEvaluation && !isEsgDisclosure && chapterTitle.includes('制度')) || isPolicyAppendix) {
    parts.push(buildPolicyReferenceMarkdown({
      min: isAboutReportChapter ? 8 : (isPolicyAppendix ? 15 : 8),
      max: isAboutReportChapter ? 9 : (isPolicyAppendix ? 22 : 10),
    }));
  }

  const isSpecialChapter = /前言|关于本报告|企业基本信息|关键指标|指标总览|制度|规范|综合评价|报告结论|附录/.test(chapterTitle);
  if (!isEvaluation && !isEsgDisclosure && !isSpecialChapter) {
    parts.push(`\n本章为评价维度章节：先写章首引导段（阐述该维度与企业战略的协同机制），再写 ${chapterNo}.1 总述（战略定位 + 发展目标），然后按分节展开；每个分节为"一段文字说明 + 一张数据/分析表格"，确保与本章标题对应的评价维度一致`);
  }

  if (options.userRequirements) {
    parts.push(`\n用户附加要求：\n${options.userRequirements}`);
  }
  return parts.join('\n');
}

module.exports = {
  REPORT_TYPE_LABELS,
  DUAL_TRACK_OUTLINE_TEMPLATE,
  DOCUMENT_STYLE_GUIDANCE,
  buildOutlineTemplateMarkdown,
  buildOutlineSystemPrompt,
  buildOutlineUserInstruction,
  buildContentSystemPrompt,
  buildContentUserInstruction,
};
