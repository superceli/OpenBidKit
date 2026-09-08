export type SectionId =
  | 'green-report'
  | 'knowledge-base'
  | 'document-knowledge-base'
  | 'resources'
  | 'template-settings'
  | 'my-templates'
  | 'new-template'
  | 'export-format'
  | 'developer-test'
  | 'developer-json-test'
  | 'developer-multimodal-test'
  | 'developer-prompt-lab'
  | 'developer-parser-sandbox'
  | 'developer-export-preview'
  | 'developer-agent-test'
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
