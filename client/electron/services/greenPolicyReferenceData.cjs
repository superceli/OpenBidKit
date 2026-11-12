'use strict';

/**
 * 绿色报告政策法规参考库。
 * 只提供名称、实施时间和主要内容，供 AI 选取和引用，避免模型编造法规。
 */
const POLICY_REFERENCES = [
  { name: '中华人民共和国环境保护法', implemented: '2015-01-01', summary: '环境保护基本制度、企业污染防治责任与环境信息公开要求。' },
  { name: '中华人民共和国节约能源法', implemented: '2018-10-26 修正', summary: '节能管理、重点用能单位节能义务和能源利用效率要求。' },
  { name: '中华人民共和国循环经济促进法', implemented: '2018-10-26 修正', summary: '减量化、再利用、资源化原则及企业循环经济责任。' },
  { name: '中华人民共和国清洁生产促进法', implemented: '2012-07-01', summary: '清洁生产审核、源头削减和全过程污染控制要求。' },
  { name: '中华人民共和国科学技术进步法', implemented: '2022-01-01', summary: '企业技术创新主体地位、研发投入和科技评价制度。' },
  { name: '中华人民共和国促进科技成果转化法', implemented: '2015-10-01', summary: '科技成果转化、收益分配和产学研合作机制。' },
  { name: '中华人民共和国专利法', implemented: '2021-06-01', summary: '专利保护、职务发明和知识产权运用规则。' },
  { name: '中华人民共和国食品安全法', implemented: '2021-04-29 修正', summary: '食品生产经营主体责任、全过程追溯和食品安全管理制度。' },
  { name: '中华人民共和国产品质量法', implemented: '2018-12-29 修正', summary: '产品质量责任、质量管理和消费者权益保护要求。' },
  { name: '中华人民共和国安全生产法', implemented: '2021-09-01', summary: '生产经营单位安全生产主体责任、风险防控和应急管理要求。' },
  { name: '中华人民共和国劳动法', implemented: '2018-12-29 修正', summary: '劳动用工、工时休息、劳动报酬和职业安全基本制度。' },
  { name: '中华人民共和国劳动合同法', implemented: '2013-07-01', summary: '劳动合同订立、履行、变更、解除和终止规则。' },
  { name: '中华人民共和国公司法', implemented: '2024-07-01', summary: '公司治理结构、股东权益、董事监事高级管理人员职责。' },
  { name: '中华人民共和国统计法', implemented: '2010-01-01', summary: '统计资料真实性、统计调查和统计数据管理要求。' },
  { name: '企业信息公示暂行条例', implemented: '2014-10-01', summary: '企业年度报告和即时信息公示义务。' },
  { name: '中华人民共和国国民经济和社会发展第十四个五年规划和2035年远景目标纲要', implemented: '2021-03', summary: '创新驱动、绿色发展、数字经济等国家战略方向。' },
  { name: '中华人民共和国国民经济和社会发展第十五个五年规划和2035年远景目标纲要', implemented: '2026-03', summary: '新质生产力、绿色低碳转型和科技创新等阶段性目标。' },
  { name: '“十四五”科技创新规划', implemented: '2021-12', summary: '企业研发投入、创新平台、成果转化和科技人才部署。' },
  { name: '“十四五”冷链物流发展规划', implemented: '2021-12', summary: '冷链物流基础设施、全程温控和绿色低碳发展要求。' },
  { name: '“十四五”数字经济发展规划', implemented: '2022-01', summary: '产业数字化转型、数据要素和数字基础设施建设。' },
  { name: '高新技术企业认定管理办法', implemented: '2016-01-01', summary: '高新技术企业认定条件、研发费用占比和知识产权要求。' },
  { name: '绿色工厂评价通则（GB/T 36132-2018）', implemented: '2018-05-01', summary: '绿色工厂评价指标体系、评价方法和等级划分。' },
  { name: '绿色制造 制造企业绿色供应链管理 导则（GB/T 33635-2017）', implemented: '2017-12-01', summary: '绿色供应链管理目标、流程和评价要求。' },
  { name: '变革我们的世界：2030年可持续发展议程（SDGs）', implemented: '2015-09-25', summary: '联合国17项可持续发展目标及全球可持续发展行动框架。' },
];

function buildPolicyReferenceMarkdown({ title = '政策法规参考清单', min = 15, max = 22 } = {}) {
  const lines = [`\n${title}（请从中选择 ${min}-${max} 项与报告主题和行业最相关的条目，不得编造清单外的法规）：`];
  POLICY_REFERENCES.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.name}｜实施时间：${item.implemented}｜主要内容：${item.summary}`);
  });
  return lines.join('\n');
}

module.exports = {
  POLICY_REFERENCES,
  buildPolicyReferenceMarkdown,
};
