# UI v2 W5 · 星图 WebView2 浏览器验证

2026-10-27（Asia/Shanghai）。基线 W4 `1726e2d`，分支 `codex/ui-v2-w5-starmap-validation`。本片只记录测量，不改星图实现、不接入真实数据、不修改 Runtime 原生壳、Memory pin 或领域代码。

## 方法与范围

开发服务器 `/starmap.html?lang=en&theme=dark`，明确标注 invented memories。使用本机忽略目录内的独立 Tauri 2.12 / WebView2 浏览器测量程序：只有浏览器窗口，没有 Runtime/Memory 依赖、命令或能力授权，不是 Runtime 应用的原生星图集成。独立用户数据目录、调试端口只绑 loopback，CDP 连接先核对监听进程属于本片子进程。复用仓库 smoke 的 HWND/PID/标题验证和物理窗口尺寸函数（本地副本只改测量壳标题）。

两种内核均为 Edge/Chromium 155，1440×900 逻辑客户区，DPR 1.5；WebView2 实际 Windows DPI 144（150%）、客户区 2160×1350。无头 Edge 仿真同尺寸/DPR。逐布局/规模等待 Worker 完成，再稳定 2.5 s、采样 6.5 s；样本数逐组保存在 JSON，未并发运行构建/测试或另一个测量矩阵。读 `window.__starPerf`，另在其 draws.push 上临时记录时间，取完恢复方法。数据与完整用户代理见[数值记录](UI-v2-W5-starmap-2026-10-27.json)。

下表单位 ms。布局列是 WebView2 / Edge 的 Worker 工作时间；绘制、计算列是 WebView2 中位 / P95；间隔列是两内核实际 draw 调用间隔中位。`force` 是代码里的星系标识，沿用原名称契约。0.0 为计时精度下的四舍五入，不能解释为没有计算成本。绘制 CPU 时间不包括 GPU、合成和最终呈现；draw 间隔也不是屏幕呈现帧测量。

| 布局 | 条数 | 布局 WV2 / Edge | WV2 绘制 中位 / P95 | WV2 计算 中位 / P95 | draw 间隔 WV2 / Edge |
| --- | ---: | ---: | ---: | ---: | ---: |
| sphere | 200 | 2.6 / 2.8 | 0.4 / 0.7 | 0.0 / 0.1 | 34.6 / 34.9 |
| sphere | 700 | 5.8 / 5.0 | 0.7 / 0.8 | 0.1 / 0.2 | 34.7 / 34.9 |
| sphere | 1,000 | 7.0 / 8.1 | 0.9 / 1.1 | 0.1 / 0.2 | 34.8 / 35.1 |
| sphere | 5,000 | 24.6 / 24.9 | 7.9 / 8.7 | 0.5 / 0.6 | 128.6 / 132.2 |
| force | 200 | 23.7 / 26.1 | 0.2 / 0.4 | 0.1 / 0.1 | 34.7 / 34.7 |
| force | 700 | 88.6 / 87.5 | 0.3 / 0.6 | 0.2 / 0.4 | 34.9 / 34.6 |
| force | 1,000 | 134.0 / 142.1 | 0.4 / 0.7 | 0.3 / 0.5 | 34.7 / 34.3 |
| force | 5,000 | 415.6 / 411.0 | 1.0 / 1.2 | 1.0 / 1.2 | 34.9 / 34.8 |
| drum | 200 | 1.2 / 1.2 | 0.2 / 0.3 | 0.0 / 0.1 | 34.5 / 34.3 |
| drum | 700 | 3.5 / 3.4 | 0.4 / 0.6 | 0.1 / 0.2 | 34.7 / 34.2 |
| drum | 1,000 | 4.6 / 4.6 | 0.4 / 0.6 | 0.1 / 0.3 | 34.6 / 34.2 |
| drum | 5,000 | 15.6 / 15.7 | 1.2 / 1.7 | 0.4 / 0.6 | 34.7 / 34.3 |
| clusters | 200 | 1.2 / 1.3 | 0.1 / 0.2 | 0.0 / 0.1 | 34.6 / 34.4 |
| clusters | 700 | 3.6 / 3.6 | 0.2 / 0.3 | 0.1 / 0.2 | 34.7 / 34.6 |
| clusters | 1,000 | 4.7 / 4.7 | 0.3 / 0.3 | 0.1 / 0.2 | 34.6 / 33.9 |
| clusters | 5,000 | 16.6 / 15.7 | 1.2 / 1.6 | 0.6 / 0.7 | 95.8 / 98.4 |

宣纸球体 5,000 条另测：WebView2 绘制 2.0 / 2.7 ms、计算 0.5 / 0.6 ms；Edge 绘制 2.0 / 2.3 ms、计算 0.4 / 0.6 ms。此补测没有记录 draw 时间戳，不补推帧率。

## 结论与停止条件

200/700/1,000 条的四种布局保持约 35 ms draw 间隔。5,000 条黛蓝球体约 129 ms、主题聚类约 96 ms，明显慢于设计的约 30 帧/秒；Edge 对照也能复现慢间隔。不能只凭主线程 CPU 耗时把这些状态判为流畅。记为 OPEN_ISSUES #24，本片不修复或宣称已定位 GPU 根因。

历史无头记录是球体 700 / 5,000 布局约 6 / 28 ms，星系 5,000 约 460 ms、绘制约 5 ms、计算约 7 ms。本次 WebView2 球体为 5.8 / 24.6 ms、星系约 416 ms；环境、版本、DPR 和采样口径未完全冻结，历史值仅作参照，不能据此声称性能提升。

在 700 条球体稳定后，分别暂停、媒体 prefers-reduced-motion、应用 data-motion=reduced、把画布实际移出视口（IntersectionObserver 路径），等待 4.5 s 收敛，清空计数，再观察 1.5 s：四项均 draws=0、steps=0，完整像素缓冲的 FNV 哈希相同；这是像素哈希证据，不是逐字节比较。活跃/恢复/重新入屏分别 54/55/55 次绘制，哈希改变。系统设置级减少动画已由 W2 另测，本片使用媒体仿真；没有新增 OS 设置改动。未测实际显示呈现帧或后台最小化。

截图与完整测量脚本/临时壳源码/日志仅保留在 `.design/w5-browser/`，其中 `shots/` 含两内核的四布局×四规模、宣纸 5,000 与 WebView2 停止/恢复证据；原始交付图片未上传。抽查 WebView2 5,000 球体原图，页面明确虚构标注。后端图投影仍是原生接入前提。

## 检查

`npm run check`、`npm test`（Node 127 通过 / 3 跳过、DOM 77/77）、独立 `npm run test:dom`（77/77）、`npm run build`、两个根检查均通过，日志在 `.design/w5/`；没有重跑 Rust 全套测试。首次临时壳缺少 Windows 图标，补用仓库已有图标；共享构建目录受上一片自建调试进程占用（os error 32），关闭该进程后编译通过。未改产品构建逻辑。

本地 PowerShell 5 包装器最初将 Vite 已知 #18 警告的 stderr 当成终止错误，原样输出：

```text
npm.cmd : [plugin builtin:vite-reporter]
At E:\Workteree\fc79\Enouia Runtime\.design\run-slice-checks.ps1:17 char:8
+  try { & $c.exe @($c.args) *> (Join-Path $logRoot ($c.name+'.log'));$ ...
+        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: ([plugin builtin:vite-reporter] :String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
```

改为按外部进程退出码判断，再单独完成 build 和两个根检查。原始文件保留为 `.design/w5/build-wrapper-initial.log`；产品构建成功且 #18 警告保留待指定切片处理。

Edge 初次测量工具错误地要求每组至少 50 次 draw，实际 5,000 球体只有 48 次，原样报错：

```text
Error: invalid active sample {"n":5000,"layout":"sphere","theme":"dark","layoutMs":26.399999976158142,"draw":{"n":48,"median":7.899999976158142,"p95":8.5,"max":10.100000023841858},"step":{"n":48,"median":0.5,"p95":0.6000000238418579,"max":0.7999999523162842},"cpuCombined":{"n":48,"median":8.300000071525574,"p95":9,"max":10.5},"drawInterval":{"n":47,"median":133.60000002384186,"p95":142,"max":144.70000004768372},"hidden":false}
```

工具改为保留慢组且只拒绝零样本/隐藏页面，继续未完成组；没有丢弃慢数据或修改星图。首次完整输出在 `edge-measure-initial.log`，最终见 `edge-measure.log`。不代表 owner 验收、真实 Vault 或正式 Windows 安装交付。
