# UI v2 W6 #8 · Inspector 长 ID 换行

2026-10-27。基线 #7 `07bb196`，分支 `codex/ui-v2-w6-08-inspector-ids`。

仅在 `theme/negative.css` 为 Memory Inspector 内 `.qr63` 链接加 `min-width:0; max-width:100%; overflow-wrap:anywhere`。Session ID 以完整文本换行，不截断、不隐藏，也不改变链接点击、Copy ID、类名或 data 属性；不改普通正文与其他表面。

无头 Edge 浏览器虚构演示：1100×700 / 1440×900、三语、两主题、正式/候选，共 24 张截图；每组测链接边界均在其行内，Inspector 的 scrollWidth 等于 clientWidth。证据 `.design/w6-08/visual.json`、`shots/`，人工查看日文宣纸 1100 候选图，Session ID 跨行且留在裁切角以内。未涉及个人库、原生改动或生产验收。

六项检查最终全部通过：类型检查、原始 `npm test`（127 通过 / 3 跳过，DOM 77/77）、独立 DOM（77/77）、build 与两个根检查；日志 `.design/w6-08/{check,test,test-dom,build,memory,retirement}.log`。未放宽断言或改产品逻辑修复测试；#18 的既有包体积警告仍在。

前两次 `npm test` 的 DOM 阶段出现相同超时；按 #5 单独重跑 `inspector-action-focus`，7 项通过。进一步用忽略目录里的只读诊断加载器，连续 5 次独立运行均通过；全量诊断保留原顺序并仅增加失败时的信息，不修改原测试或产品行为。原样失败输出如下，完整日志 `.design/w6-08/test-initial.log`、`test-second.log`，单独结果 `inspector-action-focus-retry.log`：

```text
AssertionError [ERR_ASSERTION]: inspector-action-focus: [{"id":"Error: UI timeout: BODY Read memory
againactivefactSaved synthetic memoryMemorysynthetic-memory Copy IDRevisionr1Approved2026-10-13
08:00EvidenceCorrectCorrected contentPropose correctionDelete impactForget…Purge…","ok":false}]

false !== true

    at file:///E:/Workteree/fc79/Enouia%20Runtime/apps/desktop/tests/dom-fixtures.mjs:47:19
```

全量诊断 77/77 通过，随后原始命令也通过；没有复现可解释根因，因此不声称已修好 #5。诊断脚本、五次独立结果及完整诊断日志均在忽略目录 `.design/w6-08/`。
