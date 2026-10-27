# UI v2 W6 #16 · Runtime 组件名与状态分行

2026-10-27。基线 #10 `c185f8e`，分支 `codex/ui-v2-w6-16-component-labels`。

仅改 `theme/negative.css`：组件按钮使用一列、3px 行间隔，名称和状态可断行，状态 flex 可换行。保留最小高度与自适应内容高度、选择/键盘行为、状态图形、类名及 data 属性。

独立无头 Edge 浏览器演示，1100×700 / 1440×900、三语、两主题，共 12 张图。每组选择 Context Compiler；六个组件的名称和状态均处于不同的行且在按钮边界内，侧栏无横向溢出。截图和测量 `.design/w6-16/shots/`、`visual.json`。查看英文宣纸 1100 原图，长组件名及状态均完整。没有读取个人库或改原生代码，也不把浏览器截图当作 owner 验收。

截图首次未执行成功，因为此前专用浏览器/开发服务器已经退出，原样错误摘要：

```text
Cannot process the XML from the 'Error' stream of 'C:\Program Files\nodejs\node.exe': Root element is missing.
FullyQualifiedErrorId : CmdletizationQuery_NotFound,Get-NetTCPConnection
```

完整原始输出保存在 `visual-initial.log`（含 PowerShell 编码输出），新建隔离浏览器 profile 并重启当前工作树服务器后，沿用 PID 归属检查，12 组通过；未放宽安全检查或改变产品。

六项检查全部通过：类型检查、`npm test`（127 通过 / 3 跳过，DOM 78/78）、独立 DOM（78/78）、build、两个根检查。首次检查会话在独立 DOM 阶段中断，仅有开头日志，没有完整结果；确认无残留测试进程后从该项重跑并完成后续三项。完整日志在 `.design/w6-16/`，中断文件为 `test-dom-interrupted.log`。#18 既有体积警告仍在。
