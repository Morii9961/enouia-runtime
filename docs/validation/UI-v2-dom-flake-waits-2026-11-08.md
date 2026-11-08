# UI v2：两个 DOM fixture 的 passive effect 时序（2026-11-08）

分支 `claude/dom-flake-waits`，基线 `main@63cec87`。处理 [OPEN_ISSUES #5](../design/ui-v2/OPEN_ISSUES.md)（DOM 测试偶发失败）里有证据的两例。只改测试，不改产品代码。

## 怎么找的

用一个临时脚本（不进仓库）逐个以 `tests/dom-fixtures.mjs --worker <name>` 起子进程，4 个并发加压，全部 fixture 跑 3 轮，共 330 次。只有 `history-plan` 失败 1 次。另一例 `source-suggestions` 来自同一天上午的完整 `npm test`：单独重跑 3 次都通过。

## 根因

两例都是同一类问题：等待条件只看 DOM。React 提交后要过一段时间才执行 passive effect（`useEffect`）。在这段空档里点击，React 会在处理这次点击的渲染之前，先执行上一轮挂起的 effect。机器负载越高，空档越长。

- **`source-suggestions`**：首次渲染提交后，`Source` 里“证据变化就重置”的 effect 还没执行。这时点 “Show source”，`load()` 会先开始读取，接着重置 effect 调用 `action.clear()`，把这次读取作废。界面停在 “Show source”，5 秒后等待超时。报错时的页面文本与上午那次失败完全一致。
- **`history-plan`**：第 98 行的规划结果提交后，`HistoryPlan` 里 `[read.busy]` 的焦点 effect 还没执行，`wait(details === 10)` 就放行了。第 100 行点 Next 时，`refresh()` 先把 `focusReturn` 设成 Next 按钮。随后执行的旧 effect 看到 `busy` 为 false，就把这个 `focusReturn` 消费掉了。新一页读完后焦点不再移动，第 101 行的焦点等待超时。用同一 Vite 配置转译 fixture 后对照调用栈行号，确认失败的正是这一行。

真实 WebView2 里，这段空档不到一帧，人点不进去，所以不改产品代码。

## 确定性复现

两例都用 MutationObserver 回调（微任务，在提交之后、passive effect 之前触发）复现了：

- `source-suggestions`：按钮一出现就点。修复前失败，报错文本与原始失败一致，`source_excerpt` 已发出但结果被丢弃；修复后通过。
- `history-plan`：第 10 个 `details` 一出现就在微任务里继续点 Next。修复前在同一行超时；修复后通过。

另外，把 `history-plan` 的 `render()` 人为推迟 50 ms 后，第 87 行的检查失败（那里只 `sleep(30)`）。这说明原写法要求异步提交在 30 ms 内落地。

## 修复

- `source-suggestions`：首次渲染改为 `flushSync(() => root.render(...))`。同步车道提交会在返回前执行 mount effect，与 2026-10-28 `inspector-action-focus` 用 `act` 包住首次渲染是同一个思路。
- `history-plan`：`render()` 改为 `flushSync`，改 props 后的重新挂载因此同步完成；`click()` 在派发前先做一次同 props 的同步渲染。React 在同步渲染开始前会执行挂起的 passive effect，所以上一轮的 effect 总在新点击之前跑完。

## 检查

- 修复前，`history-plan` 与 `source-suggestions` 两个 fixture 8 并发跑两组，各 80 次，分别失败 3 次和 1 次，全部是 `history-plan` 的同一行。其中失败 3 次的那组已带上 `render()` 的 `flushSync`，但当时还没改 `click()`，也就是还没修到焦点这一处。
- 修复后，同样两个 fixture 8 并发跑 100 轮共 200 次，0 失败。
- `npx tsc --noEmit -p .` 通过。
- 完整 `npm test` 退出 0：Node 151 项（148 通过 / 3 跳过 / 0 失败）；DOM 121 个场景运行，2,519 项全部通过。`git diff --check` 干净。

## 边界

另有 31 个 fixture 也在旅程中途调用 `root.render`，可能有同类空档。它们在这次 330 次加压中都没有失败，所以没有改。以后再出现偶发失败，先按本记录的办法转译、对行号、做微任务复现，再决定修法。这次没有截图、Rust、原生 smoke、个人 Vault、Owner、Provider、迁移或部署；Memory pin 不变。
