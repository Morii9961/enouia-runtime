# UI v2：合成 Memory 读取反馈（2026-11-06）

基线 `fea8fce7d213e4ddcb05ae92e5f6f7d7bedcfb3b`，分支 `codex/ui-v2-catalog-reading-feedback`，接续草稿 #140。问题来自上一片实际截图，不扩展后端契约。

read-2 目录的 page/stats 等待原来只有 aria-busy 与禁用按钮，现在增加可见、走 role=status 的“正在读取目录页和统计…”。read-1/read-2 状态读取失败后原来仍显示“正在读取库状态…”，现在显示“库状态未知。”，同时保留原错误。真正首次未返回仍显示读取中；已知 locked/disabled/failed 等枚举显示不变。只改显示分支与两条中日文字典，没有新增请求、状态机、重试、轮询、key 或 Provider 行为。

先复现再修正：目录 DOM 新 5 项在修复前均失败，修复后原有与新增合计 28 项通过；相邻 read-1 用既有 busy 状态场景新增 1 项，修复前失败，修复后合计 20 项通过。验证包含原正文、来源/召回、草稿焦点、迟到结果撤销和原操作次数；所有操作均在 mock。

TypeScript 在最后 read-1 文案修改后复查通过。i18n/CJK 12 项在字典/read-2 修改后通过，read-1 只复用同一个已检查的键，未改字体。Memory pin 与 Activity 退役守卫通过，随后只补 read-1 显示表达式；diff 检查通过。

自有 Edge 156/profile、1100×700：read-2 首次读取、统计等待、状态失败，三语双主题 18 项/18 张截图；等待/失败再切三语 36 项，共 54 项通过。读取提示和未知状态文案正确，页面错误与宿主动作均 0，启动器退出 0。原始标题/正文、输入节点、草稿与焦点保持，语言不重发 page/stats。复核日文浅色等待、中文深色失败截图。read-1 本片只有 DOM 证据，不套用 read-2 截图。

复现：`node e2e/catalog-state-diagnostics.mjs <Edge executable> target/<owned-directory> --feedback-only`；DOM 为 `catalog-memory` 与 `automatic-memory` workers。没有完整 npm test、构建、Rust、原生 smoke、实际缩放、个人 Vault、Owner、真实 Provider、持续形成、迁移、部署或物理 shell 接受；Memory pin 不变。
