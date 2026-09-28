export type SectionId =
  | 'bid-generation'
  | 'technical-plan'
  | 'feasibility-report'
  | 'knowledge-base'
  | 'document-knowledge-base'
  | 'credential-library'
  | 'image-knowledge-base'
  | 'bid-check'
  | 'duplicate-check'
  | 'rejection-check'
  | 'ai-evaluation'
  | 'template-settings'
  | 'bid-opportunity'
  | 'settings'
  | 'plugin-manager';

export interface AppMenuNotice {
  message: string;
  actionLabel?: string;
  externalUrl?: string;
}

export interface AppSubMenuItem {
  id: SectionId;
  label: string;
  description: string;
  icon?: 'document' | 'expand' | 'briefcase' | 'compare' | 'shield' | 'code' | 'prompt' | 'file' | 'export' | 'tool';
  badge?: string;
  notice?: AppMenuNotice;
}

export interface AppMenuItem {
  id: SectionId;
  label: string;
  description: string;
  children?: AppSubMenuItem[];
  notice?: AppMenuNotice;
}
