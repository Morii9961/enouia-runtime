# R5 Windows 候选 `eaa410c`（2026-11-24，已装到本机）

从 Runtime main `eaa410c`（PR252 合并）构建，取代 [`38586e4`](R5-candidate-38586e4-2026-11-24.md)，供 Morii 周末按 [R4 一次性验收指南](../RUNTIME_R4_ACCEPTANCE_2026-11-19.md)验收。内嵌的 Memory pin 仍为 `ca76892303eda0b268237c8b83878bc12f6cfe7e`。x64、当前用户 NSIS 安装方式，产品版本 0.1.0，安装包和程序均未签名。产物在本机忽略目录 `apps/desktop/target/candidate-eaa410c/`。

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| `Enouia Runtime_0.1.0_x64-setup.exe` | 32,495,334 | `748992c55942c4baf7cba91b3d68d531461d58f428262841de1f6a6d44c527d7` |
| `enouia-desktop.exe` | 87,228,274 | `2030db8fa357ff84f6a70ec5c9ea2dc9cb116a4cf802dee719fb6504938de529` |
| `enouia-memory-mcp.exe` | 53,421,061 | `79df071f90cdaa2e08bb008c968024a702549a669bcb1c906bda2e96c8b1e392` |
| `WebView2Loader.dll` | 160,880 | `86545b66cdb0603bc26b626fb9ad610cb6e71f28d468f5ea66df23b03dda96d5` |

**作废的候选**：`38586e4`（中文、日文界面下 Home 的日期标签挤在一起）、`7021984`、`839e34d`、`4fd0e92`、`1ab7a89`、`73983bd`、`884c015`、`218df03`。

## 这一版包含的内容（相对 `38586e4`）

- Home 记录纸和记录带的日期标签改为“10/28”这种数字格式（#252）。原来中文的“10月28日”太宽，两周十四个标签挤成一串。

其余内容与 `38586e4` 相同：Home 用真实时间画线（#250）、Sessions 把同一段平台对话的各部分合在一行（#249）、ChatGPT 请求署名（#246）。

## 本候选上实际执行的检查

| 检查 | 结果 |
| --- | --- |
| tsc；`npm test` 151 项；DOM 夹具 | 通过 |
| `npm run desktop:bundle -- --no-sign -- --offline --locked` | 通过 |
| 生成的 NSIS 模板 `template-check.ps1` | 26/26 |
| 本机升级安装（Morii 要求“现在就给我升级”）：`/S` 静默安装，覆盖 `839e34d` | 退出码 0；装好的 `enouia-memory-mcp.exe` 与上表一致；装好的 `enouia-desktop.exe` 大小相同，只差 3 个字节，是打包时把 `__TAURI_BUNDLE_TYPE_VAR_UNK` 改写为 `…_NSS` |
| 装好的程序在真实库上只读运行两次（英文、中文界面；原登记账户、迁移后的 home、原 operation） | Home 画出线，注记写“这几天有 205 个已捕获的轮次、0 次 Memory 写入”；日期标签“10/28 … 11/10”不再重叠；点“Now”后写“这几天没有已捕获的轮次，最近一次在 11 月 9 日 17:22，范围内有 352 次 Memory 写入”；时间、形成、值得回看、Sessions、关联页都打开了；两次退出码都是 0，CURRENT 前后均为 440 |

## 未重跑的项目

`--owner-readonly-only` 与 `--catalog-only` 合成模式没有在本候选上重跑：相对 `38586e4`（41/41、42/42），这一版只改了前端两处日期格式参数，原生代码没有变。托盘、全局热键、登录启动、卸载，以及在真实库上写入（纠正、登记 Agent、处理请求、身份决定、保存 Capsule），仍按验收指南由 Morii 亲手做。

## 已知问题：中文召回

用装好的程序只读测试召回预览：“我平时喜欢喝什么茶？”选中 0 条，“喝 茶”选中 2 条；“Enouia迁移”选中 0 条，“Enouia 迁移”选中 3 条。原因是 Memory 的共享召回合约只按空格切词，整句中文被当成一个词。Memory 已在 ChatGPT 连接器一侧修好（ADR-MEM-208），Runtime 已请 Memory 在合约层统一采用这个规则。这样召回预览、Context 和本机 Agent 的 MCP 都能一起修好；合约改好后，Runtime 升级 pin 并重新验证。在那之前，召回预览里请用空格把关键词分开。
