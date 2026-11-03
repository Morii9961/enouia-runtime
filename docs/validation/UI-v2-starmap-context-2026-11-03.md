# UI v2 #24 画布透明通道假设

基线：`69fffd2`。在既有成本与虚线对照之后，验证“整帧铺满底色的主画布能否通过关闭透明通道降低成本”。先核对 [MDN 的 Canvas 优化说明](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas#turn_off_transparency)与 [HTML Canvas 标准](https://html.spec.whatwg.org/multipage/canvas.html#the-canvas-settings)：`alpha:false` 可让浏览器按不透明画布处理，但初始位图会是黑色，不能只改一个参数就假定首次绘制前的外观等价。

工具新增 `--context`，在自己的空白页启用 CDP Page 域，通过新文档脚本只覆写 `.sm-canvas` 的上下文创建参数；其他画布、全部产品绘制指令、数据和样式保留。透明→不透明→透明分别新建页面，核对每次新页面标记与 `getContextAttributes().alpha`。命令是原诊断命令的输出目录改为 `target/starmap-context`，并追加 `--context`。

两次初始测量器运行未通过校验：一次在进入不透明组时实际属性不匹配；加入新页面标记后发现注入未生效。显式启用 Page 域后，六组标记/属性/可见性/非零样本校验全部通过。初始不完整日志保留在忽略目录，不作为有效对照。CDP 方法见[官方 Page 协议](https://chromedevtools.github.io/devtools-protocol/tot/Page/)。

环境仍为独立无头 Edge 156、1440×900、DPR 1.5；每组预热1.2秒，采样6秒。完整有效结果见[数据](UI-v2-starmap-context-2026-11-03.json)。

| 5,000 节点 | 透明前 | 不透明 | 透明后 |
| --- | ---: | ---: | ---: |
| 球体 draw 间隔中位 ms | 647.0 | 615.9 | 620.7 |
| 聚类 draw 间隔中位 ms | 451.9 | 402.3 | 426.8 |
| 球体脚本 draw 中位 ms | 61.9 | 60.9 | 59.5 |
| 聚类脚本 draw 中位 ms | 7.0 | 7.4 | 7.7 |

本轮透明基线整体明显慢于前轮，原因尚未定位；不能跨轮归因于透明通道。每组仅9–17次 draw，且前后基线有漂移。不透明组没有显示足以解决 #24 的收益，因此未改产品上下文，也未做“视觉完全等价”的结论或为首次黑底增加实现。#24 保持未关闭。

本片只增加可复现诊断工具与证据，实际完成六组有效浏览器对照、`node --check` 与 `git diff --check`。没有重跑产品套件/构建或实际 WebView2 验收，没有读取 Vault 或用户浏览器。draw 完成间隔不是屏幕呈现时间。
