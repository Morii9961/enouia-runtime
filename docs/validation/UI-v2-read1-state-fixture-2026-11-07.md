# UI v2：read-1 读取状态截图桩与可见等待（2026-11-07）

基线 `12455b5c9c6e8e13f2e3d486a5ccba9d4d94a418`，分支 `codex/ui-v2-read1-state-fixture`，接续草稿 #141。Codex 写好代码与诊断后限额用尽，Claude 接手验证、补记录并提交。仅合成浏览器证据，未合并，不代表原生或人工接受。

新增独立 read1-state-preview.html / .tsx，复用原 AutomaticMemory 与 core8 合成页。沿用三栏容器和固定英文水印 FICTIONAL FIXTURE · NO NATIVE CONNECTION；SDK/Workspace 调用一律拒绝，automation transport 只允许 status/page。八态：首次读取、页面等待、页面失败、状态失败、打开、锁定、禁用、不可用。

产品修正：库已打开、page/detail 读取进行中时原来只有 aria-busy 和禁用按钮，现在显示走 role=status 的“正在读取…”（中日字典各一条）。没有新增请求、重试、轮询、操作或 key；枚举和 ISO 原样。

先复现再修正：`automatic-memory` DOM 新增 5 项（页面等待可见、三语切换不重发、详情等待可见），在修复前的组件上都失败；修复后原有与新增共 26 项通过。TypeScript、i18n/CJK 12 项、Memory pin 与 Activity 退役守卫通过。

自有 Edge 156/profile、1100×700：第一次运行在 `Page.enable` 上触发脚本自身的 60 秒 CDP 超时，没有截图，按脚本约定不自动重试；手动重跑一次通过。三语双主题八态 48 行/48 张截图，四态再各切三语 72 行，共 120 行。页面错误 0，宿主动作 0，读取只有 status/page，启动器退出 0。语言切换保留输入节点、焦点、草稿和行节点，不重发 page。复核日文浅色页面等待、中文深色打开截图。

复现：`node e2e/read1-state-diagnostics.mjs <Edge executable> target/<owned-directory>`（cwd `apps/desktop`），`--pending-only` 只跑页面等待/打开。没有完整 npm test、构建、Rust、原生 smoke、实际缩放、个人 Vault、Owner、真实 Provider、持续形成、迁移或部署；Memory pin 不变。
