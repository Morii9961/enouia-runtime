# UI v2 · 当前保存 Capsule 的导航与预算，2026-11-01

基线 `62a649f`；同一修复分支，Memory pin 和领域命令未变。

## 呈现

Context 恢复三栏：当前保存 Capsule 的分区导航、问题/预算/纳入与排除记录、dispatch 检查。导航只指向本次读取对象的实际分区，数量取保存决策；没有添加全库列表、未知分类或统计。

预算单段填充和刻度只来自保存的 `estimated_tokens` / `max_tokens`，保留 `counting_method` 与原有 units 表述，不声称真实 tokenizer token 数或虚构分项。数值必须有限、已用非负、上限为正才画比例；超限只将填充截至100%，原始数值不改；未知/零上限不画比例。表格有自己的滚动容器。

分区链接仅在页面中跳转，不读取或准备 Capsule。读取中/失败会撤下旧对象导航与预算；原有 dispatch 身份、请求哈希、晚到回执和草稿保护不变。新增7个中日译文；字典、占位符和字体覆盖11/11通过，没有重打包字体。

## 检查

- `context-budget-navigation` 8/8：实际方法/数值、真实决策数、本地导航无请求、超限、未知、零上限、读取失败撤下、仅读恢复。
- `context-observation` 14/14：异对象、异 dispatch/哈希/标志拒绝，真实 hash mismatch 保留，晚到回执、草稿与只读恢复均保留。
- `npm run check`、`npm run build` 通过，主 JS 448.59 kB（十进制）。Memory integration 和 Activity retirement 根检查通过，`git diff --check` 通过。
- 完整 `npm test` 通过：Node 131通过、3跳过、0失败；内含 DOM 83场景、1114项断言全部通过。

## 浏览器检查及修正

使用真实 App 的既有 `inspectCapsule` 导航路径挂载合成保存对象，保留 App 网格、Vault gate、记录带和水印。Mock 只返回本片虚构保存字段，不调用真实 Provider 或准备真实 Capsule。

三语 × 两主题 × 两尺寸共12组正常预算页面；英文1100深色再覆盖未知预算、超预算、零上限、未选对象和读取失败，合计17组。最终检查17/17：无文档/主面板横向溢出、内容可见高度超过视口一半、仅有效预算有图；12/12分区链接实际滚动到可见的排除标题。已目视查看中文1440深色、日文1100浅色的最终完整 App 截图。

首次预览误把 Context 放进独立 App 根的标题栏行，截图只露出标题。初版几何断言未覆盖可见高度，不能作为布局证据。目视发现后，预览改走真实 App 路由并增加高度断言；17张截图与 `visual-results.json` 已重做并覆盖初版，以上结果仅指修正后运行。产品布局没有为此绕改。

本机忽略目录 `.design/native-context-2026-11-01/` 保存最终17张 PNG、`visual-results.json`、完整测试及构建日志。没有原生 WebView2/DPI/Narrator、安装、托盘或登录验收；没有打开个人 Vault、改 pin、真实 Provider 或合并。F6 只恢复现有字段可表达的布局与预算；完整 Capsule 索引/分类仍是缺口，未宣称完整复刻。
