# 绿色报告 AI 联网查询 + 预估填充

## Context（背景）

绿色报告生成当前依赖知识库检索 + 系统提示词中的「无资料时留 `[XX]` 占位符供后续填写」策略。但用户实际使用中往往不在知识库建企业资料，导致 AI 生成正文出现大量 `[XX]吨`、`[XX]%` 占位符，影响报告可用性。

本次改造目标：
1. **联网查询**：知识库无该企业资料时，让 AI 自主联网查询企业基本信息（不留 `[XX]`）
2. **预估兜底**：联网也查不到时，让 AI 基于行业经验给一个合理预估数值并明确标注「（估算）」，不再留占位符
3. **优先级**：知识库资料 > 联网搜索结果 > AI 行业经验预估
4. **用户可控**：在设置页加「启用联网搜索」开关（默认开），关闭时直接走预估策略

## 设计要点

### 联网字段注入策略（最小化 + 失败降级）

国内常见 OpenAI 兼容供应商字段差异较大：
- 智谱 BigModel：`tools: [{"type":"web_search","web_search":{"enable":true}}]`
- 通义 DashScope：顶层 `enable_search: true`
- DeepSeek / OpenAI 官方：不支持，会 400 拒绝未知参数

**策略**：单次请求同时注入两个字段，让上游自取所需，互不冲突；不支持的服务会 400，由统一的「失败降级重试」兜底——仿照现有 `response_format` 不支持时的降级模板（[aiService.cjs#L1391-L1397](file:///d:/develop/OpenBidKit/client/electron/services/aiService.cjs#L1391-L1397)）实现镜像逻辑。

### 失败降级机制

- 新增 `isWebSearchUnsupported(message)` 识别器，镜像 [isResponseFormatUnsupported](file:///d:/develop/OpenBidKit/client/electron/services/aiService.cjs#L80-L90) 实现
- 在 [aiHttpError.cjs#L69-L73](file:///d:/develop/OpenBidKit/client/electron/utils/aiHttpError.cjs#L69-L73) 扩展透传 `webSearchUnsupportedChecker`，叠加到 `error.webSearchUnsupported` 属性
- 在 [chatWithConfig](file:///d:/develop/OpenBidKit/client/electron/services/aiService.cjs#L1351-L1430) 的 catch 内增加双标志持久化降级：`webSearchOmitted` + `responseFormatOmitted`，避免「先剥 web_search 后剥 response_format」时把已剥字段重新加回
- 降级成功后通过 `preparedRequest.onWebSearchDowngrade()` 回调通知任务层（透传 `request` 对象即可，无需改 `chat`/`requestJson` 函数签名）

## 实施步骤

按「叶子节点先改、入口后改」顺序，便于增量 `npm run build` 验证。

### Step 1：配置类型与存储层（无依赖）

**1.1 [config.ts](file:///d:/develop/OpenBidKit/client/src/shared/types/config.ts#L5-L16)**
- `TextModelConfig` 接口新增 `web_search_enabled: boolean;`

**1.2 [configStore.cjs](file:///d:/develop/OpenBidKit/client/electron/services/configStore.cjs)**
- 新增 helper `normalizeWebSearchEnabled(value, fallback)`，镜像 [normalizeTextMultimodalEnabled](file:///d:/develop/OpenBidKit/client/electron/services/configStore.cjs#L338-L341)（L338-L341）
- [defaultTextModelProfiles](file:///d:/develop/OpenBidKit/client/electron/services/configStore.cjs#L35-L95)（L35-L95）每个 provider 加 `web_search_enabled: true`
- [defaultConfig](file:///d:/develop/OpenBidKit/client/electron/services/configStore.cjs#L250-L287) 顶层加 `web_search_enabled: true`
- [normalizeTextModelProfile](file:///d:/develop/OpenBidKit/client/electron/services/configStore.cjs#L382-L399)（L382-L399）加 `web_search_enabled: normalizeWebSearchEnabled(source.web_search_enabled, defaults.web_search_enabled)`
- [textProfileFromFlatConfig](file:///d:/develop/OpenBidKit/client/electron/services/configStore.cjs#L413-L428)（L413-L428）加同上
- [textProfileFromUnknownProvider](file:///d:/develop/OpenBidKit/client/electron/services/configStore.cjs#L449-L464)（附近）加同上
- [normalizeConfig](file:///d:/develop/OpenBidKit/client/electron/services/configStore.cjs#L715-L748) return 里加 `web_search_enabled: activeTextProfile.web_search_enabled`

验证：`cd client; npm run build`

### Step 2：设置页 UI（依赖 Step 1）

**[SettingsPage.tsx](file:///d:/develop/OpenBidKit/client/src/features/settings/pages/SettingsPage.tsx)**
- [textProviderDefaults](file:///d:/develop/OpenBidKit/client/src/features/settings/pages/SettingsPage.tsx#L85-L91)（L85-L91）每个 provider 加 `web_search_enabled: true`
- [normalizeTextModelProfile](file:///d:/develop/OpenBidKit/client/src/features/settings/pages/SettingsPage.tsx#L145-L160)（L145-L160）加 `web_search_enabled: profile?.web_search_enabled ?? defaults.web_search_enabled`
- [textProfileFromState](file:///d:/develop/OpenBidKit/client/src/features/settings/pages/SettingsPage.tsx#L171-L184)（L171-L184）加 `web_search_enabled: textModel.web_search_enabled`
- [createClientConfig](file:///d:/develop/OpenBidKit/client/src/features/settings/pages/SettingsPage.tsx#L743-L770)（L743-L770）return 里加 `web_search_enabled: activeTextProfile.web_search_enabled`
- 在 [multimodal_enabled 开关 JSX](file:///d:/develop/OpenBidKit/client/src/features/settings/pages/SettingsPage.tsx#L1813-L1822)（L1813-L1822）之后新增一个 `settings-row`：
  - 标题「启用联网搜索」
  - 描述「开启后 AI 在生成正文时会尝试联网查询企业资料；模型不支持时自动降级为行业经验预估」
  - `<AppSwitch checked={state.textModel.web_search_enabled} onCheckedChange={(checked) => updateTextModelConfig({ web_search_enabled: checked })} />`

**[settings/types.ts](file:///d:/develop/OpenBidKit/client/src/features/settings/types.ts#L3-L8)**：无需改（`SettingsPageState.textModel` 是 `Omit<TextModelConfig, ...> & {...}`，自动继承新字段）

验证：`cd client; npm run build`

### Step 3：AI 请求层（依赖 Step 1）

**3.1 [aiHttpError.cjs](file:///d:/develop/OpenBidKit/client/electron/utils/aiHttpError.cjs#L69-L73)**（L69-L73）
- 在 `responseFormatUnsupported` 生成逻辑旁，新增 `webSearchUnsupportedChecker` 调用，叠加到 `error.webSearchUnsupported`

**3.2 [aiService.cjs](file:///d:/develop/OpenBidKit/client/electron/services/aiService.cjs)**
- 新增 `isWebSearchUnsupported(message)` 函数，镜像 [isResponseFormatUnsupported](file:///d:/develop/OpenBidKit/client/electron/services/aiService.cjs#L80-L90)（L80-L90）
  - 命中 token：`['web_search', 'enable_search', 'web search', 'tool', 'function', 'tools']`
  - 命中 marker：`['not supported', 'does not support', 'unsupported', 'unknown parameter', 'invalid parameter', 'unrecognized', 'must be', 'no such']`
- [createChatRequestBody](file:///d:/develop/OpenBidKit/client/electron/services/aiService.cjs#L869-L893)（L869-L893）：
  - options 新增 `omitWebSearch`（与 `omitResponseFormat` 同级）
  - 在 `response_format` 块之后追加：`if (config.web_search_enabled && !options.omitWebSearch) { body.tools = [{ type: 'web_search' }]; body.enable_search = true; }`
- [ensureTextAiResponseOk](file:///d:/develop/OpenBidKit/client/electron/services/aiService.cjs#L948-L957)（L948-L957）：在 `createAiHttpErrorFromResponse` 的 options 里增加 `webSearchUnsupportedChecker: isWebSearchUnsupported`
- [chatWithConfig](file:///d:/develop/OpenBidKit/client/electron/services/aiService.cjs#L1351-L1430)（L1351-L1430）：
  - 闭包外引入 `let webSearchOmitted = false; let responseFormatOmitted = false; let webSearchDowngraded = false;`
  - catch 内计算两个 strip 决策：`stripWebSearch = !webSearchOmitted && error.webSearchUnsupported`；`stripResponseFormat = !responseFormatOmitted && preparedRequest.response_format && error.responseFormatUnsupported`
  - 任一为 true → 置位对应标志，重建 `requestBody = createChatRequestBody(config, preparedRequest, { omitWebSearch: webSearchOmitted, omitResponseFormat: responseFormatOmitted, stream: requestMode === 'stream' })`，再调一次 `requestTextAi`
  - `runWithAiRetry` 成功返回后：`if (webSearchDowngraded && typeof preparedRequest.onWebSearchDowngrade === 'function') { try { preparedRequest.onWebSearchDowngrade(); } catch {} }`
- [service 对象](file:///d:/develop/OpenBidKit/client/electron/services/aiService.cjs#L2436-L2507)（L2436-L2507）新增方法：`isWebSearchEnabled() { return Boolean(configStore.load().web_search_enabled); }`

验证：`node --check client\electron\services\aiService.cjs` + `node --check client\electron\utils\aiHttpError.cjs`

### Step 4：Prompt 层（无依赖）

**[greenReportPrompts.cjs](file:///d:/develop/OpenBidKit/client/electron/services/greenReportPrompts.cjs#L159-L197) — [buildContentSystemPrompt](file:///d:/develop/OpenBidKit/client/electron/services/greenReportPrompts.cjs#L159-L197)（L159-L197）**

把第 3 条「信息来源策略」（L167-L171）整体替换为：

```
3. 信息来源策略（重要）：
   - 优先级：知识库资料 > 模型联网查询结果 > AI 行业经验预估
   - 若提供了知识库资料，必须优先引用其中的真实数据、案例和表述，不得编造与资料冲突的内容
   - 若知识库无相关数据且已启用联网搜索，调用联网工具核实企业基本信息（工商信息、行业地位、规模量级等），引用查询结果
   - 若知识库与联网均无该数据，基于行业经验给出合理预估数值写入正文，并在数值后明确标注「（估算）」或「（参考行业平均水平，估算）」字样
   - 严禁使用 [XX]、[待填] 等占位符
   - 严禁编造精确到个位数的具体数字伪装成真实数据；估算值应给出量级（如「约 5000 吨（估算）」）而非虚假精确值
```

第 7 条「即使没有具体数据，也要写出框架...」保留，去掉「占位符」字样改为「估算值」。

验证：`node --check client\electron\services\greenReportPrompts.cjs`

### Step 5：任务层（依赖 Step 3、4）

**[greenReportTasks.cjs](file:///d:/develop/OpenBidKit/client/electron/services/greenReportTasks.cjs)**

**5.1 [runGreenReportOutlineTask](file:///d:/develop/OpenBidKit/client/electron/services/greenReportTasks.cjs#L52-L114)（L52-L114）**
- L78 文案改为读 `aiService.isWebSearchEnabled()` 判断：
  - 开启：`'未检索到知识库资料，AI 将联网查询企业资料'`
  - 关闭：保留原 `'未检索到知识库资料，将基于通用模板生成'`
- 目录任务不传 `onWebSearchDowngrade`（目录是结构，无需特别提示）

**5.2 [runGreenReportContentTask](file:///d:/develop/OpenBidKit/client/electron/services/greenReportTasks.cjs#L116-L200)（L116-L200）**
- L148-150 文案改为读 `aiService.isWebSearchEnabled()`：
  - 开启：`'未检索到知识库资料，AI 将联网查询企业资料'`
  - 关闭：`'未检索到知识库资料，将基于行业经验预估生成内容'`
- 任务级引入 `let webSearchDowngradePublished = false;`
- 在 `aiService.chat` 的 request 里加 `onWebSearchDowngrade: () => { if (!webSearchDowngradePublished) { webSearchDowngradePublished = true; publish('联网查询失败，将基于行业经验预估生成内容', 当前completed/total比例); } }`
- 进度值取当前 `Math.round((completed / total) * 100)`，不回退进度，只追加日志

验证：`node --check client\electron\services\greenReportTasks.cjs`

## 验证清单（端到端）

- [ ] `cd client; npm run build`（tsc --noEmit + vite build）退出码 0
- [ ] `node --check client\electron\services\aiService.cjs`
- [ ] `node --check client\electron\services\greenReportTasks.cjs`
- [ ] `node --check client\electron\services\greenReportPrompts.cjs`
- [ ] `node --check client\electron\services\configStore.cjs`
- [ ] `node --check client\electron\utils\aiHttpError.cjs`
- [ ] `npm run dev` 启动，设置页确认「启用联网搜索」开关存在且默认开
- [ ] 切换开关，保存，检查 `userData/user_config.json` 含 `web_search_enabled`
- [ ] 跑一次绿色报告正文生成，进度日志出现「AI 将联网查询企业资料」
- [ ] 配置一个不支持 web_search 的模型（如 DeepSeek），正文生成时进度日志出现「联网查询失败，将基于行业经验预估生成内容」且不阻塞
- [ ] 检查 AI 日志（开发者面板），首次请求 body 含 `tools`/`enable_search`，降级后请求 body 不含
- [ ] 生成正文无 `[XX]`/`[待填]` 占位符，无数据处带「（估算）」标注

## 关键文件清单

按修改优先级排序：

1. [aiService.cjs](file:///d:/develop/OpenBidKit/client/electron/services/aiService.cjs) — 注入 + 降级重试 + 回调透传 + `isWebSearchEnabled`（改动最集中）
2. [configStore.cjs](file:///d:/develop/OpenBidKit/client/electron/services/configStore.cjs) — 默认值 + 多处 normalize 贯通 `web_search_enabled`
3. [greenReportPrompts.cjs](file:///d:/develop/OpenBidKit/client/electron/services/greenReportPrompts.cjs) — `buildContentSystemPrompt` 信息来源策略重写
4. [greenReportTasks.cjs](file:///d:/develop/OpenBidKit/client/electron/services/greenReportTasks.cjs) — publish 文案 + `onWebSearchDowngrade` 透传
5. [SettingsPage.tsx](file:///d:/develop/OpenBidKit/client/src/features/settings/pages/SettingsPage.tsx) — UI 开关 + 默认值/normalize/profileFromState/createClientConfig
6. [config.ts](file:///d:/develop/OpenBidKit/client/src/shared/types/config.ts) — `TextModelConfig` 加字段
7. [aiHttpError.cjs](file:///d:/develop/OpenBidKit/client/electron/utils/aiHttpError.cjs) — 扩展 `webSearchUnsupportedChecker` 透传

## 复用的现有模式

- 镜像 [isResponseFormatUnsupported](file:///d:/develop/OpenBidKit/client/electron/services/aiService.cjs#L80-L90) 实现 `isWebSearchUnsupported`（同 token+marker 模板）
- 镜像 [response_format 降级重试](file:///d:/develop/OpenBidKit/client/electron/services/aiService.cjs#L1391-L1397)（L1391-L1397）实现 web_search 降级
- 镜像 [normalizeTextMultimodalEnabled](file:///d:/develop/OpenBidKit/client/electron/services/configStore.cjs#L338-L341) 实现 `normalizeWebSearchEnabled`
- 镜像 [multimodal_enabled 开关 JSX](file:///d:/develop/OpenBidKit/client/src/features/settings/pages/SettingsPage.tsx#L1813-L1822)（L1813-L1822）实现「启用联网搜索」开关
- 复用 [AppSwitch](file:///d:/develop/OpenBidKit/client/src/features/settings/pages/SettingsPage.tsx) + `settings-action-cell` 布局
- 复用 [updateTextModelConfig](file:///d:/develop/OpenBidKit/client/src/features/settings/pages/SettingsPage.tsx#L950-L968)（已是通用 `Partial<Omit<...,'provider'>>` 合并，自动支持新字段）
- 复用 [publish](file:///d:/develop/OpenBidKit/client/electron/services/greenReportTasks.cjs#L66-L71) 进度发布函数（已有去重逻辑）

## 风险与权衡

1. **每章都 400 一次**：当前降级是 per-request。30 章报告会对不支持模型产生 30 次 400。符合用户「重试一次，不阻塞流程」确认。后续优化可在 `aiService` 加 `Map<model_name, boolean>` 缓存「该模型已确认不支持」——本期不做。
2. **`enable_search` 被严格 OpenAI 兼容服务拒绝**：OpenAI 官方端点会 400，由降级兜底。可接受。
3. **`response_format` 与 `tools` 同时被拒**：双标志持久化设计已覆盖，不会出现「剥了又加回」。
4. **目录任务也注入 web_search**：`requestJson` 走 `chatWithConfig`，会带 `tools`/`enable_search`。目录是 JSON 结构任务，模型基本不调用工具，但严格服务可能因 `tools` 与 `response_format: json_object` 冲突 400，由降级兜底。本期不做特殊处理。
5. **回调时机**：`onWebSearchDowngrade` 在 `runWithAiRetry` 成功返回后调用，确保只在「降级后成功」时通知任务；若最终失败（throw），回调不触发，任务 catch 兜底。
