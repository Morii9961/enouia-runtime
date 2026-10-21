# 已保存历史批次的请求准备与单独发送

2026-10-21 续改：[Provider 配置往返竞态修正与新构建](History-batch-config-race-v1.md)。下文保留首次接入的原始证据。

同日新增：[53项原生 WebView2 批次准备检查](History-batch-request-native-v1.md)，仍不发送模型请求。

日期：2026-10-20（Asia/Shanghai）。Runtime 起点 `5deb9546eead991b0ea7382aa7574a6b4e6cd712`，开发分支 `codex/runtime-history-batch-prepare`。开始时工作树干净、远端 main 与起点一致，Runtime 无未合并 PR；未修改其他工作树或 Memory 仓库。

Memory PR [#39](https://github.com/Morii9961/enouia-memory/pull/39) 本轮两次核实均为 OPEN / DRAFT、未合并，HEAD `d565181e0cb3bf14c938eb66a945269bba57ac8d`。本分支将三个精确 manifest revision、八个锁定 Git source 和 pin 记录一起更新到该**未合并开发提交**。Workspace IPC v1 共53条命令，surface aggregate `9b25885480cf2e220b37f231fe9973afaecb3bd68b8939fdf1c918d42ac233b2`。不叠加旧草稿 #36，不合并任何 PR。最终交付仍须 Memory #39 合并后记录其正式 merge revision，并复核依赖、接入面及受影响行为；Runtime PR 保持草稿。

## 行为

保存任务中的批次提供显式请求入口。页面选择已有 extraction grant 和输出上限，仅向 `history_batch_prepare` 传原 taskId、原 batchIndex、policyId、outputTokens。命令是带幂等键的同步本地写；Core 派生原 child/run，准备可提交 Context 并改变 head，不读取凭据、不调用 transport。Runtime 核对 task/batch/session/run/input、API/模型、输出上限、handle/hash 和 TTL 后，显示实际 body、endpoint、模型、callId、wireHash 及 token 估计。文本保持普通文本节点。

请求状态独立于 head 预览。进程内、按 Vault 分隔的 owner 保存参数草稿、原键、选择和已提交标记；参数变化使用不同键，恢复相同参数保留原键。任务重读、组件重挂载、锁定/重开和选择变化不会把另一批次的回执认作当前请求。切换、锁定、Provider/grant 变化、状态读取失败或过期撤下旧 body/handle/确认。完整进程退出不持久化这份 UI 元数据，重开必须重新发现保存任务并检查新请求；不得把 UI 恢复测试当作跨进程保存私有请求的证明。

发送另需勾选当前确切请求并单独点击。发送前重新观察 Provider 和保存任务；`external_send` 使用独立固定键及该 callId/hash。回执不明确只能恢复同一调用，不能靠准备重发。任何已观察 invocation，包括失败、取消、length、unknown，及本进程未确认的已提交调用都阻止重新准备。只有首次发送被 Core 明确以 `provider.call_unknown` / `provider.call_expired` 在 admission 前拒绝时，才撤下 handle、要求重读任务，再允许恢复原准备键；此前不明确的发送不走此路径。缺失 child 仍用已有显式 resume。最终错误要求重新观察任务；不重建另一任务、不入队或批准候选。

## 验证

机器可读结果和新场景逐项断言见 [JSON 记录](History-batch-request-v1.json)。所有资料、Vault、凭据和传输均为合成或 fake。

| 检查 | 结果 |
| --- | --- |
| `cargo fmt -- --check` | 通过 |
| `cargo test --locked` | 68 个适配器单元测试、8 个固定 Core 消费者测试通过 |
| `cargo clippy --locked --all-targets -- -D warnings` | 通过 |
| 前端 Node 测试 | 121 通过 |
| 默认 DOM 门禁及受影响场景复核 | 69 个独立 journeys；最终合计939项断言通过，新场景31项 |
| 生产 TypeScript 与两个受影响 TSX fixtures 的 strict TypeScript | 通过；fixture 检查使用 Vite CSS types |
| 生产 Vite build、Windows no-bundle build、NSIS bundle | 通过；保留既有 chunk >500 kB 非阻断提示 |
| 精确 pin / committed surface | 通过，8 个负向检查；三个直接依赖、八个 Memory 包 |
| resolved desktop domain boundary | 通过，7 个负向检查 |
| 实际 rendered NSIS template ownership | 26/26 通过 |
| runner syntax、JSON 与 diff 检查 | 通过 |

完整69个 DOM journeys 曾一起通过937项；最后增加两项失效 handle 恢复检查并修改请求组件后，复用其余68个未受影响场景的有效证据，重新通过受影响场景31项和全部121个 Node tests，合计939项。没有把分开的证据写成一次未发生的完整门禁运行。

固定 Core 消费者测试使用生成的 Markdown、临时 Vault 和计数 fake ports：准备及错误 hash 阶段的 SecretStore read / transport exchange 均为0；同键重开保持原 child/run/input/hash，旧 handle 不可使用；正确的独立确认和同发送键恢复合计只有1次 fake read / exchange。已调用批次不能重新准备，未新增候选。DOM 另覆盖 head 更新、回执丢失、组件重挂载、相同键/变更参数、迟到批次/Vault 回复、模型漂移、过期/失效 handle、单独确认、各类既有 invocation 及暂停/来源权限/缺失 child 的错误提示。

首轮 Rust 在沙箱内有15项既有 Windows 文件锁、目录身份和隔离注册表访问失败；在完整本机权限下验证，并补齐新命令的共享生命周期目录断言后通过。消费者测试新增的 candidate-list 检查最初缺少契约必需的 cursor/limit，修正后通过。DOM 首轮存在对 React 更新前旧按钮的读取，以及既有 `panel-action-focus` 的40 ms固定等待；现等待真实的控件/焦点状态，保留原断言。补测也发现任务重读期间旧 Provider 观察可短暂启用按钮，现仅使用当前读取归属的观察。以上失败未记作通过。

## 构建与剩余边界

最终开发 no-bundle、NSIS payload、setup 的 SHA-256、setup 字节数和签名状态保存在 JSON；产物位于忽略的 desktop `src-tauri/target/release/`。NSIS 会修改 payload 的 bundle 类型信息，两类 executable 的哈希不可互换。包未签名，未运行或安装，不是 v1 冻结交付或主人验收。

本片没有真实历史、个人 Vault、真实凭据、账户或 Provider HTTP，也没有真实 Send、部署或生产启用。未新增真实 WebView2/物理 Windows/Narrator 验收；本轮 native 证据是嵌入 Core 的合成消费者测试和 Windows 构建。真实模型质量、完整历史初始化、备份恢复及主人统一验收仍独立。结果预览、候选逐条入队/审核、语义分析、MV-8、MCP、云端和 Activity 均未启动。
