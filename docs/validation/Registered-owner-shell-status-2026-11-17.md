# 已登记只读库壳层状态验证（2026-11-17）

基线 Runtime `66aa7e2c93889f340c1b2c00125a710ac299ec81`（PR183）。Memory 仍为
`a543c1e` / aggregate `723ec245…` / Workspace 61 命令。延续 R2，只统一已有显式
登记入口的表现层；没有新认证、写入、图形开库或个人数据接入。

## 改动

`shell_status.memoryEntry` 只报告不可变的启动模式，不含路径或身份。前端继续读取真实
Workspace 状态，再分别观察原生 catalog 状态；登记入口不会把 v1 的 none 改成 open。
原生状态读取失败或返回错误模式时撤回打开主张，保留只读入口，防止旧写入/Provider
控件重新出现。锁定开始撤回观察，实际回执立即更新共享状态，并使旧读取结果失效。

顶栏、Home、Settings 和页脚说明已登记库的独立打开/关闭/未知状态，不虚构旧库提交点
或连续时间迹线。Memory 默认展示原生目录，Context/Sessions 的门控解释本入口限制；
Settings 不挂载模型配置或 Provider 状态组件。登录启动功能仍保持原有单独的显式控制。

## 实际验证

- 新挂载组件夹具 `registered-owner-status`：**13/13**。包括 Workspace 保持 none、
  无 Provider 调用/写入控件、目录默认选择、失败及错误模式撤回、延迟 open 不覆盖
  newer close，以及实际锁定回执更新顶栏并使在途 open 失效。
- 相关 Happy DOM 回归：Home 状态 **24**、Settings 退出归属 **17**、生命周期门控
  **24**、工作区 **33**、原生目录 **42** 项断言通过。未运行完整 DOM 矩阵。
- 翻译/CJK 可见文本覆盖 **9/9**；TypeScript 与 Vite 构建通过，主入口 492.34 kB。
- Rust 定向 `shell_status_exposes_only_lifecycle_state` **1 通过**；格式化通过。
  明确执行 ignored 的真实原生登记合成测试 **1 通过**，为本轮创建新的固定三记录假库。
  旧夹具策略已过一小时，不当作产品故障；新 protected home 保留，不当缓存清理。
- 内嵌资产 release/offline/locked/custom-protocol 程序构建通过。实际 WebView2
  `--owner-readonly-only` **20/20**：原生入口模式、Home/Settings/默认目录、精确来源、
  Workspace 写入拒绝、锁定撤回与顶栏回执、跨进程同库重开、CURRENT 不变和自启动
  不开库。`owner-01-readonly.png` 已查看。
- 首轮 WebView2 **18/20**：两个新增测试漏解 `__t.invoke` 的 `{ok:...}`，而不是原生
  状态缺失。仅修正测试取值后重跑为 20/20；保留首轮报告与日志，不隐藏失败。
- Memory pin/surface 集成守卫、Activity 退役守卫、桌面脚本语法与差异检查通过。
  未重跑完整 Rust/消费者套件、21 原生模式、安装包或真实 Provider 检查。

忽略日志位于 `apps/desktop/target/owner-shell-*` 及独占构建目录
`apps/desktop/target/memory-pin-a543c1e-build/owner-shell-*`。其中
`owner-shell-native-initial-location.txt` / `owner-shell-native-location.txt` 指向首轮/最终
独立输出。登记 manifest 只指向显式测试创建的合成 home；不上传身份/路径或原始日志。

## 证据限制与下一步

仅运行专用假库。没有打开个人库、备份或私有原文，没有授予 OwnerReadGrant、Provider、
安装/部署或更新手动项目状态快照。此程序不是 R3 生产候选；旧候选仍不能用于新 Owner 根。
PR183 的报告保留当时“壳层未统一”的历史范围，本报告补齐该项，不改写历史检查结果。
下一步准备 R3 的只读验收分流与证据清单；真实形成/恢复证明、图形目录选择和人工验收
仍受各自边界约束。
