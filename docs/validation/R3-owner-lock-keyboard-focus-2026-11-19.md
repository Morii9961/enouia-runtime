# R3 登记只读库：键盘锁定后的焦点（2026-11-19）

在候选 `1267268` 上，用键盘在“Lock registered library”按钮上按 Enter 锁定登记只读库后，
按钮随库关闭被卸载，焦点落到 `BODY`。键盘和读屏用户因此失去在目录中的位置。

## 修改

- `apps/desktop/src/memory/CatalogMemory.tsx`：锁定或解锁按钮在点击时仍持有焦点，就把焦点交给
  始终挂载的目录标题 `Native memory catalog`。标题设 `tabIndex={-1}`，不新增 Tab 停靠点；
  沿用原有控制请求。焦点已在别处时不移动焦点。
- `apps/desktop/e2e/memory-smoke.mjs`：`--owner-readonly-only` 不再用 DOM click 锁定，而是聚焦按钮后
  通过 WebView2 CDP 发送 Enter（带 `text` / `unmodifiedText` 的 `keyDown` 及对应 `keyUp`），
  新增 `OWNER.keyboard_lock_keeps_focus_in_catalog`：锁定后焦点须为该 `H2`。撤回、页面不能重认证、
  同根重开、`CURRENT` 不变和自动启动不打开登记库等原有检查保留，总数 25 项。

## 被测程序

源码为 Runtime `35bc7d179ec9289a3609fd88a73cc7e324a84454` 加本补丁（`CatalogMemory.tsx` blob
`3c3264c`，`memory-smoke.mjs` blob `0b0939c`），Memory pin `506d23d`，aggregate `df3248e7…`，
Workspace 61 命令。`npm run desktop:build -- -- --offline --locked`（`--no-bundle`）构建到本机忽略
目录 `apps/desktop/target/memory-pin-a543c1e-build/release/`（target 名为历史复用名）。

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| `enouia-desktop.exe` | 84,744,954 | `e2b29a1206a393255a893e0cc0eff0f1af2b5dbc7ff0c138df7e2142c8f54587` |
| `WebView2Loader.dll` | 160,880 | `86545b66cdb0603bc26b626fb9ad610cb6e71f28d468f5ea66df23b03dda96d5` |

这是免打包验证程序，不是新的安装候选；未生成 NSIS 安装包。

## 原生结果

两个程序在同一份新生成的合成登记上依次运行 `--owner-readonly-only`：

| 程序 | 结果 | 焦点 |
| --- | --- | --- |
| 修复版（上表） | **25/25** | `H2` “Native memory catalog” |
| 旧候选 `1267268`（`b2910fc0…`） | 24/25 | `BODY`，唯一失败 |

合成登记由忽略测试 `memory_catalog::tests::registered_native_owner_opens_same_root_reads_closes_and_reauthenticates`
在 `E:\EnouiaRuntimeSyntheticValidation` 下新建（`synthetic_validation_only: true`），未使用真实资料。
只用窗口内 CDP，没有系统热键或文件对话框。

首次复用 11 月 18 日的合成登记时，修复版与旧候选都读到 0 条授权记录（6/8），在锁定步骤之前
就停止。原因是合成夹具的授权策略按设计 1 小时后到期（`memory_catalog/fixture.rs`），目录显示
“当前授权范围内没有记录”是正确行为，属于夹具失效，不是产品回归。合成登记需在生成后一小时内使用。

## 其他检查

`catalog-memory` DOM 48/48、`registered-owner-status` 19/19、`npm run check`、
`node scripts/check-memory-integration.mjs`、`node --check apps/desktop/e2e/memory-smoke.mjs`
和 `git diff --check` 通过。日志在本机忽略目录 `apps/desktop/target/`：
`r3-lock-focus-fixed-owner.log`、`r3-lock-focus-old-same-fixture.log`、
`r3-lock-focus-fixed-fixture-test.log`、`r3-catalog-lock-focus-build.log`。

## 边界

候选 `1267268` 的既有成绩和真实库代理回执仍归属该候选，不转到本补丁。本补丁没有重跑 NSIS、
Workspace 布局/无障碍/键盘矩阵，也不构成 Morii 人工验收、实际安装或新候选。

2026-11-19 后续：按 Morii 指示清理了 `E:\EnouiaRuntimeSyntheticValidation` 及其中的合成登记。复跑时须重新创建仅用于合成验证的上级目录（测试要求其已存在），再按上文生成新登记。
