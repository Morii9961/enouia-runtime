# read-1 合成自动记忆原生三语 × 双主题 × 最小窗口复验

基线：`0442ff0`，分支 `codex/read2-synthetic-surface`。只改原生 smoke 脚本，产品代码不变。

`413d318` 补齐 read-1“合成的自动记忆”面板的中日文动态文案时，没有做原生验收。本片把 [read-2 矩阵](UI-v2-read2-native-matrix-2026-11-03.md) 抽成 `memory-smoke.mjs` 的共用 `surfaceMatrix`，并在 `--automatic-only` 的召回模拟截图之后调用。此时列表、详情、按需读取的原文和只读召回结果同时在屏，是这个面板信息最密的状态。检查项与 read-2 相同：

- 自有主 HWND 实际缩到 1100×700；
- 在 Quick Search 窗口写入语言偏好，走真实的跨窗口切换；
- 用 CDP 模拟深 / 浅系统配色；
- 每格检查根和窗格无溢出、标签文字在边框内，并截图；
- 列表行数和全部 `pre` 原文（读取的原文与 Core 渲染的召回）在切换语言后保持不变，不重新读取。

## 实际运行

- 重新构建前端与调试原生程序（custom-protocol），包含截至 `0442ff0` 的界面文案。
- 新建 `enouia-runtime-core8-smoke-tOxytI` 合成 fixture、自有进程和独立 WebView2 profile：`--automatic-only` 36/36（原 18 项 + 矩阵 18 项）。
- 抽取共用函数后，新建 `enouia-runtime-catalog-smoke-05K6eP` 重跑 `--catalog-only`：39/39，检查项与截图名不变。
- 已查看 ja 深色、zh 浅色截图：无溢出、无越框，换行的记录按钮完整撑高。库状态、枚举值和 ISO 时间按 `413d318` 的口径原样显示。
- `node --check` 通过；没有改产品代码，没有重跑 npm / Rust 套件。

日志在忽略的 `apps/desktop/target/pin-verification/core8-matrix*.log` 与 `catalog-matrix-refactor.log`；截图只在本机临时 fixture 的 `out/` 中，未提交。

## 边界

配色是媒体模拟，窗口缩放只用当前 DPI；不代表其他显示器、Narrator 或人工验收。全部数据为固定合成记录，没有个人 Vault、Owner、真实 Provider，也没有迁移或部署。
