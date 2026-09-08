/**
 * 绿色报告类型库
 * 涵盖 ESG、碳减排、绿色制造、智能制造、绿色供应链等 180+ 报告类型
 * 支持名称搜索，按分类展示
 */

export interface GreenReportTypeItem {
  /** 唯一标识 */
  id: string;
  /** 报告名称 */
  name: string;
  /** 分类 */
  category: GreenReportCategory;
  /** 简短描述 */
  description?: string;
}

export type GreenReportCategory =
  | 'ESG与社会责任'
  | '碳与气候'
  | '绿色制造与工厂'
  | '能源与资源'
  | '环保与三废'
  | '绿色供应链与物流'
  | '产品与包装'
  | '科技创新与数智化'
  | '安全与应急'
  | '经营与综合评价';

export const GREEN_REPORT_TYPES: GreenReportTypeItem[] = [
  // ============ ESG与社会责任 ============
  { id: 'esg', name: 'ESG（环境、社会、公司治理）报告', category: 'ESG与社会责任', description: '涵盖环境(E)、社会(S)、治理(G)三大维度的综合性报告。' },
  { id: 'sustainability', name: '可持续发展报告', category: 'ESG与社会责任', description: '聚焦经济、环境、社会三重底线的可持续发展披露报告。' },
  { id: 'csr', name: '企业社会责任报告', category: 'ESG与社会责任', description: '侧重企业在社会公益、员工权益、社区贡献等方面的履责情况。' },
  { id: 'green-enterprise', name: '绿色企业创建体系报告', category: 'ESG与社会责任', description: '绿色企业创建体系建设与运行情况报告。' },
  { id: 'green-development-system', name: '企业绿色低碳发展体系评价报告', category: 'ESG与社会责任' },
  { id: 'green-development-planning', name: '企业绿色发展规划报告', category: 'ESG与社会责任' },
  { id: 'green-development-top-level', name: '绿色发展顶层规划及执行情况报告', category: 'ESG与社会责任' },
  { id: 'green-development-strategy', name: '绿色发展战略体系报告', category: 'ESG与社会责任' },
  { id: 'green-development-path', name: '绿色发展实施路径报告', category: 'ESG与社会责任' },
  { id: 'green-development-appraisal', name: '绿色发展鉴定评价报告', category: 'ESG与社会责任' },
  { id: 'green-development-plan-eval', name: '绿色发展规划评价报告', category: 'ESG与社会责任' },
  { id: 'green-enterprise-comprehensive', name: '绿色企业综合报告', category: 'ESG与社会责任' },
  { id: 'green-enterprise-report', name: '绿色企业报告', category: 'ESG与社会责任' },
  { id: 'green-environmental-low-carbon', name: '绿色环保及低碳发展报告', category: 'ESG与社会责任' },
  { id: 'green-low-carbon-measures', name: '绿色低碳举措及成效报告', category: 'ESG与社会责任' },
  { id: 'green-system-construction', name: '企业绿色制度及体系建设报告', category: 'ESG与社会责任' },
  { id: 'institution-system-construction', name: '制度及体系建设报告', category: 'ESG与社会责任' },
  { id: 'public-credit-info', name: '公共信用信息报告', category: 'ESG与社会责任' },
  { id: 'integrity-evaluation', name: '诚信评价报告', category: 'ESG与社会责任' },
  { id: 'team-rd-scale', name: '团队研发规模报告', category: 'ESG与社会责任' },
  { id: 'rd-team-scale', name: '研发团队规模报告', category: 'ESG与社会责任' },
  { id: 'scientific-research-funding', name: '科研经费报告', category: 'ESG与社会责任' },
  { id: 'scientific-research-funding-ratio', name: '科研经费占比报告', category: 'ESG与社会责任' },
  { id: 'industry-university-research', name: '产学研报告', category: 'ESG与社会责任' },
  { id: 'market-share-analysis', name: '市场占有率分析报告', category: 'ESG与社会责任' },
  { id: 'enterprise-asset-operation', name: '企业资产运营能力报告', category: 'ESG与社会责任' },
  { id: 'enterprise-operation-eval', name: '企业经营状况综合评价报告', category: 'ESG与社会责任' },
  { id: 'quality-evaluation', name: '企业质量评价报告', category: 'ESG与社会责任' },
  { id: 'scale-service-eval', name: '规模与服务评价报告', category: 'ESG与社会责任' },
  { id: 'performance-comprehensive-eval', name: '履约能力综合评价报告', category: 'ESG与社会责任' },

  // ============ 碳与气候 ============
  { id: 'carbon-reduction', name: '碳减排报告', category: '碳与气候', description: '温室气体减排措施与成效报告。' },
  { id: 'carbon-peak', name: '碳达峰报告', category: '碳与气候' },
  { id: 'carbon-peak-plan', name: '碳达峰方案报告', category: '碳与气候' },
  { id: 'carbon-footprint', name: '碳足迹报告', category: '碳与气候', description: '温室气体排放核算与减排路径报告，涵盖Scope 1/2/3排放。' },
  { id: 'carbon-emission-comparison', name: '碳排放对比报告', category: '碳与气候' },
  { id: 'energy-consumption-reduction', name: '能耗降低报告', category: '碳与气候' },
  { id: 'energy-consumption-reduction-eval', name: '能耗降低评价报告', category: '碳与气候' },
  { id: 'energy-saving-assessment', name: '企业节能评估报告', category: '碳与气候' },
  { id: 'energy-saving-carbon-reduction-eval', name: '节能降碳评价报告', category: '碳与气候' },
  { id: 'energy-saving-measures', name: '节能减排措施报告', category: '碳与气候' },
  { id: 'energy-evaluation', name: '能源评价报告', category: '碳与气候' },
  { id: 'energy-assessment', name: '能评报告', category: '碳与气候' },
  { id: 'enterprise-energy-assessment', name: '企业能评报告', category: '碳与气候' },
  { id: 'energy-consumption-eval', name: '能源消耗评价报告', category: '碳与气候' },
  { id: 'energy-technology-eval', name: '能源技术评价报告', category: '碳与气候' },
  { id: 'err-energy-eval', name: 'ERR能源评价报告', category: '碳与气候' },
  { id: 'green-power-eval', name: '绿色电力评价报告', category: '碳与气候' },
  { id: 'green-power-usage', name: '企业绿电使用情况报告', category: '碳与气候' },
  { id: 'green-power-usage-report', name: '绿电使用情况报告', category: '碳与气候' },
  { id: 'enterprise-green-power', name: '企业绿电使用报告', category: '碳与气候' },
  { id: 'green-power-certificate-eval', name: '绿色电力证书评价报告', category: '碳与气候' },

  // ============ 绿色制造与工厂 ============
  { id: 'smart-manufacturing-demo-factory', name: '智能制造示范工厂报告', category: '绿色制造与工厂' },
  { id: 'smart-manufacturing-demo-factory-eval', name: '智能制造示范工厂评价报告', category: '绿色制造与工厂' },
  { id: 'smart-manufacturing-advantage-scene', name: '智能制造优势场景报告', category: '绿色制造与工厂' },
  { id: 'smart-manufacturing', name: '智能制造报告', category: '绿色制造与工厂' },
  { id: 'smart-factory', name: '智能工厂报告', category: '绿色制造与工厂' },
  { id: 'wisdom-factory', name: '智慧工厂报告', category: '绿色制造与工厂' },
  { id: 'future-factory', name: '未来工厂报告', category: '绿色制造与工厂' },
  { id: 'green-factory-eval', name: '绿色工厂评价报告', category: '绿色制造与工厂' },
  { id: 'green-manufacturing-eval', name: '绿色制造评价报告', category: '绿色制造与工厂' },
  { id: 'green-manufacturing', name: '绿色制造报告', category: '绿色制造与工厂' },
  { id: 'green-production', name: '绿色生产报告', category: '绿色制造与工厂' },
  { id: 'green-comprehensive-eval', name: '绿色综合评价报告', category: '绿色制造与工厂' },
  { id: 'green-low-carbon-production-eval', name: '绿色低碳生产评价报告', category: '绿色制造与工厂' },
  { id: 'green-environmental-measures-eval', name: '绿色环保措施评价报告', category: '绿色制造与工厂' },
  { id: 'green-environmental-upgrade', name: '绿色环保改造升级报告', category: '绿色制造与工厂' },
  { id: 'enterprise-green-environmental-upgrade', name: '企业绿色环保改造升级报告', category: '绿色制造与工厂' },
  { id: 'enterprise-green-environmental-renovation', name: '企业绿色环保升级改造报告', category: '绿色制造与工厂' },
  { id: 'green-renovation-upgrade', name: '绿色改造升级报告', category: '绿色制造与工厂' },
  { id: 'production-equipment-green-remediation', name: '生产设备绿色化改造专题报告', category: '绿色制造与工厂' },
  { id: 'equipment-process-optimization-eval', name: '设备工艺优化改进评价报告', category: '绿色制造与工厂' },
  { id: 'product-process-optimization-eval', name: '产品工艺优化改进评价报告', category: '绿色制造与工厂' },
  { id: 'production-tech-innovation-eval', name: '生产技术和工艺创新评价报告', category: '绿色制造与工厂' },
  { id: 'production-tech-renovation-eval', name: '生产技术和工艺改造评价报告', category: '绿色制造与工厂' },
  { id: 'clean-production-process', name: '清洁生产工艺技术报告', category: '绿色制造与工厂' },
  { id: 'purification-workshop-eval', name: '净化车间评估报告', category: '绿色制造与工厂' },
  { id: 'digital-workshop', name: '数字化车间报告', category: '绿色制造与工厂' },
  { id: 'digital-workshop-report', name: '数智化车间报告', category: '绿色制造与工厂' },
  { id: 'digital-pilot-enterprise', name: '企业数字领航报告', category: '绿色制造与工厂' },
  { id: 'digital-pilot-eval', name: '数字领航企业评价报告', category: '绿色制造与工厂' },
  { id: 'enterprise-digital-pilot-eval', name: '企业数字领航评价报告', category: '绿色制造与工厂' },
  { id: 'digital-evaluation', name: '数智化评价报告', category: '绿色制造与工厂' },
  { id: 'digital-green-manufacturing', name: '数智化绿色制造报告', category: '绿色制造与工厂' },
  { id: 'digital-green-low-carbon-system', name: '数智化绿色低碳体系建设报告', category: '绿色制造与工厂' },
  { id: 'enterprise-digital-green-low-carbon', name: '企业数智化绿色低碳体系建设报告', category: '绿色制造与工厂' },
  { id: 'digital-green-low-carbon-comprehensive-eval', name: '数智化绿色低碳体系建设综合评价报告', category: '绿色制造与工厂' },
  { id: 'green-low-carbon-digital-enterprise-eval', name: '绿色低碳现代数智企业评价制度及体系建设报告', category: '绿色制造与工厂' },
  { id: 'digital-nc-manufacturing-eval', name: '智能数控制造评价报告', category: '绿色制造与工厂' },
  { id: 'digital-pilot-eval-report', name: '数智化评价数字领航报告', category: '绿色制造与工厂' },
  { id: 'digital-navigator-enterprise', name: '数智领航企业报告', category: '绿色制造与工厂' },
  { id: 'digital-green-low-carbon-system-eval', name: '数智化数字领航评价报告', category: '绿色制造与工厂' },

  // ============ 能源与资源 ============
  { id: 'water-saving-eval', name: '节水评价报告', category: '能源与资源' },
  { id: 'resource-energy-consumption', name: '资源能源消耗报告', category: '能源与资源' },
  { id: 'resource-recycling', name: '资源循环化利用报告', category: '能源与资源' },
  { id: 'resource-recycling-utilization', name: '资源化循环利用报告', category: '能源与资源' },
  { id: 'industrial-solid-waste-utilization-eval', name: '工业固废综合利用评价报告', category: '能源与资源' },
  { id: 'raw-material-green-procurement', name: '原材料绿色采购管理制度报告', category: '能源与资源' },
  { id: 'raw-material-selection-eval', name: '产品原料选择评价报告', category: '能源与资源' },
  { id: 'raw-material-capability-eval', name: '原材料部能力改进评价报告', category: '能源与资源' },
  { id: 'hazardous-substance-reduction', name: '有毒有害物质减量或替代报告', category: '能源与资源' },
  { id: 'hazardous-substance-substitution', name: '有毒有害物质减量或代替报告', category: '能源与资源' },
  { id: 'reduce-hazardous-substances', name: '减少有害物质报告', category: '能源与资源' },
  { id: 'harmless-disposal', name: '无害化处置报告', category: '能源与资源' },

  // ============ 环保与三废 ============
  { id: 'waste-gas-water-solid-eval', name: '废气、废水、固废评价报告', category: '环保与三废' },
  { id: 'three-wastes', name: '三废报告', category: '环保与三废' },
  { id: 'gtr-waste-eval', name: 'GTR废水、废气、固废评价报告', category: '环保与三废' },
  { id: 'four-wastes-eval', name: '四废（废水、废气、固废、噪声）评价报告', category: '环保与三废' },
  { id: 'waste-gas-water-solid-compliance', name: '废气、废水和废固合规报告', category: '环保与三废' },
  { id: 'pollutant-discharge', name: '污染物排放报告', category: '环保与三废' },
  { id: 'environmental-impact', name: '环境影响评价报告', category: '环保与三废', description: '建设项目环境影响评价报告，包括大气、水、声、土壤、生态等专题。' },
  { id: 'green-building-energy-saving', name: '绿色建筑节能报告', category: '环保与三废' },
  { id: 'green-consumption-research', name: '绿色消费调研报告', category: '环保与三废' },
  { id: 'green-travel-research', name: '绿色出行研究报告', category: '环保与三废' },
  { id: 'after-sales-service-eval', name: '售后服务能力评价报告', category: '环保与三废' },
  { id: 'after-sales-service-component', name: '售后服务组件报告', category: '环保与三废' },
  { id: 'after-sales-service-comprehensive-eval', name: '企业售后服务能力综合评价报告', category: '环保与三废' },

  // ============ 绿色供应链与物流 ============
  { id: 'green-supply-chain-eval', name: '绿色供应链评价报告', category: '绿色供应链与物流' },
  { id: 'green-supply-chain', name: '绿色供应链报告', category: '绿色供应链与物流' },
  { id: 'green-supply-chain-eval-statement', name: '绿色供应链评价声明报告', category: '绿色供应链与物流' },
  { id: 'green-procurement', name: '绿色采购报告', category: '绿色供应链与物流' },
  { id: 'green-logistics', name: '绿色物流报告', category: '绿色供应链与物流' },
  { id: 'green-logistics-eval', name: '绿色物流评价报告', category: '绿色供应链与物流' },
  { id: 'green-transport', name: '绿色运输报告', category: '绿色供应链与物流' },
  { id: 'enterprise-green-transport-eval', name: '企业绿色运输评价报告', category: '绿色供应链与物流' },
  { id: 'transport-planning', name: '运输规划报告', category: '绿色供应链与物流' },
  { id: 'transport-organization-measures', name: '运输组织措施报告', category: '绿色供应链与物流' },
  { id: 'transport-organization-plan', name: '运输组织措施方案报告', category: '绿色供应链与物流' },
  { id: 'transport-safety-control', name: '运输安全管控举措报告', category: '绿色供应链与物流' },
  { id: 'in-transit-material-monitoring', name: '在途物资监控报告', category: '绿色供应链与物流' },
  { id: 'supply-chain-guarantee', name: '供应链保障措施报告', category: '绿色供应链与物流' },
  { id: 'emergency-supply', name: '应急保供报告', category: '绿色供应链与物流' },
  { id: 'emergency-supply-eval', name: '应急保供评价报告', category: '绿色供应链与物流' },
  { id: 'emergency-rescue-power-supply', name: '应急抢险保电物资供应能力报告', category: '绿色供应链与物流' },
  { id: 'outsource-component-material', name: '外购外协组件材料报告', category: '绿色供应链与物流' },
  { id: 'packaging-transport', name: '包装及运输报告', category: '绿色供应链与物流' },
  { id: 'green-packaging-transport-eval', name: '绿色包装及运输评价报告', category: '绿色供应链与物流' },

  // ============ 产品与包装 ============
  { id: 'epd', name: 'EPD（环境产品声明）报告', category: '产品与包装', description: '环境产品声明报告，披露产品全生命周期环境影响。' },
  { id: 'epd-report', name: 'EPD报告', category: '产品与包装' },
  { id: 'green-design-product', name: '绿色设计产品报告', category: '产品与包装' },
  { id: 'green-product-design', name: '绿色产品设计报告', category: '产品与包装' },
  { id: 'green-design-product-eval-statement', name: '绿色设计产品评价声明报告', category: '产品与包装' },
  { id: 'green-packaging', name: '绿色包装报告', category: '产品与包装' },
  { id: 'green-packaging-eval', name: '绿色包装评价报告', category: '产品与包装' },
  { id: 'enterprise-green-packaging-eval', name: '企业绿色包装评价报告', category: '产品与包装' },
  { id: 'green-recovery', name: '绿色回收报告', category: '产品与包装' },
  { id: 'green-recovery-eval', name: '绿色回收评价报告', category: '产品与包装' },
  { id: 'product-design-rationality', name: '产品设计合理性报告', category: '产品与包装' },
  { id: 'product-design-rationality-eval', name: '产品设计合理性评价报告', category: '产品与包装' },
  { id: 'product-design-advanced', name: '产品设计先进性报告', category: '产品与包装' },
  { id: 'product-design-advanced-eval', name: '产品设计先进性评价报告', category: '产品与包装' },
  { id: 'product-upgrade-eval', name: '产品升级评价报告', category: '产品与包装' },
  { id: 'product-manufacturing-quality', name: '产品制造质量控制报告', category: '产品与包装' },
  { id: 'gdp-green-development-plan', name: 'GDP企业绿色发展规划报告', category: '产品与包装' },

  // ============ 科技创新与数智化 ============
  { id: 'technological-innovation-eval', name: '科创创新评价报告', category: '科技创新与数智化' },
  { id: 'enterprise-innovation-achievement', name: '企业创新成果报告', category: '科技创新与数智化' },
  { id: 'enterprise-tech-innovation-achievement', name: '企业科技创新成果报告', category: '科技创新与数智化' },
  { id: 'tech-achievement-comprehensive-eval', name: '科技成果情况综合评价报告', category: '科技创新与数智化' },
  { id: 'scientific-innovation', name: '科研创新报告', category: '科技创新与数智化' },
  { id: 'scientific-innovation-achievement', name: '科研创新成果报告', category: '科技创新与数智化' },
  { id: 'innovation-achievement-eval', name: '创新成果评价报告', category: '科技创新与数智化' },
  { id: 'innovation-incentive-mechanism', name: '创新激励机制报告', category: '科技创新与数智化' },
  { id: 'innovation-incentive-eval', name: '创新激励机制评价报告', category: '科技创新与数智化' },
  { id: 'innovation-incentive-development', name: '创新激励机制发展报告', category: '科技创新与数智化' },
  { id: 'independent-controllable-level', name: '自主可控水平报告', category: '科技创新与数智化' },
  { id: 'smart-management-system-eval', name: '智能管理系统评价报告', category: '科技创新与数智化' },
  { id: 'tooling-equipment-eval', name: '工装设备评价报告', category: '科技创新与数智化' },
  { id: 'technical-service-measures', name: '技术服务措施、技术力量、管理水平报告', category: '科技创新与数智化' },
  { id: 'capacity-assessment', name: '产能评估报告', category: '科技创新与数智化' },

  // ============ 安全与应急 ============
  { id: 'safety-status-eval', name: '安全现状评价报告', category: '安全与应急' },
  { id: 'safety-reliability-eval', name: '安全可靠性评价报告', category: '安全与应急' },
  { id: 'safety-control-measures', name: '安全管控措施方案报告', category: '安全与应急' },
  { id: 'quality-control-measures', name: '质量管控措施报告', category: '安全与应急' },
  { id: 'entity-list-countermeasures', name: '实体清单应对举措报告', category: '安全与应急' },
  { id: 'trade-barrier-countermeasures', name: '应对国际贸易壁垒举措报告', category: '安全与应急' },
  { id: 'bid-response-comprehensive-eval', name: '投标响应综合评价报告', category: '安全与应急' },

  // ============ 经营与综合评价 ============
  { id: 'green-finance', name: '绿色金融报告', category: '经营与综合评价', description: '绿色债券、绿色信贷等绿色金融产品发行与资金使用报告。' },
  { id: 'institution-system-eval', name: '制度及体系建设评价制度报告', category: '经营与综合评价' },
];

/** 按分类分组 */
export function groupReportTypesByCategory(types: GreenReportTypeItem[] = GREEN_REPORT_TYPES): Record<string, GreenReportTypeItem[]> {
  const groups: Record<string, GreenReportTypeItem[]> = {};
  for (const item of types) {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push(item);
  }
  return groups;
}

/** 按关键词搜索报告类型（匹配名称、分类、描述） */
export function searchReportTypes(keyword: string): GreenReportTypeItem[] {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return GREEN_REPORT_TYPES;
  return GREEN_REPORT_TYPES.filter((item) =>
    item.name.toLowerCase().includes(kw) ||
    item.category.toLowerCase().includes(kw) ||
    (item.description?.toLowerCase().includes(kw) ?? false),
  );
}

/** 根据 id 查找报告类型 */
export function findReportTypeById(id: string): GreenReportTypeItem | undefined {
  return GREEN_REPORT_TYPES.find((item) => item.id === id);
}
