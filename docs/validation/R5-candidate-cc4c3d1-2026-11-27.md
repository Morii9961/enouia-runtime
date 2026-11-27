# R5 Windows 候选 `cc4c3d1`（2026-11-27，已装到本机）

从 Runtime main `cc4c3d1`（#288 合并）构建，接替 [`e31b6d7`](R5-candidate-e31b6d7-2026-11-27.md)（作废，产物已删）。内嵌 Memory pin `b5b05fa`。x64、当前用户 NSIS 安装方式，未签名。为了不和共用 `E:\Enouia Runtime` 的界面重构会话互相影响，前端在单独的工作树里构建，Rust 部分沿用主工作区的构建缓存。产物在 `apps/desktop/target/candidate-cc4c3d1/`。

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| `Enouia Runtime_0.1.0_x64-setup.exe` | 39,821,277 | `508375d5864e412d3f8b8cad35dd60c6ad8bf6ad2c6a3ea43b60f6413724c6b4` |
| `enouia-desktop.exe`（构建目录） | 93,403,168 | `3266b4de66ff59ec8271d4cc211d288236b49923a659abce6948801a2f9df3f8` |
| `enouia-memory-mcp.exe` | 59,519,844 | `6ea74578de519bf96be8aff8e1263c39a022c6748559c2cc65bd268bcbdd4f01` |

安装后的 `enouia-desktop.exe` SHA-256 为 `16ceb8dfb43e5623ce68909b3cf6fa802f40aec49dae4dc0a17ca1212e87ae77`。

## 这一版包含的内容（相对 `e31b6d7`）

- #288：人物与地点页可以显示每个条目背后的记忆。已确认的组整组显示一次，选中一条后右侧显示详情和原文引用；已确认的组显示成一条，组内的提及条目折叠起来。
- #287：界面重构会话的同口径截图页（只在测试里用）。

## 实际执行的检查

| 检查 | 结果 |
| --- | --- |
| #288 源码树 | `npm run check`、`npm test`（registered-people 9/9）、`npm run build` 通过 |
| `template-check.ps1` | 26/26 |
| 本机升级安装（`/S`） | 退出码 0。安装前 Runtime 和 Ollama 都已经不在运行：Morii 先退出了 Runtime，Ollama 也随之关闭 |
| 从桌面快捷方式启动 | Runtime 启动了 `ollama.exe` 作为子进程，库已打开（343 条，Memory 侧同一时段在清理库）；人物与地点页中 Enouia 显示为一条“已确认为同一个 · 5 个条目”，“显示记忆”列出 5 条记忆的全文，点开一条，右侧显示详情 |
