# UI v2 #24：运动中隐藏主题线（方案 B）

基线：`main@0cc1cb07be4078c9fb0af28f3ff0edbaac93d249`。仅改浏览器合成星图；Memory pin、Rust、原生入口不变。

`StarMap.tsx` 在 `loop.current.busy` 为真时跳过 theme 批次。source / supersedes、选中 / 悬停高亮的绘制保留。把现有 busy 计算放到 draw 前，避免停止循环的最后一帧仍隐藏主题线。

## 测量

诊断使用新建、自有隔离 profile，无头 Edge 156、1440×900、DPR 1.5、黛蓝、5,000 条虚构记录。`--motion` 用每 100 ms 交替的缓动放大 / Reset view 维持有界相机运动；停止计时器后观察恢复。每组预热 1.2 s、采样 6 s。不是屏幕呈现帧，也不是原生或人工验收。

| 布局 | 原始空闲 / 运动 / 恢复 ms | 本片空闲 / 运动 / 恢复 ms |
| --- | --- | --- |
| Sphere | 629 / 619 / 1270 | 671 / 222 / 1284 |
| Theme clusters | 492 / 517 / 468 | 168 / 115 / 490 |

完整样本含数量和 P95 见同名 JSON。运动样本 theme stroke 的中位 / P95 从 1 / 1 变为 0 / 0；空闲和恢复均为 1 / 1。已查看恢复后的聚类截图，主题线存在。

本轮明显慢于参考探针的原样 141 / 104 ms、隐藏主题线 40 / 33 ms。运动操作、取景、环境漂移均限制跨轮比较，空闲聚类也有明显波动。**没有达到约 30 帧/秒目标，#24 保持开放**；不采用缓存或 C/D/E，不据此扩展性能方案。

## 静止像素与执行记录

`--idle-only` 在新页面仿真 reduced motion、等待字体和布局后显式 Reset view，保存完整画布 PNG；`--compare-idle=<prior directory>` 用浏览器解码后比较每个 RGBA 像素。球体、聚类均为 1530×1002，差异像素各为 0。此为静止场景对照，不代表运动帧相同。

可复现命令（cwd `apps/desktop`，输出只在忽略的 target）：

```powershell
node e2e/starmap-diagnostics.mjs <msedge.exe> target/starmap-motion-after --motion
node e2e/starmap-diagnostics.mjs <msedge.exe> target/starmap-idle-after-reset --idle-only
node e2e/starmap-diagnostics.mjs <msedge.exe> target/starmap-idle-after-reset --compare-idle=target/starmap-idle-before-final
```

保留的失败 / 限制：最初缩放正反交替会累计改变取景，改成 zoom-in / Reset；大型像素数组导出导致诊断中断，改为 PNG；第一次静止聚类比较因初始化取景不同而无效，补显式 Reset。早期脚本检查和一次源码写入使用了错误 cwd，未改到目标，随后纠正。旧输出均未删除。失败诊断遗留的浏览器只按本轮明确 profile 核对并停止。

检查：TypeScript `npm run check`、诊断脚本 `node --check`、Memory pin 一致性通过。未跑完整 npm test、构建或 Rust 检查；未读取 Vault、Owner、真实 Provider 或用户浏览器。
