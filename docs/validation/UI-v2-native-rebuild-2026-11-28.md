# UI v2 原生已登记库界面重建（2026-11-27 – 11-28）

Morii 认为装好的候选 `e31b6d7` 和 UI v2 设计稿严重不符，要求逐屏重建。11-26 的 #265–#268 只换了样式写法，保留了旧结构。这一轮先用同口径截图列出逐屏差距（私有页面「原生界面差距清单 · UI v2」，21 组并排截图），Morii 按建议确认 D1–D5（[决定记录](../design-decisions.md) 2026-11-27 两条），再分六片重建，每片截图自检、跑检查后合并。

## 同口径截图

- 设计参照：`e2e/design-app-preview.html?page=…`，即浏览器演示本身。
- 原生：`e2e/registered-app-preview.html?page=…&click=…`，原生已登记库组件（`registered_owner_readonly`）读同一套虚构演示数据，主机与目录读取全部模拟，计划和确认请求一律拒绝，页面左下角有 FICTIONAL 标记。没有连接真实库。
- 两边都用 `tools/shot.mjs` 截图（1440×900，最小窗口 1100×700）。截图在本机忽略目录 `.design/`，不入库。

## 六片

| 片 | PR | 内容 |
| --- | --- | --- |
| 截图入口 | #287 | 上面两个页面 |
| ① 骨架 + 首页 | #290 | 标题栏短牌（D4）与真实周；记录带改为本周 7 日列；首页一次 4 天、大写星期日标、「Recording.」读数、短注记与短 ID、说明移到图例行、「上次停在」（D5） |
| ② 记忆目录 | #291 | 五个工作区按钮（D1、D2）；左栏检索与 Core 分面计数；紧凑列头；行去掉重复标题；日期口径「发生 / 提及于 / 初始化」；默认选中、↑↓ 移动；详情按设计顺序 |
| ③ 记忆工作区 | #292 | 时间：月份侧栏、月标题、日覆盖、按日分组；关联：星座 / 星图 / 关系链三个视图，默认打开关联最多的记录；形成：事件类型按钮、按日分组的观察流、默认打开最新事件 |
| ④ 会话 | #293 | 默认打开最近会话；会话时间小地图；连续时间尺；助手写平台名（D3）；右栏「记忆写入」说明数据缺口 |
| ⑤ 上下文 | #294 | 页头（提示、范围按钮、预览）、字节刻度、分区栏与已保存胶囊、已选入 / 未选入 / 生成的上下文；召回只在这里（D2） |
| ⑥ 运行 + 设置 | #295 | 运行只列三个真实组件（D5）、STATE 表、HEALTH 状态记号；设置把带框卡片拆成行；浅色、中文与 1100×700 复核 |

## 差距清单的结果

| # | 结果 |
| --- | --- |
| G1–G4 | 关闭 |
| H1–H4 | 关闭 |
| H5 | 例外（Morii 同意，D5）：底部右侧为「上次停在」+ 最近一轮的会话标题与时间 |
| H6 | 例外（D5）：笔迹画真实轮次的平滑计数，不造起伏 |
| M1–M7 | 关闭；M5 按 Morii 经 Memory 会话转达的口径实现，`formation_reason.mode == "backfill"` 写「初始化」 |
| W1–W3 | 关闭 |
| W4 | 按 D2 关闭：记忆区「召回」按钮跳到上下文页 |
| C1–C4 | 关闭；预算刻度画的是本次预览的字节数，Memory 不给逐条字节数，所以不画分段 |
| S1–S5 | 关闭 |
| S6 | 部分：右栏有「记忆写入」一节，但 Memory 还不能按对话列出形成的记录，界面直说，没有造数据 |
| R1 | 例外（D5）：只列 Memory Core、Memory 操作、Windows 外壳三个真实组件 |
| R2、ST1 | 关闭 |
| Q1 | 无结构差距，未改 |

D1：「值得回看」在「形成」的子视图，「人物与地点」在「关联」的子视图（#288 的人物页功能和 9 项检查保留）。

## 字体

新文案过了中日标签字体子集检查。中文「初」不在标签子集里，按 2026-11-08 的做法登记为标签位置回落到正文字体（`cjk-manifest.json`）；其余缺字（座、浏、供；日文 及、鎖、聞、渡、口）都改了措辞。

## 每片都跑的检查

`npm run check`、Node 测试（151 通过 / 3 跳过）、DOM 夹具全量、`npm run build`、CJK 字体测试，以及根目录 `node scripts/check-memory-integration.mjs`、`node scripts/check-activity-retirement.mjs`，六片均通过。没有改 `src-tauri`、Memory pin 或后端契约，所以没有跑 `cargo test`。原生冒烟脚本 `e2e/memory-smoke.mjs` 里随界面改名的字符串已同步，但这一轮没有运行原生冒烟。

## 边界

- 只读登记库不写入；页面拿不到路径或授权；没有 Activity / Usage。
- 截图里的数据全是虚构演示数据，没有在真实库上截图。
- 候选安装包见下节；安装到本机要先问 Morii。

## 候选 `b65dc49`（已装到本机）

从 Runtime main `b65dc49`（#295 合并）构建：`npm run desktop:bundle -- --no-sign -- --offline --locked`，x64、当前用户 NSIS 安装方式，产品版本 0.1.0，未签名。内嵌的 Memory pin 与 `e31b6d7` 相同，没有升级。产物复制到本机忽略目录 `apps/desktop/target/candidate-b65dc49/`。

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| `Enouia Runtime_0.1.0_x64-setup.exe` | 39,823,259 | `a7a31215c2695fadf762ea62a06514659d619141f09d94ea1c6f18746265d9af` |
| `enouia-desktop.exe`（构建目录） | 93,411,460 | `43511b89b9601939e34a36a22be66959fd65e0b6587c45c4e89d0ab85c9a9abb` |
| `enouia-memory-mcp.exe` | 59,519,844 | `85fb5f9bf59af99a9bc6a03207326922efa73aae68095d0289ba16a5b836a1a2` |
| `WebView2Loader.dll` | 160,880 | `86545b66cdb0603bc26b626fb9ad610cb6e71f28d468f5ea66df23b03dda96d5` |

`template-check.ps1` 对渲染出的 `installer.nsi`：26/26 通过。

2026-11-28 Morii 同意后安装到本机，按 Morii 的要求直接覆盖旧版：Runtime 当时没有运行，候选以 `/S` 覆盖安装到原来的 `D:\Users\Morii\AppData\Local\Enouia Runtime`，退出码 0；卸载登记里仍只有一个「Enouia Runtime 0.1.0」。安装后的 `enouia-desktop.exe` 为 93,411,460 字节，SHA-256 `65dc9d4513d534209e8b82eb24d1261c127227883d4a9b635e109b2824e066a5`（与构建目录的版本只差 Tauri 写进的打包类型标记）；`enouia-memory-mcp.exe` 与 `WebView2Loader.dll` 与上表一致。安装时有一个独立运行的 Ollama，不归 Runtime 管，没有动它。

随后应 Morii 要求在本机打开，于已登记库模式下逐屏查看真实库（343 条、已采用 311、暂存 32，只读，没有写入）：六个表面和记忆区各工作区都能读出真实数据，排布与设计稿一致；发现五处真实数据才暴露的问题，由 #298 修复（会话转录倒序，因而会话时间小地图也没有出现；记录带把写入次数写成「条记录」；owner_action / initial 没有译名、「纠正 · 纠正」重复；只有一个值「none」的项目分面）。另记两项未改：关联页的星座图在一条记录连着 30 条时方框互相重叠（组件原有问题）；那次启动时语义检索不可用，因为启动时已有一个独立的 Ollama 在跑、之后它自己退出了，与界面无关。

## 候选 `4f595e2`（已装到本机，接替 `b65dc49`）

从 Runtime main `4f595e2`（#298 合并）用同样的命令构建，内嵌的 Memory pin 不变。产物在本机忽略目录 `apps/desktop/target/candidate-4f595e2/`。

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| `Enouia Runtime_0.1.0_x64-setup.exe` | 39,824,332 | `722e7ed29e5e433efccd1d79d81bc988d957c93846d5645a941971ac33ecadbf` |
| `enouia-desktop.exe`（构建目录） | 93,411,759 | `3ba63b961c83a89283d5304fac062d53f2c3aaa50cdb70e5b0895f5d21363de8` |
| `enouia-memory-mcp.exe` | 59,519,844 | `85fb5f9bf59af99a9bc6a03207326922efa73aae68095d0289ba16a5b836a1a2` |
| `WebView2Loader.dll` | 160,880 | `86545b66cdb0603bc26b626fb9ad610cb6e71f28d468f5ea66df23b03dda96d5` |

`template-check.ps1`：26/26。先在设置页点「退出 Enouia Runtime」正常退出（进程全部结束），再以 `/S` 覆盖安装，退出码 0，卸载登记仍只有一个；安装后的 `enouia-desktop.exe` SHA-256 `00006c72c21b14551dd623238d294bb8e03aa189449c218deea79cb4d33b9383`。重新打开后：会话转录按轮次正序、会话时间小地图出现、记录带写「更早的 344 次 Memory 写入」；`ollama.exe` 是 Runtime 的子进程、`llama-server.exe` 已加载，设置页「语义检索 已就绪 · 343 条记忆 · bge-m3」。

## 候选 `287f885`（已装到本机，接替 `4f595e2`）

从 Runtime main `287f885`（#300 合并，Memory pin `9b54d9035d774cc43af27567e533df73f7af5204`，ADR-MEM-232 纠正合并来源记忆的修复）用同样的命令构建，界面与 `4f595e2` 相同。产物在本机忽略目录 `apps/desktop/target/candidate-287f885/`。

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| `Enouia Runtime_0.1.0_x64-setup.exe` | 39,827,752 | `70861682eb7e86116b7011d86fd19447c54060d651cc0913fcce638a13ce4bb9` |
| `enouia-desktop.exe`（构建目录） | 93,397,101 | `92d12d7e7381376e525da72c733d7248f659cfd050962ed4d1a2f0bfbfc0ddbe` |
| `enouia-memory-mcp.exe` | 59,508,342 | `6f70d6087d7f880eb59918f70888da77e8882b9a06af29415ce6e01b4e2171f0` |
| `WebView2Loader.dll` | 160,880 | `86545b66cdb0603bc26b626fb9ad610cb6e71f28d468f5ea66df23b03dda96d5` |

`template-check.ps1`：26/26。Runtime 当时没有运行，以 `/S` 覆盖安装，退出码 0，卸载登记仍只有一个；安装后的 `enouia-desktop.exe` SHA-256 `7be29de7ec379f1a2c62033943ebf0ac81e012ac79aaa6e0bb5fd7fa17dbf66a`。打开后读真实库（此前 Memory 会话已清理：会话 289 段，记忆 343 条，其中 17 条经 Owner 纠正为 r2 / live）：首页 343 条（已采用 311、暂存 32）；记忆目录里经纠正的记录按规则显示写入日期与时刻，其余仍归在「初始化」；左栏的人物与地点分面出现；设置页「语义检索 已就绪 · 343 条记忆 · bge-m3」。只读，没有写入。

还需要 Morii 自己逐屏确认，作为人工验收。
