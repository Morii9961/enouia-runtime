# 已保存历史批次的原生准备验证

日期：2026-10-21（Asia/Shanghai）。Runtime 基线 `bb5f5a5`。固定 Memory 仍为未合并开发 pin `d565181e`，53 commands，aggregate 与 [pin 记录](../integration/memory-pin.json) 一致；Runtime #92 保持草稿，不合并 Memory #39。

新增 `memory-smoke.mjs --history-batch-only`，复用既有归档规划、本地任务与 Sessions 导航的真实 WebView2 harness，增加实际 `history_batch_prepare` 的页面验证。入口要求专用临时目录、空合成 Vault、仅虚构模型配置，以及绑定可执行文件、相邻同构建 `WebView2Loader.dll` 和 app-directory override 的 manifest。Vault 通过测试子进程自己的原生 picker/token 创建；页面不接收路径。测试只控制其启动的 Runtime/WebView2 进程，调试连接先核对进程归属。

最终 [报告](History-batch-request-native.json) **53/53通过**，其中14项是新增批次检查。真实回调被完整转发，只延迟一个准备回执，以验证 Context 提交和共享 head 更新后稳定 owner 仍等待并接收原批次结果。页面逐字显示 Core 的 body、endpoint、model、callId、wireHash；原 child/session/run/input 不变，输出上限256。1100×700窗口检查无横向溢出。

测试勾选请求检查框后仅观察独立 Send 控件变为可用，**不点击 Send**；随后锁定合成 Vault，确认旧 body 和检查状态撤下。解锁后显式重读保存任务、恢复准备，取得同一 child/run/body/hash 的新 handle，检查框重新为空。会话集合不变，没有 `external_send` operation，H1显式 fixture 创建的一个候选仍是唯一候选，正式记忆为0。测试另有捕获事件 guard，拒绝激活 Send。原生 CredentialStore/HTTP 未被测试调用；准备零端口访问的直接计数证据仍来自此前的固定 Core fake-port 消费者测试，不能把本轮 UI 观察写成系统级凭据审计。

构建通过 CLI `--config` 使用 Tauri 2.12.0 的已验证 `app.appDirectoriesOverride` 模式，将全部应用目录指向专用临时 fixture 的 `config`。模型仅为 `synthetic-history-model`，配置没有密钥。测试启动前校验隔离 exe 与 DLL 哈希，拒绝非空 Vault；不要对安装版、个人配置或个人 Vault 运行此模式。实际隔离 exe/DLL 和原始报告的精确字节哈希保存在 JSON 的 `evidence` 中。源代码和 pinned dependency 未改变，正常 NSIS 开发包与隔离 exe 是不同产物；本次没有安装或发布。

首两次诊断只通过了外来调试 listener 拒绝检查，随后因复制 exe 时遗漏 loader DLL 而没有 main page，不算通过。补齐同构建 DLL、加入启动前校验及进程退出/目标诊断后，用仍为空的同一专用 fixture 完成最终53项。最终图像已读取检查；首次请求图展示实际请求内容，重开图展示保存任务页面，不将后一张图像当作完整请求的截图证据。

本片修改测试 harness 和证据，没有修改产品逻辑。复用 `bb5f5a5` 的121项 Node、70个 DOM journeys/943项断言、生产及 fixture TypeScript、Windows/NSIS build，以及仍适用的 native unit/Core consumer/Clippy/pin/domain 证据；本片另通过两个 harness 的 Node syntax 和 diff 检查。真实 Provider 回答质量、真实资料初始化、物理键盘/Narrator、人工统一验收、最终合并 pin、安装与生产启用仍未建立。未入队或批准候选，未启动语义分析、MV-8、MCP、云端或 Activity。

复现入口：以 CLI `desktop:build -- --config <owned-override.json>` 生成隔离版本，将 exe 与同构建 loader 复制到测试目录，在专用临时 fixture 写入 `isolated-build.json`（`purpose: synthetic-history-batch-preparation`、`appDirectoriesOverride: <fixture>/config`、exe/DLL 的 `exeSha256`/`loaderSha256`），并提供无凭据的虚构模型 metadata。随后运行 `node apps/desktop/e2e/memory-smoke.mjs <isolated-exe> <fixture>/vault <fixture>/history.md <fixture>/out --history-batch-only`。fixture 须在系统临时目录下以 `enouia-runtime-history-` 开头，首次 Vault 目录须为空。
