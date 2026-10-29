# UI v2 #22 · 原生无库与空库文案

日期：2026-10-29。基线 main `88cffb53f7f62fa4dd4826db22a6e62aeb54dc00`（PR #110），分支 `codex/ui-v2-issue-22-i18n`。

## 改动与范围

W2 记录的无库标题、建库确认说明、空记忆/无匹配结果、空会话标题及 Inspector 轮询说明接入既有 i18n。相邻的锁库标题、会话标题、shell 读取状态、操作列表说明/计数/观察边界和无记录带的可见/辅助文字也使用同一套翻译。

建库句子用 `tj()` 保留 `<code lang="en">create new vault</code>`；确认值和按钮启用条件不变。库名、会话/分支 ID、命令、记录正文、原生组件代码仍原样显示。操作执行状态不等于校验无误、备份完成、模型回答完成或记忆已批准，原有这条边界完整保留。没有改变读取、写入、选中、按键、类名或 data-* 契约。

涉及六个视图模块：`memory/status.tsx`、`MemorySurface.tsx`、`SessionsSurface.tsx`、`runtime/RuntimeSurface.tsx`、`WorkspaceOperations.tsx`、`theme/RecordStrip.tsx`；两份字典各新增 15 键，共 1,437 键。`i18n-keys --missing` 为 0；译文覆盖、占位符、无多余键与英文残留检查 8/8。

## 字体

用既有生成器及本机交付的原始字体重生成。新增日文字触发 M PLUS 标签子集与 Zen 正文的首片/余片重排，正文仍保留全部原字符映射，未改变字形、许可、字体栈或 IPA 派生命名。

| 字体 | 文件 | 字节 |
| --- | ---: | ---: |
| Sarasa Mono SC | 3 | 453,100 |
| M PLUS 1 Code | 1 | 158,120 |
| Enouia Text SC | 100 | 3,986,136 |
| Zen Kaku Gothic New | 400 | 5,094,468 |
| 合计 | 504 | 9,691,824 |

比 W4 的 9,691,652 B 增加 172 B；字典、字体 manifest、生成 CSS 与文档同步。原始 TTF 不提交，西文字体文件未变。W4 旧版首屏流量保留为历史测量，本片没有把它当成更新后的流量结果。

## 验证边界

| 最终代码检查 | 结果 |
| --- | --- |
| `npm run check` | 通过 |
| `npm test` | Node 127 通过 / 3 跳过 / 0 失败；DOM 80/80 |
| `npm run test:dom` | 第二遍 DOM 80/80 |
| `npm run build` | 通过；主 JS 436.91 kB |
| `node scripts/check-memory-integration.mjs` | 通过，原 pin 不变 |
| `node scripts/check-activity-retirement.mjs` | 通过 |
| embedded-assets debug 原生构建 | 通过，27.07 秒 |

六项退出码均为 0。字体检查确认字典覆盖、正文完整映射、文件与 manifest 一致；未增加与实现逐字对应的新测试。最终日志在 `.design/w6-22-native-copy-final/`，初次复核记录保留在 `.design/w6-22-native-copy/`。没有重跑 Rust 全量测试或 Clippy；无 Rust 改动。

全部原生检查使用 `.design/w3/config` 的隔离 appDirectoriesOverride、新建 WebView2 profile 与新建临时空 Vault；不启动标准生产配置，不打开个人 Vault，不配置 Provider、不发送模型请求、不写真实启动项，Memory pin 不变。

最终 native 命令退出 0，两个自有进程均已退出。60 格文本/尺寸检查及截图：英中日 × 1100×700 / 1440×900 × 黛蓝 / 宣纸；无库连接页 12 格、空记忆/无匹配检索/空会话/Inspector 各 12 格。配色和减少动画通过 WebView2 媒体模拟，未再次切换系统 DPI 或系统主题。无库阶段保持 `none`；空库阶段保持 `open`、待审数 0，没有创建会话或记忆。

60 格均无页面横向溢出，标题都保留 `ENOUIA RUNTIME`。确认说明中的英文短语与 `lang="en"` 保持；输入精确短语可启用按钮、清空后禁用，但不点击创建。最终日文回首页时 `I'm here.` 仍为英文。已查看代表性的中文无库/空记忆、日文窄会话及宽 Inspector 截图；#23 的按钮问题仍可见，未把横向无溢出当成全部纵向布局通过。

最终截图：本机 `.design/w6-22-native-copy-final/shots/`；报告 `native-none.json`（12 格）、`native-empty.json`（48 格）。初次发现记录带/操作说明裸英文的 60 张截图保留在旧目录，不能替代最终结果。截图、辅助脚本和临时 Vault 不提交。本片无失败的验证检查。

本片覆盖上述已观察文案，不声称所有原生动态/错误分支都已完成文字审计。尤其未用真实会话、进行中的长操作或真实 Provider 验证对应文案。日文 Sessions 长按钮越界 #23 保持独立，物理托盘、默认 M 冲突、实际安装等既有界限不变。
