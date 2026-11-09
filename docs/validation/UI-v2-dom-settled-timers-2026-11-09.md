# UI v2：DOM 测试的定时器等 React Scheduler 跑完再触发（2026-11-09）

分支 `claude/dom-settled-timers`，基线 `main@c194305`。接续 [#160](UI-v2-dom-flake-waits-2026-11-08.md)。#160 修了两个 fixture 的同类问题，这一片在 DOM 测试的 runner（`tests/dom-fixtures.mjs`）里一次处理整类问题。只改测试基础设施，不改产品代码和任何 fixture。

## 问题

React Scheduler 在模块加载时捕获 `setImmediate`，非同步车道的渲染和 passive effect（`useEffect`）都靠它执行。fixture 用 `setTimeout` 轮询和 `sleep`。机器负载高时，一个定时器可能先于排队中的 Scheduler 工作触发，于是出现两种偶发失败：

- 等待条件在 DOM 上成立，但这次提交的 effect 还没执行，随后的点击和 effect 打架（#160 的两例）；
- 固定 `sleep(20/30)` 之后断言，看到的还是上一次渲染。

## 怎么找出整类问题

在 worker 里加了诊断开关 `--delay-effects=<ms>`：把 Scheduler 用的 `setImmediate` 推迟这么多毫秒，让依赖时序的写法稳定失败，不再只在负载下偶发。用一个临时脚本（不进仓库）逐个 worker 扫描全部 110 个 fixture：

| 条件 | 失败数 |
| --- | --- |
| 原 runner，延迟 50 ms | 33 |
| 原 runner，延迟 25 ms | 16 |
| 本次修复，延迟 50 ms | 0 |

失败名单里有 OPEN_ISSUES #5 历史上真实偶发过的 `inspector-action-focus`、`operation-cancel`、`catalog-memory`，也有 #160 修复之前的 `source-suggestions`：#160 之前的版本加 `--delay-effects=50` 稳定失败，不加则通过，#160 之后的版本加了也通过。

## 修复

runner 的 worker 里：

- 给 Scheduler 的 `setImmediate` 计数，记录排队中的工作数。
- 全局 `setTimeout` 到点时，如果还有排队中的 Scheduler 工作，就每 1 ms 顺延一次，直到 Scheduler 空闲才执行回调。`clearTimeout` 对顺延中的定时器同样有效。
- Happy DOM 的 `requestAnimationFrame` 走它自己的定时器，绕过了上面的顺延（`session-retry-ownership`、`quick-search-observation`、`history-results` 因此仍失败），所以同样换成顺延版本。

这就是空闲浏览器给出的顺序。fixture 用 promise 挂起的请求不属于 Scheduler 的工作，照样保持挂起，所以“请求进行中”的中间状态仍然能断言。另加 `--no-settle` 恢复原始定时器，用来对照。用 `--no-settle --delay-effects=25` 运行时，`provider-settings-status`、`workspace-operations-inspector`、`source-suggestion-focus` 失败；去掉 `--no-settle`，在延迟 25 ms、50 ms 和不加延迟三种情况下都通过。

## 检查

- 延迟 50 ms 扫描全部 110 个 fixture：0 失败（修复前 33）。
- 不加延迟、6 并发负载跑 2 轮共 220 次：0 失败。
- 完整 `npm test` 退出 0：Node 151 项（148 通过 / 3 跳过 / 0 失败）；DOM 121 个场景运行，2,519 项全部通过；257 秒。

## 边界

这个顺序只存在于 Happy DOM 测试里，不代表真实 WebView2 的时序，也不替代原生 smoke。真实浏览器里同样的空档不到一帧，人点不进去，所以产品代码不改。#160 在 `source-suggestions` 和 `history-plan` 里做的局部修复保留，两层互不冲突。以后新写的 fixture 仍应等自己要断言的东西，不要依赖固定 sleep。这次没有截图、Rust、原生 smoke、个人 Vault、Owner、Provider、迁移或部署；Memory pin 不变。
