# 历史批次请求的配置往返竞态

日期：2026-10-21（Asia/Shanghai）。修正前基线 `5182487`，仍在 Runtime 草稿 PR #92；Memory 开发 pin 与53条契约、aggregate 均未变化。Memory #39 再次核实仍为未合并草稿，不在本轮合并。

检查发现：一个准备回执或发送前状态读可以被延迟。在等待期间，Provider 的观察值从 A 改为 B，再改回 A，原实现只比较最终字符串与选择身份，便重新接受变更前的回执。状态读取先失败、再恢复为 A 也有相同问题。旧请求已失效，配置值重新相等不能恢复其授权。

新增的实际组件 fixture `history-batch-config-race.tsx` 在未修正产品代码时明确得到三个失败：A→B→A 后旧 body 被显示、状态失败/恢复后旧 body 被显示、发送前读取 A→B→A 后发生一次 fake exchange。修正后，配置变更或读取失败会递增不可回退的请求代次；准备、持有的 handle 及发送前检查都绑定捕获的代次。值重新相等不会恢复旧 body、确认或发送前检查。

同一 fixture 的四项断言现通过，旧批次请求 fixture 的31项也通过。重新运行的完整 `npm test` 通过 **121 个 Node tests、70 个隔离 DOM journeys、943 项断言**；这次是同一次完整前端门禁。生产 TypeScript、新 fixture strict TypeScript、runner syntax、Windows no-bundle 与 NSIS build、26/26 实际 rendered installer ownership 检查通过。保留既有大于500 kB的前端 chunk 提示。

没有修改 native、依赖、pin、契约或 Backend。复用 [原验证](History-batch-request-v1.md) 中仍适用的68项 Rust单元测试、8项固定 Core 消费者测试、fmt、严格 Clippy、pin/surface 及 domain boundary 证据；没有把这些未重跑的检查记为本次重跑。新构建的 payload/setup 哈希保存在 [JSON 记录](History-batch-config-race-v1.json)。包未运行或安装。

全部竞态由合成 IPC/假端口驱动；修正后的三个竞态均无发送 exchange，也没有另建任务、候选入队或审核。真实 WebView2/Windows、人类验收、真实 Provider 质量和正式合并 pin 仍是各自独立的后续证据，不从 DOM 模型推定。
