import type { AppMenuItem, SectionId } from '../shared/types/navigation';
import { githubStarNotice } from '../shared/ui/useNoticeToast';

export const appMenuItems: AppMenuItem[] = [
  {
    id: 'bid-generation',
    label: '内容生成',
    description: '标书与可研报告内容编制',
    children: [
      {
        id: 'technical-plan',
        label: '投标文件',
        description: '根据招标文件生成技术方案、商务标等投标内容，或导入已有方案继续优化扩写',
        icon: 'document',
      },
      {
        id: 'feasibility-report',
        label: '可行性研究报告',
        description: '根据项目资料编制可行性研究报告',
        icon: 'document',
        badge: 'Beta',
      },
    ],
  },
  {
    id: 'template-settings',
    label: '模版设置',
    description: '标书导出模板与排版配置',
  },
  {
    id: 'knowledge-base',
    label: '知识库',
    description: '素材、模板和案例资产',
    children: [
      {
        id: 'document-knowledge-base',
        label: '文档知识库',
        description: '管理文档资料、案例素材和可复用知识条目',
        icon: 'document',
      },
      {
        id: 'credential-library',
        label: '资信库',
        description: '管理单家企业的资质、人员、业绩和财务资料',
        icon: 'shield',
      },
      {
        id: 'image-knowledge-base',
        label: '图片知识库',
        description: '管理图片素材、图示和视觉参考资料',
        icon: 'file',
        notice: githubStarNotice,
      },
    ],
  },
  {
    id: 'bid-check',
    label: '标书检查',
    description: '查重、废标项与合规检查',
    children: [
      {
        id: 'duplicate-check',
        label: '标书查重',
        description: '相似度与重复表达检测',
        icon: 'compare',
      },
      {
        id: 'rejection-check',
        label: '废标项检查',
        description: '硬性条款与响应完整性',
        icon: 'shield',
      },
      {
        id: 'ai-evaluation',
        label: 'AI评标',
        description: '模拟AI评标，对标书进行打分，出具评标报告',
        icon: 'tool',
        notice: githubStarNotice,
      },
    ],
  },
  {
    id: 'bid-opportunity',
    label: '投标机会',
    description: '机会发现与线索跟踪',
    notice: githubStarNotice,
  },
  {
    id: 'plugin-manager',
    label: '插件管理',
    description: '安装和管理插件，扩展软件功能',
  },
];

export function getAppMenuItems(developerMode: boolean): AppMenuItem[] {
  return appMenuItems;
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
