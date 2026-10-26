@AGENTS.md

# Claude Code 补充

- 项目约定、流程和硬规则都在上面导入的 `AGENTS.md`，Codex 也读同一份，改动只改那一处。
- 细则在 `docs/design-kit/`，做到对应阶段再读，不要一开始全部读进上下文。
- 并行做多个方向时可以用子代理，但子代理是冷启动：必须让它**自己去读** `docs/design-kit/` 里相关的文件和对应的 `DIRECTION.md`，不要只转述。每个子代理只写自己那个方向的目录。
- 看截图：用 Read 读取 `tools/shot.mjs` 生成的 PNG。无法读图时在报告里明说。
- 可以用内置浏览器或 Playwright 预览页面；对比与自检以 `tools/shot.mjs` 的输出为准，保证每次口径一致。
