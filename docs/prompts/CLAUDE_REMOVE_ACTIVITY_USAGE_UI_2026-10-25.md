请在你正在进行的 Enouia Runtime UI 重构中落实以下范围调整，只处理 Activity / Usage 的界面删除，继续保留其他重构工作。

Morii 已明确决定：一起移除 Runtime 的公开 Activity 与私有用量账本界面。GitHub 活动和 Codex / Claude 公开用量以后由 Moriium 联动 GitHub、tokens.ci 展示；Runtime 不再承担这些统计的产品界面。旧后端待 Moriium 替代链路迁移完成后另行清理。

本次改动：

1. 从导航、路由和页面布局中移除 Activity，以及其中的“私有用量”页面/标签；不要保留空壳、占位页或“即将推出”。按你当前设计自然收拢导航，不必继续保持旧的七个主界面数量。
2. 删除上述界面中的日历、统计卡片、来源选择、扫描、冲突审核、修正、导出、采集/上传/重试/暂停等操作入口，以及仅服务于这些界面的前端状态与资源。
3. 清理 Home、Settings、Inspector、快捷入口、演示数据和文案中指向这两块功能的卡片、状态行与链接。保留 Inspector 的 Memory / Windows 状态、Memory 操作与任务观察。不要把 Memory 的后台任务、Provider 请求 token 限制或会话用量误当成私有 Usage Ledger 删除。
4. 不在 Runtime 增加 tokens.ci 拉取、嵌入页面、替代统计面板或新网络请求。
5. Codex 已在 Runtime 后端草稿 PR #100 撤下桌面 Activity / Usage 的原生命令、宿主和权限；请删除对应前端调用，不要重新加回。旧独立采集/同步/导出程序和打包/运维脚本仍暂留。不要修改、停止或卸载任何已安装任务，不删除归档、账本、pending 或其他个人数据。
6. 保留 Memory、Context、Sessions、Provider 配置、托盘、快捷键、自启动、安装器等其他功能及其安全边界，不更新 Memory pin。
7. 只在你当前负责的 UI 工作中改动；不要合并、关闭或清理其他分支、PR、worktree，也不要改写 Moriium / Dashboard。尤其不要因移除 Usage 界面而顺带处理已有 Usage PR。
8. 按实际改动更新受影响的导航/路由和组件检查；遵守仓库要求，桌面代码变更包含 `node scripts/check-memory-integration.mjs` 及集成文档规定的相关检查。报告删除范围与实际验证结果，不把 UI 删除称为后端退役或 Moriium 自动更新完成。
