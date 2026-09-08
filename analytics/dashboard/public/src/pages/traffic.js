import { assertReady, buildRangeQuery, getEncodedProjectAndDays, loadProjectOptions, requestJson, saveSettings } from '../api.js';
import { renderTable } from '../render.js';
import { state } from '../state.js';

const pageLabels = {
  'green-report': '绿色报告生成',
  'green-report/company-info': '绿色报告生成 - 企业信息',
  'green-report/report-config': '绿色报告生成 - 报告配置',
  'green-report/outline': '绿色报告生成 - 报告目录',
  'green-report/content': '绿色报告生成 - 正文生成',
  'knowledge-base': '知识库',
  resources: '资源下载',
  'knowledge-base/library': '知识库 - 文档列表',
  'knowledge-base/viewer/items': '知识库 - 知识条目',
  'knowledge-base/viewer/markdown': '知识库 - Markdown 原文',
  'knowledge-base/viewer/analysis': '知识库 - 分析调试',
  'template-settings': '报告模板',
  'my-templates': '报告模板 - 我的模板',
  'my-templates/edit': '报告模板 - 编辑模板',
  'new-template': '报告模板 - 新建模板',
  'export-format': '报告模板 - 新建模板',
  'plugin-manager': '插件管理',
  'developer-test': '测试页',
  'developer-json-test': '测试页 - Json请求测试',
  'developer-multimodal-test': '测试页 - 多模态测试',
  'developer-prompt-lab': '测试页 - Prompt调试台',
  'developer-parser-sandbox': '测试页 - 文件解析沙盘',
  'developer-export-preview': '测试页 - 导出链路预演',
  'developer-agent-test': '测试页 - 智能体链路测试',
  settings: '设置',
};

function getPageLabel(page) {
  return pageLabels[page] || '未知页面';
}

export async function loadTraffic() {
  assertReady();
  await loadProjectOptions();
  saveSettings();

  const range = state.trafficRange.value;
  const { projectName } = getEncodedProjectAndDays();
  const summary = await requestJson(`/api/traffic?projectName=${projectName}&${buildRangeQuery(range)}`);
  const pages = (summary.pages || []).map((row) => ({
    ...row,
    pageLabel: getPageLabel(row.page),
  }));

  renderTable(state.pagesTable, pages, [
    { key: 'pageLabel', label: '功能名称' },
    { key: 'page', label: '路由', code: true },
    { key: 'count', label: range === 'history' ? '累计访问量' : '访问量' },
  ], '暂无页面访问数据');

  renderTable(state.versionsTable, summary.versions || [], [
    { key: 'version', label: '版本', code: true },
    { key: 'count', label: range === 'history' ? '累计事件数' : '事件数' },
    { key: 'clients', label: '客户端数' },
  ], '暂无版本数据');
}
