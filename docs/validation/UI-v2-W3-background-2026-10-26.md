# UI v2 W3 · 启动底色

2026-10-26，基线 W2 `5f00ce0`，分支 `codex/ui-v2-w3-native-background`。owner 已批准继续、推送及本轮相关原生修改。

在 `tauri::generate_context!()` 后、创建窗口前，读取 Windows 的应用主题，将两个窗口的原生窗口/WebView 底色设为 DESIGN.md 的黛蓝或宣纸。使用已有 `windows-sys` Registry 功能，不写系统配置、不新增权限或依赖。`index.html` 的早期内联样式与两条媒体查询 `theme-color` 保持一致。Memory pin、适配器和领域代码未改。

实际 Windows 设置从深色临时切到浅色，再恢复深色；每种模式重新启动独立配置的原生构建。WebView2 未使用主题媒体覆盖。观察结果：

| 阶段 | 深色系统 | 浅色系统 |
| --- | --- | --- |
| HTML 已解析、所有模块脚本暂停、React 根为空 | `rgb(15,28,35)`，匹配 meta `#0F1C23` | `rgb(241,240,235)`，匹配 meta `#F1F0EB` |
| 完整应用 HTML / body | 均为黛蓝 | 均为宣纸 |
| 另行导航到 `about:blank` 的探针 | Chromium 自己的暗色空白文档为 `#121212` | 截图为 `#F1F0EB` |

因此已确认浅色系统下，早期 WebView/应用文档不再使用旧深色底，脚本运行前后纸色一致。`about:blank` 是诊断探针，不代表应用启动文档；本次没有高速摄影捕获窗口出现的第一个物理合成帧，也未逐帧录像隐藏的 Quick Search 窗口。两个窗口的原生颜色均在创建前设置，实际截图覆盖主窗口。截图 PNG 经显示色彩处理的采样可能比 CSS 通道值相差 1，不据此改设计值。

本机截图和原始日志位于忽略目录 `.design/w3/shots/`、`dark-background-fixed.log`、`light-background.log`。代码依据见[设计决定](../design-decisions.md)的 W3 条目；实现已用锁定版本本地源码与官方 API 文档核对。

检查结果：`npm run check` 通过；`npm test` Node 124 通过、3 跳过、DOM 77/77；独立 `npm run test:dom` 77/77；`npm run build` 通过（仍有 #18 主包警告）；Memory integration 与 Activity retirement 两个根检查通过。另运行离线 locked 原生构建、`cargo fmt -- --check`、`cargo clippy --bin enouia-desktop -- -D warnings`，最终均通过；未重跑 Rust 全套测试。

曾失败的原始诊断：

```text
tauri build: EOF while parsing a value at line 1 column 0
```

原因是跨沙箱调用使用了失效的临时配置路径，已改为 worktree 内固定的隔离配置后构建通过。首次 fmt 要求合并一行 import，已修正。首次 Clippy 在测试程序仍运行时失败：

```text
tauri build: 另一个程序正在使用此文件，进程无法访问。 (os error 32)
```

正常退出拥有的进程后重新通过。构建另有增量缓存不能建立硬链接的环境警告；Clippy 用 `CARGO_INCREMENTAL=0` 完成。首次本地截图脚本等待 `document.fonts.ready` 与暂停模块加载互相等待，已修正为在该阶段直接截图，未修改产品来绕过检查。

未打开个人 Vault，未读凭据、调用模型、安装或部署应用。
