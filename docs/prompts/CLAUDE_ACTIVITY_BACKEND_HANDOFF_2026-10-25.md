本条只补充你正在进行的 Runtime UI 删除改动，不调整其他重构方向。

Morii 已确定一起移除 Activity 和私有用量界面。Codex 已在独立后端分支撤下原生 `activity_call`、`activity_setup`、`usage_call`、`usage_pick`、`usage_cancel`，以及对应宿主与权限；后端没有修改 `apps/desktop/src`。

请删除两块功能的导航、页面、操作入口，以及 Home / Settings / Inspector 的相关卡片、状态和链接；清理仅用于这些界面的前端调用、状态和资源。不要保留占位页，也不要新增 tokens.ci 面板或网络调用。

保留 Memory、Context、Sessions、Provider 配置、Memory 任务观察、会话请求 token 信息和 Windows 外壳。不要把它们和被删除的独立 Usage Ledger 混淆。

旧独立采集/上传程序、账本和安装任务仍在，等 Moriium 替代链路完成生产验证后再清理。请勿停止任务、删除数据或处理其他分支/PR。原来提示词中“暂留原生命令”已被这次后端改动取代；不要为旧页面重新加回这些命令。

完成受影响的前端检查，并在整合后运行 `node scripts/check-memory-integration.mjs` 和新增的 `node scripts/check-activity-retirement.mjs`。后端分支的具体提交由 Morii / Codex 交接后再整合，不要顺带合并其他未完成工作。
