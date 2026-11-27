# Claude 启动提示词：接手 Enouia Runtime（2026-11-19）

复制下方引用内的内容，给 Claude 在 `E:\Enouia Runtime` 启动。请选同一 Windows 工作目录；另开干净 checkout 拉不到当前未提交的修复，也不会带上本机验证产物。

> 请接手 `E:\Enouia Runtime` 的开发，用中文工作。先读 `AGENTS.md`、`docs/handoff/RUNTIME_CLAUDE_HANDOFF_2026-11-19.md`、`docs/integration/RUNTIME_ROADMAP_2026-11-16.md` 和 `docs/MEMORY_INTEGRATION_v1.md`。核对当前分支、工作树、远端 `main` 和 Memory pin，保留 `.claude/` 及与本片无关的修改。交接基线是 Runtime `35bc7d179ec9289a3609fd88a73cc7e324a84454`（已合并 PR #205）、Memory `506d23dc174a3e927d323f8f8d0b8ecfc9d1726d`；若仓库状态变化，先确认现有补丁是否已交付，避免重复工作。
>
> 第一项是接续本机未提交的 `CatalogMemory.tsx` 和 `memory-smoke.mjs`：旧 R3 候选 `1267268` 上，键盘 Enter 锁定登记只读库后，焦点落到 `BODY`（新断言 24/25）。修复让目录标题接住焦点，构建已完成；还没有修复版的原生通过记录。按交接文档核对修复版 exe、相邻的 WebView2 DLL 和显式合成登记，然后跑 `--owner-readonly-only`。验收须同时覆盖标题焦点、旧内容撤回、页面不能重认证、同根重开、`CURRENT` 不变和自动启动不打开库，预期 25/25。若失败，先区分夹具、Enter 投递和产品问题，做最小修复。若缺产物或夹具，使用交接里的定向配方，不碰真实库。
>
> 通过定向验证后记录对应源码与程序，依照 `AGENTS.md` 提交、推送、开 PR，并在现有授权范围内合并。焦点补丁有 Codex 实质贡献，提交信息空一行后保留 `Co-authored-by: Codex <267193182+codex@users.noreply.github.com>`。保留旧候选 `1267268` 和既有验收证据；不要把交接文件或 `.claude/` 混入产品提交。随后按现有路线自动接续仍获授权、可用合成证据验证的问题，无需等我再说“继续”。没有新的实证问题就不要重复矩阵或另开功能。
>
> 用 `docs/RUNTIME_OWNER_READONLY_ACCEPTANCE_2026-11-17.md` 跟踪 Morii 的人工回执。已有真实登记库代理回执、合成测试、实际安装以及 Morii 人工验收是各自独立的证据。只读接入范围之外的工作（个人 Vault、读取授权、迁移或写入、真实 Provider、新 pin、真实安装/升级、全局热键、登录启动、分发与部署）都等明确授权。Memory PR #120 由上游接续，Runtime 保持现有 pin。若余项全部受人审或外部证据阻塞，列出具体门槛和可立即恢复的步骤。
