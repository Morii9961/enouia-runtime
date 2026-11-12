# Runtime：Claude → Codex 交接（2026-11-10）

> 2026-11-12 起，当前进展与合并授权以 [Runtime 接续入口](RUNTIME_CONTINUATION_2026-11-12.md) 为准。下文保留当日基线和原始提示作追溯；“逐片合并前询问”已被 Morii 后续的直接合并授权取代。

Morii 让 Codex 接手后续全部工作。本文接在 [2026-11-07 交接](CLAUDE_TO_CODEX_2026-11-07.md) 之后。那份文档以及更早的 [2026-11-04 交接](CLAUDE_TO_CODEX_2026-11-04.md)、[Codex → Claude 交接](CODEX_TO_CLAUDE_2026-11-03.md) 里的边界仍然有效。项目规则只在 `AGENTS.md`。

## 现在在哪

- `main@6e9f058`，#120–#166 已全部合并，没有开着的 Runtime PR（本交接文档自己的 PR 除外）。
- 最后合并的 [#166](https://github.com/Morii9961/enouia-runtime/pull/166) 做两件事，都是 Morii 实机验收时提的：
  - 主题按钮改成 跟随系统 / 深色 / 浅色；
  - 快速检索默认快捷键从 Ctrl+Alt+M 改为 Ctrl+Alt+Q。
  - 已验证：完整 `npm test`、`cargo fmt --check`、`cargo test --release hotkey` 都通过；原生程序不带 `--hotkey-key` 启动，报 `{"combo":"Ctrl+Alt+Q","state":"registered"}`。
  - 这些验证是在 #166 分支上做的。分支基于 `87a2878`，所以合并后的树与它完全相同。
- 阶段：**统一验收进行中**。Morii 装的是 [`71a5222` 候选](../validation/UI-v2-candidate-71a5222-2026-11-09.md)，按 [人工验收指南](../RUNTIME_ACCEPTANCE_GUIDE_2026-11-08.md) 在做。这个包没有 #166，所以里面的快捷键还是 M，主题按钮还是黛蓝 / 宣纸。**还没有包含 #166 的候选包。**
- Memory pin 仍是 `731edd56a276ffa752c736b7d2be667b9e12776c`。Memory 仓库之后只多了 #88（给 ChatGPT 的远程 MCP 端点，属于 Host/MCP），Runtime 不需要跟进。pin 升级只在 Morii 要求时做。

## Morii 在验收中已经提出的

1. 主题按钮改成“深色 / 浅色”：#166 已实现并合并。
2. Ctrl+Alt+M 呼不出快速检索：原因是这台机器上另有程序占着 M。逐个字母只注册、立即注销的探测显示，Runtime 没运行时 M 也返回 1409，其余 25 个字母都可用。Morii 在三个方案里选了“只改默认为 Q”（没选“设置里可改字母”）。#166 已实现并合并。
3. 第 6 步（日常流程）和第 9 步（公开人设导出）要接入 Morii **已经初始化好的 Enouia Memory Vault** 来测。
   - 操作由 Morii 在界面里做：先备份；锁定记忆库或重启 Runtime；在记忆页点“打开已有的记忆库…”，选库的根文件夹。
   - Runtime 每次启动都不记住上次打开的库。
   - 第 9 步需要库里有带 `enouia-public-persona-1` 段的身份记录。
   - **agent 不要自己打开、读取或迁移这个个人 Vault**（AGENTS.md）。Morii 发来现象或截图后，先用合成 Vault 复现，再做最小修复。
4. Morii 问过“待决定的三项怎么看实机效果”：
   - #28 已由 #166 解决。
   - #24 星图只存在于浏览器设计预览（`apps/desktop` 下 `npm run dev`，打开 `/starmap.html`），原生程序里没有。
   - #29 要在有身份记录的 Vault 里才看得出来。

## 接下来按顺序

1. **从 `main@6e9f058`（或之后的 main）重新打候选包**，让 Morii 能在安装版里看到 #166。按下面的配方跑安装保护和 21 个原生冒烟模式。新增一份 `docs/validation/UI-v2-candidate-<sha>-<日期>.md`（照 `71a5222` 那份写），并更新：
   - 验收指南：安装包路径、大小、SHA-256，以及“取代哪份候选、补哪几步”；
   - CLAUDE.md 第 3 行的入口指针。
2. **处理 Morii 验收反馈。** 一次一片，先复现（DOM 场景或合成 Vault 的原生冒烟），再最小修复。每片完整 `npm test`；动了界面层或原生壳的，在 release 程序上跑相关冒烟模式。每片单独开 PR，合并前问 Morii。
3. **Morii 尚未决定的事**，在他决定前不推进：
   - OPEN_ISSUES #24：5,000 条星图运动时，主题线是隐藏还是改实线；
   - OPEN_ISSUES #29：公开人设导出的四项保守默认，以及 Memory 契约 §5 的五项（目标文件夹策略会影响使用）；
   - 2026-11-04 交接里留下的：合成面板枚举 / ISO 是否翻译、Windows 独立验收环境、新 Owner 后端首个采用切片；
   - 如果以后 Q 也被占：是否在设置里加改键入口（现在只能用启动参数 `--hotkey-key`）。

## 这两天合并的切片（供追溯）

| PR | 内容 | 记录 |
| --- | --- | --- |
| #160 | 两个 DOM fixture（`source-suggestions`、`history-plan`）在“DOM 已提交、passive effect 未执行”的空档里点击 | [记录](../validation/UI-v2-dom-flake-waits-2026-11-08.md) |
| #161 | DOM runner 让定时器和 `requestAnimationFrame` 等 React Scheduler 跑完排队工作再触发，新增 `--delay-effects=<ms>` / `--no-settle` | [记录](../validation/UI-v2-dom-settled-timers-2026-11-09.md) |
| #162 | `c194305` 候选（覆盖 #159 公开人设导出），验收指南加第 9 步 | [记录](../validation/UI-v2-candidate-c194305-2026-11-09.md) |
| #163 | SCREENS 十种状态表、OPEN_ISSUES #8/#20 的过时状态 | — |
| #164 | 快速连续切页以最后一次为准（`settleMoves`），原生冒烟新增 `--rapid-nav-only` | [记录](../validation/UI-v2-rapid-nav-order-2026-11-09.md) |
| #165 | `71a5222` 候选，验收指南第 2 步加快捷键连按检查 | [记录](../validation/UI-v2-candidate-71a5222-2026-11-09.md) |
| #166 | 主题按钮改为深色 / 浅色；快速检索默认快捷键改为 Ctrl+Alt+Q；OPEN_ISSUES #28 标为已解决 | design-decisions 2026-11-10 两条 |

## 配方

### 打候选包

在 `apps/desktop` 下（Git Bash）：

```bash
unset TAURI_CONFIG
export CARGO_NET_OFFLINE=true CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 PATH="/c/msys64/ucrt64/bin:/c/Users/Morii/.cargo/bin:$PATH"
npm run desktop:bundle -- --no-sign -- --offline --locked
```

- 只改前端时，增量构建约 100 s；冷构建约 30 分钟。
- 产物在 `src-tauri/target/release/bundle/nsis/`。要另存到 `apps/desktop/target/candidate-<sha>/`（忽略目录），并且把 `src-tauri/target/release/enouia-desktop.exe` 和 `WebView2Loader.dll` 一起复制过去：少了这个 DLL，复制出来的 exe 会以 0xC0000135 退出。
- 只验证程序、不需要安装包时，用 `npx tauri build --no-bundle -- --offline --locked`。

### 安装保护（PowerShell，仓库根目录）

```powershell
$n="$env:LOCALAPPDATA\tauri\NSIS"
.\scripts\desktop-installer\template-check.ps1 -RenderedTemplate "E:\Enouia Runtime\apps\desktop\src-tauri\target\release\nsis\x64\installer.nsi"
.\scripts\desktop-installer\version-guard-smoke.ps1 -MakeNsis "$n\makensis.exe" -TauriPlugins "$n\Plugins\x86-unicode\additional"
.\scripts\desktop-installer\startup-cleanup-smoke.ps1 -MakeNsis "$n\makensis.exe"
.\scripts\desktop-installer\locked-file-smoke.ps1 -MakeNsis "$n\makensis.exe"
```

上一轮的结果是 26/26、7/7、5/5、2/2。**不要运行** `install-smoke.ps1` / `upgrade-smoke.ps1`，它们会真的安装。

### 原生冒烟

- 先构建固定版本的 Memory CLI，用来初始化测试 Vault：
  ```bash
  cargo build -p enouia-memory-cli --manifest-path ~/.cargo/git/checkouts/enouia-memory-*/<pin前7位>/Cargo.toml --target-dir <你的临时目录>
  ```
  大约 2 分钟。`E:\Enouia Memory` 通常有未提交的改动，不要从那里构建。
- 每个模式用一个新的临时目录。下面是上一轮用的循环，`CLI` 换成你构建出的路径：

```bash
EXE="E:/Enouia Runtime/apps/desktop/target/candidate-<sha>/enouia-desktop.exe"
CLI="<临时目录>/debug/enouia-memory.exe"; LOGS="<临时目录>/smoke-<sha>"
export TEMP='E:\enouia-smoke-temp' TMP='E:\enouia-smoke-temp'   # 必须在仓库外
mkdir -p /e/enouia-smoke-temp "$LOGS"; cd "E:/Enouia Runtime"
for mode in automatic-only catalog-only capture-only layout-only native-window-only source-paging-only transcript-only stale-plan-only forget-only keyboard-journey-only accessibility-only confirm-only context-only contrast-only explorer-only explorer-keyboard-only lists-only plan-keyboard-only session-writes-only sessions-only rapid-nav-only; do
  case $mode in automatic-only) p=enouia-runtime-core8-smoke-;; catalog-only) p=enouia-runtime-catalog-smoke-;; capture-only) p=enouia-runtime-capture-smoke-;; keyboard-journey-only) p=enouia-runtime-keyboard-journey-;; accessibility-only) p=enouia-runtime-native-accessibility-;; *) p=enouia-runtime-candidate-smoke-;; esac
  T=$(node -e "const fs=require('fs'),p=require('path'),os=require('os');console.log(fs.mkdtempSync(p.join(os.tmpdir(),'$p')))")
  mkdir -p "$T/vault"
  case $mode in automatic-only|catalog-only|capture-only) ;; *) "$CLI" init "$T/vault" --confirm-new-vault > "$T/init.log" 2>&1 || { echo "$mode init_failed"; continue; };; esac
  printf 'Fictional import for the candidate smoke.\nI prefer a quiet desk for long reading.\n' > "$T/import.txt"
  node apps/desktop/e2e/memory-smoke.mjs "$EXE" "$T/vault" "$T/import.txt" "$T/out" "--$mode" > "$LOGS/smoke-$mode.log" 2>&1
  echo "$mode exit=$? $(grep -E '^checks ' "$LOGS/smoke-$mode.log" | tail -1)"
done
```

- 上一轮 21 个模式共 398 项全部通过（各模式项数见 `71a5222` 候选记录）。
- 会打开原生文件对话框或发送系统热键的模式（picks、quick、operations、history-*、long-lifecycle、damaged-verify、persona）**不在 Morii 正在使用的桌面上运行**。`operations-only` 曾经间接弹出过文件选择器。
- `init` 报错时看 `init.log`：
  - `root_rejected / InsufficientSpace`：磁盘空间不足（C 盘剩约 3 GB 时出现过）；
  - `InsideRepository`：目录在 Git 仓库内。
- 冒烟脚本总会追加 `--hotkey-key Q`。要验证默认快捷键，得自己启动程序，不带这个参数，然后读 `window.__TAURI_INTERNALS__.invoke('shell_status')` 里的 `hotkey`。
- 冷启动时，偶尔会在第一个 CDP 命令上遇到 60 秒超时。重跑一次即可，记录里要写明第一次失败了。

### DOM 测试

- `apps/desktop` 下 `npm test` 跑 Node 测试加全部 DOM 场景。上一轮在 `main@71a5222` 上：Node 151 项（148 通过 / 3 跳过），DOM 122 个场景、2,525 项。
- 偶发失败先用 `node tests/dom-fixtures.mjs --worker <name> --delay-effects=50` 复现。新写的 fixture 要等自己断言的东西，不要依赖固定 `sleep`。
- `theme-preference` 场景本来就会打印一条 `act(...)` 警告，不影响结果。

### 本机状态

- `.claude/launch.json`（未提交）里有 `desktop-preview` 配置，在 5173 端口跑 `vite`，用于浏览器预览。第一次启动时 Vite 要重新优化依赖，页面可能要等十几秒再刷新一次。
- `apps/desktop/target/candidate-*` 下保留着各轮候选包。`E:\enouia-smoke-temp` 是冒烟用的临时目录，可以随时删。
- 中文字体子集缺“搜”（用“检索”）和“公、群、友、套”（已登记为回落到正文字体）。新加的中日文字符串要通过 `tests/cjk-fonts.test.mjs`。
- 用 Python 在 Windows 上写 JSON 证据时，要指定 `newline='\n'`。

## 规则提醒

- 合并任何 PR 前都要 Morii 明确同意。
- 不要让 Activity/Usage 界面回来。
- 不打开个人 Vault、Owner 或真实 Provider，不做迁移或部署。
- 不碰其他 session 的工作树（`.claude/worktrees/memory-pin-b9faf54`、`E:/Workteree/Enouia Runtime/public-persona-export-ui-08982c`）。
- 动了 Memory 适配层或集成界面，要跑 `node scripts/check-memory-integration.mjs` 和 `node scripts/check-activity-retirement.mjs`。
- 增加复杂度去防范小概率竞态之前，先向 Morii 说明失败场景、概率和成本。
- Codex 实质参与的提交，加 AGENTS.md 规定的 trailer。

## 启动提示词

见本文末尾，Morii 可以直接粘贴给 Codex：

```text
接手 Enouia Runtime（E:\Enouia Runtime）。先读 AGENTS.md，再读 docs/integration/CLAUDE_TO_CODEX_2026-11-10.md，它是当前的接续入口。

现状：main 已包含 #120–#166，项目在统一验收阶段。我装的是 71a5222 候选包，正在按 docs/RUNTIME_ACCEPTANCE_GUIDE_2026-11-08.md 验收。#166（主题按钮改成深色/浅色、快速检索默认快捷键改为 Ctrl+Alt+Q）已合并，但还没有包含它的候选包。

你的工作：
1. 先从最新的 main 重新打候选包，跑安装保护和 21 个原生冒烟模式，写候选记录，并更新验收指南和 CLAUDE.md 的指针。配方都在交接文档里。
2. 处理我发来的验收反馈。每个问题先复现，再做最小修复，一片一个 PR，合并前问我。
3. 交接文档“尚未决定”里的事，等我决定再动。

边界：不要自己打开或读取我的个人记忆库（第 6、9 步由我在界面里接入），不跑会真的安装的 install/upgrade 冒烟，不在我正在用的桌面上跑会弹文件对话框或发系统热键的冒烟模式。
```
