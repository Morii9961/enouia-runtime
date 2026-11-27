# R5 Windows 候选 `1ce6b2d`（2026-11-27，已装到本机）

从 Runtime main `1ce6b2d`（#283 合并）构建，接替 [`97c631d`](R5-candidate-97c631d-2026-11-27.md)（Morii 已装）和 [`c450785`](R5-candidate-c450785-2026-11-27.md)，两者作废。内嵌 Memory pin `b5b05fa4af88b50238f48cff99fb8f0bdd1fddb5`。x64、当前用户 NSIS 安装方式，产品版本 0.1.0，未签名。产物在本机忽略目录 `apps/desktop/target/candidate-1ce6b2d/`。Morii 要求“准备好了就自己安装，把旧版本删干净，别删记忆库”，据此安装。

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| `Enouia Runtime_0.1.0_x64-setup.exe` | 39,817,638 | `4536cb87b1c90ebeb60663e9dca34872223256f68a3be95d2437204af4af47b1` |
| `enouia-desktop.exe`（构建目录） | 93,393,487 | `8697eb22efaea33b1489bc3d1dab128ea8d14377efdea251ed6f81de03159f26` |
| `enouia-memory-mcp.exe` | 59,508,308 | `469fdc72a4500001b03a0dfe5b5904f0c7ab92a57ef60fbe49533ee34ecab6d3` |
| `WebView2Loader.dll` | 160,880 | `86545b66cdb0603bc26b626fb9ad610cb6e71f28d468f5ea66df23b03dda96d5` |

安装后的 `enouia-desktop.exe` 大小相同，与构建目录的版本只差 3 个字节（Tauri 写进安装包那份的打包类型标记），SHA-256 为 `bb0dcae20a09919900b52c33f0251b115275caa6b35256a8a17948fef28854d7`。

## 这一版包含的内容（相对 `97c631d`）

- Memory pin 从 `bcaa77b` 升到 `b5b05fa`（#281）。
- #282：显式启动打开登记库后记下 home 和 operation，不带参数的启动（安装程序每次重建的快捷方式）自动重开；快捷方式和登录启动只运行一个实例（ADR-038 补充）。
- #283：保存 Capsule 默认开启（D2，Morii 决定）。

## 实际执行的检查

| 检查 | 结果 |
| --- | --- |
| #282/#283 源码树 | `cargo test --locked` 75 + 9 通过，clippy、fmt 通过，`check-memory-integration` 一致 |
| `npm run desktop:bundle -- --no-sign -- --offline --locked`（打包前更新了源码时间戳）；生成的 NSIS 模板 `template-check.ps1` | 通过；26/26 |
| 本机升级安装（`/S`，覆盖 `97c631d`） | 退出码 0；安装程序自己关掉了正在运行的 3 个旧进程 |
| 记忆库入口 | 按 Morii 的登记写入 `%APPDATA%\com.enouia.runtime\owner-entry.json`（只有 home 和 operation），没有用显式参数启动 |
| 从桌面快捷方式启动两次 | 只剩一个进程；窗口显示“已登记库已打开 · 351 条记录” |
| 清理 | 删掉了 `candidate-97c631d`、`candidate-c450785` 和 silly-lewin 工作树里的旧安装包；记忆库、Runtime 配置目录和 WebView2 配置都没动 |

## 未做的项目与注意

- Ollama 当时没有运行，语义索引会显示不可用，召回暂时只用字面匹配；启动 Ollama 后，Runtime 会在后台建好索引。早先测试运行留下的索引缓存在 Claude 应用的虚拟化 AppData 里，安装的程序用不到。
- 托盘、全局热键、登录启动、卸载，以及在真实库上第一次写入（包括保存 Capsule），仍按[验收指南](../RUNTIME_R4_ACCEPTANCE_2026-11-19.md)由 Morii 亲手做。
