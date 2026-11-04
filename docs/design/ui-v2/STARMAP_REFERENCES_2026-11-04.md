# 记忆星图参考调研（#24，2026-11-04）

目的：在 [CDP 追踪](../../validation/UI-v2-starmap-trace-2026-11-03.md) 已定位成本之后，看其他记忆库和图谱工具怎么画大规模记忆图，整理成可选方案。本文只是调研，产品绘制没有改，#24 仍未关闭。

## 我们的已知事实

- 5,000 节点时，球体 draw 间隔约 500 ms，聚类约 350 ms（无头 Edge，硬件光栅）。时间主要花在 GPU 进程反序列化和光栅化画布指令，JS 只占一小部分。
- 跳过虚线主题连线后，每帧 GPU 光栅约从 270 ms 降到 47 ms，间隔降到 117 / 80 ms；跳过全部星点几乎没有变化。
- `StarMap.tsx` 已经按类型把连线合成三条路径，每帧只有 3 次 `stroke`；成本在路径本身，约 4,300 段 3/3 虚线。
- 绘制顺序是背景 → 环 → 连线 → 高亮 → 星点。空闲时画布仍按 `IDLE_MS` 重画，只为星点闪烁（`tw` 随时钟变化）。聚类视图空闲时连线不动；球体自转时连线每帧都在动。

## 参考项目

| 项目 | 做法 | 对我们的启示 |
| --- | --- | --- |
| [OmbreBrain-folio](https://github.com/ceshihaox-dotcom/OmbreBrain-folio)（此前参考过的记忆桶项目） | `dashboard.html` 的“记忆网络”：Canvas 2D、无库，环形加随机扰动后跑 80 轮力导向，只画一次。边是实线，透明度随相似度变化，没有虚线、缩放、悬停或细节分级。没有标明规模目标。`v2/network/index.html` 的脚本部分未能读到 | 小规模、一次性静态绘制；实线加低透明度就能表达“弱关联”，不必用虚线 |
| Obsidian 图谱 | 内置图谱用 PixiJS（WebGL），论坛有 [shader 报错](https://forum.obsidian.md/t/v1-4-5-graph-view-does-not-render-nodes-pixiejs-shaders-broken/66621) 和 [内存泄漏](https://forum.obsidian.md/t/pixi-webgl-memory-leak-with-graph/1177) 的记录。[大库会卡死](https://forum.obsidian.md/t/obsidian-graph-view-doesnt-work-for-a-large-vault/106287)，社区插件 [Speed Graph](https://community.obsidian.md/plugins/speed-graph)、[Fast Graph](https://community.obsidian.md/plugins/fast-graph) 把布局放进 Worker 并交给 GPU | 规模上去以后，主流做法是 WebGL 加离线布局；我们的布局已在 Worker，绘制仍是 Canvas 2D |
| [sigma.js](https://www.sigmajs.org/reference/settings/) | WebGL；`hideEdgesOnMove` 在平移 / 缩放时隐藏边，[性能指南](https://www.sigmajs.org/how-to/technical/performance/)建议关闭边拾取、减少曲线段数 | 运动中隐藏或简化连线，是大图的常规取舍 |
| [Cosmograph / cosmos](https://github.com/cosmograph-org/cosmos/wiki/Cosmos-v2-(Beta-version)) | 布局与绘制都在 GPU 着色器里完成（regl），[文档](https://cosmograph.app/docs-general/concept/)称 SVG 超过几千个动画对象就会失效，规模目标为数十万点 | 若将来要支持数万条记忆，需要换成 WebGL 管线，而不是继续优化 Canvas 2D |
| Zep / Graphiti | Zep 控制台有 [Graph Explorer](https://help.getzep.com/v3/graph-visualizer-assistant.md)；开源的 Graphiti 不带可视化，[需要自己做前端](https://help.getzep.com/zep-vs-graphiti) | 没有可复用的绘制做法 |
| 学术对照 [Horak 2018](https://mt.inf.tu-dresden.de/cnt/uploads/Horak-2018-Graph-Performance-Poster.pdf) | 大图下 WebGL 优于 SVG / Canvas；WebGL 里画文字标签会掉帧，建议缩小时去掉标签 | 标签要按缩放分级 |

关于虚线成本：Firefox 的 [Bug 1942031](https://bugzilla.mozilla.org/show_bug.cgi?id=1942031) 把一个卡顿页面归因于“大量带虚线样式的 stroke”。没有找到 Chrome 的同类基准；我们的追踪是目前唯一的 Chrome / WebView2 系证据。

## 可选方案（按外观影响排序）

1. **缓存静态底层，外观不变。** 布局、缩放、平移、选择或主题没有变化时，把“背景 + 环 + 连线”画进同 DPR 的离屏画布，空闲帧只做一次 1:1 `drawImage`，再叠加星点和高亮。追踪显示连线约占每帧 GPU 光栅的八成，聚类空闲帧预计接近“跳过虚线”那一组（约 80 ms 或更好），需要实测。限制：球体自转、拖动、相机移动时缓存每帧都失效，帮不上忙。实现前要确认，高亮和悬停线与底层的叠放顺序保持现状。
2. **运动中隐藏或简化连线（sigma.js 做法）。** 自转、拖动、缩放期间不画主题线，或只画选中邻域，停下后恢复。外观会变：运动中看不到主题线。
3. **主题线改为实线、低透明度（OmbreBrain / Obsidian 常见做法）。** 此前对照显示，实线仍慢于省略主题线，单独改实线不够；可与 1、2 组合。外观会变：失去“共现”与“明确关系”在线型上的区分，需要换成别的编码（例如透明度或颜色）。
4. **按缩放分级显示。** 缩小时只画部分主题线或聚合成簇间连线，放大后再展开。外观和信息量都会变。
5. **长期：换成 WebGL 管线**（PixiJS、regl 或 sigma 式自建）。工作量最大；只有当规模目标超过 5,000 条时才值得。

## 效果对照（2026-11-04 实测）

`starmap-diagnostics.mjs --options`：在同一页面依次套用各方案，截取画布全图和局部放大（中心偏右上区域 ×2.5），并测量帧间隔中位。环境：无头 Edge 1440×900、DPR 1.5、5,000 条、深色。截图和拼合对照图只保存在忽略目录 `apps/desktop/target/starmap-options/`（`starmap-options-compare.png`），已发给 Morii，未提交。这次运行没有开追踪，整体比追踪模式快，但各方案的相对顺序一致。

| 方案 | 球体 ms | 聚类 ms | 看得出的变化 |
| --- | ---: | ---: | --- |
| A 原样（虚线） | 141 | 104 | — |
| B 隐藏主题线（只在运动时） | 40 | 33 | 球体全图几乎看不出（主题线透明度本就只有 0.16）；聚类会少掉团内的灰色连线 |
| C 缩小时每 4 条留 1 条 | 71 | 43 | 全图仍显得密，放大后能看出变稀 |
| D 实线 | 106 | 69 | 全图看不出；放大后虚线变成连续线 |
| E 半透明实线 | 108 | 64 | 同 D，线更淡 |

另外更正：球体只在用户甩动后的惯性自转期间（速度按指数衰减到停）连线才会逐帧移动，空闲时同样静止。所以方案 1 对两种布局的空闲帧都有效，方案 2 只需处理拖动、自转和缩放。

## 决定（2026-11-04）

Morii 选择 **方案 B：运动中隐藏主题线**。规格如下：

- `StarMap.tsx` 的 `draw()` 在 `loop.current.busy` 为真时，跳过 `theme` 类型那一批连线。`busy` 已经汇总了布局过渡（`chasing`）、星点漂移（`moving`）、拖住星点、相机平移 / 缩放、甩动惯性、自转和滚筒旋转。停下后的下一帧照常画回全部主题线。
- `source`、`supersedes` 两类连线以及选中 / 悬停高亮线照常绘制，星点、光晕、标签都不变。
- 减少动效（reduced motion）下没有漂移动画，行为不受影响。
- 空闲帧外观与现状逐像素一致。

方案 0（静态底层缓存）不改外观，不在本次决定范围内；B 落地后如果空闲帧仍需提速，可以作为纯性能优化另开一片。C / D / E 不采用。

## 建议（决定前的分析，保留备查）

推荐“1 + 2”组合：空闲帧靠缓存（外观不变），运动帧隐藏主题线（停下即恢复，球体视图几乎察觉不到）。实测运动中可到约 40 / 33 ms。若只选不改外观的部分，就先做方案 1：唯一不改外观的选项，改动集中在 `StarMap.tsx` 的 draw 和失效条件，可以用现有的 `--trace` 诊断前后对照，并逐像素比较空闲帧。球体运动中的成本要靠方案 2 或 3 解决，属于视觉取舍，等 Morii 选择。方案 5 只在规模目标变化后再讨论。

本次调研的边界：OmbreBrain-folio 的 `v2/network` 脚本没能读到；Obsidian 内部实现的证据只来自论坛，不是官方文档；Cosmograph 的规模数字来自厂商自述。
