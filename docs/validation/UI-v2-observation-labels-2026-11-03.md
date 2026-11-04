# UI v2 剩余观察标签

基线：`413d318`。补齐候选建议优先级与被修改事实、设置退出状态与观察时间、工作区调用 ID 标签及 Vault 释放时的模型停止说明。保存事实原文、优先级值、修订与操作 ID 不变；明确本地停止不代表服务方未收到请求。

实际验证：类型检查通过；i18n、CJK 与 surface 定向 Node 35 项通过；`candidate-core-filter`、`provider-settings-status`、`workspace-calls`、`memory-lifecycle-gate` 四个现有合成 DOM 场景通过。根 Memory pin 检查及 `git diff --check` 通过。此片只补译文与调用，不新增测试或改变观察/写入行为。

未运行完整套件、构建、原生或人工验收；没有访问真实 Vault、设置文件、Provider 或个人资料。
