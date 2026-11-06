# UI v2：read-2 读取状态截图桩（2026-11-06）

基线 `117ca58af84f7c253dc511e5b6ce2ba9ea586cf4`，分支 `codex/ui-v2-catalog-state-fixture`，接续草稿 #139。仅合成浏览器证据，未合并、不代表原生或人工接受。

新增独立 catalog-state-preview.html / .tsx，复用原 CatalogMemory 与既有 catalog.mjs 样本。使用原三栏容器，固定英文技术水印 FICTIONAL FIXTURE · NO NATIVE CONNECTION；SDK/Workspace 调用拒绝，目录 transport 只允许 status/page/stats。支持首次读取、统计等待、统计失败、状态失败、打开、锁定、禁用、不可用八态。产品组件、默认入口、枚举/ISO、Memory pin 和 Rust 不改。

实际检查：桌面包 TypeScript、原 catalog-memory DOM 23 项、Memory pin/Activity 退役守卫、诊断语法和 diff 检查通过。TypeScript 配置只含 src 与 Vite 配置，e2e 由本次浏览器的 Vite 实际编译，不称 e2e 经过 tsc。无字典或字体变动，未重跑 i18n/CJK。

自有 Edge 156/profile、1100×700：三语双主题八态，48 项与 48 张截图；四态再各切三语，72 项，合计 120 项。保存标题/正文、行节点、输入草稿与焦点保持，语言不重发 page/stats；统计未就绪不显示半页/计数，全部宿主动作 0，页面错误 0。该次工具调用遗漏返回的会话句柄，虽然完整报告已写且自有进程随后已退出，退出码未捕获，不能写成退出 0。

随后只将诊断预热从整 App 收窄至自身 fixture 模块，首次读取/统计等待三语双主题复查 30 项与 12 张截图通过、页面错误 0，明确观察启动器退出 0。初次矩阵误把整行中的可翻译说明也当原文比较，诊断停住；改为仅比较保存标题/正文、另查节点身份后通过，没有因此修改产品。最终复核日文浅色统计等待、中文深色状态失败截图。

截图确认两个后续最小修正点：统计等待仅按钮禁用和 aria-busy，没有可见进度；状态失败仍显示“正在读取库状态…”。本片只保存证据，另片修复反馈，不增加恢复/重试动作。对 .ts 保留反馈的限定审阅未发现新翻译固化问题，不称全部文案已审计。

复现：`node e2e/catalog-state-diagnostics.mjs <Edge executable> target/<owned-directory>`；`--pending-only` 为入口/等待定向矩阵。没有完整 npm test、构建、Rust、原生 smoke、实际缩放、个人 Vault、Owner、真实 Provider、持续形成、迁移或部署；保留历史全量结果及其原修订边界。
