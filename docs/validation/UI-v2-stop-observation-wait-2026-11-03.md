# DOM `operation-stop-observation` 终态渲染等待

基线：`a619013`，分支 `codex/read2-synthetic-surface`。只改 `apps/desktop/e2e/operation-stop-observation.tsx`，产品代码不变。

## 现象与原因

`a619013` 之前的一次完整 `npm test` 中，该 fixture 的 `external_send_completed_new_observation_retires_obsolete_stop_error` 和 `external_send_completed_observed_outcome_controls_actions` 失败，单独重跑通过（OPEN_ISSUES #5 同类）。用例在 `onDone` 回调计数变为 1 后立即断言，但 `Operation` 观察到终态时，回调先于 React 提交终态渲染执行。并行负载下断言偶尔落在两者之间，读到的仍是旧的 Retry、错误提示和停止按钮。

## 修复

`completed` 分支先限时等待终态渲染提交（停止按钮消失），再断言 Retry 和错误提示已撤下、回调只触发一次、没有重发取消。若终态渲染始终不出现，等待超时，用例照样失败；断言含义不变。

## 实际运行

同一台机器上 6 个 worker 并行一组：原版本 18 次中失败 1 次，失败项与完整运行时相同；修复版 48 次全部为 32/32。
