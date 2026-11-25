# Agent 管道并发连接偶发 BrokenPipe 排查（2026-11-25）

基线：Runtime `8601135`（Memory pin `c1ebb04`），Memory `origin/main` 为 `48093e1`。只用合成夹具，没有打开真实库，没有安装任何东西。

## 现象

`memory_catalog::tests::concurrent_agent_sessions_all_connect` 在全量 `cargo test --locked --bin enouia-desktop -- --test-threads=1` 中偶发失败，报 `client Io(BrokenPipe)`；单独运行时通过。并行全量下也见过（见 [R5 ChatGPT 请求记录](R5-chatgpt-requests-2026-11-24.md)）。

## 结论：Memory 侧缺口，不是测试互相干扰

- **管道名不冲突。** 名字是 `pipe_id(vault_id, principal)`；夹具每次都用随机 `VaultId`，所以前面测试留下的监听不会占用本测试的名字。
- **失败点是 Agent 宿主创建时的 `Busy`。** 在 `memory_pipes::serve` 的每一步临时加上错误输出（未提交），全量单线程连续跑 8 次，第 7 次失败（`round 4: client Io(BrokenPipe)`）。同一次运行的输出里只有一条非正常错误：`QualifiedAgentHost::from_authenticated_initialized_owner` 返回 `Vault(Busy)`。其余 9 条都是 `serve_connection` 在客户端正常挂断后报的 `Io(BrokenPipe)`，属于正常收尾。监听端随即丢掉这个连接，客户端握手时就读到 `BrokenPipe`。
- **原因。** `from_owner_profile` 先调用 `SegmentedAutomationVault::snapshot()`（只读 Agent 走这条路径；原始 Agent 走 `check_original_agent_carrier()`），而这两个调用取写锁时都只试一次（`Duration::ZERO`）。ADR-MEM-175 让 Agent 读取、许可签发和只读授权查询最多等待 `BRIEF_LOCK_WAIT`（2 秒），但没有覆盖这一步。另一个会话正在签发许可、持有写锁时，后到的会话立刻拿到 `Busy`。
- **为什么以前能过。** `fd265ac` 在 Runtime 里给宿主创建也加了 2 秒的 `Busy` 重试。`c75e989` 采用 ADR-MEM-175 时删掉了这层重试，并在注释里写明“Memory 会短暂等待写锁”，但宿主创建这一步并不在 Memory 的等待范围内。

## 影响

这是真实缺陷：Morii 让同一个 Agent 的几个 Claude Code 会话同时连接时，后到的会话可能因 `Busy` 被断开，需要由桥接重新连接。

## 处理

修复属于 Memory 仓库：`from_owner_profile` 里的 `snapshot()` / `check_original_agent_carrier()` 也应等待 `BRIEF_LOCK_WAIT`。证据已交给 Memory 会话。Memory 合入后，Runtime 升级 pin，并改正 `memory_pipes.rs` 中的注释，再连续三次跑单线程和并行全量。本记录不改代码。
