# Runtime 后续接续提示词（2026-11-15）

> 历史提示词；当前工作请使用[2026-11-16接续提示词](CODEX_RUNTIME_NEXT_2026-11-16.md)。

以下正文可直接复制到 Enouia Runtime 的新 session。主线前置工作目前在 Memory；本提示词不启动尚未选定的正式 Owner 集成切片。

---

请接手 Enouia Runtime 接续工作，目录 `E:\Enouia Runtime`。先读 `AGENTS.md`，再读：

1. `docs/integration/RUNTIME_CONTINUATION_2026-11-12.md` 顶部的最新更新。
2. `docs/validation/Memory-pin-eb70509-2026-11-14.md`：兼容采用与未完成的新库初始化边界。
3. `docs/MEMORY_INTEGRATION_v1.md` 和 `docs/integration/memory-pin.json`。
4. 做到安装候选或人工验收时再读 `docs/integration/CLAUDE_TO_CODEX_2026-11-10.md` 的配方，以及 `docs/RUNTIME_ACCEPTANCE_GUIDE_2026-11-08.md`。

先 fetch 并核对 main、HEAD、status、工作树，保留 `.claude/` 与其他会话修改，不从旧分支直接继续。已知基线为 `main@84506869299003d9d4b9e764b463571ef3767ea2`，#176、#177 已合并；启动时确认远端新进展。

当前事实：

- 当前源码 Memory pin 为 `eb7050961cceaac04d4aec79257524331be6c7b0`，aggregate `39cc2a820fd132770397e3cef37674b8fca17280c8977bcd161622a43ad54c52`。Workspace v1 仍为 61 命令，没有启用正式 Owner 或读取 grant 接口。
- #177 已保存 Rust 格式、release 58 个原生/适配 +9 个固定 Core 消费者通过（1 忽略）、严格 Clippy、Node 148 通过/3 跳过、DOM 122 场景/2,527 项及相关原生 102/102。它们是相应 revision 的证据，不是新 session 重跑的结果。
- #176 仅把 Windows 调试归属 helper 时限改为 30 秒；归属判定未放宽。实际查询约20秒，旧15秒失败和诊断都有记录。不要为通过测试关闭保护或自动重试。
- 安装候选仍为 `5175284`，嵌入旧 pin `731edd56…`。只有新 pin 的验证用内嵌程序，没有对应的新安装候选。
- 最近取得的 Memory 工程交接中，能力 #102/#106–#108 已合并，真实初始化仍未完成。核对后续交付，不自动认定它仍未完成或已经完成。

下一步按依赖推进：

1. Morii 已授权就工程状态直接与 Memory session 沟通；核对生产驱动是否交付、真实初始化/重开/查询/来源验收是否完成、根类型、revision/aggregate、所需 Runtime 契约和剩余门槛，不索取私人内容或自行探测库。当前主线启动词是 `docs/prompts/CODEX_MEMORY_NEXT_2026-11-15.md`。
2. 若前置仍未完成，记录明确依赖，或处理已有的具体 Runtime 验收反馈；不要重复截图/构建矩阵充当进度，不替 Memory 实现领域逻辑。
3. 若正式 Owner 首个采用入口尚未由 Morii 选定，先给出基于实际契约的最小范围建议；不要擅自新增 Owner GUI、读取范围或把分段根转接成旧 Workspace 库。
4. 只有相应产品/接入切片就绪，或 Morii 明确要求候选时，再从最新 main 打包，执行安装保护与21个安全原生模式，记录失败及重跑，更新候选、验收指南和入口；不要因兼容 pin 已合并就声称新库已经可用。

已授权范围内完成一片就适当验证、提交、推送、开 PR 并直接合并，无需逐次询问。先复现再最小修复，引用现存有效证据，检查范围与风险相称；不得把未跑检查写成通过。

边界保持：不自行打开/读取/迁移个人 Vault；第6、9步由 Morii 在 UI 接入；不跑真实 install/upgrade smoke，不在使用中的桌面运行会弹文件对话框/发系统热键的模式。真实 Provider、部署、长期读取授权、新 Owner 首个入口，以及星图 #24、公开人设 #29 等待定事项不能从直接合并授权取得。Activity/Usage 不回到桌面。

先报告核实后的前置状态和第一片范围，再推进对应已授权工作。
