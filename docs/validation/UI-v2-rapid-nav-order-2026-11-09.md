# UI v2：快速连续切页时以最后一次为准（2026-11-09）

分支 `claude/rapid-nav-order`，基线 `main@c194305`。2026-11-08 的 [b00034d 候选记录](UI-v2-candidate-b00034d-2026-11-08.md)记下了这个竞态。按 AGENTS.md，我先向 Morii 说明了失败场景、出现概率和修复成本，2026-11-09 Morii 回复“Fix it”。

## 问题

`moveAlong` 把状态更新放进 View Transition 的回调。回调要等截取完旧画面才执行，大约一两帧。在这段空档里：

- `App.show()` 读到的“当前页”还是旧值；
- 再按一次快捷键时，`show()` 可能误以为已经在目标页，于是直接应用；
- 随后，前一次切换被推迟的更新落地，把它覆盖掉。

原生实测（下文）中，没修复的程序上，按 Ctrl+2 再按 Ctrl+1，最后停在“记忆”，而不是首页。不同内核如果把被跳过的回调放到后面执行，2→3 这种情况也会停在先按的那一页。方向键连按读到的是旧的当前选择，也属于同一类。

## 修复

- `theme/motion.ts`：记住还没执行的那次更新。新的 `moveAlong` 开始前，先用 `flushSync` 把它执行掉，它自己的过渡回调随后变成空操作。另外导出 `settleMoves()`。
- `App.tsx`：`show()`、`select()` 和方向键处理在读当前页或当前选择之前，先调用 `settleMoves()`。方向键只在确定要处理时才调用，免得切页后一帧内打字就把切页动画提前结束。
- 没有处理：浏览器自动记忆预览（`AutoMemory`）的 A→B→A。它的处理函数闭包里拿的是旧的 `view`，提前落地也改不了闭包。A→B→C 由 `moveAlong` 内部处理，已经覆盖。

## 检查

- **DOM**：新增 `rapid-navigation-order` 场景，用一个延迟执行回调的假 `startViewTransition`，可以选择“新的先执行”或“旧的先执行”。修复前 4 项中 3 项失败，修复后全部通过。
- **原生**：`memory-smoke.mjs` 新增 `--rapid-nav-only`。它在自己拥有的 WebView2 页面里，于同一个任务内连发 Ctrl+数字，不发系统按键。
  - 候选 `c194305` 的程序（复制到 `target/candidate-c194305/`，连同 `WebView2Loader.dll`）：View Transitions 已启用、未减少动画；2→3 停在 Context；2→1 停在“记忆”（失败）；4→5→6 停在 Settings。共 5/6。第一次运行时复制的 exe 缺 `WebView2Loader.dll`，以 0xC0000135 退出，补上 DLL 后重跑得到上述结果。
  - 修复后用 `tauri build --no-bundle` 编出的 release 程序：6/6。
  - 回归（修复后的程序）：`--rapid-nav-only` 再跑两次，都是 6/6；layout 33、native-window 20、keyboard-journey 17、accessibility 27、contrast 9、explorer-keyboard 13，全部通过。
- `npx tsc --noEmit -p .` 通过；`check-memory-integration.mjs` 与 `check-activity-retirement.mjs` 通过。
- 完整 `npm test` 退出 0：Node 151 项（148 通过 / 3 跳过 / 0 失败）；DOM 122 个场景运行，2,523 项全部通过。

## 边界

只改界面层的切页时序，不改 Memory、Rust、pin 或任何写入。原生检查在 Morii 正在使用的桌面上运行，但只派发页面内的键盘事件，不发系统热键，也不打开文件对话框。测试 Vault 放在仓库外的 `E:\enouia-smoke-temp`，因为 C 盘空间不足。
