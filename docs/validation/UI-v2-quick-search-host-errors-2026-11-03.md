# UI v2 Quick Search 宿主错误语言

基线：`c7ba2ee`。Quick Search 的窗口事件订阅失败与窗口操作失败保存消息键，显示时按当前语言翻译；不会因其他窗口改语言而重订阅事件、重试窗口命令或重新检索。

未修改产品代码时运行扩展的实际 overlay 组件夹具，28 项中中文/日文宿主失败提示检查失败；修复后全部通过。新增分支由 SDK mock 拒绝 `shell_hide`，随后发送主窗口使用的三语 storage 事件，保留同一输入节点、草稿及焦点，不增加隐藏或搜索次数。既有检索失败恢复、blur/事件清理、Escape、卸载与只读范围检查通过。

`npm run check`、i18n Node 8 项、Memory pin 检查与 `git diff --check` 通过。仅合成 SDK/DOM 证据；未操作真实窗口、热键、托盘或 Vault，未重跑整套或构建。
