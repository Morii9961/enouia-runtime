# UI v2 · 共享 Settings 与浏览器集合导航焦点，2026-11-02

基线 `6e291df`。继续检查以翻译文字作 key 的交互列表，发现共享 Settings 的动效选项与浏览器示例的 Memory 集合分组同样会在语言切换时重建按钮。

先扩展 `primary-navigation-languages`：第一次复现 Settings 动效按钮焦点失败，保存为 `settings-baseline.log`；只修 Settings 后再次运行，动效通过、浏览器集合导航失败，保存为 `demo-baseline.log`。两处先分别确认根因再修复。

- App 的动效选项携带原 `system/reduced` 偏好 ID，Settings 以它作 key。
- 浏览器 Memory 的五个固定顺序分组使用原分组位置作 key，避免依赖翻译文字；不依赖分组的项目成员是否为空。分组没有动态插入/重排。
- 没有改动效值、偏好保存、导航行为、数据或原生接口。generic 浏览器 fixture 增加显式 `demo=1` 选项，只用于查看已有虚构示例，不进入产品或原生回退路径。

定向21/21通过：三语动效按钮/实际焦点与 Reduced 状态保持；浏览器集合按钮/焦点、选中状态与页面保持。完整 `npm test`：Node 134通过、3跳过、0失败；DOM 86场景/1268项断言通过。build（含类型检查）、两个根检查与 `git diff --check` 通过，主 JS 451.47 kB（十进制）。

三语 × 两尺寸，分别检查连接模式的 Settings 前端与显式浏览器 Memory 示例，共12组（1100浅色、1440深色）。复用实际语言模块、等待目标 URL 与真实导航译文，然后核实控件文字变化、原节点/焦点/状态；全部12/12通过，水印可见，布局无横向溢出，前后24张截图。目视检查日文1100的 Settings。

本机 `.design/shared-language-focus-2026-11-02/` 保存两阶段失败、成功、完整检查及截图/JSON。连接模式也只有虚构回执；未运行原生窗口、OS 动效设置、Provider、个人 Vault 或人工验收，没有字典/字体或 pin/Rust 变更。
