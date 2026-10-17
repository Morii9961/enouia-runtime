# Claude 启动提示词：Runtime 当前前端路线

以下提示词由 Morii 复制给 Claude 后才开始执行；本文件不会创建聊天或自动启动任务。

```text
请接手 E:\Enouia Runtime 的当前 Runtime 前端工作。先读根目录 AGENTS.md、docs/PROVIDER_RUNTIME_HANDOFF_2026-10-17.md、docs/MEMORY_INTEGRATION_v1.md、现有计划与 ADR register，核对 Git 分支、HEAD、远端、工作区及其他 worktree。交接的代码基线是 main@3e6f1614fd101efa700ef0a0855c9ad9cd8cc783；后续文档提交另算，接手时刷新事实。

PR #65–68 已合并，自己的工作分支已清理。当前保存证据是 98 项 Node/前端测试、48 个实际组件 DOM 模拟用例共 677 项断言通过；最近产品构建及适用边界见交接。它们不代表真实 Provider、Windows/Narrator、存储故障或 Morii 验收。先用简短中文说明现状，然后选择现有前端范围内一个可复现的未完成问题，修复、按影响验证并提交推送。不要重复已有功能或为消耗额度制造工作。

Memory 仍固定 8186aed861af08cf7a2c5d8c912a24eae51b4d66、47 条 IPC 命令。领域实现由 enouia-memory 仓库负责；Runtime 冻结的旧领域 crates 不延伸。Activity 保持独立，J1/B4 未签收、B5 未激活。不要从旧 Activity 交接的过期基线重新开发，也不要自动启动 pin 更新、安装器或新 Windows 集成阶段。

保留 owner 的 AGENTS.md 修改、旧 Activity 交接/提示词及其他 worktree，不用 git add .。真实账号、凭据、个人 Vault/活动档案、Provider HTTP、个人迁移、生产采集/上传/计划任务和部署均不在本次范围。若下一步依赖这些授权，列出明确门槛后停止。

遵守仓库贡献署名及验证要求。完成一个切片后推送、创建可审阅 PR、确认实际 head 与检查状态，再合并并核实 main；只清理该切片自己的分支。不要以“创建 PR”代替完成合并。状态快照只有 Morii 明确要求时才更新，Markdown/JSON 同步并遵守 Project Status Protocol v1；本次已有 docs/status/project-status.json 供 Dashboard 手动导入，不连接 Dashboard 或建立同步服务。
```
