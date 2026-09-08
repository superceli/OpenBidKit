# 绿色报告封面合并功能实施方案

## Context

用户上传了一份精美封面 docx 模板（含 2 页：第一页尾封面、第二页正封面），每页含字段标签"委托单位：/报告编号：/编制日期：/编制单位："。当前绿色报告导出的 Word 只有正文，缺少正式封面。

需求：
1. 选择生成报告时把封面字段（委托单位、报告编号、编制日期、编制单位）回显到封面 docx 上
2. 报告编号随机生成唯一标识（结合市面 ESG 报告通用编号格式）
3. 把正封面插入到正文第一页之前，尾封面插入到正文最后一页之后

用户已确认决策：
- 合并方式：扩展 OpenXmlHelper（C#）新增 merge-documents 动作
- 模板管理：封面 docx 内置到 client/assets/ 应用资源
- 字段采集：扩展现有 CompanyInfoPage（企业信息步骤）增加封面字段输入框

## 整体架构

```
[CompanyInfoPage 表单]                    [内置封面模板 client/assets/green-report-cover.docx]
   ↓ saveProjectInfo                              ↓
[green_report_meta.project_info_json]      [首次启动 scan-template-fields 缓存 fields.json]
   ↓                                              ↓
[GreenReportHome.handleExportWord] ─────→ [export:word IPC]
                                                 ↓
                          [exportService.exportWord(payload)]
                                                 ↓
                    [buildDocxResult 生成正文 docx buffer] → 写临时 .docx
                                                 ↓
                    [openXmlHelperService.runJob('merge-documents', {
                         cover_template: 内置模板路径,
                         cover_fields: { 委托单位, 报告编号, 编制日期, 编制单位 },
                         body_doc: 临时正文路径,
                         output: 最终保存路径
                       })]
                                                 ↓
                          [OpenXmlHelper C# 执行：扫描字段 → 应用字段值 → 合并 cover1+正文+cover2]
                                                 ↓
                                       [最终 .docx 文件]
```

## 报告编号格式设计

结合市面 ESG/可持续发展报告通用惯例（GRI 报告、TCFD 报告、上市公司可持续发展报告），编号格式：

```
WTHB-ESG-YYYYMM-NNNN
```

- `WTHB`：用户原意前缀（蔚碳环保）
- `ESG`：报告类型标识（绿色报告通用，区别于投标报告）
- `YYYYMM`：年月（2026年9月 → 202609）
- `NNNN`：4 位顺序号，从 SQLite `green_report_meta` 新增 `report_seq` 列递增取值，确保本次运行唯一

例：`WTHB-ESG-202609-0001`

顺序号持久化在 `green_report_meta` 表，避免重复；用户也可在表单手动覆盖。

## 实施步骤（按依赖顺序）

### 步骤 1：内置封面模板到应用资源

**文件**：
- 新增 `client/assets/green-report-cover.docx`（用户上传的封面模板，重命名规范）
- 修改 `client/electron/utils/paths.cjs`：新增 `getGreenReportCoverTemplatePath()` 工具函数，返回打包后/开发模式下封面模板的绝对路径

**要点**：
- 开发模式：`client/assets/green-report-cover.docx`
- 打包后：`process.resourcesPath/assets/green-report-cover.docx`
- 复用现有 `getBundledOpenXmlHelperPath` 的解析模式

### 步骤 2：扩展 GreenProjectInfo 字段

**文件**：
- `client/src/features/green-report/types.ts` L19-L25：在 `GreenProjectInfo` 新增 4 字段
  - `clientUnit: string`（委托单位）
  - `compileUnit: string`（编制单位）
  - `compileDate: string`（编制日期，YYYY-MM-DD）
  - `reportCode: string`（报告编号，空字符串表示自动生成）
- `client/electron/services/greenReportStore.cjs` L129-L144 `loadState` 默认值同步新增 4 字段为空字符串

**要点**：
- 字段加在 `GreenProjectInfo` 而非新增 `coverInfo`，复用现有 `saveProjectInfo` 调用链，不动数据库 schema
- 字段存进 `project_info_json` JSON 字符串，无需新增 SQL 列

### 步骤 3：扩展 CompanyInfoPage 表单

**文件**：
- `client/src/features/green-report/pages/CompanyInfoPage.tsx` L113-L232：在现有表单底部新增"封面信息"区块，含 4 个输入框
  - 委托单位：text input
  - 编制单位：text input
  - 编制日期：date input，默认今天
  - 报告编号：text input + "自动生成"按钮，placeholder 显示 `WTHB-ESG-YYYYMM-NNNN`

**要点**：
- `handleFieldChange`（L35-L37）已支持 `keyof GreenProjectInfo`，新增字段自动通过
- "自动生成"按钮调用新增的 IPC `green-report:generate-report-code`（见步骤 5）
- 保存按钮不变，沿用 `onSaveProjectInfo`，把 4 个新字段一并存入 `project_info_json`

### 步骤 4：新增 report_seq 持久化报告编号顺序号

**文件**：
- `sql/workspace_schema.sql` L263-L278：`green_report_meta` 表新增列 `report_seq INTEGER DEFAULT 0`
- `client/electron/services/sqliteDatabase.cjs`：新增 migration（version +1），`ALTER TABLE green_report_meta ADD COLUMN report_seq INTEGER DEFAULT 0`
- `client/electron/services/greenReportStore.cjs`：新增 `generateReportCode()` 方法
  - 读取 meta 行的 `report_seq`，+1 后写回
  - 拼装 `WTHB-ESG-{YYYYMM}-{seq padded 4}` 返回

**要点**：
- migration 同步根目录 SQL 文件（AGENTS.md 硬约束）
- 报告编号生成是 Main 侧职责，不在 Renderer 生成（避免 Renderer 多次刷新重复）
- smoke 测试：`npm run smoke:electron-native`

### 步骤 5：暴露报告编号生成 IPC

**文件**：
- `client/electron/ipc/greenReportIpc.cjs`：新增 `green-report:generate-report-code` handler，调用 `greenReportStore.generateReportCode()`
- `client/electron/preload.cjs`：在 `window.lvcert.greenReport` 暴露 `generateReportCode()`
- `client/src/shared/types/ipc.ts`：补类型

**要点**：
- 复用既有 greenReport 命名空间，不新增 API 桶
- 只注册/转发，业务逻辑在 `greenReportStore.cjs`（AGENTS.md 约束）

### 步骤 6：C# 新增 merge-documents 动作

**文件**：
- 新增 `D:\develop\OpenBidKit\openxmlhelper\src\OpenXmlHelper\Jobs\MergeDocumentsAction.cs`
- 修改 `D:\develop\OpenBidKit\openxmlhelper\src\OpenXmlHelper\Jobs\JobRunner.cs` L41-L49：在 switch 增加 `MergeDocumentsAction.Name => MergeDocumentsAction.Execute(...)`

**MergeDocumentsAction 设计**：
- 输入 request.json：
  ```json
  {
    "action": "merge-documents",
    "cover_template": "relative/path/to/cover.docx",
    "cover_fields": {
      "委托单位": "...",
      "报告编号": "...",
      "编制日期": "...",
      "编制单位": "..."
    },
    "body_doc": "relative/path/to/body.docx",
    "output": "relative/path/to/output.docx"
  }
  ```
- 执行流程（复用现有能力）：
  1. 复制 cover_template 到 output 临时文件
  2. 用 `TemplateFieldScanner.Scan` 扫描封面字段候选
  3. 用 `TemplateFieldSdtWriter.Apply` 把 cover_fields 值应用到匹配的 after-label 候选（"委托单位："等）
  4. 用 `ExtractChaptersAction` 的 block 复制 + 样式映射 + section-break 转 page-break 能力，把 body docx 的所有 block 插入到 cover 第 1 页之后、第 2 页之前
  5. 校验 OpenXML，写 result.json

**要点**：
- 不重新发明合并逻辑，直接复用 `ExtractChaptersAction.cs` L91-L145 的克隆/样式映射代码（可提取为 internal static helper）
- 字段应用复用 `TemplateFieldSdtWriter.Apply`，不需新增 SDT 写入逻辑
- 关键风险：cover docx 含 7 个嵌入字体和 3.5MB 图片，合并时必须保留 main part 的 FontTablePart 和 image parts，不要做"只取 body"的简化合并
- 验证：`cd D:\develop\OpenBidKit\openxmlhelper\src\OpenXmlHelper; dotnet build` 然后 `dotnet run` 跑 ping

### 步骤 7：Node 侧 openXmlHelperService 暴露 merge 入口

**文件**：
- `client/electron/services/openXmlHelperService.cjs`：现有 `runJob(action, request)` 已通用，无需新增包装函数
- 在 exportService 中直接调用 `openXmlHelperService.runJob('merge-documents', { cover_template, cover_fields, body_doc, output })`

**要点**：
- runJob 已封装 job 目录创建、request.json 写入、信号等待、result.json 读取（L271-L349）
- 路径传 workspace 相对路径，由 C# 侧 `WordWorkspace.ResolveWorkspacePath` 解析

### 步骤 8：exportService 注入 openXmlHelperService 和模板路径

**文件**：
- `client/electron/ipc/index.cjs` L188-L221 `registerWorkspaceDatabaseServices`：在创建 `exportService` 时把 `openXmlHelperService`（来自外部作用域）和 `getGreenReportCoverTemplatePath` 注入
- `client/electron/services/exportService.cjs` L2392 `createExportService` 签名：`createExportService({ configStore, openXmlHelperService, getCoverTemplatePath })`

**要点**：
- openXmlHelperService 在 `registerIpcHandlers` 顶部已创建（L237），传给 exportService 即可
- 模板路径函数 `getGreenReportCoverTemplatePath(app)` 来自步骤 1 的 paths.cjs

### 步骤 9：exportWord 流程插入封面合并

**文件**：
- `client/electron/services/exportService.cjs` L2394-L2465 `exportWord` 主流程

**改造点**（在 `buildDocxResult` 之后、`fs.writeFileSync` 之前）：
1. 检查 `payload.cover_template === 'green-report'`（绿色报告专用标识）
2. 若是，把 `buildResult.buffer` 写到 workspace 临时文件 `body-<timestamp>.docx`
3. 调用 `openXmlHelperService.runJob('merge-documents', { cover_template: getCoverTemplatePath(), cover_fields: payload.cover_fields, body_doc: 临时路径, output: result.filePath })`
4. 删除临时 body docx
5. 进度回调：96% → "正在合并封面"，100% → "Word 已导出"
6. 失败时回退到直接写正文 buffer（降级策略，不阻塞导出）

**要点**：
- 仅在 payload 显式声明 `cover_template === 'green-report'` 时走合并流程，不影响其他导出（投标书等）
- 降级策略：合并失败时仍写出正文，并 `warnings.push('封面合并失败，已导出无封面版本')`
- 临时文件用 workspace 下的 `cover-jobs/` 子目录，复用 `getOpenXmlJobsDir`

### 步骤 10：GreenReportHome 构建新 payload

**文件**：
- `client/src/features/green-report/pages/GreenReportHome.tsx` L163-L188 `handleExportWord`

**改造点**：
- payload 新增 `cover_template: 'green-report'`
- payload 新增 `cover_fields: { 委托单位, 报告编号, 编制日期, 编制单位 }`，从 `projectInfo` 取值
- 若 `reportCode` 为空，先调 `window.lvcert.greenReport.generateReportCode()` 拿到编号再传

**要点**：
- 不破坏现有 payload 字段（project_name/outline/export_format）
- 编制日期默认今天，从 projectInfo 取（已在 CompanyInfoPage 表单填好）

### 步骤 11：编译发布流程

**文件**：
- `client/scripts/prepare-openxml-helper.cjs`：检查是否需要改动（若 C# 项目新增了文件，dotnet publish 自动包含，通常无需改）
- `client/package.json` 的 `build.files` 配置：确认 `assets/**/*` 被打包进 asar 外的资源目录

**要点**：
- 本地验证 C# 改动：`cd D:\develop\OpenBidKit\openxmlhelper\src\OpenXmlHelper; dotnet build; dotnet run -- ping`
- 完整发布验证：`cd client; npm run dist:win` 后检查 `release/win-unpacked/resources/assets/green-report-cover.docx` 存在

## 验证方案

### 1. C# 单元验证
```bash
cd D:\develop\OpenBidKit\openxmlhelper\src\OpenXmlHelper
dotnet build
# 手动构造 job 目录测试 merge-documents 动作
```

### 2. Node 侧语法验证
```bash
cd client
node --check electron/services/exportService.cjs
node --check electron/services/greenReportStore.cjs
node --check electron/ipc/greenReportIpc.cjs
node --check electron/utils/paths.cjs
node --check electron/preload.cjs
npm run build
```

### 3. SQLite migration 验证
```bash
cd client
npm run smoke:electron-native
```

### 4. 端到端验证
```bash
cd client
npm run dev
```
操作步骤：
1. 打开应用，进入"绿色报告"→"企业信息"
2. 填写委托单位、编制单位、点"自动生成"得到报告编号、编制日期默认今天
3. 保存信息，完成目录和正文生成
4. 在"正文生成"页点"导出 Word"
5. 选择保存路径，观察进度："正在合并封面" → "Word 已导出"
6. 打开导出的 .docx，确认：第一页是正封面（字段已回显）、中间是正文、最后一页是尾封面（字段已回显）
7. 验证报告编号唯一性：再次导出，编号应不同

### 5. 降级验证
- 故意把 `client/assets/green-report-cover.docx` 改名隐藏
- 导出 Word，应仍能成功（无封面版本），warnings 提示"封面合并失败"

## 关键风险与对策

| 风险 | 对策 |
|---|---|
| 封面 docx 含嵌入字体/大图片，合并后文件膨胀或字体丢失 | C# 合并时保留 main part 的 FontTablePart/ImagePart，不做简化合并；测试时检查合并后文件大小 |
| 跨文档样式冲突（正文样式覆盖封面样式） | 复用 ExtractChaptersAction L419-L520 的样式映射/编号重映射逻辑 |
| section-break 处理不当导致封面分页错乱 | 复用 ExtractChaptersAction L291-L339 的 section-break 转 page-break 逻辑 |
| OpenXmlHelper 进程崩溃导致导出卡死 | runJob 已有超时和异常处理；exportService 增加降级路径 |
| 报告编号并发冲突 | report_seq 在 SQLite 单行更新，事务保证原子性 |
| 用户手动改了报告编号后下次自动生成重复 | generateReportCode 不检查用户输入，只保证自动生成的递增唯一；用户手动输入由用户负责 |

## 涉及文件清单

**C# 新增**：
- `D:\develop\OpenBidKit\openxmlhelper\src\OpenXmlHelper\Jobs\MergeDocumentsAction.cs`

**C# 修改**：
- `D:\develop\OpenBidKit\openxmlhelper\src\OpenXmlHelper\Jobs\JobRunner.cs`（switch 增加分支）
- `D:\develop\OpenBidKit\openxmlhelper\src\OpenXmlHelper\Jobs\ExtractChaptersAction.cs`（提取 block 复制逻辑为 internal helper 供复用）

**资源新增**：
- `client/assets/green-report-cover.docx`

**Node 侧修改**：
- `client/electron/utils/paths.cjs`（新增 getGreenReportCoverTemplatePath）
- `client/electron/services/greenReportStore.cjs`（loadState 默认值、generateReportCode）
- `client/electron/services/sqliteDatabase.cjs`（migration）
- `client/electron/services/exportService.cjs`（exportWord 合并流程、createExportService 签名）
- `client/electron/ipc/index.cjs`（注入 openXmlHelperService 到 exportService）
- `client/electron/ipc/greenReportIpc.cjs`（新增 generate-report-code IPC）
- `client/electron/preload.cjs`（暴露 generateReportCode）

**SQL 修改**：
- `sql/workspace_schema.sql`（green_report_meta 新增 report_seq 列）

**前端修改**：
- `client/src/features/green-report/types.ts`（GreenProjectInfo 扩展 4 字段）
- `client/src/features/green-report/pages/CompanyInfoPage.tsx`（新增封面信息表单区块）
- `client/src/features/green-report/pages/GreenReportHome.tsx`（handleExportWord 构建新 payload）
- `client/src/shared/types/ipc.ts`（GreenReport API 类型补全）

**配置修改**：
- `client/package.json` 的 `build.files` 确认 assets 打包配置
