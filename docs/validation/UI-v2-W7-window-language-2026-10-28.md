# UI v2 W7 · 双窗口语言与原生标题

2026-10-28。基线 main `270d1fc`（PR #106），分支 `codex/ui-v2-w7-overlay-language`。

## 改动与边界

主窗口和 Quick Search 各有独立 JS 语言 store，但共用本地偏好。现在接收同源 `localStorage` 的语言事件，仅应用收到的新值，不回写存储；仅用户在当前窗口明确选择才持久化。移除覆盖或清空存储回到跟随系统，其他键和 sessionStorage 不改变语言。`?lang=` 的演示覆盖仍独立。

主窗口的 `WindowLanguage` 用既有字典发布快速检索与退出等待两条文字。`shell_set_window_labels` 只授予 main，并在 Rust 再校验身份；只修改固定 overlay 标题和当前退出等待标题，不接受任意窗口目标。Rust 保存退出文字，原有 `request_exit` 使用它。初始 fallback 仍为英文；`Enouia Runtime` 始终英文，退出失败仍恢复产品标题。没有改变关闭、热键、锁库、Memory shutdown、Memory 读取范围或业务动作。

新增一条中日译文，字典各 1,418 键、缺失 0；重新生成字体，504 个 WOFF2 内容未变。Memory pin、领域代码、个人数据与真实 Provider 均未触碰。

## 回归与原生验证

- `window-language` 10 项：浏览器不调用 native、固定标题命令、英中日文字、忽略其他存储、外部选择和移除不回写、清空后跟随系统。
- 原有 Quick Search fixture 保留全部断言，增加跨窗口切换不改草稿、不发搜索；共 25 项。Harness 按 `main.tsx` 订阅语言，继续用原有 SDK mock 和 synthetic Memory transport。
- 本次 debug 原生构建，独立 profile `.design/w7-overlay-language/webview`、既有隔离配置，无 Vault。按主窗口 Settings 按钮切英/中/日，真实 overlay 同步到对应语言，`Local UI language check` 草稿不变、结果仍空；没有提交这段检索文本，也没有放入演示数据。
- 从 overlay 调用新标题命令被拒，原样信息：

```text
shell_set_window_labels not allowed on window "overlay", webview "overlay", URL: local

allowed on: [windows: "main", URL: local]

referenced by: capability: main-window, permission: allow-shell-set-window-labels
```

- 跟随系统后，两窗口为本次系统首选语言中文，覆盖为 null。连续选择 `ja → en → zh-Hans` 后，两窗口都为中文，最终保存 `zh-Hans`。
- 随后选日文，正常退出并重启同一临时 profile；main/overlay 均为日文，主窗口品牌仍英文。真实原生标题更新命令返回成功；未使用额外窗口读写权限来做验收。
- 通过 Computer Use 的窗口清单核对主窗口标题仍为 `Enouia Runtime`；该清单未返回无任务栏的 overlay。截图显示 overlay 文案，不把它说成原生 OS 标题的读回。未在真实长操作下截获退出等待标题，其实现与长操作验收界限保留。

截图共 8 张，在 `.design/w7-overlay-language/shots/`：三语 `settings-*.png`、`overlay-*.png`，以及 `restart-ja-main.png`、`restart-ja-overlay.png`。已查看日文 overlay 原图。原始回执在 `native-languages.json`、`native-system-rapid.json`、`restart.json`。

## 失败与修复

第一版 storage handler 调用会持久化的 `setLang(readPref())`。普通三语回归通过，但真实双窗口连续切换复现了旧选择回写，错误为：

```text
Error: overlay timeout document.documentElement.lang==='zh-Hans'
```

两个窗口最后都回到了先前的日文。修正为区分持久化选择与只读应用事件，并直接使用事件的 `newValue`；新增两条“不回写”断言。随后真实系统/连续切换与完整六项检查重新通过。`native-rapid-first-failure.log` 保留错误摘要；完整首次堆栈在本次会话工具输出。开发新 fixture 时也修正了未等待异步字典完成就结束 SSR 的测试等待；不是应用端口失败。

## 最终检查

最终代码六项全部通过：`npm run check`、`npm test`（Node 127 通过 / 3 跳过，DOM 80/80）、独立 `npm run test:dom`（80/80）、`npm run build`、`node scripts/check-memory-integration.mjs`、`node scripts/check-activity-retirement.mjs`。主 JS 436.73 kB，无 500 kB 警告。

Rust：offline/locked build、fmt check、shell 定向测试 3/3（43 filtered out）、Clippy `--bin enouia-desktop -- -D warnings` 通过。未跑完整 Rust 集成套件、未打安装包、未启用登录启动。日志位于 `.design/w7-overlay-language/`。物理托盘 #25 和其他 W7 验收继续保留。

平台语义对照 [MDN storage event](https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event)；原生标题沿用仓库已有 Tauri 2.12.0 `set_title` 模式。
