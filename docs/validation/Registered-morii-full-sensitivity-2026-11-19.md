# 已登记 Morii 入口：读取全部敏感级别（2026-11-19）

Morii 在聊天中明确授权：已登记 Morii 只读入口读取库中所有敏感级别的记录。此前原生绑定在
page、stats、detail、source 和 status 的读取请求中都固定传 `Private` 上限，真实库因此只显示
259 条；Memory 审计的总数是 351 条，其余记录标为 `HighlySensitive`。

## 修改

- `apps/desktop/src-tauri/src/memory_catalog.rs`：登记 Morii 模式的读取上限改为
  `HighlySensitive`，固定合成入口仍为 `Private`。页面请求仍不能指定上限；Core 继续执行主体、来源、
  策略、删除与到期检查。
- `apps/desktop/src-tauri/src/memory_catalog/fixture.rs`：`seed` 新增参数，用于把第三条合成记录及策略
  上限标为 `HighlySensitive`。只有显式原生 Morii 测试会开启；固定合成目录不变。
- `memory_catalog/tests.rs`：原生 Morii 测试开启该参数，并继续断言三条记录全部可见。

## 验证

源码为 Runtime main `7270fc9`（Memory pin `368634b`）加本补丁。

| 检查 | 结果 |
| --- | --- |
| 撤掉上限改动、保留高敏感夹具，运行原生 Morii 测试 | 失败：可见 2 条，预期 3 条 |
| 加上改动后同一测试 | 通过 |
| `cargo test --locked` 全部 | 61 通过，1 忽略（即上面的显式测试）；另 9 通过 |
| `cargo fmt -- --check`、`cargo clippy --all-targets -D warnings`、`node scripts/check-memory-integration.mjs` | 通过 |
| `npm run desktop:build -- -- --offline --locked` | 通过 |
| 新程序 `--owner-readonly-only`，用含高敏感记录的新合成登记 | **25/25** |
| 候选 `1e96a6d` 跑同一合成登记 | 6/8，停在 `OWNER.actual_registered_records`（只读到 2 条） |

被测程序 `enouia-desktop.exe` SHA-256 `a71bd4816395bbffe7923681a75592061c715b4f6508b0138e5fa2103fd5b9ac`，
旁边是同一份 `WebView2Loader.dll`（`86545b66…`），存放在本机忽略目录
`apps/desktop/target/owner-ceiling-build/`。这是 `--no-bundle` 验证程序，不是安装候选。合成登记在
重新创建的、仅用于合成验证的上级目录下生成，没有使用真实资料。

## 边界

真实库能显示多少条，取决于 Memory 的策略授权与到期时间。本次没有改动授权本身，也没有新增写入、
grant、Provider、Context 或 Sessions。Morii 人工验收、安装和新候选都单独记录。
