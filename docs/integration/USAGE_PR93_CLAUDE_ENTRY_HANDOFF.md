# 给 Claude：PR #93 Usage 最小入口适配

2026-10-23。对应 #93 原 head 969f504f915989402b552ba7670c7ed7bc2fdfe1 及本次本地 Usage 宿主身份绑定修复。此文件供人工交接，不启动、不合并任何 UI 分支。

## 文件归属

Claude 继续现有 redesign/* 分支完成 Runtime UI；所有相关分支/worktree 保护。功能侧本次不改 apps/desktop/src/App.tsx、apps/desktop/src/main.tsx，不替换壳或调整样式。#93 旧入口差异只能按以下需求移植，不能用旧 App.tsx/main.tsx 整文件覆盖重构成果。

| 文件 | 最小适配需求 |
| --- | --- |
| apps/desktop/src/App.tsx（或重构后稳定的根宿主） | 在导航切换不会卸载的位置放置一个 UsageProvider，native 依据现有原生窗口判断。该 provider 保留手动操作/待定回执状态；不依赖 Memory 已连接，也不在 mount/startup 时读账本或采集。保留 Claude 的路由、Shell 和 Memory 生命周期。 |
| apps/desktop/src/App.tsx 的 Activity 出口（或新 Activity 路由组件） | 可复用 usage/ActivityWorkspace，在现有公开 Activity 内容外提供“公开活动 / 私有用量”入口。公开内容继续使用原 ActivitySurface；私有 UsageSurface 仍按需 lazy 加载。若重构已有等价导航，只接相同内容与 controller，不复制旧壳。 |
| apps/desktop/src/main.tsx（或样式聚合入口） | 仅接入 ./usage/usage.css；不得因此替换 quiet-runtime、Memory 或 Activity 样式。视觉适配归 Claude，可在现有设计中处理。 |
| apps/desktop/src/usage/UsageProvider.tsx、ActivityWorkspace.tsx、UsageSurface.tsx、client.ts | 可独立复用，保持 Usage 独立状态/命令和精确计数、unknown/unallocated 披露。浏览器预览断开真实后端，合成 transport 仅用于明确标识的测试。 |
| apps/desktop/src-tauri/src/usage.rs | 本次修复只把选择时的二进制摘要绑定至 native 令牌；Web DTO、usage_pick/call/cancel 和既有 usage_binary_changed 错误不变。无需新增页面参数或改共享入口。 |
| apps/desktop/src-tauri/src/main.rs、shell.rs、权限/build 配置 | #93 已有最小 native 命令注册和 owned-child 退出接点。保留并与最终主线协调；overlay 不得拿 Usage 权限。无需本片另改。 |

## 必须保留的交互语义

- 不自动扫描、不自动打开个人根，不控制 Activity 调度器，不使用 Memory adapter，也不以 UI 状态冒充账本提交。
- 切页保持 controller；停止等待实际结果，不承诺撤销已经完成的提交。显式退出只处理自有 Usage Child；close-to-tray 沿用原行为。
- 显示覆盖与未观察状态；没有请求开始日就保持数据集 unallocated，unknown 不补零、不造日/周/价格。
- 先查看具体计数并确认，再采用版本或排除整个身份；来源/证据变化使旧审阅失效。修订是替代，可调低总量。
- 导出为用户显式选择的新聚合文件，不上传、不覆盖既有文件。
- 程序包未签名。本次选择绑定当时验证的 SHA-256；即使替换 exe 和配套 manifest，也须重新选择。该边界不是发布者认证或沙箱。

## 基线与验收出口

#93 源自 5deb954；当前 main 是 669e68e1，已有 #92 的 Memory 集成。不要把 #93 工作区的旧 Memory pin/锁文件/Memory 模块拷回主线；本次不采用 55 命令或切 Host。合并/重定基线另需 Morii 明确授权。

完成重构后的入口适配时，针对实际改动验证：公开/私有切换、浏览器断开态、切页后待定操作、取消与过期审阅、离线导出入口，以及现有原生窗口权限和退出接点。可复用未受影响的已保存证据，不默认重跑全量或安装。物理 picker、Narrator/DPI、个人历史对账仍需单独验收。

[本片最终评审与证据](../validation/AI-usage-ledger-PR93-final-review.md)。本文件没有替 Claude 宣告 UI 完成，也没有发送至其他会话。
