# Runtime：Claude → Codex 交接（2026-11-07）

Codex 限额用尽后，Morii 让 Claude 接续。本文接在 [2026-11-04 交接](CLAUDE_TO_CODEX_2026-11-04.md) 之后，那份文档的边界、工具和待决定事项仍然有效。

## 从哪里开始

- **2026-11-07 已全部合并。** Morii 在会话里选定“全部合并 #121–#149 和 #120”。合并顺序：叠放链 #121 → … → #141 → #143 → … → #149（每合一个把下一个的 base 改成 `main`，合并提交，分支保留），最后 #120（星图方案 B）。期间另一个 session 的 #150（Memory pin 升到 `b9faf544da272bfe821c621d59a979b1a434e355`）先进了 `main`。最终 `main@884a6a8`。
- 合并前在独立工作树里把 `main@94bbce9` + 链尾 + #120 合成一次：完整 `npm test`（Node 139 通过 / 3 跳过 / 0 失败；DOM 119 个场景运行、2,470 项全部通过）、`npm run build`（主 JS 470.17 kB）、Memory pin 与 Activity 退役守卫全部通过，无冲突。最终 `main` 与该合成结果的差异只有 #150 的 Cargo / pin / 文档，前端源码和测试完全一致；在最终 `main` 上复跑 pin 与退役守卫通过。没有在最终 `main` 上跑 Rust 或原生检查（#150 的 Rust 证据见其自身记录）。
- 下一片在 `main` 上开新分支。之后另一个 session 又合入了合成采集相关的 #152、#154、#155；Claude 合入了 #151（交接指向 main）与 #153（UI v2 下的原生冒烟脚本修正和 `884a6a8` 候选）。
- 2026-11-08 从 `main@b00034d` 重新打候选包，并修了高对比度下导航焦点框的回归和 `lists-only` 的拦截问题，见 [b00034d 候选记录](../validation/UI-v2-candidate-b00034d-2026-11-08.md)。原生冒烟里会弹文件对话框或发系统热键的模式（picks、quick、operations、history-*、long-lifecycle、damaged-verify）没有在 Morii 使用中的桌面上跑。
- 2026-11-08 至 11-09：#157（高对比度焦点）、#158（`128ae13` 候选与[人工验收指南](../RUNTIME_ACCEPTANCE_GUIDE_2026-11-08.md)）、另一个 session 的 #159（公开人设导出）、#160（两个 DOM fixture 的时序）已合并。之后从 `main@c194305` 重新打了候选包，覆盖 #159，见 [c194305 候选记录](../validation/UI-v2-candidate-c194305-2026-11-09.md)。DOM runner 让定时器等 React Scheduler 跑完再触发，见 [记录](../validation/UI-v2-dom-settled-timers-2026-11-09.md)；写这条时它还在 PR 里（#161）。
- C 盘只剩约 3 GB，Memory 拒绝在空间不足的磁盘上建库（`InsufficientSpace`）。原生冒烟的临时目录可以用 `TEMP`/`TMP` 指到仓库外的 E 盘目录；不能放进仓库（`InsideRepository`）。

## Claude 本轮的切片

| PR | 分支 | 内容 | 记录 |
| --- | --- | --- | --- |
| #143 | `codex/ui-v2-read1-state-fixture` | Codex 写好未提交的 read-1 独立截图桩（八态）与“正在读取…”可见等待；Claude 复现、验证、补记录后提交（含 Codex trailer） | [记录](../validation/UI-v2-read1-state-fixture-2026-11-07.md) |
| #144 | `claude/ui-v2-read1-empty-outcomes` | read-1 空库、召回无选中、详情 `automation_memory_absent` 三处静默分支补说明；截图桩加 `empty` 态 | [记录](../validation/UI-v2-read1-empty-outcomes-2026-11-07.md) |
| #145 | `claude/ui-v2-read2-empty-results` | read-2 检索无匹配与空目录分开说明；截图桩加 `empty` 态 | [记录](../validation/UI-v2-read2-empty-results-2026-11-07.md) |
| （#145 上） | 同上 | 整条链累计门禁：`npm test` 与 `npm run build` 全过 | [门禁](../validation/UI-v2-chain-gate-2026-11-07.md) |
| #146 | `claude/ui-v2-memory-state-fixture` | 记忆库列表七态独立截图桩（初次载入、空库、无匹配、两种索引不可用），只取证 | [记录](../validation/UI-v2-memory-state-fixture-2026-11-07.md) |
| #147 | `claude/ui-v2-review-conflict-fixture` | 收件箱审阅计划过期的 DOM 场景（解释、禁止重试、不重发、取消后保留草稿），并更正 #146 记录 | [记录](../validation/UI-v2-inbox-stale-plan-2026-11-07.md) |
| #148 | `claude/ui-v2-draft-shows-saved` | 草稿与已保存内容不同时显示“已保存的提议（r{修订}）”；完整 `npm test` 通过 | [记录](../validation/UI-v2-draft-shows-saved-2026-11-07.md) |
| #149 | `claude/ui-v2-vault-switch-clearing` | 换库落在两次状态轮询之间时，旧 Vault 的列表和详情会留在新 Vault 下；Explorer/Inbox 按 Vault 身份重新挂载；完整 `npm test` 通过 | [记录](../validation/UI-v2-vault-switch-clearing-2026-11-07.md) |

## 这轮发现的工作习惯

- 两个状态诊断脚本（`read1-` / `catalog-state-diagnostics.mjs`）在本机冷启动时偶尔在第一次 CDP 命令上触发自身 60 秒超时，没有截图就退出。脚本按设计不自动重试；手动重跑一次即可，记录里要写明第一次失败。
- 中文字体子集缺“搜”（U+641C）。目录相关文案用界面已有的“检索”。
- 在 Windows 上用 Python 写 JSON 证据要指定 `newline='\n'`，否则 CRLF 会被 `git diff --check` 当作行尾空白。

## 下一步建议（按顺序，均不需要 Morii 先决定）

1. SCREENS §9 剩下的原生状态只有行为、没有截图（索引不可用由 #146、收件箱计划过期由 #147/#148、换库清除由 #149 补上）：剩下的只有截图取证，例如权限改变 / 删除 / 换库（立即清除面板与派生文本）。可以仿 read-1/read-2 的独立截图桩，为对应的原生面板各做一个只用 mock transport 的预览，先取证，再按“先复现，再最小修复”处理发现的缺口。
2. #120 星图方案 B 在 WebView2 中复测（OPEN_ISSUES #24），达到目标频率才宣称解决。W5 用的独立 Tauri/WebView2 测量壳只保存在当时的本机忽略目录 `.design/w5-browser/`，2026-11-07 已不存在，仓库里也没有源码；复测需要先按 [W5 记录](../validation/UI-v2-W5-starmap-2026-10-27.md) 第 7 行的约束重建测量壳，这是单独一片。
3. ~~`.ts` 模块返回给界面的字符串仍需人工检查~~ 2026-11-07 已在 #149 头部查过：非 fixture / 演示数据的 `.ts` 模块里，三词以上的英文句子和返回的短标签都经 `msg()` / `t()`；演示动作抛出的 `Error` 消息也是 `msg()` 键并在渲染时翻译；`nativeTime.ts` 的 `Now` 在 `TimeMap` 里 `t()`。fixture、`demo-data.ts`、`starfield.ts` 的主题名与 `vault-demo-states.ts` 是虚构内容，按约定保持英文。没有发现泄漏，未改代码。查法：按“英文句子字面量数量 / msg·t 调用数量”给 `.ts` 文件排序，再逐条排除已包裹的字面量。

## 仍待 Morii 决定（不推进）

同 2026-11-04 交接：合成面板枚举 / ISO 是否翻译；Windows 独立验收环境；新 Owner 后端首个采用切片。
