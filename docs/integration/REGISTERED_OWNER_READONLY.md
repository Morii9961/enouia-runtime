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
Owner 接口；不能用旧包测试新库。新生产候选待 R3 与 Memory 工程交付就绪后另行安排。

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

目录明确标记“已登记 Owner · 只读”，不标成虚构示例。旧 Workspace 仍为 none，
所以本切片的全局旧 Workspace 徽标、Home/Settings 仍有待下一片统一表达；这不表示
新根被旧 Workspace 打开。图形目录选择与全局壳层状态是后续接入项。

真实个人库验收须等待 Memory 的形成、重开、查询/来源及独立备份恢复证明，并由 Morii
在明确批准的入口操作。当前合成演练不能替代这些结果。
