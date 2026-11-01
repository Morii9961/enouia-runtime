# UI v2 · 原生首页与时间骨架，2026-11-01

基线：`d0208eb60e75f05d283b0866fe528b1b47080786`（PR #112）；分支 `codex/native-home-time-structure`。开始时工作树干净；已通过 GitHub 连接器核对近期提交及无 open PR。当前 Memory pin 仍为 `bf6bfd10bf3c870ae2ce7ceb5c6bd635b08bf327`，未调整适配器、原生命令或 Memory 契约。

## 改动和数据含义

- ConnectedHome 恢复选定 UI v2 的大时刻、左侧 58% 记录纸、右侧四条注记与底部图例。大时刻来自设备时钟，明确标 UTC+8，不显示虚构的「Recording」或固定 demo 时间。
- 首页复用 TimeMap / timeview，在 21 个设备日历日内显示 4 日；支持既有键盘、按钮、点击与拖动。其他原生页面的 7 日记录带使用实际日期。
- 唯一事件标记和引线来自当前 `workspace_status.vault.lastCommitAt` 与 `headSequence`。最新 Vault 提交不代表记忆写入、候选或检查点，不推算连续波形或记忆统计；提交在可视范围外时不显示引线。
- Context、Sessions、Checkpoint 是显式导航入口；接口没有它们的最近摘要时间，均显示「—」。检查点入口进入 Sessions，不自动创建检查点或选中未经观察的会话。
- 未知、读取失败、锁库、切库、退出时撤下旧提交与可操作地图，保留纸面结构和设备时钟。按 Vault/日期隔离视口；没有新数据读取、领域写入、自动开库或 demo 回退。
- 新增 6 个中日译文，移除 5 个已无引用的旧键。既有打包字体的覆盖测试通过，本片没有重打包或下载字体。

F1/F2 **部分修复**：首页骨架与日历导航已恢复；没有把完整波形和四条已知时间引线标为完成。Sessions 的事件时间尺/小地图、Memory/Context/Inspector 的其他结构差异尚待后续片。没有改原浏览器演示或开放原生合成星图。

## 实际执行的检查

| 检查 | 结果 |
| --- | --- |
| `npm run check` | 通过；最终 `npm run build` 再次包含类型检查 |
| `npm test` | Node 127 通过、3 跳过、0 失败；内含完整 DOM gate |
| 内含 `npm run test:dom` | 80 场景、1,081 项断言，全通过 |
| `node tests/dom-fixtures.mjs --worker home-status-observation` | 最终代码 24/24；状态失败/锁库/切库/退出、空队列/未知队列、四入口、Home/End 平移、无效提交时间、仅读 workspace_status |
| `npm run build` | 最终代码通过；主 JS 440.55 kB（构建报告十进制单位） |
| `node scripts/check-memory-integration.mjs` | 通过，原 pin 一致 |
| `node scripts/check-activity-retirement.mjs` | 通过 |
| `node tests/i18n-keys.mjs --missing` | 两字典均 0 缺失；Node gate 的占位符/冗余键/字体覆盖也通过 |
| `git diff --check` | 通过 |

初次 Node gate 因旧 UI 移除后留下 5 个冗余译文键而失败；删除对应键后上述完整 gate 通过。没有把失败当作通过记录。离线依赖安装因缓存缺包失败，随后按既有 lockfile 执行 `npm ci --no-audit --no-fund` 成功，未改变依赖版本。

## 布局证据与限制

使用受控的无头 Chrome、全新临时 profile 和 `e2e/native-home-preview.html`。它渲染实际 connected 组件，但 IPC 全为合成回执，每张图保留 **FICTIONAL FIXTURE · NO NATIVE CONNECTION** 水印；没有读取个人资料。

- open：English / 中文 / 日本語 × 黛蓝 / 宣纸 × 1100×700 / 1440×900，12 组。
- English、黛蓝、1100×700：none / locked / error / changing / exiting，5 组。
- 17/17：无文档横向溢出、四注记的文字边界都在按钮内、无虚构波形；已目视查看中文 1440 深色、日文 1100 浅色、英文锁库 1100 深色。
- 预览与结果留在本机忽略目录 `.design/native-home-2026-11-01/`：`visual-results.json`、17 张 PNG、完整 `tests.log`、最终 `home-final.json` 和 `build-final.log`。最初沙箱浏览器未能启动、外部浏览器无法访问沙箱预览服务；改为仅监听本机的隔离预览服务后完成，未更改产品代码来规避加载问题。

这些是**合成组件、浏览器布局和前端构建验证**。未运行 Rust 测试、原生打包/安装或物理 Windows 操作，未复验 WebView2/DPI/Narrator、安装升级、托盘、默认热键、登录启动；不是 Morii 人工验收。未打开个人 Vault、采用 schema-2 Owner Vault、调用真实 Provider 或部署。

后续顺序：先移植 Sessions 的真实事件时间尺/间距及选中会话地图；再对照可读字段修复 Memory/Context/Inspector；原生与安装验收、正式 Vault 的 pin 兼容接入各按独立授权边界推进。
