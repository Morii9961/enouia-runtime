# UI v2：换库时清除上一个 Vault 的列表与详情（2026-11-07）

接续草稿 #148，分支 `claude/ui-v2-vault-switch-clearing`。SCREENS §9 的最后一项：权限改变 / 换库时立即清除面板与派生文本。

问题：Memory 状态每 3 秒轮询一次。换库若在别的窗口完成且落在两次轮询之间，前端观察不到 `vaultChanging`，状态直接从 Vault A `open` 变成 Vault B `open`。`Explorer` 的 key 只含集合和检索序号，不含 Vault，于是 A 的行和已选详情留在 B 之下，也不重读。

新增 `memory-vault-switch` DOM 场景（原 `MemorySurface`，两个虚构 Vault 身份，全部 IPC mock）：
- 修复前 6 项中 3 项失败：换库后 A 的行与详情仍显示、没有读取 B 的列表、选择状态被继承；锁定清除与只读两项原本就通过。实际调用记录里换库后只有 `workspace_status`，没有 `memory_list@B`。
- 修复：`Explorer` 与 `Inbox` 的 key 加上 Vault 身份（`vaultId`，缺省用 `rootName`），与已有的 `Import` 一致。修复后 6/6。

影响与边界：换库后收件箱的未发送草稿会随旧 Vault 一起清除，这是预期行为（草稿属于旧 Vault 的候选）。不新增状态、请求、轮询或写入。按 AGENTS.md 的原则，这里记明失败场景与成本：发生条件是换库在一次轮询间隔内完成；后果是新 Vault 下显示旧 Vault 的记忆；代价是两个 key。若 Morii 认为不需要，回退这两行即可。

检查：完整 `npm test`：Node 142 项 139 通过 / 3 跳过 / 0 失败；DOM 119 个场景运行、2,470 项全部通过，退出 0。TypeScript 通过。没有字典改动。没有截图、Rust、原生 smoke、真实换库、个人 Vault、Owner、Provider、迁移或部署；Memory pin 不变。
