# UI v2 W7 · 托盘菜单三语同步

2026-10-28。基线 main `cbd6ab3`（已含 W2–W6 的 PR #104 与独立测试等待修复 #105），分支 `codex/ui-v2-w7-tray`。

## 改动

主窗口挂载 `TrayLanguage`，使用现有 `useLang()` 和 `t()`，把显示、快速检索、锁定与退出四条菜单文字交给 `shell_set_tray_labels`。英文、中文、日文和跟随系统共用既有语言偏好；不新增第二份原生语言配置。原生在前端加载前仍使用英文菜单，前端就绪后更新，包括隐藏启动。

Rust 保留四个 `MenuItem` 句柄，仅修改文字，固定动作 ID `show/search/lock/exit` 与原有生命周期处理不变。新命令只授予 main，Rust 再校验窗口身份；DTO 拒绝额外字段。overlay 没有发布器，也没有这个命令的权限。产品名和托盘 tooltip 保持英文。

新增两条中日译文，字典各 1,417 键、缺失 0。重跑字体生成器，504 个 WOFF2 内容未变，总计 9,691,652 B；不提交原始字体。没有改 Memory pin、领域代码、CSP、热键、托盘图标或锁库/退出的业务路径。

## 原生验证

使用本次 debug 构建、独立 WebView2 profile `.design/w7-tray/webview` 与既有隔离应用配置，无 Vault。没有读个人库、配置真实 Provider、输入密钥、调用模型或修改登录启动设置。调试端口仅 loopback，并先核对所属进程链。

- Settings 按钮依次切换英、中、日。原生 IPC 绑定不可写，未修改它；用调试断点观察到三次真实 `shell_set_tray_labels`，四个参数均匹配当前字典。另逐组调用真实命令，三个菜单更新回执均成功。不是物理菜单文字的屏幕读回。
- 完整退出并重启后，日文偏好 `ja` 保留；首页 `I'm here.` 与 `ENOUIA RUNTIME` 保持英文。
- 跟随系统清除本地语言覆盖，按本次 `navigator.languages` 的 `zh-CN` 切为中文，并观察到中文托盘调用。
- 实际关闭按钮使 `shell_status.visible` 从 true 变 false，进程保持；`shell_show` 恢复 true，`shell_search` 使 overlayVisible 为 true。它们是现有原生命令入口验证，不是托盘鼠标点击验收。
- 从真实 overlay 调新命令，被 capability 明确拒绝：

```text
shell_set_tray_labels not allowed on window "overlay", webview "overlay", URL: local

allowed on: [windows: "main", URL: local]

referenced by: capability: main-window, permission: allow-shell-set-tray-labels
```

- 手动带既有 `--autostart` 参数启动隔离进程，main 在创建时隐藏。保持 `visible:false` 时切换语言，观察到日文托盘调用；随后显示并正常退出。这不证明真实 Windows 登录时启动，也没有启用注册表开关。
- `shell_exit` 正常结束两个测试进程。锁库动作和长操作退出沿用已有路径，本片没有真实库，也没有新增这两项验收。

截图在 `.design/w7-tray/shots/`：`settings-en.png`、`settings-zh-Hans.png`、`settings-ja.png`、`overlay-no-vault.png`、`home-restart-ja.png`、`settings-system.png`、`hidden-startup-shown-ja.png`。已查看日文 Settings 原图。截图不上传交付包材料。

原始回执：同目录上层的 `languages.json`、`native-label-receipts.json`、`lifecycle.json`、`overlay-denial.json`、`restart.json`、`system.json`、`hidden-startup.json`。

## 检查与失败记录

六项全部通过：`npm run check`、`npm test`（Node 127 通过 / 3 跳过，DOM 79/79）、独立 `npm run test:dom`（79/79）、`npm run build`、两个根检查。主 JS 436.46 kB，无 500 kB 警告。新增 `tray-language` fixture 6 项覆盖三语、重新挂载与浏览器不调用 native；保留 baseline fixture 顺序。

原生：`cargo build --offline --locked`、`cargo fmt --check`、`cargo test --offline --locked … shell::tests --bin enouia-desktop`（3/3，43 filtered out）、`cargo clippy --offline --locked … --bin enouia-desktop -- -D warnings` 均通过。没有跑完整 Rust 集成套件或生成安装包。菜单更新 API 对照本机锁定 Tauri 2.12.0 的 `src/menu/normal.rs` 源码。

独立 DOM 首次遇到 #5 的另一项偶发失败，原样错误为：

```text
Error: unobserved_list_does_not_claim_empty
```

`workspace-operations-inspector` 单独重跑 18/18，随后独立 DOM 79/79。未改该 fixture，也不声称 #5 全部解决。原始输出保留于 `.design/w7-tray/test-dom-first-failure.log`、`workspace-operations-inspector-rerun.log`。早期历史任务与焦点测试失败已在独立 #105 修复，见其[记录](UI-v2-history-owner-wait-2026-10-28.md)。本片检查日志均在 `.design/w7-tray/`。

## 留下的验收边界

本次桌面会话没有 Explorer 通知区域进程，Computer Use 只返回应用窗口，无法做物理托盘左键/右键菜单截图与点击。保留为 OPEN_ISSUES #25，不能用命令回执或 Settings 截图替代。真实锁库、系统登录、完整 Windows shell 与 owner 验收仍待后续；本片仅完成菜单本地化实现和上述隔离验证。
