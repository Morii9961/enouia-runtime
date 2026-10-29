# UI v2 #23 · 多行按钮高度

2026-10-29，基线 main `30d479d719820dea743a005fe8c7a2d2b8091a13`（PR #111），分支 `codex/ui-v2-issue-23-button-wrap`。

## 改动

仅 `src/theme/negative.css` 的 `.mem-button` 高度规则由固定 `height:30px` 改为 `height:auto;min-height:30px`。多行内容可自然增高，单行保留 30px 下限；字号、字体、文案、padding、类名、事件、键盘与 Memory pin 不变。没有引入截断、缩小字号或禁止换行。

## 原生复验

同一新建临时空库、独立 WebView2 profile，使用既有隔离 appDirectoriesOverride 的 embedded-assets debug 应用。英/中/日 × 1100×700、1440×900 × 两种配色媒体模拟，共 12 格前后对照；不改系统 DPI/主题，截图减少动画。

修复前日文四格均为 30px 高，文字行高 19.2px、两行文字越过边框。修复后 12/12 的文字 Range 边界均在按钮内，滚动后按钮完整可见，无页面横向溢出；点击读取并等待按钮重新可用/无错误，也全部通过。日文约 39.73px，中文 30px，英文约 30.67px；不把原生分数像素测量写成所有单行都恰好 30px。

报告与截图仅本机保留：`.design/w6-23-button-wrap/before.json`、`shots/`，`.design/w6-23-button-wrap-after/after.json`、`shots/`；已查看 1100×700 黛蓝日文修复后截图，第二行在边框内。原生前后命令退出 0；没有创建会话、记忆、模型调用或真实启动项。没有使用个人 Vault、生产配置或真实 Provider。

## 检查

六项退出码均为 0：`npm run check`；`npm test`（Node 127 通过、3 跳过、DOM 80/80）；独立 `npm run test:dom`（80/80）；`npm run build`（主 JS 436.91 kB）；两个根目录 Memory integration / Activity retirement 检查。隔离原生 debug 构建通过，11.25 秒。日志 `.design/w6-23-button-wrap/`。无失败的验证检查；未重跑 Rust 全量测试或 Clippy，无 Rust 改动。

## 刷新 Windows 候选包

在六项检查完成后，用本片同一代码（main `30d479d` 加上述唯一 CSS 改动）执行 `npm run desktop:bundle -- --no-sign -- --offline --locked`，独立进程清除 `TAURI_CONFIG`，使用标准配置，release 编译 1m 11s、打包退出 0。没有启动标准配置的应用或执行安装。

- 新产物：`apps/desktop/src-tauri/target/release/bundle/nsis/Enouia Runtime_0.1.0_x64-setup.exe`，20,672,647 B（19.71 MiB），`NotSigned`。
- SHA-256：`7A5B014B6E5616D305B67A5F850D75FF91727925824A5DAAE6B30D60B8F26266`。
- 生成模板 26/26 通过，仍含简体中文、英文、日文；`dist` 仅 `index.html`，506 个 WOFF2、0 个 TTF，无 `starmap.html`。模板/hooks 未改，本片没有重跑实际安装或升级 drills。
- PR #109 的旧候选包在校验原 SHA 后归档到本机 `.design/w7-installer/validated-5293993/Enouia Runtime_0.1.0_x64-setup.exe`，不将新包套用旧包的 SHA 或验收记录。

构建与产物记录在 `.design/w7-candidate-refresh/`，候选包和截图不上传 Git 或公开 release。

## 待验收事项

本片验证 Sessions 中已复现的按钮及读取交互，未声称所有界面的任意长文案/缩放组合都已验收。默认 M 冲突、物理托盘、真实登录启动、安装/升级与 owner 人工验收仍独立。
