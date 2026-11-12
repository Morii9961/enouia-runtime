@AGENTS.md

当前接续入口（2026-11-12）：先读 [Runtime 接续入口](docs/integration/RUNTIME_CONTINUATION_2026-11-12.md)。#120–#174 已合并进 `main`，项目在统一验收阶段；Morii 已授权完成验证的 PR 直接合并，不再逐片询问。最新 Windows 候选仍为 [5175284](docs/validation/UI-v2-candidate-5175284-2026-11-11.md)，人工验收按 [验收指南](docs/RUNTIME_ACCEPTANCE_GUIDE_2026-11-08.md)。待决定事项、个人 Vault 与安装/Provider/集成边界不变；历史配方见 [2026-11-10 交接](docs/integration/CLAUDE_TO_CODEX_2026-11-10.md)。

# Claude Code 补充

- 项目约定、流程和硬规则都在上面导入的 `AGENTS.md`，Codex 也读同一份，改动只改那一处。
- 细则在 `docs/design-kit/`，做到对应阶段再读，不要一开始全部读进上下文。
- 并行做多个方向时可以用子代理，但子代理是冷启动：必须让它**自己去读** `docs/design-kit/` 里相关的文件和对应的 `DIRECTION.md`，不要只转述。每个子代理只写自己那个方向的目录。
- 看截图：用 Read 读取 `tools/shot.mjs` 生成的 PNG。无法读图时在报告里明说。
- 可以用内置浏览器或 Playwright 预览页面；对比与自检以 `tools/shot.mjs` 的输出为准，保证每次口径一致。
