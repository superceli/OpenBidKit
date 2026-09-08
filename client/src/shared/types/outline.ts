export interface OutlineItem {
  id: string;
  title: string;
  description?: string;
  content?: string;
  children?: OutlineItem[];
}

export interface OutlineData {
  outline: OutlineItem[];
  project_name?: string;
  project_overview?: string;
}
