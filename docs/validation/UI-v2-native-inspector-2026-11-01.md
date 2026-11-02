# UI v2 · 原生 Inspector 组件选择，2026-11-01

基线 `d1dd29d`（Sessions 时间尺）；同一修复分支。沿用现有观察入口，不改 Memory pin、后端或读取范围。

## 改动

- 左侧选择 Memory Core / Memory operations / Windows shell，名称和状态分行；右侧显示对应观察与显式读取，顶部汇总现有回执。
- 选择只改变面板可见性。三个观察 owner 保持挂载，操作的选中状态、本地分页和待返回请求不因切换重建或重复发送。
- 面板使用 `aria-controls`、`aria-labelledby`、`aria-pressed` 和实际 `hidden`，隐藏面板不占布局或进入浏览器可访问树。
- 原有 `section[aria-label="Memory operations"]` 契约保留；没有可用 Vault 时仅显示不可用说明，不伪装成一个已观察的空操作列表。Vault 切换和关闭仍按原规则卸载其操作观察。
- 观察失败仍撤下旧数据，不把执行完成说成验证通过，不复制演示中的虚构组件或状态，Activity 不回归。

## 验证

定向 `runtime-inspector` 18/18；`workspace-operations-inspector` 22/22，其中新增四项覆盖默认可见面板、选择的无障碍关系与无请求副作用、带有待返回请求的隐藏 owner、返回后选中项与分页保留。原有外来回执、晚到回执、失败、Vault 生命周期和仅读取断言均通过。

`npm run build`（含类型检查）通过，主 JS 446.46 kB（十进制）。两个根检查通过，Memory pin 仍为 `bf6bfd10…`，Activity/Usage 原生命令与授权仍退休。Node gate 为131通过、3跳过、0失败。首次完整 DOM gate 在未改动的 `panel-action-focus` 发生一次既有等待超时；该场景单独重跑7/7通过，随后完整 DOM 重跑81场景、1097项断言全部通过。首轮失败保存于 `tests.log`，重跑明细保存于 `dom-rerun.log`，未将失败写成通过。

无头 Chrome 使用新 profile 和严格仅读的合成预览，三语 × 两主题 × 两尺寸 × 三面板共36组，另有英文1100深色的锁库/读取失败 × 三面板共6组，**42/42** 无文档横向溢出、组件按钮文字在边界内、仅选中面板可见。已目视查看日文1100浅色 shell、中文1440深色 Core、英文1100深色 operations。所有截图有 `FICTIONAL FIXTURE · NO NATIVE CONNECTION` 水印。

本机忽略目录 `.design/native-inspector-2026-11-01/` 保存 `visual-results.json`、42张 PNG、`tests.log` 和 `build.log`。本片没有原生 WebView2、DPI/Narrator、Windows 安装/托盘/登录验收；没有访问个人 Vault、调用真实 Provider、修改 pin 或合并主线。F4 的组件选择层级已恢复，内容继续按实际组件观察组织，不声称复制了演示中的虚构验证结论。
