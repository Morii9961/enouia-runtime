# Runtime：Codex → Claude 交接（2026-11-03）

Morii 最新要求：完成手头 read-2 前端切片后停止开发，整理交接及新 session 启动提示词，在周限额耗尽前交付。本次已收尾；下面的待办交给 Claude，不由本 session 继续展开。没有等待中的构建或测试。

## Claude 接续进度（截至 `d6d8dd4`）

以下切片已在 `codex/read2-synthetic-surface` 上逐片验证、提交并推送，随草稿 PR #118 更新，均未合并。逐片记录见 [当日接续表](../design/ui-v2/CONTINUATION_2026-11-03.md)。

- `678f475`：read-2 原生三语 × 双主题 × 1100×700 矩阵；修复英文标签越框（`.mem-tag` 改用 min-height）和 read-2 新增文案的 CJK 字形覆盖（`3a5dc33` 起 `cjk-fonts` 失败）。
- `a619013`：`i18n.test.mjs` 新增解析守卫（Vite `parseSync`），覆盖 JSX 字面文字、可访问名称和子表达式字面量；52 处改为整句翻译。
- `4ed0b3d`：`operation-stop-observation` 改为等终态渲染再断言（OPEN_ISSUES #5 同类）。
- `233571b`：#24 CDP 追踪。成本在 GPU 进程光栅反序列化，不在 JS；虚线主题线约占每帧 GPU 光栅 80%。产品绘制不变。
- `0442ff0`：演示记忆库区分空分组与无匹配。
- `d6d8dd4`：read-1 也接入同一原生矩阵（共用 `surfaceMatrix`）。

待 Morii 决定：合成面板的库状态 / 枚举 / 时间是否翻译（现按 `413d318` 保持原样）；#24 降成本的视觉取舍；#13 / #3 / #4 / #15 等既有 owner 项。#14 的整屏空库等状态需要一套演示状态，尚未开始。物理托盘、热键冲突、登录启动与安装仍是独立验收项。

## 从哪里开始

- **继续代码所在工作树**：`E:\Enouia Runtime\.worktrees\read2-pin-compatibility`，当前分支 `codex/read2-synthetic-surface`。目录名是最初 pin 切片名称，当前分支已向下推进，**不要切回旧分支**。
- 最新功能代码：`3a5dc335f6b371756f518df2759cd2dfa86d49c2`。交接文档提交在它之后；先核对实际 HEAD/status。功能代码已提交并推送，交接完成后也会推送。
- 原目录 `E:\Enouia Runtime` 保持干净 `main@61715c1677eef5f22eebbb7d70907675bdaa66b2`；已在交接时用 `ls-remote` 核对 origin/main 相同。没有合并到 main。
- 另一个工作树 `E:\Enouia Runtime\.worktrees\ui-v2-review-continuation` 停在 `e6808fc8ae8647104991185868079eb27d00420c`，其内容已包含在当前分支祖先中。
- Remote：`https://github.com/Morii9961/enouia-runtime.git`。三个工作树均保留，不做 reset/clean/清缓存。

这是叠放的四个草稿 PR，按表格顺序依赖，均未合并；不要跳过下层直接把上层当成独立变更。若后续获准整合，先重新读取远端状态、核对 base 和 diff。

| PR | 分支 / 功能基线 | 范围 |
| --- | --- | --- |
| [#115](https://github.com/Morii9961/enouia-runtime/pull/115) | `codex/ui-v2-review-continuation` / `e6808fc` | UI v2 动态三语、保留回执/错误与星图诊断；base main |
| [#116](https://github.com/Morii9961/enouia-runtime/pull/116) | `codex/read2-pin-compatibility` / `bbdea44` | 精确更新 merged Memory pin；base #115 分支 |
| [#117](https://github.com/Morii9961/enouia-runtime/pull/117) | `codex/read2-synthetic-native` / `73ca965` | 独立 segmented 合成原生入口；base #116 分支 |
| [#118](https://github.com/Morii9961/enouia-runtime/pull/118) | `codex/read2-synthetic-surface` / `3a5dc33` | page + stats 前端、授权到期观察与本次交接；base #117 分支 |

## 已完成及证据

1. 前端动态文案：历史比较/来源简报/冲突恢复、共用进度与停止、Provider 草稿、候选/设置/调用/退出状态、历史四面板、详情/任务、Quick Search、Shell Settings、OperationWatch。语言切换时保留原始记录、确认码、错误原因、重试闭包及输入焦点，不重发操作。逐项提交和报告见 [当日接续](../design/ui-v2/CONTINUATION_2026-11-03.md)。
2. 星图 #24：独立浏览器定位光晕/混合/主题线成本，虚线方案及 opaque context 对照，JSON 结果和测量限制均已保存。**产品绘制没有改变，#24 未解决**；不能用删主题线、改实线或单看 JS draw 时间宣称完成。
3. Memory 精确 pin：`0d338f12f51a859363e0725071bcf43874b492c7`（Memory #82 已合并），surface hash `61e8712d37e456de326725caf589a74950a10992437632b59bbaaa2b3635b4ef`；五个 manifest 引用、九个 locked Memory 包一致。Workspace v1/schema 1/58 命令兼容。完整门禁见 [pin 报告](../validation/Memory-pin-0d338f1-2026-11-03.md)：Node 134 通过/3 跳过、DOM 86 场景/1,376 断言、Rust 46+8、严格 Clippy、构建、metadata/domain 与 pin 负例，旧 read-1 原生 18/18。这是 `bbdea44` 的证据，不能改写为最新全量结果。
4. read-2 原生：显式 `--memory-catalog-synthetic` 新建独有临时 SegmentedV1 根、新 System/profile/Private 上限；三条固定中英记录由真实 Core prepare/evaluate/apply 接受。main-only `memory_catalog` schema 2 / `memory-native-read-2`，闭合 status/page/stats/lock/unlock；旧根、Workspace、read-1 不采用新根。锁定/退出先撤下读取；Provider 设置跳过且更新被拒绝；autostart 不初始化例库。原生片完整 Rust 50+8、旧 read-1 18/18、新入口 17/17 等见 [原生报告](../validation/UI-v2-read2-native-entry-2026-11-03.md)。
5. read-2 前端：`CatalogMemory.tsx`、`catalog.ts` 及 MemorySurface 独立合成 collection，二条分页、中文字面查询、同 selection 的 page + stats、显式刷新/锁定；统计失败不显示半页结果。busy 保留草稿/焦点但隐藏观察，锁定及失效范围撤行，迟到响应丢弃。status 经 Core 重新授权，覆盖授权到期而 CURRENT 不变的场景。最新 [前端报告](../validation/UI-v2-read2-surface-2026-11-03.md)：Node 定向 17、新 DOM 23、既有 DOM 19/24、目标 Rust 5（其余过滤）、fmt/严格 Clippy、前后端构建、真实原生 21/21 与两张已查看截图；主 JS 460.45 kB。**最新片没有重复全量 npm test / Rust suite**。

## 接下来做什么

建议第一项接续为 **read-2 新前端的定向原生复验**：当前已覆盖英语窗口的列表/分页/中文记录搜索/锁定，三语焦点和状态竞态主要是 DOM 证据，尚无该新 collection 的两主题、窄窗口及三语原生矩阵。先读报告和实现，检查真实可复现问题，再按最小片修复并验证、提交、推送。既有窗口/DPI/W7 历史证据不能套到这片新 UI 上。

之后继续当前 UI v2 的保留内容、等待与恢复分支审阅；字典覆盖并不证明所有动态路径完成。#24 的下一步应提出新的完整渲染链路假设并测量；视觉取舍要 Morii 决定。`OPEN_ISSUES.md` 还保留物理托盘 #25、安装/升级 #27、默认 Ctrl+Alt+M 冲突 #28、真实登录启动及 Morii 接受等独立待办；不要把测试 Q 成功或构建候选包等同这些项目完成。

read-2 尚未做 facets、时间分桶、图投影、完整 record 详情、持续 formation、Agent/Runtime capture 或 Owner 接线。这些是后续契约/激活边界，**不是本片遗留未提交代码**；先对齐 Memory 当前路线和所需激活门槛，不擅自扩展。当前 frontend 是固定三条合成记录，不能称日用 Memory 已就绪。

## 必须保留的边界与协同信息

- `AGENTS.md`、`DESIGN.md`、[Memory integration v1](../MEMORY_INTEGRATION_v1.md) 是约束。Runtime 只维护宿主/适配器/前端；Memory 域归 `Morii9961/enouia-memory`，冻结 Runtime-local Memory crates 不扩展。只用 exact Git pin，不提交本地路径、branch 或 patch。
- 没有打开个人 Vault、Owner enrollment/adoption、真实 Provider、生产迁移/部署；合成 descriptor 内的 owner 记账不是正式 Owner 身份。`active_vault` 也不是 Runtime adoption 或授权凭据。
- Activity/Usage 已退役，不得恢复 UI/命令；保留独立旧 producers/任务/ledger，未经单独授权不清理。
- Memory 协同 session ID：`01a19eb6-e2df-77b1-8e7d-ff2496997649`。对方最后确认 main 为 `0d338f1`；PR #83 已推至 `06b0e3e`，pipe-6 仍在其分支验收，不影响当前 read-2。此为接收时快照，后续需重新核实；不要自动采用未合并 #83。
- 对方已确认新合成接线使用新根的 `SegmentedMemoryReader::from_authenticated_system`，不能复用旧 HostV2。fixture 的 occurred_at/time_precision 不一致已由本 session 修正（未知日期用 Unknown）；Memory 无需为此改代码。
- Native smoke 曾分到 Fetch 禁用端口 1720；脚本现从 49152–65535 探测空闲端口，保留 PID 所有权保护。不要因旧日志中的 bad port 改产品网络或重发 Memory 请求。
- 保存日志在忽略的两个 `target/pin-verification/` 下；最终本机合成截图位置见前端报告。没有将临时根/敏感配置加入 Git。不清理其他进程或缓存，未知结果保留原 packet/key。
- Node `>=24.15.0`；Rust 1.98.1 Windows GNU。当前机器命令需给 PATH 前置 `C:\msys64\ucrt64\bin;C:\Users\Morii\.cargo\bin;`，Cargo 使用 `CARGO_NET_OFFLINE=true`、`CARGO_INCREMENTAL=0`、`CARGO_BUILD_JOBS=2`。不必为阅读交接重新构建。
- 每片按范围验证，不默认跑全套。Memory 集成变更需 `node scripts/check-memory-integration.mjs`；Activity 退役检查为 `node scripts/check-activity-retirement.mjs`。定向 DOM 可用 `node tests/dom-fixtures.mjs --worker catalog-memory`（cwd `apps/desktop`）；Rust catalog 可用 `cargo test --locked memory_catalog`（cwd `apps/desktop/src-tauri`）。原生 smoke 的四个位置参数必须全用新建、自有、无个人数据的临时路径，先读脚本，不复用历史实际根。
- 每个完成片验证、提交、推送；保留其他人的改动。Codex 贡献提交已有指定 trailer；Claude 后续遵循仓库对实际贡献者的要求，不复制成 Codex 冒名贡献。

新 session 可直接复制 [启动提示词](../prompts/CLAUDE_RUNTIME_RESUME_2026-11-03.md)。本 session 到交接为止停止，没有暗中开始下一项。
