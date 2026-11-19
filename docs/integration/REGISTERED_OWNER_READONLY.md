# 已登记 Owner 库：显式本机只读入口

这是 R2 的开发接入说明。[ADR-038](../adr/038-registered-owner-readonly-entry.md) 定义入口，
[验证报告](../validation/Registered-owner-readonly-2026-11-17.md) 只覆盖专用合成登记库。
本说明不批准打开个人库、初始化/迁移、创建权限、Provider、安装或部署。

## 可以做什么

在 **Memory → Vault → 原生记忆目录** 中，对启动时明确选定的同一个登记库做文字检索、
分页、单条详情与精确引文来源读取。只显示 Core 当前允许读取的范围；列表数量不能当作
整库总量，也不会因打开库而续期策略。来源摘录不证明图片内容或原始 Raw 的完整性。

这个入口不能创建、修改或删除记忆，不能创建 Agent/OwnerReadGrant、形成任务或向模型
发送内容。Sessions、Context 和旧 Workspace 操作不在此入口接通。

## 开发启动方式

仅适用于本切片源码构建的对应程序。旧 `5175284` 安装候选不认识这些参数，也不包含新
Owner 接口；旧包仅用于旧 Workspace 验收。当前可使用本地 R3 候选 `1267268` 的程序和相邻 DLL
免安装验收。[候选记录](../validation/R3-owner-readonly-candidate-1267268-2026-11-18.md)

包含 ADR149 来源分组决策的库还要求兼容 reader；`506d23d` 起即满足，见[pin 验证](../validation/Memory-pin-506d23d-2026-11-17.md)。
当前源码采用 Memory `368634b`，Runtime 链接的代码只多了 Windows 长路径持久重命名修复，见[采用验证](../validation/Memory-pin-368634b-2026-11-19.md)；
R3 候选 `1e96a6d` 与 `1267268` 都仍嵌 `506d23d`。早期 `a543c1e` 的 R2 验证程序
也不能因此当作分组新库的兼容程序。独立 fresh 工具的 journal v2 接续由 Memory 管理。

在已授权的受信任本机启动中显式指定原来登记的 home 与 bootstrap operation：

```powershell
& '<MATCHING_RUNTIME_EXE>' --memory-owner-readonly `
  --memory-owner-home '<REGISTERED_OWNER_HOME>' `
  --memory-owner-operation '<ORIGINAL_BOOTSTRAP_OPERATION>'
```

这些值来自原来的原生登记，不从名字猜测，不把 Vault 子目录当 home，不读取 descriptor
自行拼出 Owner/System，也不借此创建新登记。agent 不能因为文档里有命令，就自行填写
个人路径并运行。相同 Windows 账户或这些参数本身不等于人的授权。

运行时再次核实原账户/home/operation/描述符绑定；缺失、变更或合成登记冒充真实登记均
由 Memory 拒绝。恢复根的激活/接续仍由 Memory 的明确恢复流程负责，本入口不会自动
修复、重建或换根。旧 Workspace 参数和合成模式不能与此入口混用；失败不会转开其他库。

## 锁定、关闭与重开

“锁定已登记的库”会撤回列表与来源，并释放原生读取和目录占用。页面没有解锁按钮。
退出 Runtime 后，通过另一次已授权的显式本机启动重新打开，同一登记会重新认证。
窗口右上角关闭仍是收进托盘，不代表库已释放；需要释放时用锁定或退出。

登录自启动即使收到这些参数，也不打开登记库。Runtime 不保存上一次 home 或操作编号，
不改登记元数据中的 `runtime_adopted`，不把“登记成功”误写成“产品验收完成”。

## 当前界面范围

目录与全局徽标明确标记“已登记 Owner · 只读”，Home 和 Settings 显示独立的原生
打开/关闭/未知状态。Memory 默认进入原生记忆目录；锁定回执会更新徽标，晚到的旧
状态不能覆盖它。读取失败不恢复旧库写入或模型配置控件。旧 Workspace 仍为 none，
不将新根伪装成 v1 Vault，也不虚构提交点或连续时间迹线。

Context、Sessions 和旧 Workspace 页面会说明本入口的限制；Settings 不提供 Provider
配置。图形目录选择、其他 Owner 表面及记住上次打开的库均未实现。

真实个人库验收须等待 Memory 的形成、重开、查询/来源及独立备份恢复证明，并由 Morii
在明确批准的入口操作。当前合成演练不能替代这些结果。候选就绪后的步骤与待交付材料
见[只读入口验收准备](../RUNTIME_OWNER_READONLY_ACCEPTANCE_2026-11-17.md)。
