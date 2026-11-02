# UI v2 · #21 三语主导航的稳定定位，2026-11-01

基线 `5f4fc9b`。原问题：导航 aria-label 在英文为 `Primary`、中文为「主导航」、日文为「メインナビゲーション」，文档及两处原生 smoke 仍把英文名称当固定挂钩。

共享 App 主导航新增 `data-runtime-nav="primary"`，六按钮新增 `data-runtime-page="home|memory|context|sessions|runtime|settings"`。原有可访问名称、类名、事件处理和 `aria-current` 保留。原生 smoke 的两处 Sessions 焦点定位改用新属性；README / SCREENS / OPEN_ISSUES #21 同步。

`primary-navigation-languages` 9/9：三语分别验证固定主导航只有一个、可访问名称仍本地化、六个页面键稳定、固定 Sessions 挂钩实际切到 Sessions。`node --check apps/desktop/e2e/memory-smoke.mjs` 通过；没有启动原生 smoke、Vault 或 Windows 输入。

`npm run build`（含类型检查）通过，主 JS 446.51 kB；Memory integration 和 Activity retirement 两个根检查通过。完整 `npm test` 通过：Node 131通过、3跳过、0失败；内含 DOM 82场景、1106项断言全部通过。本片只有定位属性，没有视觉改动，未重复截图、原生打包或安装。

本机日志位于 `.design/native-nav-2026-11-01/tests.log`、`build.log`。这些是合成组件与前端检查，不等于原生三语 smoke 或 Morii 验收。
