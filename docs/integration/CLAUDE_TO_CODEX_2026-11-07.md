# Runtime：Claude → Codex 交接（2026-11-07）

Codex 限额用尽后，Morii 让 Claude 接续。本文接在 [2026-11-04 交接](CLAUDE_TO_CODEX_2026-11-04.md) 之后，那份文档的边界、工具和待决定事项仍然有效。

## 从哪里开始

- 主目录 `E:\Enouia Runtime`，当前分支 `claude/ui-v2-memory-state-fixture`（草稿 #146 头部）。下一片从这个分支开新分支，PR 以它为 base 继续叠放。
- 主目录有 `docs/status/PROJECT_STATUS.md` 与 `project-status.json` 的未提交改动，内容与 `claude/status-2026-11-07`（草稿 #142，另一个 session 的工作树）里已提交的快照完全一致。不要在功能分支上提交它们，也不要丢弃；等 #142 的去留由 Morii 决定。
- 草稿链：#120（星图方案 B，基于 `main`）单独一条；#121 → … → #141（Codex）→ #143 → #144 → #145 → #146（Claude）依次叠放。全部未合并，合并需要 Morii 明确同意。

## Claude 本轮的切片

| PR | 分支 | 内容 | 记录 |
| --- | --- | --- | --- |
| #143 | `codex/ui-v2-read1-state-fixture` | Codex 写好未提交的 read-1 独立截图桩（八态）与“正在读取…”可见等待；Claude 复现、验证、补记录后提交（含 Codex trailer） | [记录](../validation/UI-v2-read1-state-fixture-2026-11-07.md) |
| #144 | `claude/ui-v2-read1-empty-outcomes` | read-1 空库、召回无选中、详情 `automation_memory_absent` 三处静默分支补说明；截图桩加 `empty` 态 | [记录](../validation/UI-v2-read1-empty-outcomes-2026-11-07.md) |
| #145 | `claude/ui-v2-read2-empty-results` | read-2 检索无匹配与空目录分开说明；截图桩加 `empty` 态 | [记录](../validation/UI-v2-read2-empty-results-2026-11-07.md) |
| （#145 上） | 同上 | 整条链累计门禁：`npm test` 与 `npm run build` 全过 | [门禁](../validation/UI-v2-chain-gate-2026-11-07.md) |
| #146 | `claude/ui-v2-memory-state-fixture` | 记忆库列表七态独立截图桩（初次载入、空库、无匹配、两种索引不可用），只取证 | [记录](../validation/UI-v2-memory-state-fixture-2026-11-07.md) |

## 这轮发现的工作习惯

- 两个状态诊断脚本（`read1-` / `catalog-state-diagnostics.mjs`）在本机冷启动时偶尔在第一次 CDP 命令上触发自身 60 秒超时，没有截图就退出。脚本按设计不自动重试；手动重跑一次即可，记录里要写明第一次失败。
- 中文字体子集缺“搜”（U+641C）。目录相关文案用界面已有的“检索”。
- 在 Windows 上用 Python 写 JSON 证据要指定 `newline='\n'`，否则 CRLF 会被 `git diff --check` 当作行尾空白。

## 下一步建议（按顺序，均不需要 Morii 先决定）

1. SCREENS §9 剩下的原生状态只有行为、没有截图（索引不可用已由 #146 补上）：plan 过期 / revision 冲突（`revision_conflict`、`review.stale_plan`，要求保留草稿）、权限改变 / 删除 / 换库（立即清除面板与派生文本）。可以仿 read-1/read-2 的独立截图桩，为对应的原生面板各做一个只用 mock transport 的预览，先取证，再按“先复现，再最小修复”处理发现的缺口。
2. #120 星图方案 B 在 WebView2 中复测（OPEN_ISSUES #24），达到目标频率才宣称解决。
3. `.ts` 模块返回给界面的字符串仍需人工检查（JSX 已有守卫）。

## 仍待 Morii 决定（不推进）

同 2026-11-04 交接：合成面板枚举 / ISO 是否翻译；草稿链合并范围与顺序；Windows 独立验收环境；新 Owner 后端首个采用切片。
