# 设计决定记录

每做出一个具体的设计决定，在最上面加一条。已记录的决定直接沿用，不重新讨论。推翻旧决定时，新增一条并写明替代了哪一条，不要直接改旧条目。

条目格式：

```
## YYYY-MM-DD · 标题

- 决定：做了什么选择（具体值）。
- 理由：为什么，对应概念里的哪一句。
- 影响：涉及哪些页面、组件或 token。
- 依据：看过的参考、截图、自检记录（只写实际看过的）。
- 状态：试验 / 定稿 / 已被替代（替代者：…）
```

---

## 2026-11-02 · 共享动效选项与示例集合分组保留语言切换焦点

- 决定：Settings 使用原偏好 ID 作动效选项 key；浏览器 Memory 的五个固定顺序分组以固定位置作 key，均不依赖翻译标题。
- 理由：分别先复现两处语言切换重建按钮/丢失焦点。只有 key 与偏好 ID 的呈现传递变化，动效值、导航和数据行为不变。
- 依据：两阶段失败、21项定向、12组合成浏览器与完整前端回归，见 `validation/UI-v2-shared-language-focus-2026-11-02.md`。
- 状态：定稿

## 2026-11-02 · 历史批次请求说明保留原句柄并翻译标签

- 决定：批次请求、输出上限/草稿、估算、调用哈希与发送/恢复按钮接入三语；正文、模型、目标、哈希与原数值保留。
- 边界：语言切换不取得确认权限、不准备或发送；原句柄/批次归属与过期/漂移撤回规则不变。准备可保存本地 Context，发送仍单独检查。
- 依据：`history-batch-request` 38项及完整前端回归，见 `validation/UI-v2-native-history-request-copy-2026-11-02.md`。
- 状态：定稿

## 2026-11-02 · 历史规划与任务表单翻译保留只读/本地边界

- 决定：规划范围、有限引用/未知状态、导出选择与本地任务表单的数量/顺序/额度接入三语；观察提交保持独立等宽节点，原哈希、引用和数值不变。
- 边界：规划不创建模型任务或批准记忆；创建本地任务与模型调用分开。语言切换保留已展开引用、输入/精确费用、模型和焦点，不重新规划、读取模型或提交。
- 依据：规划33项、表单15项及完整前端回归，见 `validation/UI-v2-native-history-plan-copy-2026-11-02.md`。
- 状态：定稿

## 2026-11-02 · 保存历史批次结果的标签与恢复说明接入三语

- 决定：翻译结果/进度、原建议/候选、来源/时间与模糊回执的说明；原建议、引文、所选文本、ID、技术分类与时间戳原样保留。
- 边界：同一预览切换语言不重置原确认勾选或取得新的提交权限，不触发读取、应用或暂停。刷新与生命周期变化仍按原协议撤回旧确认。
- 依据：`history-results` 38项与完整前端回归，见 `validation/UI-v2-native-history-result-copy-2026-11-02.md`。
- 状态：定稿

## 2026-11-02 · 历史任务观察标签随界面语言显示

- 决定：翻译保存任务定义/版本、批次顺序、额度单位和本地任务创建情况；ID、模型、状态码、micro USD 数值及原保存顺序不变。
- 边界：本地任务已存在不表示已调用模型或批准记忆；语言切换保留原任务会话链接与焦点，不重新读取或创建任务。
- 依据：`history-task-navigation` 16项及完整前端回归，见 `validation/UI-v2-native-history-task-copy-2026-11-02.md`。字体/样式及后端均未改。
- 状态：定稿

## 2026-11-02 · Memory 左侧分组用稳定集合 ID 保留焦点

- 决定：导航分组不使用翻译后的标题作 React key，使用静态非空分组的首个集合 ID；文字与可访问名称照常翻译。
- 理由：原 key 在语言切换时重建按钮，造成焦点丢失。只改一个 key，保留集合、按钮行为、来源与读取归属。
- 依据：先复现失败，再通过16项定向、12组合成浏览器及完整前端回归，见 `validation/UI-v2-native-memory-nav-focus-2026-11-02.md`。
- 状态：定稿

## 2026-11-02 · 导入恢复与 Vault 作用范围说明接入三语

- 决定：翻译导入预览、失败/等待/重复提示与 Vault 的还原/锁库/退出说明；警告码、ID、原字节和账户别名保持原样。
- 边界：语言切换保留失败后草稿、焦点和写入阻止条件，不读取/重放导入；保留进行中操作 owner，不执行实际锁库或退出。
- 依据：导入28项、Vault12项、完整1215项DOM检查及12组合成浏览器复核。浏览器语言驱动的重复模块问题与42组旧证据重跑已单独记录，见 `validation/UI-v2-native-import-recovery-copy-2026-11-02.md`。
- 状态：定稿

## 2026-11-02 · 候选上下文依赖保留其证据边界并翻译说明

- 决定：上下文依赖的可访问名称/标题、完整性限制及空/未知状态接入三语；冲突数沿用复数接口，详情等待提示接入字典。
- 边界：记录为输入上下文不表示新增引用、支持性证据或批准，也不能推出完整阅读历史。保留保存的来源文本、模型分类与已读节点；语言切换不发起新读取。
- 依据：`candidate-context` 21项及本片完整检查，见 `validation/UI-v2-native-candidate-copy-2026-11-02.md`。
- 状态：定稿

## 2026-11-02 · 已保存建议与队列等待说明接入三语

- 决定：建议数量用既有复数接口；引文/所选文本/当前候选只翻译前缀，完整保存内容不翻译。已保存任务的等待与暂停说明使用完整句子。
- 边界：不把来源对应性写成事实真实或审批；语言切换不改变保存任务，不解除进行中操作的 owner/busy，不读取或重放恢复命令。
- 依据：`suggestion-resume` 23项与完整前端检查，见 `validation/UI-v2-native-suggestion-copy-2026-11-02.md`。
- 状态：定稿

## 2026-11-02 · 来源提取说明与待审请求随界面语言显示

- 决定：提取面板的来源字节范围、单次发送/恢复说明和本地暂停队列说明使用完整翻译句子；离开请求/不发送复用相应界面标签。
- 边界：保存范围、正文、模型和目标不翻译；同一请求/模型的持有状态与原发送协议不变。复核三语切换不会触发读取、准备或发送。
- 依据：`extraction-provider-choice` 25项与本片完整检查，见 `validation/UI-v2-native-extraction-copy-2026-11-02.md`。样式及字体未变。
- 状态：定稿

## 2026-11-02 · Provider 配置与待审请求说明使用完整翻译句子

- 决定：补齐既有 ExternalPanel 的设置、授权范围、提取选项、错误前缀与请求估算说明；含目标/模型/上限的请求说明作为完整句子翻译，目标保留独立等宽节点，不拼接英文尾句。
- 边界：只翻译界面；实际请求正文、技术值、配置与调用持有状态不变。切换语言不触发重载、读取、准备或发送。
- 依据：现有 Provider 流程与两项扩展 DOM 场景、18组带虚构水印的浏览器复核，见 `validation/UI-v2-native-provider-copy-2026-11-02.md`。字体沿用现有包。
- 状态：定稿（不代表全部动态分支完成文案审计）

## 2026-11-01 · Memory 行展示当前 pin 已返回的保存元数据

- 决定：按原样显示可用保存标题、逻辑项目 ID 和每条记忆的证据引用数；没有标题时继续用已有片段，不从正文生成标题。不把项目 ID 当显示名，也不把 evidenceCount 当不同来源数或全库统计。
- 依据：固定 pin `bf6bfd10…` 的 `views.rs` 21–37 行返回 title/projectId/evidenceCount；`lib.rs` memory_search 同样返回 projectId/evidenceCount，但没有 title。Workspace v1 的 MemoryListArgs / SearchArgs 拒绝未知字段，不支持加入项目/种类筛选参数。
- 影响：只改当前加载行的呈现；不新增查询、回退、过滤或写入，搜索结果不借用先前列表标题。
- 状态：定稿（F5 的可用行字段，不代表全库分类完成）

## 2026-11-01 · 检查点覆盖按当前 pin 的已保存事件 ID 绘制

- 决定：在转录中提供检查点覆盖选择；只对该检查点 `covered_event_ids` 中确实存在于本次加载页的事件画括号，按连续可见片段分段，不能跨越未覆盖事件。默认不选，页外覆盖明确计数，不画未知延伸。
- 边界：读取中/失败撤下覆盖，恢复后以新回执重新派生；未知时间不影响已保存 ID 的覆盖关系。不会从摘要文本、时间间隔或「检查点已创建」事件推断覆盖，也不宣称哈希验证或记忆采用。
- 依据：已通过 GitHub 连接器读取固定 pin `bf6bfd10…` 的 `crates/enouia-memory-workspace/src/lib.rs` 1755–1785 行，确认当前分支检查点返回 `coverage_hash` / `covered_event_ids` / `created_at`。此字段实际可用，补齐此前只标事件时保留的待证明边界。
- 影响：只改原生 Sessions 呈现，无新 IPC、pin 或领域变更。
- 状态：定稿

## 2026-11-01 · Memory 日期标题随界面语言，分组键保持稳定

- 决定：已加载列表的日期标题沿用原本本地时区和日期分组，只将固定 en-GB 改为当前界面 locale。React 分组键取首条记录 ID，不使用翻译后的日期，切换语言时保留行节点与焦点。
- 影响：Memory 已加载日期标题与分组键；不改记录顺序、时间、查询、分页或统计，不补造项目/来源分类。
- 依据：`MemorySurface.dayOf`、既有语言切换与列表焦点规则。
- 状态：定稿

## 2026-11-01 · Settings 动效说明按原生实际行为区分

- 决定：原生只说明时间地图移动日历/已读取转录，以及减少动画的即时行为；不再承诺首页绘制连续迹线。浏览器演示仍保留其已实现的一次绘线说明。
- 影响：Settings 的说明文字，根据既有 memorySettings 区分已连接与演示路径；不改动效控制、存储、状态或壳行为。
- 依据：本轮原生首页/会话实现及审计 F7。
- 状态：定稿

## 2026-11-01 · 已加载 Sessions / Context 文案沿用既有 i18n

- 决定：将有内容分支的会话/分支标签、事件数、已保存事件、发送说明与读取反馈，及 Context 的来源可达性、destination 和 dispatch 时间标签接入现有字典。保留 ID、原始正文、请求文本、状态代码和计数方法，不把保存内容当界面文案翻译。
- 影响：SessionsSurface、SessionEventBody、SessionTranscript 与 ContextSurface 的显示字符串；不改请求、写入、确认、草稿或状态机。
- 依据：本轮有内容合成截图暴露的英文残留、OPEN_ISSUES #22 的已知分支限制。
- 状态：定稿（仅所列分支；不声称全应用动态文案审计完成）

## 2026-11-01 · Context 只为当前已读取 Capsule 恢复分区与预算刻度

- 决定：左侧导航只指向当前保存对象的预算、问题、纳入/排除和 dispatch 分区，数量取实际读取结果；不伪造全库 Capsule 列表、分类或计数。
- 预算：依据已保存的 estimated_tokens / max_tokens 和 counting_method 画单段刻度，文字仍称原有 units；仅在已用值非负、上限为正且两者有限时画比例。超过上限只截断填充，不改写原数值；未知预算不画零或虚构分项。
- 影响：原生 Context 三栏与当前对象导航、预算、表格滚动；不新增 IPC，不自动准备 preview，不改回执、请求哈希与 dispatch 所有权。
- 依据：`SCREENS.md` §1.3、当前 `ContextSurface` 的保存字段及 Context 观察回归。
- 状态：定稿（现有字段可表达部分；完整分类/历史列表待领域契约）

## 2026-11-01 · 主导航的稳定测试挂钩与本地化名称分开

- 决定：新增 `data-runtime-nav="primary"` 和按钮的 `data-runtime-page`（六个固定页面键）。保留原有本地化 aria-label、aria-current 与键盘处理，不把可访问名称锁回英文。
- 影响：共享主导航、原生 smoke 中两处英文导航选择器和文档；不改导航行为或原生代码。对应 OPEN_ISSUES #21。
- 依据：W2 的中日导航可访问名称记录、当前 `App.tsx` 和 `memory-smoke.mjs`。
- 状态：定稿

## 2026-11-01 · 原生 Inspector 按组件选择，观察 owner 不随选择重建

- 决定：左侧提供 Memory Core / Memory operations / Windows shell 三个组件入口，右侧保留各组件既有观察与显式读取。顶部只汇总现有回执，不复制浏览器演示中的虚构健康、验证或缺口状态。
- 所有权：选择只改变可见面板，三个观察 owner 保持挂载；不会丢失选中操作、重启轮询或重复请求。Vault 生命周期仍按原规则卸载 Vault 依赖操作。无 Vault 时操作面板明确显示不可用。
- 影响：原生 Runtime Inspector 的信息层级与布局；不改变后端、IPC、读取范围或 Activity 退休边界。
- 依据：选定 UI v2 左侧组件选择/右侧状态结构、当前 `RuntimeSurface` 与 `WorkspaceOperations` 观察语义。
- 状态：定稿

## 2026-11-01 · 原生 Sessions 使用已保存事件的时间尺

- 决定：沿用每分钟 2px、最多 48px 的间隔；不排序、不补造事件时间。左侧时间尺使用 UTC+8，语义 time/title 保留原始 ISO 值。检查点事件仅画自己的括号，不推断未获证明的覆盖范围。
- 地图：复用现有 TimeMap 与借出机制，只覆盖本次已读取的转录；只有全部时间有效且按事件顺序不倒退时提供地图。未知/倒序时间保留文字和记录顺序，地图不可用；读取中/失败时撤下地图，旧正文继续按既有规则标为上次成功读取。
- 影响：原生 Sessions 转录、共用记录带；不新增 IPC、不修改草稿、写入、权限或原始事件内容。布局变化及滚动需要浏览器验证。
- 依据：`DESIGN.md` §5/§6、`SCREENS.md` §1.4、原生 `SessionsSurface.tsx` 与 `SessionEventMetadata`，浏览器演示的 `rulerFor`。
- 状态：定稿（已有记录的呈现；不定义新的后端字段）

## 2026-11-01 · 原生首页恢复记录纸骨架，提交标记只表示 Vault 提交

- 决定：沿用 UI v2 的大时刻、58% 记录纸、四条注记和底部图例。大时刻标明设备时钟、UTC+8；21 个日历日中显示 4 日，复用现有小地图的拖动、点击和键盘平移。原生其他表面的 7 日记录带显示实际日期。
- 数据口径：只用现有 `workspace_status` 的 `lastCommitAt` / `headSequence` 标记最新 Vault 提交，不解释为记忆写入、候选、检查点、连续波形或完整历史。只有这个已观察时刻能有引线。Context / Sessions / Checkpoint 保留明确读取入口，未知摘要时间写「—」。
- 生命周期：状态失败、锁库、切库、退出时立即撤下提交和可操作小地图，保留设备日历与纸面结构；不自动开库、不请求额外领域摘要、不回退到 demo。
- 影响：原生 Home、共用记录带；浏览器原演示不变。沿用已实现的 UTC+8 试验口径，不替 owner 确认全局时区或新增数据契约。F1/F2 为部分修复，完整迹线和其余三条真实时间注记仍需 Memory 的字段/口径支持，Sessions 的时间尺另片推进。
- 依据：`DESIGN.md` §5/§6、`SCREENS.md` §1.1；2026-10-29 本机逐屏审计；[本片验证](validation/UI-v2-native-home-2026-11-01.md)。
- 状态：定稿（已有数据的呈现与空缺说明；未定义未来波形）

## 2026-10-29 · #23 原生按钮按多行文字增高

- 决定：UI v2 `.mem-button` 取消固定高度，使用 `height:auto;min-height:30px`；不截断、不缩小文字、不禁止换行。
- 理由：原生日文两行的行高合计超过固定 30px，文字越过边框。侧栏已有滚动，应让内容决定按钮高度。
- 影响：保留字号、字体、padding、按键、事件及类名契约；多行按钮可自然增长。
- 依据：[12 格前后原生测量、读取交互及六项检查](validation/UI-v2-23-button-wrap-2026-10-29.md)。
- 状态：定稿（已复现按钮的隔离验证；owner 人工验收待定）

## 2026-10-29 · #22 原生无库与空库文案使用既有 i18n

- 决定：无库、空结果、空会话、Inspector 观察说明及无记录带提示包入 t/tj；确认短语、库名、ID、组件代码和正文保留原文。操作状态不代表领域结果的边界也完整翻译。
- 理由：字典覆盖检查无法发现未标记 JSX 和模板字符串；W2 及本片原生截图已经显示这些路径的裸英文。
- 影响：各新增 15 个译文键；按既有脚本重生成标签与正文切片，总 CJK 9,691,824 B，比 W4 增加 172 B。字体字形、四条栈、授权与业务/键盘契约不变。
- 依据：[最终六项检查及 60 格原生复验](validation/UI-v2-22-native-copy-2026-10-29.md)；不等于所有动态/错误文案的完整审计，#23 单独处理。
- 状态：定稿（本片已观察路径与隔离验证；owner 人工验收待定）

## 2026-10-29 · W7 热键 smoke 使用标记临时库与真实 OS 输入保护

- 决定：focused Quick Search smoke 只接受标记的新建临时空库；通过既有语言控件设英文，使用 canonical Vault 状态作前置条件。注册成功且前台 PID 属于测试进程才发送 Q；保留全部清空、焦点、权限与冲突断言。
- 理由：UI v2 的翻译与大写外观不能成为旧英文 smoke 的隐含状态协议；焦点失败应先留下诊断，不能改断言掩盖失败。
- 影响：仅测试 harness 与验证文档；产品默认键仍是 Ctrl+Alt+M，应用与 Memory pin 不变。
- 依据：[37/37 原生验证及原始失败记录](validation/UI-v2-W7-hotkey-2026-10-29.md)。默认 M 在本机实际冲突，保护停止且未发送按键。
- 状态：定稿（测试 Q 的本机合成验证；默认键与 owner 验收保留）

## 2026-10-28 · W7 安装器增加日语，沿用现有卸载保护

- 决定：NSIS 语言设为 `SimpChinese`、`English`、`Japanese`，继续显示语言选择器；沿用 ADR-027 的 current-user 安装、禁止降级及自有模板/hooks。
- 理由：应用已支持三语，安装器也应提供对应语言。采用本机 Tauri 2.12.0 / NSIS 自带的日语资源，不新增自译安装文案。
- 影响：只改安装配置的语言列表；版本仍为 0.1.0，不替换历史双语安装验证的结论。
- 依据：[本片构建与验证记录](validation/UI-v2-W7-installer-2026-10-28.md)。
- 状态：定稿（配置；候选包不代表安装或 owner 验收）

## 2026-10-28 · W7 双窗口共用语言偏好，主窗口管理原生标题

- 决定：主窗口与 Quick Search 使用现有同源 localStorage 偏好；接收事件只应用 `newValue`，不回写。原生标题由 main-only 的固定命令设置，产品名保持英文，overlay 无标题写权限。
- 理由：不同 WebView 的 JS store 需要同步；将收到的旧事件再次持久化会覆盖后来的选择。语言切换应保留检索草稿，不附带搜索或 Memory 动作。
- 影响：语言 store、窗口标题发布器、原生退出等待文字；不改布局、键盘、Memory pin 或任何真实数据启用。
- 依据：[双窗口验证](validation/UI-v2-W7-window-language-2026-10-28.md)，真实连续切换的失败与修复、三语/系统/重启、六项检查与 Rust 定向检查。
- 状态：定稿（实现与隔离验证；OS 标题/长操作和 owner 验收边界见记录）

## 2026-10-27 · W6 #18 延后面板视图，保留历史任务 owner

- 决定：历史任务视图、Provider 配置、Provider 状态用 React.lazy/Suspense 独立加载；历史 owner hook 继续留在 Import 的原位置，不把请求生命周期绑到视图下载。
- 理由：主包从 503.47 kB 降为 436.15 kB，保持已有请求、重试与批次选择边界。生产冷首页不请求这三个面板；全部首屏 JS 含共享包仍为 502,123 B，不等同于主包大小。
- 影响：新增 HistoryTaskView、两个 lazy 入口、一条三语加载提示；Settings 渲染检查等待异步内容完成，保留原有安全断言。字体重生成内容不变，不改依赖或警告阈值。
- 依据：[W6 #18 记录](validation/UI-v2-W6-18-lazy-panels-2026-10-27.md)，完整六项检查、重点 owner/请求/退出检查、12 张 mock 截图及生产首屏请求。
- 状态：定稿（实现与本地验证，不代表 owner 人工验收）

## 2026-10-27 · W6 #16 Runtime 组件状态放到下一行

- 决定：Runtime 左栏组件按钮采用单列，名称下方显示状态，间隔 3px，内容可换行并自然增高。
- 理由：让 Context Compiler 等长组件名与状态读数各有完整宽度。
- 影响：三条 CSS 规则，保留选择、状态图形、键盘与结构契约。
- 依据：[W6 #16 记录](validation/UI-v2-W6-16-component-labels-2026-10-27.md)，两尺寸、三语、两主题共 12 组边界测量与截图。
- 状态：定稿（实现记录）

## 2026-10-27 · W6 #10 全局方向键限于当前列表

- 决定：App 只在 Memory `.qr44`、Sessions `.qr135` 内处理 ↑/↓；列表外保留默认行为，原生处理与其他键盘契约不变。
- 理由：页面处于 Memory/Sessions 不足以说明方向键应移动那份列表选择。
- 影响：两项键盘范围判断，新增实际 App 的 13 项 DOM 交互检查。
- 依据：[W6 #10 记录](validation/UI-v2-W6-10-list-keys-2026-10-27.md)，旧逻辑复现 4 项失败，修复后通过；浏览器三语两主题共 12 条键盘旅程。
- 状态：定稿（实现记录）

## 2026-10-27 · W6 #9 标签基础字号统一为 12px

- 决定：`.mem-tag` 的基础字号从 11.5px 改为 12px，保留 CSS 20px 高度与现有盒模型。
- 理由：基础样式也满足 12px 下限，与 UI v2 已有覆盖值一致。
- 影响：仅 `memory/memory.css` 的一处字号。
- 依据：[W6 #9 记录](validation/UI-v2-W6-09-tag-size-2026-10-27.md)，三语、两主题、三档 DPR 的 18 组 CSS 探针，文字边界在标签内。
- 状态：定稿（实现记录）

## 2026-10-27 · W6 #8 Inspector 的完整 ID 可换行

- 决定：Memory Inspector 链接型 ID 限于当前列宽，使用 `overflow-wrap:anywhere`；保留完整 ID 与原点击行为。
- 理由：普通 ID 已有断行，而链接缺少约束，长 Session ID 会撑出裁切角。
- 影响：仅 `.qr88 .qr63` 的 CSS，不改变结构或契约。
- 依据：[W6 #8 记录](validation/UI-v2-W6-08-inspector-ids-2026-10-27.md)，两尺寸、三语、两主题、两类记录共 24 张浏览器截图及边界测量。
- 状态：定稿（实现记录）

## 2026-10-27 · W6 #7 视图模型传状态，CSS 决定皮肤

- 决定：移除 `renderVals()` 和 Context fixture 的旧 Quiet 色值；保留 active/selected/tone/status/section/speaker，由现有 CSS token 与状态属性绘制。去掉不再使用的呼吸圆环模型与对应行内样式覆盖。
- 理由：主题不应被视图模型携带的旧颜色覆盖；样式状态也不能从翻译后的标签推导。
- 影响：App、demo fixture/type、Memory/Context/Sessions/Runtime JSX 与三处 CSS 优先级；现有类名/data 属性及键盘行为保留。
- 依据：[W6 #7 记录](validation/UI-v2-W6-07-view-state-2026-10-27.md)，三语两主题共 30 张浏览器截图。
- 状态：定稿（实现记录，不代表 owner 人工验收）

## 2026-10-27 · W5 星图性能以完整绘制间隔记录

- 决定：在独立临时 WebView2 浏览器壳测 `/starmap.html`，不把合成星图放入 Runtime 原生应用；记录 Worker 布局、主线程绘制/计算中位与 P95，并补 draw 间隔。保留 5,000 条球体/聚类的慢数据为 #24，不因 CPU 帧成本较低宣称通过流畅性验收。
- 理由：WebView2 的球体/聚类在 5,000 条时 draw 间隔约 129/96 ms，无头 Edge 同条件亦能复现；CPU 数据不覆盖 GPU 与合成。
- 影响：仅验证记录与未决问题；暂停、媒体/应用减少动画、离屏停止已实测，后端图投影与原生接入边界不变。
- 依据：[W5 验证与数值](validation/UI-v2-W5-starmap-2026-10-27.md)，本机截图 `.design/w5-browser/shots/`。
- 状态：定稿（测量口径；5,000 条性能问题待处理）

## 2026-10-27 · W4 中日字体打包与按需加载

- 决定：更纱三字重与 M PLUS 可变 300–600 使用字典 CJK 子集；Enouia Text SC、Zen 四字重保留完整字符映射及 UVS，各字重 100 片。CJK 共 504 个 WOFF2、9,691,652 B。定义 CSS 随中日字典加载，不进入英文首屏；切片不内联。Settings 的完整授权文本另包加载，并提供原始 IPAexGothic 的本机恢复选择。
- 理由：保留选定字形、任意正文覆盖与 IPA 恢复权利，同时让英文启动仍只加载原有 67,892 B 拉丁字体。中文无库首页实测 474,908 B，日文 313,536 B（均含拉丁）。
- 影响：生成脚本、字体与 manifest、语言加载器、CJK 栈及 Settings；无新产品依赖、Memory pin 或原生权限变更。M PLUS 缺少的全角「／」「：」由 Zen 正文覆盖。
- 依据：[W4 原生/浏览器验证](validation/UI-v2-W4-fonts-2026-10-27.md)，完整来源、内部版本差异及生成方法见字体 README。
- 状态：定稿（实现与本地验证；不代表 owner 人工验收）

## 2026-10-26 · W4 IPA 字体派生、改名与恢复入口

- 决定：按 IPA 授权与官方 FAQ，将子集化和 TTF → WOFF2 都视为派生；中文正文字体的打包 family、PostScript 名和文件名改为 `Enouia Text SC`，对应 LXGW Neo XiHei v1.308 的字形，不沿用包含原名的派生名称。四条栈中原 `LXGW Neo XiHei` 的位置使用这个打包名称。附完整授权、来源、生成脚本与说明；Settings 提供可读授权及切换到用户自行安装的原始 IPAexGothic 的入口，不增加原生权限或自动下载。
- 理由：IPA 官方 FAQ §3.1 明确格式转换也是派生；§2.4、§3.3.2 要求内置字体的授权可读及恢复原始字体的方法。仅保留所有字形再转 WOFF2 并不能免除这些条件。
- 影响：CJK 字体包、四条字体栈、Settings 字体说明；原始 TTF 不提交。其余三款按 OFL 分发，Sarasa 的保留名 `Source` 不用于派生主名称，M PLUS / Zen 授权未声明保留名。
- 依据：打包前阅读的 [IPA 授权](https://moji.or.jp/ipafont/license/)、[官方 FAQ](https://moji.or.jp/ipafont/faq/)、[字体作者的说明](https://github.com/lxgw/lxgw/blob/main/documents/xizhi_embedding_instructions.md)与三款 OFL 全文；详细实施条件见 `apps/desktop/src/assets/fonts/README.md`。
- 状态：定稿（本轮已授权的字体打包所必需；恢复操作的实测边界另记验证记录）

## 2026-10-26 · W3 原生启动底色

- 决定：Tauri 创建窗口之前，通过现有 Windows Registry API 只读查询 `AppsUseLightTheme`，将主窗口和 Quick Search 的 `background_color` 设为黛蓝 `#0F1C23` 或宣纸 `#F1F0EB`；缺失/不可读时使用 Windows 默认浅色。JSON 留浅色保底。HTML 用两条带 `media` 的 `theme-color` 和极小的头部样式，在模块脚本运行前使用同样的纸色。这是 DESIGN.md §2 颜色集中规则的启动阶段例外。
- 理由：首帧不能等 React 或 `.setup()` 再改变窗口底色；owner 已在本轮明确批准相关原生修改。
- 影响：`src-tauri/src/appearance.rs`、`main.rs`、`tauri.conf.json` 与 `index.html`；无新依赖、权限或 Memory 路由变更。
- 依据：锁定的 Tauri 2.12.0 / tauri-utils 2.10.1 源码、[WindowConfig](https://docs.rs/tauri-utils/2.10.1/tauri_utils/config/struct.WindowConfig.html#structfield.background_color)、[Context::config_mut](https://docs.rs/tauri/2.12.0/tauri/struct.Context.html#method.config_mut)、[RegGetValueW](https://learn.microsoft.com/en-us/windows/win32/api/winreg/nf-winreg-reggetvaluew)、[HTML theme-color 媒体查询](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/theme-color)；[本机 W3 验证与测量边界](validation/UI-v2-W3-background-2026-10-26.md)。
- 状态：定稿

## 2026-10-26 · 中日字体定稿；首页「I'm here.」不翻译

- 决定：中文用 更纱等宽 Sarasa Mono SC（标签/标题）+ 霞鹜新晰黑 LXGW Neo XiHei（正文）；日文用 M PLUS 1 Code（标签/标题）+ Zen Kaku Gothic New（正文）。系统字体只作回退。首页的「I'm here.」与产品名一样在任何语言下都显示英文（浏览器演示与原生首页都改为 `lang="en"` 的固定文字，字典删去这一条，1,384 条）。具体栈与打包方式写入 DESIGN.md §3，落地步骤写入 HANDOFF_CODEX.md W4。替代了「界面三种语言」一条里「中文与日文的字体先用系统字体」的部分。
- 理由：Morii 2026-10-26 看了第二轮比较后选「中 2 + 日 1」，并要求「主页面的这个『我在』在中文下也用英文显示」「就这么敲定了」。第一轮的系统字体被认为太常规。
- 影响：`theme/cjk-fonts.css`、`assets/fonts/`（W4 由实现者打包）、`screens/Home.tsx`、`memory/status.tsx`、字典。
- 依据：`.design/review/fonts2/`（字样卡 + 真实界面 44 张截图，黛蓝 / 宣纸）；字体文件来自各自的官方 GitHub 发布或 google/fonts。打包体积尚未实测。
- 状态：定稿

## 2026-10-26 · 记忆星图默认改为三维球体，力导向「派」删除

- 决定：星图的第一种布局改为**球体**（三维、自转、透视，离中心的距离是年龄，黛蓝底上发光），并新增**星系**（对数螺旋臂，距离是年龄，回放时向外扩散）。原来的力导向布局删除；时间滚筒与主题聚类保留。具体值写入 DESIGN.md §7。替代了下面「记忆星图可以自己动」一条里关于力导向布局与「空闲时漂移、聚类缓慢转动」的部分，其余（拖动、弹簧、暂停、减少动画）不变。
- 理由：Morii 2026-10-26：力导向「看起来一块一块的，不太符合那种星图的发散的运动感」；看了 OmbreBrain-folio 的星图截图后要求「这种感觉，最后是一个三维球体的」；「其他方案也都可以保留，除了那个看起来是六等分的苹果派的那个」。
- 影响：`starLayout.ts`（`ball()`、`project()`、`galaxy()`，`forceSim` 改为拉向星系位置）、`StarMap.tsx`（球体投影、由远到近绘制、光晕、拖动转球与惯性、星系的旋转/涟漪/背景点、闪烁）、字典 3 条新文字（1,385 条）。主 JS 仍 500 kB；星图在懒加载分包里。
- 依据：参考 OmbreBrain-folio 星图截图（小红书功能巡览）、MemoryConstellations 的确定性螺旋摆位（`js/memory/layout.js`）。无头 Edge 1440×900：球体 700 条布局 6ms、5,000 条 28ms；空闲 1.2 秒内 11–25 万像素变化；暂停后静止，拖空白处转球；星系 5,000 条布局约 460ms（Worker），每帧绘制约 5ms、计算约 7ms。原生 WebView2 未测。
- 状态：试验

## 2026-10-26 · 界面三种语言：English、简体中文、日本語

- 决定：整个界面提供英文、简体中文、日文（`src/i18n/`：`t()`、`tn()` 复数、`tj()` 句中嵌元素、`msg()`/`labels()` 标记表格）。1,367 条界面字符串都有两种译文；产品名「Enouia Runtime」不翻译。Settings 新增 Language 一行（跟随系统 / English / 中文 / 日本語），切换就地重绘，不回首页。中文与日文的字体先用系统字体（雅黑 UI、游ゴシック UI），按 `<html lang>` 分开取字形；正式字体等 Morii 从 `.design/review/fonts/` 的比较里选。
- 理由：Morii 要求「整个界面都应该有中日英三语」「左上角的 Enouia Runtime 标题可以不本地化」「字体的选择必须格外注重」（2026-10-26）。
- 影响：几乎所有界面文件；新增 `i18n/index.ts`、`zh-Hans.ts`、`ja.ts`、`theme/cjk-fonts.css`、`tests/i18n-keys.mjs`、`tests/i18n.test.mjs`。英文输出不变（原有测试照旧通过）。字典按语言分包懒加载：主 JS 500 kB，中文字典 106 kB、日文 130 kB（未压缩）。
- 依据：`npm run check`；node 测试 124 通过、3 跳过（含新增 8 项翻译检查）；DOM 75/75；build；两个仓库检查；无头 Edge 在中文、日文下截了全部页面（`.design/shots/i18n/`）与语言切换（无控制台错误）。原生 WebView2 未看。
- 状态：试验（字体待定）

## 2026-10-26 · 记忆星图可以自己动（动效规则的唯一例外）

- 决定：星图改成实时渲染：力导向布局在 Worker 里分帧收敛并逐帧送回；拖动星星时有连线的星跟着走，松手回位；空闲时漂移、聚类缓慢转动；时间滚筒的笔固定在 12 点，年份在笔下转。新增「Pause motion」按钮。具体值写入 DESIGN.md §7「唯一例外」。另加独立预览页 `apps/desktop/starmap.html`（只在开发服务器上，生产构建不含）。
- 理由：Morii 要求星图「动态渲染，可以直接进行交互，没有进行交互的时候也要有自己的运行动效」（2026-10-26）。其余界面仍是「一次画出，然后安静」；星图的漂移不带含义，可以暂停，减少动画时关闭。
- 影响：`StarMap.tsx`（帧循环、弹簧、拖动、相机滑行）、`starLayout.ts`（`forceSim` 可分步）、`starWorker.ts`（分帧送回）、`automemory.css`（独立页样式）、新增 `starmap-preview.tsx`。主 JS 不变，星图仍在懒加载分包。
- 依据：无头 Edge 1440×900：空闲 1.2 秒内约 2.9 万像素变化，暂停后 0，减少动画时 0；拖动一颗星后它跟手、松手回位；回放时笔固定在顶端；5,000 条时每帧绘制中位约 1ms、弹簧计算中位约 1.5ms。截图与两套主题录像在 `.design/review/starmap/live/`。原生 WebView2 未测。
- 状态：试验

## 2026-10-25 · 全界面动效（第一批）

- 决定：采用 `redesign/v2-motion` 的动效原型，规则与时刻写入 DESIGN.md §7：页面沿导航顺序推进、导航反相块滑动、Memory 选中光标移动与 Inspector 翻帧、自动记忆视图推进、星图按身份重排、记录依次到达、首页记号落下、Quick Search 纸条落下、明暗切换显影、锁定斜线画过、悬停 80ms。替代 DESIGN.md 旧 §7 里「悬停/选中瞬时、导航与列表不动」的说法。
- 理由：Morii 希望整个界面有动效（2026-10-25），看完录像后确认「现有的都挺好的」。全部只沿时间或顺序移动，与「记录仪」一致。
- 影响：新增 `theme/motion.ts`、`theme/motion.css`；`App.tsx` 的 `show`/`select`、`AutoMemory.tsx` 的视图与选中、`Constellation.tsx` 的节点名、`main.tsx` 的明暗切换改走 `moveAlong`。行为与测试不变（测试环境无 View Transitions，直接更新）。主 JS 增约 0.6 kB。
- 依据：`.design/review/motion/` 的 16 段录像（8 场景 × 2 主题，无控制台错误）与 1/10 速抽帧；`npm test`（node 116 过 3 跳过，DOM 75/75）、build、两个仓库检查全过。原生 WebView2 尚未录制。
- 状态：定稿

## 2026-10-25 · 合并 main：用量账本界面一起删除，原生命令已撤下

- 决定：把 origin/main（到 PR #100）合入 `redesign/v2`。main 新增的私有用量账本界面（`src/usage/` 的视图、`UsageProvider` 包裹、`ActivityWorkspace`、其测试与 `usage-manual` fixture）按「移除 Activity / Usage 界面」一并删除；main 新的原生 Runtime Inspector 去掉「Activity producer」一节。main 带来的 Memory 历史任务、Provider 配置草稿、导入报告、合成自动记忆集合、原生 Runtime Inspector（Memory Core、Windows shell、Memory 操作）保留，套用 UI v2 外观。
- 理由：main 的交接说明（`docs/prompts/CLAUDE_ACTIVITY_BACKEND_HANDOFF_2026-10-25.md`）与 Morii 的范围调整一致：两块界面一起删，保留 Memory、Context、Sessions、Provider 配置、Memory 任务观察、会话请求的 token 信息与 Windows 外壳。
- 影响：替代上一条里「原生命令暂留」的说法：桌面 Activity/Usage 原生命令与授权已由 [ADR-037](adr/037-activity-usage-desktop-retirement.md) 撤下；独立采集/上传程序、账本、安装任务与数据仍保留，等 Moriium 替代链路完成后再清理。主 JS 增到 513.6 kB（超过 Vite 500 kB 提示线，OPEN_ISSUES #18）。
- 依据：`npm run check`；`npm test`（node 116 通过、3 跳过、0 失败；DOM 75/75）；`npm run build`；`node scripts/check-memory-integration.mjs`；`node scripts/check-activity-retirement.mjs`；浏览器演示重截，与合并前只差 Home 笔尖 27 像素。
- 状态：定稿

## 2026-10-25 · 移除 Activity / Usage 界面

- 决定：Runtime 前端删除公开 Activity 与私有用量账本的全部界面：导航项（原第 5 项）、Activity 页（浏览器演示与原生 `src/activity/`）、统计卡与操作入口；Home（原生）的 Activity 入口与「Activity uses a separate producer」、Settings 的「Activity producer · Pause scheduled runs」、Runtime Inspector 的「Activity producer」组件与「activity ipc」读数、标题栏状态牌与退出说明里的 Activity 句子；只服务它们的前端状态（`actFilter`、`actOpen`、`paused`）、演示数据（`D.ACT`、`DemoActivity`）、记录带的「第二条胶片」、CSS（`activity.css`、`.act-*`、`.bg-act-*`、`.bg-reading*`、`.qr172`–`.qr186` 中的 Activity 部分）、单元测试与驱动该页的 e2e 脚本。不留占位页，不新增 tokens.ci 面板。导航变为六项，Ctrl+1…6。
- 理由：Moriium 的 token 用量分析以后不集成到 Enouia Runtime；Runtime 前端只服务 Enouia Memory（Morii，2026-10-25）。
- 影响：保留不动的是 Activity / Usage 的后端、原生命令（`src-tauri/src/activity.rs` 与其 capability）、采集与同步程序、调度、数据与 `scripts/` 下的相关脚本（包括已无前端用途的 `prepare-activity-surface-sandbox.mjs`），等 Moriium 替代链路完成后另行清理；不停任务、不删账本、不归档，不处理其他分支或 PR。`docs/validation/` 里引用已删文件的历史记录不改。AGENTS.md 仍写「seven surfaces」与 ADR-028 的 Activity 页面，需要 owner 更新（OPEN_ISSUES #12）。
- 依据：`npm run check`、`npm test`（node 60/60，DOM 58/58）、`npm run build`、`node scripts/check-memory-integration.mjs` 全过；重截两套主题。
- 状态：定稿

## 2026-10-25 · 动效留在 Web 层，不换技术栈

- 决定：界面与动效继续用 React 19 + TypeScript，运行在 Tauri 2.12 的 WebView2 里；动效用 CSS 过渡/关键帧和 Web Animations API，不引入动画库。Rust 只负责窗口、托盘、热键、Memory 适配器，以及窗口级效果（首帧底色、以后可能的 Mica）。不改用原生 Rust 界面库。
- 理由：「一次画出，然后安静；移动只沿时间轴」需要的只是 `transform`/`opacity`/`clip-path` 这几种由合成器处理的属性，WebView2（Chromium）已经能稳定 60fps。换原生界面库要重写整个前端、丢掉 DOM 测试与 `.qr*` 接口挂钩，中文排版和动画能力也更弱。
- 影响：全部屏幕。星图规模化时按 Memory UI 规格先用合成规模样例测量，再在 SVG / Canvas / Web Worker 布局之间选（OPEN_ISSUES #6）；那时若要新增依赖，另记一条决定。
- 依据：`apps/desktop/package.json`（react 19.3.0，无动画依赖）；`src-tauri/Cargo.toml`（tauri =2.12.0）；Memory UI 规格 §10「现阶段不新增依赖」。
- 状态：定稿

## 2026-10-25 · 实现前先补设计：屏幕清单与顺序

- 决定：以 [SCREENS.md](design/ui-v2/SCREENS.md) 为唯一屏幕清单。标「已做」的按截图与规格实现；标「部分」「未做」的（记忆星图全库视图、月→日时间线、覆盖日历、记忆格的列表模式、主题簇/替代链/证据链、回看与淡出建议卡、冲突对照与修订 diff、十种状态、窄窗口与 200% 缩放）先在浏览器演示里用虚构数据设计、截图、过自检，再进入实现。
- 理由：Memory UI 规格 §11 要求原型至少覆盖十种状态；当前合成预览只有五个视图、15 条虚构记忆。
- 影响：Memory 区域与 Settings；不改变六个主表面的边界。
- 依据：Memory UI 规格 §1–§11；参考图 ref-01…ref-09（REFERENCES.md）；`.design/shots/v2/`。
- 状态：定稿

## 2026-10-25 · 本轮统一口径（待 owner 最终确认）

- 决定：① 星图的 `+ / −` 是缩放（0.85–1.5，另有「重置」）；② 所有时间按 Asia/Shanghai（UTC+8）显示，并在 Inspector 的时间区写明；③ 自动记忆合成预览用 `React.lazy` 懒加载（主 JS 475.3 kB，预览 57.8 kB 另包）。
- 理由：① Memory UI 规格 §10「缩放有 + / − / 重置按钮」；② 规格 §5 不按浏览器时区猜，演示数据本身是 Asia/Shanghai；③ 主 JS 回到 Vite 500 kB 警告线以下。
- 影响：`screens/automemory/*`、Inspector 时间区、`App.tsx` 的预览入口。
- 依据：第二轮三个变体都按此实现并截图（`.design/review/index-r2.html`）。
- 状态：试验

## 2026-10-25 · 两套配色：深色黛蓝、浅色宣纸

- 决定：深色 **Tile Blue · 黛蓝**（底 `#0F1C23`，墨 `#ECEDE8`，笔 `#93B6DC`），浅色 **Xuan Paper · 宣纸**（底 `#F1F0EB`，墨 `#1D1C1A`，笔 `#29528A`）；全部值见 DESIGN.md §2。跟随系统明暗，无应用内覆盖。所有颜色收进 `theme/palettes.css`，组件只读令牌；反相块 = 墨与底对调。
- 理由：两套是一对「粉墙黛瓦」——宣纸是墙，黛蓝是瓦；同一种墨、同一支石青笔，切换明暗只换底不换笔。做法学 04 标本馆：整个界面只有一个低彩度色相，墨也带这个色相，强调色只有一支。避开深海军蓝 + 青、紫色渐变、米色 + 陶土橙、纯黑 + 霓虹。
- 影响：全部屏幕；`quiet-runtime.css`、`theme/negative.css`、`theme/automemory.css` 里写死的色值改为令牌；Settings 的皮肤陈述句；时间小地图说明里的「amber frame」改为「frame」（笔色不再是琥珀）。替代 08 原来的近黑底 `#121312` + 琥珀笔 `#D2A24C`。
- 依据：三轮配色比较（`.design/review/index-palettes.html`、`index-palettes-dark2.html`、`index-palettes-tile.html`）：第一轮三深三浅 → 浅色选宣纸，深色都不满意（底太接近黑、只差一点色相）；第二轮黛瓦/灯下/旧绢 → 黛瓦；黛瓦底 OKLCH C 0.006 发灰，压深三版 → 黛蓝。逐节点对比度审计 0 处低于 4.5:1。
- 状态：定稿

## 2026-10-25 · 新视觉取代 Quiet Runtime 的视觉条文

- 决定：[FRONTEND_IMPLEMENTATION_v1.md](FRONTEND_IMPLEMENTATION_v1.md) 中关于布局、字体（Segoe UI Variable / Cascadia Code）、颜色（`#0C1117` 底、冰蓝 `#9FC2D2` 等）、间距与「Quiet Runtime」视觉语言的条文，由本 DESIGN.md 取代。保留不变的契约：主表面与它们的边界（Activity 已另行移除，见「移除 Activity / Usage 界面」）、浏览器演示的「fictional demo」标注与行为、原生里 Memory/Context/Sessions 走 Memory 适配器、Quick Search 独立窗口与权限、1100×700 最小窗口、CSP、所有 `.qr*` / `.mem-*` / `#quick-query` 接口类名、键盘（Ctrl+数字、↑↓）、减少动画、测试（Activity 部分随界面删除）。
- 理由：design-kit `existing-app.md` §2：保留语义，不保留具体长相；旧文档只在顶部加一行，不改正文。
- 影响：旧文档顶部加一行指向本条。
- 依据：`docs/design-kit/existing-app.md`；`.design/00-recon.md` 的契约/皮肤清单。
- 状态：定稿

## 2026-10-25 · 选定的方向与被放弃的方向

- 决定：选 **08 负片**（`redesign/08-negative` 53f9bb4）：01 的记录纸骨架（导航印在记录带上、Sessions 行距按真实时间）+ 05 的字体（Martian Mono + Geist）与时间小地图（取景框移动、图表沿时间平移），全暗/全浅各一套，一支笔色。
- 理由：它是唯一把 01 与 05 融成新东西的变体；时间小地图直接服务自动记忆的 Timeline（发生、收到、形成三种时间）；负片底同时解决了白纸夜里太亮与原生窗口首帧闪深色两个问题。
- 放弃的：
  - 01 气压记录纸：喜欢，作为 08 的骨架保留；放弃它的白纸、细坐标格、胭脂红过多、大写窄体。
  - 02 结绳、03 投币寄存柜：离「时间」这个主问题较远，Morii 未选。
  - 04 标本馆：未选为方向，但其配色方法被配色轮采用。
  - 05 胶片阅读机：喜欢，借走字体、编号习惯、裁切角、反相与斜线故障、载片台→时间小地图；放弃右侧控件栏。
  - 06 阅读机里的记录纸、07 铅笔稿：两者在截图里只拉开约两轴，Morii 选了 08。
- 影响：全部屏幕的视觉；不改任何行为、IPC、测试。
- 依据：`.design/review/index.html`（第一轮）、`.design/review/index-r2.html`（第二轮）与各方向 `critique-log.md`。
- 状态：定稿

## 2026-11-04 · #14 旧 Vault 浏览器空状态

实现记录：空库样本同时没有记忆、候选、会话和 Capsule；仅候选样本包含两条独立导入候选，保留原始 fixture，缺失引用以空状态呈现。模块级 `vault-dataset` 参数只服务浏览器，SDK 原生标记下忽略；显式恢复链接回原始兼容列表。这不构成 Memory 契约或 Owner 采用。证据见 [验证](validation/UI-v2-empty-vault-demo-2026-11-04.md)。

## 2026-11-05 · 时间工作区的月／日浏览与覆盖口径

Morii 在核对现有 Memory 能力后同意按以下方向继续。默认按月定位，再展开有明确日期的日分组；月份精度、范围和未知日期单独保留，不补成某天。原主题泳道保留为切换视图，两者沿用同一个 Inspector 和选择，时间小地图随当前视图借出。

覆盖日历的产品语义采用「收到的材料 / 暂存记忆 / 已采用记忆」。暂存不等于等待主人逐条审批，系统采用不等于主人确认。材料必须来自独立来源集合，不能把记忆或摘录条数当作材料数量。当前 pin `0d338f1` 已有 `memory_time_buckets_native` 与日/月、时区、授权范围及材料/暂存/采用字段；Runtime 的 read-2 尚未接入该投影。合成样本先对齐语义，不改 Core 或 pin；原生接入是独立集成切片。历史某日新增采用数和主人确认事件数不能从当前状态反推，需要时另行核对 Memory 契约。

本条不改变合成原生面板枚举/时间翻译待定事项，也不授权采用未合并的 Memory #83。

覆盖合成实现补记：新增独立 `coverage` 样本（3 个材料对象、4 条记忆），显式分离当前 adoption 与展示状态，不从摘录、trail 或系统采用次数推断材料。材料条形按收到日期；记忆条形按可能发生范围与当前暂存/采用分类。月份与范围可能重复覆盖多天，日计数不可相加，未知日期另列。其他样本缺材料目录时显示不可统计，并提供进入明确覆盖样本的链接。产品无需据此修改 Memory Core；原生投影仍是独立接线。

## 2026-11-05 · 合成记忆格与列表的共同筛选

既定 ref-01 落地：卡片/列表使用同一已加载数组、接收时间降序、稳定记录 ID、选择与 Inspector；布局切换不重建记录节点。类型、合成叙事状态、建议主题和字面检索取交集。筛选隐藏所选条目时保留 Inspector 并说明；清除筛选保留布局和所选记忆。列表上下键沿同一顺序移动焦点和选择。主题仍是模型建议，状态不替代 Core 的多条业务轴，不构成全库 facets 或权威当前性。标签字段和写入操作未虚构，原生接线仍另片。

## 2026-11-05 · 已加载替代关系与来源链

既定关联路线落地：替代/来源两种视图只扩展明确记录的对应关系类型在已加载集合中的连通部分，仍逐条显示原始边，不从可达性、主题相同或来源同名制造新边。替代生效时间未提供时保持未知，不从发生/有效/修订日期反推；摘录不等于独立印证，形成注记不等于提交收据。生成依赖始终单列为非支持。中央锚点仅显示原 ID/修订、标题和状态，完整陈述由共享 Inspector 保留；窄窗口仍可并列阅读替代双方。演示链接保留工作区与视图，未知视图参数回到该工作区的已有默认视图。原生、完整来源定位和收据接线另片。

## 2026-11-05 · 只读冲突与修订正文对比

既定形成路线落地：冲突对比直接读取已加载双方的原始陈述、状态、说明和来源；接收先后不决定当前真值，也不产生解决/审批操作。原样本没有同一 ID 的旧修订正文，不能从形成注记或跨 ID 替代关系重建，因此新增独立 `revisions` 虚构样本，提供明确同 ID 的 r1/r2/r3 正文和示例时间。历史状态、旧支持证据和收据未虚构。对比保留完整正文、空白和原始 ID，仅用相同前后缀之间的范围作字面标示，不进行语义判断。左右选择、相同正文和反向对比都不改变当前 Inspector 或数据；真实历史读取与写入另片。
