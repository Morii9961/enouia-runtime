@AGENTS.md

当前接续入口（2026-11-24）：先读[Runtime交付路线](docs/integration/RUNTIME_ROADMAP_2026-11-16.md)顶部的“当前状态”。R4/R5已合并，pin为abdcacf，本机装的是eaa410c（仍为ca76892，新pin构建待Morii同意后再装），剩下的是Morii的周末验收、[周末一页](docs/integration/R5_MORII_DECISIONS_2026-11-23.md)中的决定，以及待约时间的ChatGPT接主库。Memory领域工作在Memory仓库进行，Runtime只负责升级pin和改界面。

[状态报告](docs/status/PROJECT_STATUS.md)及[Dashboard JSON](docs/status/project-status.json)仅为手动快照；历史验证和验收边界见[旧接续记录](docs/integration/RUNTIME_CONTINUATION_2026-11-12.md)。授权内Runtime切片验证后可直接合并；个人库、Provider、安装/部署及待定产品决策的边界保留。

# Claude Code 补充

- 项目约定、流程和硬规则都在上面导入的 `AGENTS.md`，Codex 也读同一份，改动只改那一处。
- 细则在 `docs/design-kit/`，做到对应阶段再读，不要一开始全部读进上下文。
- 并行做多个方向时可以用子代理，但子代理是冷启动：必须让它**自己去读** `docs/design-kit/` 里相关的文件和对应的 `DIRECTION.md`，不要只转述。每个子代理只写自己那个方向的目录。
- 看截图：用 Read 读取 `tools/shot.mjs` 生成的 PNG。无法读图时在报告里明说。
- 可以用内置浏览器或 Playwright 预览页面；对比与自检以 `tools/shot.mjs` 的输出为准，保证每次口径一致。
