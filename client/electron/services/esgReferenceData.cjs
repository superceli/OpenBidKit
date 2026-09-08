'use strict';

/**
 * 内置 ESG 参考数据库
 * 包含：GRI 标准核心指标、TCFD 气候指标、行业 ESG 议题库
 * 用于在生成报告目录和正文时提供专业参考，避免全占位符内容
 */

// ============ GRI 2021 标准核心指标 ============
// 按经济(E)、环境(E)、社会(S)三大维度组织
const GRI_STANDARDS = {
  economic: {
    label: '经济绩效（GRI 200 系列）',
    indicators: [
      { code: 'GRI 201', name: '经济绩效', desc: '直接经济价值产生及分配、财务影响、市场存在' },
      { code: 'GRI 202', name: '市场表现', desc: '气候变化对组织财务状况的影响、客户健康与安全' },
      { code: 'GRI 203', name: '间接经济影响', desc: '基础设施投资和服务、供应商本地化采购、重大经济影响' },
      { code: 'GRI 204', name: '采购实践', desc: '采购政策、供应商社会与环境评估' },
    ],
  },
  environmental: {
    label: '环境绩效（GRI 300 系列）',
    indicators: [
      { code: 'GRI 301', name: '物料', desc: '按重量计算的使用物料、回收物料百分比' },
      { code: 'GRI 302', name: '能源', desc: '组织内能耗、组织外能耗、能源强度、降低能耗措施' },
      { code: 'GRI 303', name: '水资源', desc: '取水量、水源、耗水量、排水、受影响水源' },
      { code: 'GRI 304', name: '生物多样性', desc: '运营所在受保护区域、生物多样性影响、栖息地恢复' },
      { code: 'GRI 305', name: '排放物', desc: '温室气体 Scope 1/2/3 排放、臭氧消耗物质、氮氧化物等' },
      { code: 'GRI 306', name: '废弃物', desc: '废弃物产生量、处置方式、回收利用率' },
      { code: 'GRI 307', name: '环境合规', desc: '环境违规罚款、环境影响评估' },
      { code: 'GRI 308', name: '供应商环境评估', desc: '供应商环境影响评估、环境违规供应商处理' },
    ],
  },
  social: {
    label: '社会绩效（GRI 400 系列）',
    indicators: [
      { code: 'GRI 401', name: '雇佣', desc: '员工总数、雇佣类型、离职率、新员工入职' },
      { code: 'GRI 402', name: '劳资关系', desc: '集体谈判覆盖率、工会、员工申诉机制' },
      { code: 'GRI 403', name: '职业健康与安全', desc: '工伤事故率、职业病、安全培训、工作时间' },
      { code: 'GRI 404', name: '培训与教育', desc: '员工培训小时数、培训覆盖率、技能发展' },
      { code: 'GRI 405', name: '多元化与机会平等', desc: '性别比例、多元化政策、反歧视' },
      { code: 'GRI 406', name: '反歧视', desc: '歧视事件、申诉处理、多元化措施' },
      { code: 'GRI 407', name: '结社自由与集体谈判', desc: '结社自由保障、集体谈判权' },
      { code: 'GRI 408', name: '童工', desc: '童工风险识别、消除童工措施' },
      { code: 'GRI 409', name: '强迫或强制劳动', desc: '强迫劳动风险、消除强迫劳动措施' },
      { code: 'GRI 410', name: '安保实践', desc: '安保人员人权培训' },
      { code: 'GRI 411', name: '原住民权利', desc: '原住民权益保障' },
      { code: 'GRI 412', name: '人权评估', desc: '人权影响评估、人权政策' },
      { code: 'GRI 413', name: '当地社区', desc: '社区参与、社区影响评估、社区投资' },
      { code: 'GRI 414', name: '供应商社会评估', desc: '供应商社会影响评估、社会违规处理' },
      { code: 'GRI 415', name: '公共政策', desc: '公共政策立场、政治捐赠' },
      { code: 'GRI 416', name: '客户健康与安全', desc: '产品安全、客户健康安全影响' },
      { code: 'GRI 417', name: '营销与标识', desc: '营销政策、产品标识、投诉' },
      { code: 'GRI 418', name: '客户隐私', desc: '客户数据隐私保护、数据泄露' },
      { code: 'GRI 419', name: '社会经济合规', desc: '社会经济违规罚款' },
    ],
  },
};

// ============ TCFD 气候相关财务披露指标 ============
const TCFD_PILLARS = {
  governance: {
    label: '治理（Governance）',
    items: [
      '董事会对气候相关风险和机遇的监督职责',
      '管理层在评估和管理气候相关风险中的角色',
      '气候相关议题纳入董事会汇报频率',
      'ESG/可持续发展委员会设置与运作',
    ],
  },
  strategy: {
    label: '战略（Strategy）',
    items: [
      '气候相关风险和机遇对组织业务、战略和财务规划的影响',
      '气候相关风险对组织业务模型和供应链的影响',
      '不同气候情景（1.5°C、2°C、3°C）下的组织韧性分析',
      '气候相关机遇对产品服务、商业模式的创新影响',
    ],
  },
  riskManagement: {
    label: '风险管理（Risk Management）',
    items: [
      '气候相关风险识别和评估流程',
      '气候相关风险与组织整体风险管理体系的整合',
      '气候相关风险的优先级排序方法',
      '物理风险（极端天气、慢性气候变化）和转型风险（政策、技术、市场、声誉）识别',
    ],
  },
  metricsTargets: {
    label: '指标与目标（Metrics & Targets）',
    items: [
      '用于评估气候相关风险和机遇的指标',
      '温室气体排放总量及强度（Scope 1/2/3）',
      '气候相关目标及目标完成进度',
      '气候相关风险对财务报表的影响',
      '内部碳定价机制',
    ],
  },
};

// ============ 行业 ESG 重大议题库 ============
// 按行业分类，每个议题包含：名称、说明、相关指标
const INDUSTRY_TOPICS = {
  制造业: {
    topics: [
      { name: '气候变化与温室气体减排', desc: '能源消耗、碳排放管理、碳中和目标与路径', indicators: ['GRI 302 能源', 'GRI 305 排放物'] },
      { name: '水资源管理', desc: '取用水、废水排放、水风险评估', indicators: ['GRI 303 水资源'] },
      { name: '废弃物管理与循环经济', desc: '固废产生、回收利用、危废处置', indicators: ['GRI 306 废弃物'] },
      { name: '职业健康与安全', desc: '安全生产、职业病防控、安全培训', indicators: ['GRI 403 职业健康与安全'] },
      { name: '供应链环境与社会管理', desc: '供应商 ESG 评估、绿色采购', indicators: ['GRI 308 供应商环境评估', 'GRI 414 供应商社会评估'] },
      { name: '产品全生命周期环境影响', desc: '产品生态设计、包装材料、回收', indicators: ['GRI 301 物料'] },
    ],
  },
  能源: {
    topics: [
      { name: '温室气体排放与碳中和', desc: '化石能源燃烧排放、减排路径、清洁能源转型', indicators: ['GRI 305 排放物', 'GRI 302 能源'] },
      { name: '能源结构转型', desc: '可再生能源占比、清洁能源投资', indicators: ['GRI 302 能源'] },
      { name: '水资源与生态影响', desc: '取水排水、水生态影响、生物多样性', indicators: ['GRI 303 水资源', 'GRI 304 生物多样性'] },
      { name: '安全运营', desc: '安全生产、应急预案、事故管理', indicators: ['GRI 403 职业健康与安全'] },
      { name: '气候风险与机遇', desc: '物理风险、转型风险、TCFD 披露', indicators: ['TCFD 战略', 'TCFD 风险管理'] },
      { name: '社区关系与移民安置', desc: '项目征地、社区补偿、移民安置', indicators: ['GRI 413 当地社区'] },
    ],
  },
  建筑与房地产: {
    topics: [
      { name: '绿色建筑与节能减排', desc: '绿色建筑认证、建筑能耗、绿色建材', indicators: ['GRI 302 能源', 'GRI 301 物料'] },
      { name: '施工环境管理', desc: '施工扬尘、噪声、建筑垃圾', indicators: ['GRI 306 废弃物', 'GRI 305 排放物'] },
      { name: '建筑安全与质量', desc: '施工安全、工程质量、安全培训', indicators: ['GRI 403 职业健康与安全'] },
      { name: '供应链责任', desc: '供应商管理、建材溯源', indicators: ['GRI 308 供应商环境评估'] },
      { name: '社区影响', desc: '施工扰民、社区沟通、回迁安置', indicators: ['GRI 413 当地社区'] },
      { name: '运营期能效管理', desc: '物业运营能耗、节水节电', indicators: ['GRI 302 能源', 'GRI 303 水资源'] },
    ],
  },
  交通运输: {
    topics: [
      { name: '温室气体减排', desc: '运输排放、新能源车辆、航线优化', indicators: ['GRI 305 排放物'] },
      { name: '能源效率', desc: '燃油消耗、节能技术、能效管理', indicators: ['GRI 302 能源'] },
      { name: '交通安全', desc: '事故率、安全培训、应急管理', indicators: ['GRI 403 职业健康与安全'] },
      { name: '噪声与空气污染', desc: '尾气排放、噪声控制', indicators: ['GRI 305 排放物'] },
      { name: '绿色物流', desc: '包装优化、循环利用、多式联运', indicators: ['GRI 306 废弃物'] },
      { name: '员工权益与发展', desc: '驾驶员权益、休息时间、培训', indicators: ['GRI 401 雇佣', 'GRI 403 职业健康与安全'] },
    ],
  },
  信息技术与通信: {
    topics: [
      { name: '数据中心能效', desc: 'PUE、可再生能源使用、碳减排', indicators: ['GRI 302 能源', 'GRI 305 排放物'] },
      { name: '电子废弃物管理', desc: '设备回收、有害材料、循环利用', indicators: ['GRI 306 废弃物'] },
      { name: '数据隐私与网络安全', desc: '数据保护、隐私合规、安全事件', indicators: ['GRI 418 客户隐私'] },
      { name: '数字鸿沟与普惠', desc: '数字普惠、信息无障碍', indicators: ['GRI 413 当地社区'] },
      { name: '供应链责任', desc: '硬件供应商、矿产溯源', indicators: ['GRI 308 供应商环境评估', 'GRI 414 供应商社会评估'] },
      { name: '员工发展与多元化', desc: '技能培训、性别平等、多元化', indicators: ['GRI 404 培训与教育', 'GRI 405 多元化'] },
    ],
  },
  金融: {
    topics: [
      { name: '绿色金融', desc: '绿色信贷、绿色债券、ESG 投资', indicators: ['GRI 203 间接经济影响'] },
      { name: '气候风险与机遇', desc: '气候风险压力测试、TCFD 披露', indicators: ['TCFD 战略', 'TCFD 风险管理'] },
      { name: '社会责任投资', desc: '普惠金融、扶贫贷款、小微企业支持', indicators: ['GRI 203 间接经济影响'] },
      { name: '数据隐私与信息安全', desc: '客户数据保护、信息安全管理', indicators: ['GRI 418 客户隐私'] },
      { name: '反腐败与公司治理', desc: '反洗钱、反腐败、董事会治理', indicators: ['GRI 205 反腐败'] },
      { name: '员工发展与多元化', desc: '员工培训、性别平等、高管多元化', indicators: ['GRI 404 培训与教育', 'GRI 405 多元化'] },
    ],
  },
  零售与快消: {
    topics: [
      { name: '供应链可持续', desc: '供应商 ESG 管理、可持续采购', indicators: ['GRI 308 供应商环境评估', 'GRI 414 供应商社会评估'] },
      { name: '产品安全与质量', desc: '食品安全、产品质量、召回', indicators: ['GRI 416 客户健康与安全'] },
      { name: '包装与废弃物', desc: '包装减量化、可回收包装、塑料污染', indicators: ['GRI 306 废弃物'] },
      { name: '门店能效与环保', desc: '门店能耗、冷链排放、绿色物流', indicators: ['GRI 302 能源', 'GRI 305 排放物'] },
      { name: '员工权益', desc: '员工薪酬、工作时间、职业发展', indicators: ['GRI 401 雇佣', 'GRI 403 职业健康与安全'] },
      { name: '客户隐私与营销责任', desc: '客户数据保护、负责任营销', indicators: ['GRI 417 营销与标识', 'GRI 418 客户隐私'] },
    ],
  },
  化工与材料: {
    topics: [
      { name: '化学品安全管理', desc: '危化品管理、安全存储运输、应急预案', indicators: ['GRI 403 职业健康与安全'] },
      { name: '污染防治', desc: '废气废水排放、危险废弃物、污染减排', indicators: ['GRI 305 排放物', 'GRI 306 废弃物'] },
      { name: '温室气体减排', desc: '能源消耗、碳排放、清洁能源替代', indicators: ['GRI 302 能源', 'GRI 305 排放物'] },
      { name: '循环经济与资源利用', desc: '物料回收、副产品利用、循环经济', indicators: ['GRI 301 物料', 'GRI 306 废弃物'] },
      { name: '职业健康安全', desc: '职业病防控、PPE、安全培训', indicators: ['GRI 403 职业健康与安全'] },
      { name: '生态与社区', desc: '周边环境影响、社区沟通', indicators: ['GRI 304 生物多样性', 'GRI 413 当地社区'] },
    ],
  },
  采矿与冶金: {
    topics: [
      { name: '生态保护与复垦', desc: '生物多样性、土地复垦、生态修复', indicators: ['GRI 304 生物多样性'] },
      { name: '水资源与水污染', desc: '矿坑排水、尾矿库、水污染防治', indicators: ['GRI 303 水资源'] },
      { name: '温室气体与能源', desc: '能耗、碳排放、可再生能源', indicators: ['GRI 302 能源', 'GRI 305 排放物'] },
      { name: '尾矿与固废管理', desc: '尾矿库安全、固废处置、综合利用', indicators: ['GRI 306 废弃物'] },
      { name: '安全与健康', desc: '矿山安全、职业病、安全投入', indicators: ['GRI 403 职业健康与安全'] },
      { name: '社区与原住民', desc: '社区补偿、原住民权利、移民安置', indicators: ['GRI 411 原住民权利', 'GRI 413 当地社区'] },
    ],
  },
  农业与食品: {
    topics: [
      { name: '可持续农业', desc: '化肥农药减量、土壤保护、节水灌溉', indicators: ['GRI 303 水资源', 'GRI 305 排放物'] },
      { name: '生物多样性', desc: '生态农业、栖息地保护、物种保护', indicators: ['GRI 304 生物多样性'] },
      { name: '食品安全与质量', desc: '食品安全管理、可追溯体系、产品召回', indicators: ['GRI 416 客户健康与安全'] },
      { name: '供应链责任', desc: '农户支持、公平贸易、可持续采购', indicators: ['GRI 414 供应商社会评估'] },
      { name: '废弃物与包装', desc: '农业废弃物、包装减量化、循环利用', indicators: ['GRI 306 废弃物'] },
      { name: '员工与社区', desc: '农业工人权益、农村社区发展', indicators: ['GRI 401 雇佣', 'GRI 413 当地社区'] },
    ],
  },
  医药与健康: {
    topics: [
      { name: '产品质量与安全', desc: '药品质量、不良反应、药物警戒', indicators: ['GRI 416 客户健康与安全'] },
      { name: '可及性与可负担性', desc: '药品可及性、价格、仿制药', indicators: ['GRI 413 当地社区'] },
      { name: '研发伦理', desc: '临床试验伦理、患者隐私、知情同意', indicators: ['GRI 418 客户隐私'] },
      { name: '环境影响', desc: '制药废水、溶剂回收、碳排放', indicators: ['GRI 305 排放物', 'GRI 306 废弃物'] },
      { name: '供应链', desc: '原料药供应商、质量体系、合规', indicators: ['GRI 308 供应商环境评估'] },
      { name: '员工健康与发展', desc: '员工健康、培训、职业发展', indicators: ['GRI 403 职业健康与安全', 'GRI 404 培训与教育'] },
    ],
  },
};

// ============ 行业关键词匹配表 ============
// 用于根据用户输入的行业名称模糊匹配到内置议题分类
const INDUSTRY_KEYWORDS = {
  制造业: ['制造', '加工', '装备', '机械', '电子制造', '轻工', '重工', '汽车', '家电'],
  能源: ['能源', '电力', '发电', '煤炭', '石油', '天然气', '石化', '新能源', '光伏', '风电', '核电'],
  建筑与房地产: ['建筑', '房地产', '地产', '施工', '工程', '建设', '物业', '装饰'],
  交通运输: ['交通', '运输', '物流', '航运', '航空', '铁路', '港口', '快递', '货运'],
  信息技术与通信: ['信息技术', '通信', '互联网', '软件', 'IT', '电信', '数据', '云计算', '电子', '半导体'],
  金融: ['金融', '银行', '保险', '证券', '基金', '投资', '信托', '租赁'],
  零售与快消: ['零售', '快消', '百货', '超市', '电商', '贸易', '消费', '食品饮料', '化妆品'],
  化工与材料: ['化工', '材料', '化学', '塑料', '橡胶', '涂料', '化纤', '新材料'],
  采矿与冶金: ['采矿', '矿业', '冶金', '钢铁', '有色金属', '黄金', '稀土', '矿山'],
  农业与食品: ['农业', '食品', '农牧', '养殖', '种植', '粮油', '饲料', '乳业', '屠宰'],
  医药与健康: ['医药', '医疗', '健康', '制药', '生物', '医院', '医疗器械'],
};

// ============ 工具函数 ============

/**
 * 根据行业名称匹配内置议题分类
 */
function matchIndustryTopics(industryName) {
  if (!industryName) return null;
  const name = String(industryName).trim();
  for (const [category, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (keywords.some((kw) => name.includes(kw))) {
      return INDUSTRY_TOPICS[category] ? { category, ...INDUSTRY_TOPICS[category] } : null;
    }
  }
  return null;
}

/**
 * 获取 GRI 标准指标的 Markdown 文本，用于注入 Prompt
 */
function buildGriStandardsMarkdown() {
  const lines = ['## GRI 2021 全球报告倡议组织标准核心指标'];
  for (const [key, group] of Object.entries(GRI_STANDARDS)) {
    lines.push(`\n### ${group.label}`);
    for (const ind of group.indicators) {
      lines.push(`- **${ind.code} ${ind.name}**：${ind.desc}`);
    }
  }
  return lines.join('\n');
}

/**
 * 获取 TCFD 指标的 Markdown 文本
 */
function buildTcfdMarkdown() {
  const lines = ['## TCFD 气候相关财务披露建议'];
  for (const [key, pillar] of Object.entries(TCFD_PILLARS)) {
    lines.push(`\n### ${pillar.label}`);
    for (const item of pillar.items) {
      lines.push(`- ${item}`);
    }
  }
  return lines.join('\n');
}

/**
 * 根据行业获取议题 Markdown
 */
function buildIndustryTopicsMarkdown(industryName) {
  const matched = matchIndustryTopics(industryName);
  if (!matched) return '';
  const lines = [`## 行业 ESG 重大议题（${matched.category}）`];
  lines.push('以下是该行业通常需要重点关注的 ESG 议题，可作为报告章节设计和内容生成的参考：\n');
  for (const topic of matched.topics) {
    lines.push(`### ${topic.name}`);
    lines.push(`- 说明：${topic.desc}`);
    lines.push(`- 相关指标：${topic.indicators.join('、')}`);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * 根据报告类型选择要注入的参考标准
 */
function buildReferenceStandardsMarkdown(reportType, industryName) {
  const blocks = [];
  // 所有绿色报告类型都注入 GRI 标准
  blocks.push(buildGriStandardsMarkdown());
  // ESG、可持续发展、社会责任报告注入 TCFD
  if (['esg', 'sustainability', 'csr'].includes(reportType)) {
    blocks.push(buildTcfdMarkdown());
  }
  // 行业议题
  const industryBlock = buildIndustryTopicsMarkdown(industryName);
  if (industryBlock) blocks.push(industryBlock);
  return blocks.join('\n\n');
}

module.exports = {
  GRI_STANDARDS,
  TCFD_PILLARS,
  INDUSTRY_TOPICS,
  INDUSTRY_KEYWORDS,
  matchIndustryTopics,
  buildGriStandardsMarkdown,
  buildTcfdMarkdown,
  buildIndustryTopicsMarkdown,
  buildReferenceStandardsMarkdown,
};
