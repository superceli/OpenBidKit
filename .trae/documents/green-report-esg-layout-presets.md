# 绿色报告 ESG 版式预设接入

## Context（为什么做）

绿色报告的 Word 导出当前 [GreenReportHome.tsx#L160-L164](file:///d:/develop/OpenBidKit/client/src/features/green-report/pages/GreenReportHome.tsx#L160-L164) 只传 `project_name`、`outline`、`pageSetup`，**没有传 `export_format`**，所以走的是 `exportService` 的标书默认值：`第{zh}章 / 第{zh}节` 中文编号 + 可选章节页框——不符合 ESG 报告惯例（应为纯数字多级 `1.1.1`、无章节框）。

后端 `exportService.cjs` 本身已完整支持 `ExportFormatConfig`（标书在用，[ExportFormatPage.tsx#L569-L574](file:///d:/develop/OpenBidKit/client/src/features/export-format/pages/ExportFormatPage.tsx#L569-L574) 传 `export_format: config`），所以接入只是把一份 ESG 合适的 `ExportFormatConfig` 透传过去，不碰后端逻辑。

用户已确认：3 个 ESG 预设（标准 / 数据密集 / 简洁），写成代码常量、不接入 templateStore、不可在绿色报告里改细节；默认选「标准 ESG」。

## 方案

新增 3 个 `ExportFormatConfig` 常量 + 绿色报告配置页加「导出版式」下拉 + 导出时把选中预设作为 `export_format` 透传给 `exportWord`。`layoutPreset` 字段像 `documentStyle` 一样在 `green_report_meta` 表里持久化。

### 1. 新增预设常量文件

新建 `client/src/features/green-report/greenReportLayoutPresets.ts`：
- 导出 `GreenLayoutPreset = 'esg-standard' | 'esg-data' | 'esg-clean'`
- 导出 `GREEN_LAYOUT_PRESET_LABELS`（中文名 + 一句话描述）
- 导出 `GREEN_LAYOUT_PRESET_CONFIGS: Record<GreenLayoutPreset, ExportFormatConfig>`，三份配置均：
  - `heading_border.enabled = false`（无章节页框）
  - 全部 6 级标题 `numbering_format: 'outline-decimal'`（纯数字 1.1.1）
  - `page.paper_size = 'a4'`、`orientation = 'portrait'`、页边距 2cm
- 三份差异：
  - **esg-standard**：黑体标题（L1 小二居中、L2 四号、L3-6 小四）、宋体小四正文 1.5 倍行距、表头浅蓝 `#eef5ff`、页眉页脚页码开
  - **esg-data**：表格更紧（`cell_padding_pt: 4`、表头/单元格字号小五）、图片 95% 宽、正文 1.2 倍行距
  - **esg-clean**：思源黑体标题、微软雅黑正文、无页眉、表格无表头底色（白色）、阅读轻松
- 默认导出 `DEFAULT_GREEN_LAYOUT_PRESET = 'esg-standard'`
- 复用 [exportFormat.ts](file:///d:/develop/OpenBidKit/client/src/shared/types/exportFormat.ts) 的 `DEFAULT_EXPORT_FORMAT` 作为基础再覆盖，避免手写整份配置

### 2. 状态类型 + 默认值

[types.ts](file:///d:/develop/OpenBidKit/client/src/features/green-report/types.ts)：
- `GreenReportState` 加 `layoutPreset: GreenLayoutPreset`
- `DEFAULT_GREEN_REPORT_CONFIG` 加 `layoutPreset: DEFAULT_GREEN_LAYOUT_PRESET`

### 3. 配置页 UI

[ReportConfigPage.tsx](file:///d:/develop/OpenBidKit/client/src/features/green-report/pages/ReportConfigPage.tsx)：
- props 加 `draftLayoutPreset` + `onDraftLayoutPresetChange`
- 在「文档样式」和「目标字数」之间加「导出版式」字段，用现有 `green-report-style-grid` 卡片样式（和文档样式一致，3 张卡：标准 ESG / 数据密集 ESG / 简洁 ESG），保持 UI 风格统一

[GreenReportHome.tsx](file:///d:/develop/OpenBidKit/client/src/features/green-report/pages/GreenReportHome.tsx)：
- 加 `draftLayoutPreset` state（同 `draftPageCount` 等模式，从 `state.layoutPreset` 初始化）
- `handleSaveConfig` 的 patch 加 `layoutPreset`
- `ReportConfigPage` 传新 props

### 4. 导出调用透传

[GreenReportHome.tsx#L160-L164](file:///d:/develop/OpenBidKit/client/src/features/green-report/pages/GreenReportHome.tsx#L160-L164) `handleExportWord`：
- 从 `GREEN_LAYOUT_PRESET_CONFIGS[state.layoutPreset ?? DEFAULT_GREEN_LAYOUT_PRESET]` 取配置
- `exportWord` payload 加 `export_format: config`（和标书 [ExportFormatPage.tsx#L573](file:///d:/develop/OpenBidKit/client/src/features/export-format/pages/ExportFormatPage.tsx#L573) 同字段名）
- 移除 `pageSetup`（已含在 `export_format.page` 里，避免重复/冲突）

### 5. 持久化（Main 侧 + Schema）

[greenReportStore.cjs](file:///d:/develop/OpenBidKit/client/electron/services/greenReportStore.cjs)：
- `green_report_meta` INSERT（L159）加 `layout_preset` 列
- `loadState` 映射（L26-28 附近）加 `layoutPreset: row.layout_preset || 'esg-standard'`
- `saveReportConfig`（L195-199）解构加 `layoutPreset`，赋值 `fields.layout_preset`
- `applyPartial`（L268-270）加 `if (hasOwn(partial, 'layoutPreset')) metaPatch.layout_preset = partial.layoutPreset`

[sql/workspace_schema.sql](file:///d:/develop/OpenBidKit/sql/workspace_schema.sql)（AGENTS.md 要求同步）：
- `green_report_meta` 表加 `layout_preset TEXT DEFAULT 'esg-standard'`
- 加对应 migration（看现有 migration 编号续号）

## 验证

1. `cd client; node --check electron/services/greenReportStore.cjs`
2. `cd client; npm run build`（验证 TS 通过）
3. `npm run dev`，打开绿色报告：
   - 报告配置页能看到 3 张版式卡片，默认选「标准 ESG」
   - 切到「数据密集 ESG」→ 保存配置 → 重启应用 → 仍然是「数据密集 ESG」（验证持久化）
   - 生成目录 + 正文后导出 Word → 打开文档确认：
     - 标题是 `1`、`1.1`、`1.1.1`（不是「第一章」）
     - 无章节页框
     - 标准 ESG：表头浅蓝底；数据密集：表格字号更小；简洁：无页眉
4. 确认没破坏标书导出（共用 `exportService`，不应受影响，但跑一次标书导出兜底）
