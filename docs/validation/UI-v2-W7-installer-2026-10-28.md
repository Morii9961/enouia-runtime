# UI v2 · W7 Windows 安装候选包

检查日期：2026-10-28；候选包构建续跑：2026-10-29。代码基线：main `de38133c3ca4bae38a74e018e35275e42ca364b1`（PR #108），加本片安装语言配置；分支 `codex/ui-v2-w7-installer`。Memory pin 保持 `bf6bfd10bf3c870ae2ce7ceb5c6bd635b08bf327`。

## 改动

`apps/desktop/src-tauri/tauri.conf.json` 的 NSIS 语言列表增加 `Japanese`，保留简体中文、英文与语言选择器。使用本机 NSIS 的内置资源，不新增前端字典键。自有安装模板、hooks、current-user 模式、禁止降级和卸载保留数据的边界均沿用 [ADR-027](../adr/027-desktop-installer.md)。版本保持 0.1.0。

## 验证

| 检查 | 本片结果 |
| --- | --- |
| `npm run check` | 通过 |
| `npm test` | Node 127 通过、3 跳过、0 失败；DOM 80/80 |
| `npm run test:dom` | DOM 80/80（独立第二遍） |
| `npm run build` | 通过；主 JS 436.75 kB |
| `node scripts/check-memory-integration.mjs` | 通过；pin 未变 |
| `node scripts/check-activity-retirement.mjs` | 通过 |
| `template-check.ps1` | 源模板 20/20；生成后的 `target/release/nsis/x64/installer.nsi` 26/26 |
| `version-guard-smoke.ps1` | 7/7 |
| `startup-cleanup-smoke.ps1` | 5/5 |
| `locked-file-smoke.ps1` | 2/2 |
| 标准配置 NSIS 构建 | 通过，退出 0；release 续构建 8m 11s |

安装保护 drills 只编译微型测试安装器、使用新建临时目录及 `HKCU\Software\EnouiaRuntimeTests` 下的隔离键。未改真实 Run 启动项，未安装 Runtime。日志在本机 `.design/w7-installer/`，不上传生成产物。

## 构建方式与边界

在独立构建进程清除 `TAURI_CONFIG`，使用仓库标准配置；此前原生 smoke 的 appDirectoriesOverride 不参与本次打包。命令：`npm run desktop:bundle -- --no-sign -- --offline --locked`。Rust 禁用 incremental，限制两项并行任务。

第一次构建被会话中断，退出码 `1073807364`（`0x40010004`）；末尾原样输出如下，未报 Rust 编译错误。日志另存 `.design/w7-installer/bundle-interrupted-2026-10-29.log`，随后按原命令续构建。

```text
   Compiling miniz_oxide v0.9.1
   Compiling futures-channel v0.3.34
   Compiling webview2-com-sys v0.39.1
```

实查 `dist` 仅有 `index.html` 入口、506 个 WOFF2（504 个中日文件及两份既有西文字体）、0 个 TTF；开发服务器的 `starmap.html` 不在生产页面集合。`FontLicences-*.js` 含 IPA、OFL 与 Enouia Text SC 授权文本。原始 TTF 与本机交付图片不进入仓库。

## 本机产物

- 路径：`apps/desktop/src-tauri/target/release/bundle/nsis/Enouia Runtime_0.1.0_x64-setup.exe`。
- 大小：20,675,507 B（19.72 MiB）；Authenticode 状态：`NotSigned`。
- SHA-256：`6D06447D636477217BB78B04752DFEF477B7BD19B65274A4F9C120A3C5B114A0`。
- 生成脚本 431–433 行含 `MUI_LANGUAGE "SimpChinese"`、`"English"`、`"Japanese"`，456 行保留 `MUI_LANGDLL_DISPLAY`；本次构建没有语言资源缺失/回退警告，只有预期的跳过签名提示。

候选包保留在本机，不作为 Git 附件或公开 release 上传。

本片不运行候选包的安装、升级或卸载，不启动生产配置应用，也不访问个人 Vault、Provider 或真实会话。2026-10-06 的 [安装器历史验证](Desktop-installer-v1.md) 保留原始版本与范围，不能当作本次 UI v2 的安装回归结果。

未验收：交互式三语语言选择器、实际安装/升级/快捷方式、缺失 WebView2 的安装流程、代码签名与 SmartScreen、真实登录启动。物理托盘 #25、OS 热键 #26 与 W2/W4/W5 的既有问题继续保留。没有本片交互截图。
