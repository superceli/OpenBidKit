-- 工作区 SQLite 目标完整数据结构（设计说明）
--
-- 说明：
-- 1. 本文件用于开源开发者阅读、评审和排查问题，展示 workspace/yibiao.sqlite 的目标完整表结构。
-- 2. 用户运行客户端时不需要手动执行本文件。
-- 3. 客户端运行时建表和升级以 Electron Main 侧 migration 代码为准。
-- 4. 当前运行代码已落地 knowledge_* v3、export_templates v15、task_logs v20、green_report_* v24 目标结构；
--    v25 已清理 technical_plan_*、duplicate_check_*、rejection_check_*、feasibility_report_* 等投标相关表；
--    v26 绿色报告新增导出模板 ID 字段 template_id，关联 export_templates.template_id。
-- 5. 每次表结构调整后，需要同步更新本文件和 runtime migration 版本。
-- 6. 本文件不保存历史版本，每次更新都写入最新目标完整结构。

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

-- 目标完整结构版本。
-- 运行时代码应通过 PRAGMA user_version 判断是否需要自动升级。
PRAGMA user_version = 26;

-- ============================================================================
-- 任务日志 task_logs（v20 目标设计）
-- ============================================================================

-- 跨业务后台任务运行日志。
CREATE TABLE IF NOT EXISTS task_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_domain TEXT NOT NULL,
  task_type TEXT NOT NULL,
  task_id TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_logs_task
ON task_logs(task_domain, task_type, task_id, id DESC);

-- ============================================================================
-- 知识库 knowledge_*（v3 目标设计）
-- ============================================================================

-- 知识库文件夹。
CREATE TABLE IF NOT EXISTS knowledge_folders (
  folder_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_folders_order
ON knowledge_folders(sort_order, created_at);

-- 知识库文档元数据和处理状态。
-- 原始文件和 Markdown 原文仍保存在 knowledge-base/folders/<folderId>/documents/<documentId>/ 下。
CREATE TABLE IF NOT EXISTS knowledge_documents (
  document_id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  document_dir TEXT NOT NULL,
  source_path TEXT NOT NULL,
  markdown_path TEXT NOT NULL,
  markdown_hash TEXT,
  markdown_chars INTEGER NOT NULL DEFAULT 0,
  source_extension TEXT,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  error TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,
  block_count INTEGER NOT NULL DEFAULT 0,
  filtered_block_count INTEGER NOT NULL DEFAULT 0,
  candidate_item_count INTEGER NOT NULL DEFAULT 0,
  discarded_block_count INTEGER NOT NULL DEFAULT 0,
  system_discarded_after_retry_count INTEGER NOT NULL DEFAULT 0,
  last_batch_size INTEGER,
  parser_label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (folder_id) REFERENCES knowledge_folders(folder_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_folder_order
ON knowledge_documents(folder_id, sort_order, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_status
ON knowledge_documents(status);

-- 知识库有效 block 和筛除 block。
-- is_filtered = 0 表示进入 AI 分析的有效 block；is_filtered = 1 表示程序筛除的 block。
CREATE TABLE IF NOT EXISTS knowledge_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  type TEXT NOT NULL,
  heading_path_json TEXT,
  content TEXT NOT NULL,
  content_chars INTEGER NOT NULL DEFAULT 0,
  is_filtered INTEGER NOT NULL DEFAULT 0,
  filter_reason TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (document_id) REFERENCES knowledge_documents(document_id) ON DELETE CASCADE,
  UNIQUE(document_id, block_id, is_filtered)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_blocks_document_order
ON knowledge_blocks(document_id, is_filtered, sort_order);

CREATE INDEX IF NOT EXISTS idx_knowledge_blocks_block_id
ON knowledge_blocks(document_id, block_id);

-- 知识库候选条目。
-- 来源包括首轮提取、补充提取和补漏新增；当前实现可先用 source 记录 first/supplement/recovery。
CREATE TABLE IF NOT EXISTS knowledge_candidate_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  source TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES knowledge_documents(document_id) ON DELETE CASCADE,
  UNIQUE(document_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_candidate_items_document_order
ON knowledge_candidate_items(document_id, sort_order);

-- 知识库最终条目。
-- item_id 仍保持单文档内 K000001 形式；跨文档引用由服务层返回 documentId::itemId。
CREATE TABLE IF NOT EXISTS knowledge_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  resume TEXT NOT NULL,
  content TEXT NOT NULL,
  source_file TEXT,
  content_chars INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES knowledge_documents(document_id) ON DELETE CASCADE,
  UNIQUE(document_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_items_document_order
ON knowledge_items(document_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_knowledge_items_title
ON knowledge_items(title);

-- 最终条目引用的来源 block。
CREATE TABLE IF NOT EXISTS knowledge_item_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (document_id) REFERENCES knowledge_documents(document_id) ON DELETE CASCADE,
  UNIQUE(document_id, item_id, block_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_item_blocks_item_order
ON knowledge_item_blocks(document_id, item_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_knowledge_item_blocks_block
ON knowledge_item_blocks(document_id, block_id);

-- AI 舍弃和系统重试后舍弃的 block 组。
-- source: ai / system。
CREATE TABLE IF NOT EXISTS knowledge_discarded_groups (
  group_id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL,
  source TEXT NOT NULL,
  reason TEXT NOT NULL,
  block_ids_json TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (document_id) REFERENCES knowledge_documents(document_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_knowledge_discarded_document_order
ON knowledge_discarded_groups(document_id, source, sort_order);

-- 知识库分析报告。
CREATE TABLE IF NOT EXISTS knowledge_reports (
  document_id TEXT PRIMARY KEY,
  total_blocks INTEGER NOT NULL DEFAULT 0,
  filtered_blocks_count INTEGER NOT NULL DEFAULT 0,
  candidate_items_count INTEGER NOT NULL DEFAULT 0,
  final_items_count INTEGER NOT NULL DEFAULT 0,
  matched_blocks_count INTEGER NOT NULL DEFAULT 0,
  discarded_blocks_count INTEGER NOT NULL DEFAULT 0,
  system_discarded_after_retry_count INTEGER NOT NULL DEFAULT 0,
  new_items_from_recovery_count INTEGER NOT NULL DEFAULT 0,
  recovery_attempt_count INTEGER NOT NULL DEFAULT 0,
  batch_size INTEGER NOT NULL DEFAULT 20,
  coverage_rate REAL NOT NULL DEFAULT 0,
  matched_rate REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES knowledge_documents(document_id) ON DELETE CASCADE
);

-- 知识库文档处理步骤状态，用于失败后从可信断点重试。
CREATE TABLE IF NOT EXISTS knowledge_document_steps (
  document_id TEXT NOT NULL,
  step_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  result_json TEXT,
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (document_id, step_key),
  FOREIGN KEY (document_id) REFERENCES knowledge_documents(document_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_knowledge_document_steps_status
ON knowledge_document_steps(document_id, status);

-- 知识库段落匹配批次状态，用于只重试失败或缺失的批次。
CREATE TABLE IF NOT EXISTS knowledge_match_batches (
  document_id TEXT NOT NULL,
  batch_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  item_ids_json TEXT NOT NULL DEFAULT '[]',
  matches_json TEXT,
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (document_id, batch_index),
  FOREIGN KEY (document_id) REFERENCES knowledge_documents(document_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_knowledge_match_batches_status
ON knowledge_match_batches(document_id, status, batch_index);

-- ============================================================================
-- 导出模板 export_templates（v15 目标设计）
-- ============================================================================

-- 报告导出模板库。
-- config_json 保存完整 ExportFormatConfig；用于模板保存、查看和编辑。
CREATE TABLE IF NOT EXISTS export_templates (
  template_id TEXT PRIMARY KEY,
  template_name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_export_templates_updated
ON export_templates(updated_at DESC);

-- ============================================================================
-- 绿色报告 green_report_*（v24 目标设计）
-- ============================================================================

-- 绿色报告单例元数据。只保留一行 id = 1。
CREATE TABLE IF NOT EXISTS green_report_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  step TEXT NOT NULL DEFAULT 'company-info',
  report_type TEXT NOT NULL DEFAULT 'esg',
  project_info_json TEXT,
  target_words INTEGER NOT NULL DEFAULT 20000,
  page_count INTEGER NOT NULL DEFAULT 30,
  document_style TEXT NOT NULL DEFAULT 'standard',
  template_id TEXT,
  knowledge_context_json TEXT,
  outline_project_name TEXT,
  outline_project_overview TEXT,
  -- 报告编号自增顺序号，0 表示尚未生成；每次生成编号时递增
  report_seq INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS green_report_tasks (
  type TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  stats_json TEXT,
  error TEXT,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS green_report_outline_nodes (
  node_id TEXT PRIMARY KEY,
  parent_node_id TEXT,
  sort_order INTEGER NOT NULL,
  level INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (parent_node_id) REFERENCES green_report_outline_nodes(node_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_green_report_outline_parent_order
ON green_report_outline_nodes(parent_node_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_green_report_outline_level
ON green_report_outline_nodes(level);
