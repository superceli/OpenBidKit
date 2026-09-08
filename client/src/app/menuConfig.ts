import type { AppMenuItem, SectionId } from '../shared/types/navigation';

export const appMenuItems: AppMenuItem[] = [
  {
    id: 'green-report',
    label: '绿色报告生成',
    description: 'ESG报告、可持续发展报告、社会责任报告等绿色报告智能生成',
  },
  {
    id: 'knowledge-base',
    label: '知识库',
    description: '企业资料、行业素材和可复用知识条目',
    children: [
      {
        id: 'document-knowledge-base',
        label: '文档知识库',
        description: '管理企业文档、ESG数据和可复用知识条目',
        icon: 'document',
      },
    ],
  },
  {
    id: 'template-settings',
    label: '报告模板',
    description: '报告导出模板与排版配置',
    children: [
      {
        id: 'my-templates',
        label: '我的模板',
        description: '管理已保存的报告导出模板',
        icon: 'document',
      },
      {
        id: 'new-template',
        label: '新建模板',
        description: '配置 Word 文档排版与编号格式',
        icon: 'export',
      },
    ],
  },
  {
    id: 'resources',
    label: '资源下载',
    description: '报告相关资料、工具下载',
  },
  {
    id: 'plugin-manager',
    label: '插件管理',
    description: '安装和管理插件，扩展软件功能',
  },
];

const developerMenuItems: AppMenuItem[] = [
  {
    id: 'developer-test',
    label: '测试页',
    description: '开发者验证与问题复现',
    children: [
      {
        id: 'developer-json-test',
        label: 'Json请求测试',
        description: '通过通用 AI 请求验证模型 JSON 响应和修复流程。',
        icon: 'code',
      },
      {
        id: 'developer-multimodal-test',
        label: '多模态测试',
        description: '上传图片并使用自定义提示词验证文本模型的图片理解能力。',
        icon: 'code',
      },
      {
        id: 'developer-prompt-lab',
        label: 'Prompt调试台',
        description: '集中观察 Prompt 版本、变量注入和输出约束，便于后续调参。',
        icon: 'prompt',
      },
      {
        id: 'developer-parser-sandbox',
        label: '文件解析沙盘',
        description: '模拟本地解析、MinerU 解析和图片资产入库的调试入口。',
        icon: 'file',
      },
      {
        id: 'developer-export-preview',
        label: '导出链路预演',
        description: '预览 Word、Markdown、Mermaid 图片转换的导出检查路径。',
        icon: 'export',
      },
      {
        id: 'developer-agent-test',
        label: 'Pi Agent 链路测试',
        description: '验证 Pi Agent 的状态、自检、任务输出和诊断。',
        icon: 'tool',
      },
    ],
  },
];

export function getAppMenuItems(developerMode: boolean): AppMenuItem[] {
  return developerMode ? [...appMenuItems, ...developerMenuItems] : appMenuItems;
}

export function getSectionOrder(developerMode: boolean): SectionId[] {
  return getAppMenuItems(developerMode).flatMap((item) => [item.id, ...(item.children?.map((child) => child.id) ?? [])]);
}

export function getAppMenuItemById(id: SectionId, developerMode: boolean): AppMenuItem | undefined {
  return getAppMenuItems(developerMode).find((item) => item.id === id);
}

export function getParentMenuItemBySection(section: SectionId, developerMode: boolean): AppMenuItem | undefined {
  return getAppMenuItems(developerMode).find((item) => item.id === section || item.children?.some((child) => child.id === section));
}
