# UI v2 #24：方案 B 的独立 WebView2 复测（2026-11-12）

基线 `main@9ef2b995e2bd616f78d644671ce211db4fd6d8c3`。按 [2026-11-07 交接](../integration/CLAUDE_TO_CODEX_2026-11-07.md) 的下一步第 2 项，重建 [W5](UI-v2-W5-starmap-2026-10-27.md) 已丢失的测量壳，复测 [方案 B](UI-v2-starmap-motion-2026-11-04.md)。没有修改星图、Runtime 壳、Memory pin 或视觉策略，#24 继续开放。

## 方法

`apps/desktop/e2e/starmap-webview2/` 保存独立 Tauri 2.12.0 / tauri-build 2.7.0 壳源码与命令说明；不引用 Runtime/Memory，不注册命令、插件、托盘或热键，capabilities 为空。API 已核对本机 `tauri-2.12.0/src/webview/webview_window.rs` 并实际编译；公共 docs.rs 对应页面本次无法访问。它只有一个窗口，加载本轮 loopback 服务的 `/starmap.html`，使用新 profile。复用现有冒烟的调试进程后代检查及 HWND/PID/标题校验，并明确拒绝非 loopback 监听后才进行 CDP 和窗口尺寸操作。

两边均为 Edge/WebView2 `157.0.4341.46`，1440×900 逻辑客户区、DPR 1.5。WebView2 使用实际 Windows DPI 144，物理客户区 2160×1350；无头 Edge 仿真相同尺寸。顺序运行，采样期间本片没有并发构建、测试或另一测量矩阵；日常桌面的其他负载没有冻结。两边均单独静态构建同一份虚构星图页面，不使用开发服务器。具体版本、边界、样本数及中位/P95 见 [完整 JSON](UI-v2-starmap-webview2-2026-11-12.json)。

沿用现有 `--motion`：5,000 条，球体/主题聚类，布局完成后等待 4.5 s；每阶段预热 1.2 s、采样 6 s。运动阶段每 100 ms 交替通过页面 DOM 键盘事件放大、点击 Reset view；恢复阶段停止该定时器。观察包装只记录 draw 时间、CPU 耗时及虚线 stroke 次数，没有省略绘制调用。不发送系统热键，不更改系统 DPI。额外保存 fresh reduced-motion 页的静止 PNG，但本片没有做旧版逐像素对照。

## 结果

单位 ms；draw 间隔不是屏幕呈现时间戳。W/E 为 WebView2/无头 Edge。每组仅一次完整采样，慢组样本很少，P95 不应视为稳定上界。

| 布局 / 阶段 | 间隔中位 W/E | 间隔 P95 W/E | draw 样本数 W/E | 主题 stroke 中位 W/E |
| --- | ---: | ---: | ---: | ---: |
| Sphere / idle | 586.8 / 590.5 | 595.6 / 617.5 | 10 / 10 | 1 / 1 |
| Sphere / motion | 148.9 / 146.2 | 160.1 / 169.0 | 40 / 40 | 0 / 0 |
| Sphere / restored | 788.0 / 880.0 | 797.1 / 909.6 | 8 / 7 | 1 / 1 |
| Theme clusters / idle | 410.9 / 383.9 | 421.7 / 414.0 | 14 / 16 | 1 / 1 |
| Theme clusters / motion | 96.6 / 99.7 | 104.0 / 109.6 | 62 / 61 | 0 / 0 |
| Theme clusters / restored | 392.1 / 380.9 | 400.4 / 389.0 | 16 / 15 | 1 / 1 |

本轮两个内核都复现慢 draw 间隔。运动时主题线不绘制、恢复后重新绘制的行为有观测，但仍明显慢于约 33 ms 的目标。旧记录使用其他版本、构建/环境与取景，不能把本轮差异解释为性能提升，也不据此定位新的 GPU 根因或选择隐藏/实线等视觉方案。已查看 WebView2 球体运动与聚类恢复原尺寸截图，页面明确标注 invented memories，恢复截图可见主题线。#24 保持开放。

## 执行与限制

- 独立壳离线 release 构建通过（5m 23s）；本地生成的独立 Cargo.lock 随本轮证据保存，不改生产 Cargo.lock。独立壳锁文件不提交，未来传递依赖解析仍可能变化。
- 完整 `npm test`：Node 151 项（148 通过 / 3 跳过 / 0 失败），DOM 122 场景、2,527 项全部通过。Rust 格式、两个诊断脚本语法、Memory 集成自检（8 反例）与 Activity 退役检查通过。未跑产品打包、Rust 全套单测或 21 个 Memory 原生冒烟。
- 首次 WebView2 采样因本片新加的主题笔画断言中断，尚未写出样本行，未记录失败样本的具体笔画值及 busy 状态，不能确定具体原因。性能采样不应以笔画值作为纳入前提，故删除新增断言，保留实际观测；新 profile 的第二次完整采样及随后 Edge 对照完成。未改产品。首次失败日志保留，不能记作全部首次通过。另一次格式检查因 PowerShell PATH 缺少 cargo 未执行，改用 Cargo 绝对路径后通过。
- 本地忽略证据：`apps/desktop/target/starmap-webview2-build-20261112.log`、`starmap-webview2-tests-20261112.log`；首次目录/日志 `starmap-webview2-20261112`，完整目录/日志 `starmap-webview2-20261112-run2`，对照目录/日志 `starmap-edge-20261112`。目录含 report、PNG、隔离 profile、静态页面；完整 WebView2 目录另存 `measurement-Cargo.lock`。

这不是 Runtime 原生星图集成、个人 Vault 或 Morii 人工接受；未访问个人库、真实 Provider，未安装、迁移、部署或改变待定策略。当前安装候选仍为 `5175284`，本片不需要重新打候选包。
