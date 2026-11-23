# R5：ChatGPT 提交的主题标注（2026-11-23）

Morii 为主题形成选了方案 A：连接器部署后由 ChatGPT 用 `memory_submit_theme` 提交主题，Memory 以普通主题记忆入库（kind theme、change synthesis、interpretation inference，derived_from 指向引用的 2–32 条每日记忆）。pin 升至 Memory main `e7d8b25ef1499ad2d6e4ffa85826352ba4555af2`（[#152](https://github.com/Morii9961/enouia-memory/pull/152) ADR-MEM-174，合并 `5d290bc`；其后 #153–#155 只改测试与文档）；aggregate `a925dfe4…`，61 命令。

## 改动

- 形成理由的 prompt_version 为 `chatgpt-connector-theme-1` 时，界面写“ChatGPT 推断 · 模型名”（与每日记忆的“由 ChatGPT 提取”区分）。主题泳道、主题成员和主题操作不用改。

## 验证

| 检查 | 结果 |
| --- | --- |
| `cargo test --locked`；clippy、fmt；`check-memory-integration --memory-checkout <e7d8b25>` | 74 + 9 通过；通过 |
| tsc、i18n 与 CJK 字形子集；DOM 夹具全量（`registered-views` 新增 1 项：ChatGPT 主题标为它的推断）；`npm` 单元测试 | 通过；151/151 |
| 发布版程序（SHA-256 `b83112dc12ccdaf04d5c354876915bbdf75bd8fe95f249718fcb1ea0b026ae86`）原生 `--owner-readonly-only` / `--catalog-only` | **41/41** / **42/42** |
| 真实库只读走查 | **22/22**；CURRENT 前后均为 440 |

## 边界

- 连接器尚未部署（待域名），真实库目前没有 ChatGPT 主题；主题泳道照常显示空状态。主题只能涵盖连接器的每日记忆。
