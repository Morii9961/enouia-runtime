# Enouia Runtime 项目状态

快照时间：2026-11-07T13:26:23+08:00 · 协议 1.1 · 项目 ID `enouia.runtime` · 报告：Claude

代码基线：`main@0cc1cb0`。阶段：集成中（`integration`）。整体进度不估算。

#115～#119 已合入 main：Memory pin 升到 0d338f1，read-2 合成原生入口、主题三选一和三语文案修复进入主线。之后又叠了 22 个草稿 PR（#120～#141），含星图方案 B 和演示状态集，均未合并。原生候选、安装/托盘/热键验收及新 Owner 后端采用仍待完成。

## 里程碑

| ID | 事项 | 状态 | 证据 | 人工验收 |
| --- | --- | --- | --- | --- |
| `desktop_local` | 桌面启动与基础功能（合成环境） | 完成 | 已有测试 | 待验收 |
| `memory_workflow_local` | Memory 会话与上下文本地闭环（合成环境） | 完成 | 已有测试 | 待验收 |
| `memory_mv7_integration` | Runtime 已采用 Memory 精确 pin 0d338f1，Workspace v1 58 命令兼容 | 完成 | 仓库证据 | 不需要 |
| `live_provider` | 真实模型对话、来源提取与历史批次质量验收 | 进行中 | 已有测试 | 待验收 |
| `tools_experience` | 通用工具执行与实际体验 | 未知 | 仓库证据 | 未知 |
| `windows_acceptance` | UI v2 Windows 候选包及安装/托盘/热键/登录启动验收 | 进行中 | 已有测试 | 待验收 |
| `activity_acceptance` | 历史 Activity J1/B4：原 Runtime 路线已退出，旧验收不再推进 | 未知 | 仓库证据 | 不需要 |
| `activity_production` | 历史 Activity B5：原切换路线已退出，旧程序处置待迁移验收 | 未知 | 仓库证据 | 不需要 |
| `history_batch_requests` | 历史批次本地准备、精确检查、单独确认发送与重启恢复（主线） | 完成 | 已有测试 | 待验收 |
| `private_usage_ledger` | 历史私有用量账本：退出 Runtime 界面，旧代码和数据仍保留 | 未知 | 仓库证据 | 不需要 |
| `ui_v2_native` | UI v2 三语、主题及原生适配已进入主线 | 完成 | 已有测试 | 待验收 |
| `activity_usage_retirement` | Activity/Usage 桌面入口及原生命令退役（独立旧程序未清理） | 完成 | 已有测试 | 不需要 |
| `native_frontend_continuation` | 首页/会话/Inspector/Context 与三语/焦点 21 切片交付 | 完成 | 已有测试 | 待验收 |
| `read2_synthetic_native` | read-2 合成原生入口与 page/stats 前端（#117、#118 已合并，仅三条合成记录） | 完成 | 已有测试 | 不需要 |
| `ui_v2_review_continuation` | UI v2 续作：三语动态文案、主题三选一、星图诊断与决定记录（#115、#119 已合并） | 完成 | 已有测试 | 待验收 |
| `ui_v2_draft_chain` | UI v2 草稿链 #120～#141：星图方案 B、演示状态集、五个工作区、窄屏重排、Timeline 缩放等（未合并） | 进行中 | 仓库证据 | 待验收 |

## 当前卡点

- **全设计呈现受现有读取能力限制**：Home 连续真实迹线/近期摘要、全库分类、完整 Capsule 索引需要 Memory 领域契约；不能用当前页或虚构内容冒充。
- **原生与新后端采用仍有缺口**：原生候选未包含近期 UI；安装/升级、物理托盘、默认热键冲突、登录启动、真实质量和个人资料验收未闭环；新 Owner 后端没有采用。
- **22 个草稿 PR 叠放待评审**：#120～#141 依次叠放，不合并就进不了主线，也不能据此刷新原生候选；链越长评审越难。

## 下一步（本次不执行）

1. **P1 评审草稿链 #120～#141**：Morii 决定合并范围和顺序，合并后 main 成为下一轮原生候选的基线。
2. **P1 刷新候选并完成 Windows 验收**：从合并后的 UI 基线生成原生候选，在明确的验收环境补安装/托盘/默认热键和日常工作流证据。
3. **P1 选择新 Owner 后端的首个采用切片**：与 Memory 已合并的精确契约对齐，保留当前 pin 和 v1 根，先用合成数据接线。
4. **P2 在 WebView2 中复测星图方案 B**：按 OPEN_ISSUES #24 记录运动中和空闲帧间隔，达到目标频率才宣称解决。

## 需要 Morii 决定

- 草稿 PR #120～#141 是否按顺序评审合并？先合哪一段？
- Windows 实际验收用什么独立环境，何时安排安装/托盘/默认热键和真实日常工作流？
- 新 Owner/采集后端先采用哪条链，允许使用哪些测试资料？
- 合成面板的库状态、枚举值和 ISO 时间是否翻译？

## 依据与验证范围

- 2026-11-07 生成快照：只读 Git、GitHub PR 和仓库文档；不重跑测试、构建或真实验收
- origin/main@0cc1cb0（PR #119 合并提交）；本机主目录在 Codex 工作分支上，有未提交改动，未计入
- docs/integration/CLAUDE_TO_CODEX_2026-11-04.md
- PR #115～#119 已合并；开启的草稿 PR #120～#141 共 22 个，依次叠放
- 交接记录：最近一次完整 npm test 为 Node 139 通过 / 3 跳过、DOM 88 个 fixture 全过；合并后的 main 未重跑整套

证据位置见 [project-status.json](./project-status.json) 的 `evidence_refs`。本次只整理已有记录，`tests_rerun=false`；人工验收只转述有记录的结论，不把合并、分支或 CI 当作通过。
