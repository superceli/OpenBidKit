# 绿色报告封面后插入三个前置页面

## Context

当前绿色报告导出 Word 的流程：封面 → 正文 → 尾页。用户需要在封面和正文之间插入三个页面：
1. **编制说明页**：正式声明文本（报告范围、编制依据、编制方法、报告期等）
2. **目录页**：根据正文 outline 自动生成目录，页码用 Word TOC 域
3. **第三方编制信息及签章页**：含委托单位/编制单位/报告编号/编制日期等字段回显 + 签字盖章表格

用户决策：三页用**代码生成**（不用模板文件）；目录页码用 **Word TOC 域自动生成**（用户打开后 F9 更新）。

## 技术选型：在 C# MergeDocumentsAction 中直接生成

在现有 `merge-documents` 任务里直接生成前置三页内容，不引入第二个临时 docx。理由：
- 复用现有 section/sectPr 处理逻辑
- TOC 域是 OpenXml 原生结构，OpenXml SDK 直接支持
- 业务文案归 Node（组装数据），渲染归 C#（生成 OpenXml 元素）

## 数据流

```
GreenReportHome.tsx → cover_fields + 新增 reporting_period/report_scope/company_name
  ↓
exportService.cjs: buildGreenReportFrontMatter(payload) → frontMatter 对象
  ↓
openXmlHelperService.runJob({ action: 'merge-documents', request: { ..., frontMatter } })
  ↓
MergeDocumentsAction.Execute(): 封面 → 编制说明 → 目录 → 正文 → 签章页 → 尾页
```

## 文件修改清单

### 1. MergeDocumentsAction.cs（核心改动）

**新增 request 模型**：
- `FrontMatterRequest`：CompilationNotes, Toc, SigningPage
- `FrontMatterPage`：Title, Paragraphs[]
- `FrontMatterParagraph`：Label, Value
- `TocPageRequest`：Title, Instruction, Placeholder
- `SigningPageRequest`：Title, InfoRows[], SignatureRows[]
- `SigningInfoRow`：Label, Value
- `SigningSignatureRow`：Label, DateLabel

**新增方法**：
- `BuildFrontMatterBlocks(FrontMatterRequest)` → 三个页面的段落/表格 + 分页符
- `BuildCompilationNotesPage` → 标题(居中加粗小二) + 正文段落(宋体小四首行缩进480)
- `BuildTocPage` → 标题 + TOC域(begin/instrText/separate/placeholder/end) + 分页符
- `BuildSigningPage` → 标题 + 信息表(2列) + 签章表(3列,行高≥2000twips) + 分页符
- `MakeRun(text, font, sizeHalfPt, bold)` → 工厂方法
- `MakePageBreakParagraph()` → 分页符段落

**修改 Execute**：封面 sectPr 插入后，插入前置页 blocks，再接正文。`FrontMatter` 为 null 时跳过（向后兼容）。

### 2. exportService.cjs（Node 组装前置页数据）

**新增** `buildGreenReportFrontMatter(payload)`：
- 编制说明：报告范围(reportScope) + 编制依据(按报告类型选标准) + 编制方法 + 报告期(reportingPeriod)
- 目录：标题"目录"，TOC instruction ` TOC \o '1-3' \h \z \u `
- 签章页：从 coverFields 取委托单位/编制单位/报告编号/编制日期/报告类型 + 固定签章行

**修改 exportWord**：调用 buildGreenReportFrontMatter，传给 runJob 的 request 增加 frontMatter 字段。

### 3. GreenReportHome.tsx（前端传参）

handleExportWord payload 新增：reporting_period, report_scope, company_name（从 state.projectInfo 取）。

## 关键实现细节

- **前置页标题不用 Heading 样式**：避免被 TOC 域拾取
- **TOC 域五段式**：begin → instrText → separate → placeholder → end（最稳）
- **RunFonts 双字体**：EastAsia=宋体, Ascii=Times New Roman
- **section 策略**：前置三页放入正文 section（共享 1440 边距），用分页符分隔
- **向后兼容**：FrontMatter 可空，未传时行为不变

## 验证

1. `cd openxmlhelper/src/OpenXmlHelper; dotnet build`
2. `cd client; node --check electron/services/exportService.cjs`
3. `cd client; npm run build`
4. `cd client; npm run dev` → 导出 Word，验证：
   - 封面后是编制说明页
   - 目录页显示"按 F9 更新目录"占位符，F9 后自动填充
   - 签章页表格字段正确回显，有盖章空间
   - 前置页后正文从新页开始
   - 尾页正常显示
5. 回归：非 green-report 的 cover_template 导出不受影响
