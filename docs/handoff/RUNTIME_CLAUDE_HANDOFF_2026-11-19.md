# Enouia Runtime → Claude 交接（2026-11-19）

工作目录：`E:\Enouia Runtime`（Windows / PowerShell）。从同一工作目录接手：锁定焦点补丁和验证产物目前只在本机。启动指令见 [Claude 提示词](../prompts/CLAUDE_RUNTIME_NEXT_2026-11-19.md)。本页补充 [Runtime 开发路线](../integration/RUNTIME_ROADMAP_2026-11-16.md)，以本页的核对结果为交接起点；旧提示词和状态快照保留各自的时点。

> 2026-11-19 后续（Claude）：焦点补丁已随 PR206 交付，新候选 `1e96a6d` 见 PR208；pin 已由 PR209 更新为 `368634b`。按 Morii 指示已删除旧 v1 输入、11-17 同盘备份、`E:\EnouiaSyntheticValidation-20261117`、`E:\EnouiaRuntimeSyntheticValidation` 及临时合成目录，下文提到的合成夹具与指针已失效，复跑须新建合成上级目录并重新生成。主库仍在原登记 home、目前无备份；统一存放目录的迁移待 Memory 新切片。

## 已交付到哪里

| 部分 | 已确认的进度 | 仍未完成 |
| --- | --- | --- |
| R1：Memory 兼容采用 | Runtime 已嵌入 `506d23dc174a3e927d323f8f8d0b8ecfc9d1726d`；aggregate `df3248e725f92952d0be265092babd5dbdbe6fec642720a0c400c71cbd9e7e53`；Workspace IPC 仍有 61 个命令。见 [pin](../integration/memory-pin.json) 和 [验证记录](../validation/Memory-pin-506d23d-2026-11-17.md)。 | 本片无需再采用。 |
| R2：首个 Owner 入口 | [已登记只读入口](../integration/REGISTERED_OWNER_READONLY.md)已接通原生目录、检索、详情、精确引文、锁定和同根重开；Home / Settings 显示相同的入口状态。 | 图形认证入口、Context / Sessions 对该登记库的接入仍在现有授权范围之外。 |
| R3：Windows 候选与日用验收 | 现存免安装候选来自 `12672683d661ee47ee7b0937f989a0bb351385d5`。生成的 NSIS 模板 26/26，合成登记库 24/24，随后在同一候选通过隔离 NSIS 检查（7/7、5/5、2/2）、合成目录 42/42、原生 Workspace 快速导航 6/6、布局 33/33、无障碍 27/27、键盘流程 17/17。详见 [R3 候选证据](../validation/R3-owner-readonly-candidate-1267268-2026-11-18.md)。 | 焦点补丁待原生合成复测；Morii 人工回执、实际安装与升级、托盘、全局热键、登录启动、分发分别待验收。 |
| M：上游 Memory 交付 | 交付会话汇报同一运行完成 351 条形成、重开与精确来源核对；同盘导出和隔离恢复通过，恢复副本重跑保持 `CURRENT` 与 journal 哈希。该会话还用原登记 Windows 账户实测 R3 候选的打开、检索、精确引文、锁定和同根重开，确认桌面的 259 条是现有 `Private` 授权范围。 | 独立介质故障恢复仍待验证。代理实测与 [Morii 人工回执](../RUNTIME_OWNER_READONLY_ACCEPTANCE_2026-11-17.md#morii-人工验收回执)分开记录。 |

本机 `main`、`origin/main` 和 GitHub `main` 已核对为 `35bc7d179ec9289a3609fd88a73cc7e324a84454`（[Runtime PR #205](https://github.com/Morii9961/enouia-runtime/pull/205)）。PR #204、#205 补的是先前候选的验证记录，验收结果仍归于 `1267268`。候选的 `artifacts.json` 位于 `apps/desktop/target/candidate-1267268/`，原候选和记录应一并保留。

隔壁会话“推进 Memory 纯文本新库交付”也在准备自己的 Claude 交接。已查核 [Memory PR #120](https://github.com/Morii9961/enouia-memory/pull/120) 在本次交接时为 open、未合并，head `84311f6b2e75b557b810b00554484025c4d6ed71`。它处理 Windows 长路径耐久重命名；上游 PR 报告合成红绿回归、27 项 Windows 测试及 Clippy / 格式检查通过。由 Memory 侧继续处理，Runtime 本片保留现有 pin。

## Claude 接手的第一项：锁定后的键盘焦点

`main` 工作树里有两处未提交修改，尚无此补丁的 PR。先核对原 diff，保留已有 `.claude/` 和后来出现的独立修改。

- [`CatalogMemory.tsx`](../../apps/desktop/src/memory/CatalogMemory.tsx)：在锁定或解锁按钮持有焦点时，把焦点交给仍挂载的目录标题；标题 `tabIndex={-1}`，不增加 Tab 停靠点。沿用原有控制请求。
- [`memory-smoke.mjs`](../../apps/desktop/e2e/memory-smoke.mjs)：`--owner-readonly-only` 用 WebView2 CDP 向已聚焦的按钮发 Enter，锁定后检查 `Native memory catalog` 的 `H2` 获得焦点，并保留撤回记录、同根重开、无写入和自动启动不打开登记库的原有检查。
- 反例：用新增断言跑旧候选 `1267268`，`apps/desktop/target/candidate-1267268/owner-lock-focus-enter.log` 记录 24/25，唯一失败是焦点落到 `BODY`。此前调试时有一次 Enter 没触发关闭；复现使用带 `text` / `unmodifiedText` 的 `keyDown` 和对应的 `keyUp`。
- 已有定向证据：`catalog-memory` 48/48、`registered-owner-status` 19/19、`node scripts/check-memory-integration.mjs`、`node --check apps/desktop/e2e/memory-smoke.mjs` 均通过。构建日志 `apps/desktop/target/r3-catalog-lock-focus-build.log` 确认修复后的 Vite 与 Rust release 构建完成。**尚无修复后 `--owner-readonly-only` 的通过记录。**

先核对工作树和产物。修复版在 `apps/desktop/target/memory-pin-a543c1e-build/release/enouia-desktop.exe`，旁边有 `WebView2Loader.dll`；target 名是历史复用名，源码 pin 仍为 `506d23d`。若源码或产物对不上，在 `apps/desktop` 按现有构建办法重建到独立 target，并使用 `npm run desktop:build -- -- --offline --locked`，这条脚本走 `--no-bundle`。保留现存 `1267268` 候选供比对。

已有合成夹具的路径指针在 `apps/desktop/target/candidate-1267268/owner-lock-focus-manifest-location.txt`。确认 manifest、登记标记和 home 都属于专用合成测试，且 home 位于 `E:\EnouiaRuntimeSyntheticValidation\enouia-runtime-owner-synthetic-*`，再使用已验证的路径。避免把 manifest、登记参数或日志原文带入提交。夹具失效或在别的主机缺失时，按 [原生登记测试](../../apps/desktop/src-tauri/src/memory_catalog/tests.rs#L120) 的约束重新生成：在运行该夹具的 Windows 账户下，使用忽略测试 `memory_catalog::tests::registered_native_owner_opens_same_root_reads_closes_and_reauthenticates`，令 `ENOUIA_SYNTHETIC_DURABLE_PARENT` 指向现有合成专用上级目录，令 `ENOUIA_SYNTHETIC_LAUNCH_MANIFEST` 指向本机忽略的全新文件。命名参数均不使用任何真实资料。

从仓库根目录运行一次定向原生验证；四个变量依次为已核对的修复版 exe、合成 home、该 home 的 manifest、独立的临时输出目录：

```powershell
node apps/desktop/e2e/memory-smoke.mjs $patchedExe $syntheticHome $syntheticManifest $smokeOutput --owner-readonly-only
```

脚本自身核对 `synthetic_validation_only` 和合成根命名。避免干扰正在使用的 Runtime；只用窗口内 CDP，不触发系统热键或文件对话框。如果新的焦点检查和原有检查均通过（预期 25/25），记录所测程序和补丁的对应关系，按 [集成验证规定](../MEMORY_INTEGRATION_v1.md)完成本片相关检查。只提交焦点修复和对应证据，按 `AGENTS.md` 的现有范围授权 commit、push、开 PR、合并；Codex 有实质贡献的提交按该文件加 trailer。本机交接文档与 `.claude/` 不要混入产品 PR。失败时先分清夹具、键盘事件与产品行为，再修实证问题。

## 接下来的路线

1. 先交付焦点补丁。已有候选矩阵未发现的情况不作为新问题处理；单独记录新产物上实际执行的检查，不把旧候选成绩移到新提交。
2. 继续管理 R3 人工验收与候选版本。向 Morii 提供 [只读入口验收指南](../RUNTIME_OWNER_READONLY_ACCEPTANCE_2026-11-17.md)，以实际收到的回执更新状态；若决定更新候选，另记确切 Runtime SHA、Memory pin、产物及验证结果。先前代理只读窗口记录到 2026-11-24 07:27:13（Asia/Shanghai）；该记录不授权 Claude 打开真实库，也不意味着续期。
3. 继续处理开发路线内可用合成证据定位的具体问题。真实库、写入或新增授权、真实 Provider、安装与升级、全局热键、登录启动、分发、部署、新 pin 等各有独立边界。Memory 域和独立介质恢复归上游；Runtime 保持现有适配职责，Activity / Usage 不回到桌面。若剩下的工作都依赖外部门槛，列明该等谁的哪份证据即可。

本次 Codex 交接只核对 Git、文件和既有证据，未重跑产品测试和构建，未读取个人 Vault，未发起安装、部署或 Memory 变更。
