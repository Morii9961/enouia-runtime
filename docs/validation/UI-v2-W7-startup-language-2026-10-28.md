# UI v2 W7 · 登录启动文案与隔离验证

2026-10-28。基线 main `2a3ad1f`（PR #107），分支 `codex/ui-v2-w7-startup-language`。

## 改动

Settings 的登录启动默认说明、旧观察提示、首次读取失败提示和只读恢复说明接入 `t()`，补齐中日译文。成功操作的提示保存为 `msg()` 标记的文案键，在渲染时翻译，因此已显示的确认提示也随语言切换；不会重新提交启动设置。既有读取、写入、禁用、未知状态和旧提示退役规则保持不变。

字典各 1,422 键，缺失 0。字典修改后重跑字体生成器，504 个 WOFF2 内容未变，总体积仍为 9,691,652 B。没有修改原生启动逻辑、实际 Run 值、Memory pin 或领域代码。

## 验证

- `startup-note` 的 12 项 DOM 断言全部通过。原有完成/重新读取/等待/失败语义保留；新增日文成功提示、日文说明、切语言不写启动值、中文旧观察/未知状态、读取失败不写启动值。所有启动命令都由既有合成 transport 接收，不触及真实登录设置。
- 最终六项检查全部通过：类型检查，`npm test`（Node 127 通过 / 3 跳过，DOM 80/80），独立 DOM 80/80，build，两个根检查。主 JS 436.75 kB，无 500 kB 警告。
- 现有 Rust `startup::tests` 3/3（43 filtered out）：命令仅包含当前 exe 与 `--autostart`、其他安装路径不外泄、隔离注册表往返。测试写入的是 `Software\EnouiaRuntimeTests\Startup-<pid>`，不是 Windows Run 键；随后删除其测试值与空测试键。
- 重新构建嵌入资源的 debug 应用，沿用隔离应用配置、新建独立 WebView2 profile，无 Vault。通过真实 Settings 的语言按钮读取英/中/日启动说明；未点击启动开关。三张截图在 `.design/w7-startup-language/shots/startup-{en,zh-Hans,ja}.png`，已查看中文原图，文字换行容纳正常。回执在 `native-descriptions.json`，随后正常退出。

日志在 `.design/w7-startup-language/`。本片没有失败的最终检查，没有个人库、真实 Provider 或生产启动操作。

## 证据更正与未完成项

完整权限复核已发现 Explorer。此前受限进程查询未返回它，不足以得出“没有 Explorer”的结论；本片同时更正 W7 托盘记录、handoff、OPEN_ISSUES #25，以及 PR #106 的描述。实际未完成的是窗口工具未暴露可操作通知区域，因此物理托盘点击和截图仍待验收。

本片不证明真实 Windows 登录启动、实际安装/升级、物理托盘或 OS 热键通过。热键 focused smoke 的准备改动保存在其独立分支的本地 stash；六项检查通过，但原生运行在前台归属保护处停止，尚未提交或宣称完成。实际登录启动和安装包是独立验收范围。
