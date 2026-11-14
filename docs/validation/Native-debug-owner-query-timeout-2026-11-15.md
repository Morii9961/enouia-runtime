# Native smoke：Windows 归属查询时限（2026-11-15）

基线 `main@7d755f546c87b1060bc33fd3b8f4f16932f6afde`。验证 Memory `eb70509` 兼容切片时，automatic、catalog、capture 三个模式都在业务断言前报 `debug listener does not belong to test process`（各 0/1）。不据此认定产品或进程归属有问题。

## 复现与定位

在忽略目录复制原脚本，仅增加底层错误记录，用全新合成根重现。原包装器隐藏了底层失败；诊断明确返回 `ETIMEDOUT` / `SIGTERM`，stderr 只有 PowerShell 的 CLIXML 头。原 15s 的 `execFileSync` 在管理查询完成前已终止 helper。

仅在诊断副本中给同一归属查询一次 60s 观测，不改变 listener 和父进程链判定。该轮 automatic 36/36 通过，实际五次成功归属查询分别为 19,435、19,796、20,116、19,777、19,727ms。没有关闭归属保护；也未确定管理查询变慢的更深层系统原因。

正式修复只把 `assertDebugOwner` 的 helper 时限从 15s 改为 30s，并加一条实测说明。监听数、16 层祖先进程检查、必须归属于自有活跃子进程，以及所有拒绝条件均保持原样；不增加重试。其他窗口、UI Automation 和 CDP 时限不改。

## 检查

- `node --check apps/desktop/e2e/memory-smoke.mjs` 通过。
- 正式 30s 脚本的三个新合成模式全部通过：automatic 36/36、catalog 39/39、capture 27/27，共 102/102。测试使用已通过 Runtime Rust/前端检查、尚未合并的 Memory `eb70509` 兼容程序，不把它当作此文档基线的产品发布。
- 原 15s 下的三次失败、带错误字段的复现、60s 诊断及最终 30s 运行日志分别保存在根工作区忽略目录 `apps/desktop/target/memory-pin-eb70509-native/`；60s 是诊断记录，不作为正式 30s 结果。

本片只修验证工具。未修改 Runtime 产品、Memory pin 或安装包；未重复完整前端/Rust 检查，因为该脚本不参与它们的执行。本轮没有读取个人 Vault、真实 Provider、执行安装/迁移、发送系统热键或打开文件对话框。
