# UI v2 · Memory 集合导航语言切换焦点，2026-11-02

基线 `2614f6f`。Memory 左侧导航分组以翻译后的 `g.label` 作 React key，语言切换会重建分组和按钮。扩展既有 `memory-date-languages` 后先复现失败：日文切回英文时 `en_collection_navigation_keeps_node_and_focus` 失败；原列表行/日期检查仍通过。失败保存在 `.design/native-memory-nav-focus-2026-11-02/baseline.log`。

只将分组 key 改为该静态非空分组的首个集合 ID（`inbox/current/automated/import`）；文字继续随语言显示。没有改导航动作、集合选择、保存内容、读取或后端。

定向场景16/16通过：三语下集合按钮及实际焦点保留，译文和选中状态更新；原行节点/焦点、日期与保存正文检查仍通过，没有额外列表/详情读取。完整 `npm test`：Node 134通过、3跳过、0失败；DOM 86场景/1221项断言全部通过。build（含类型检查）、两个根检查、`git diff --check` 通过，主 JS 451.24 kB（十进制）。

三语 × 两主题 × 两尺寸12组隔离 Chrome：复用实际已加载的语言模块，同时确认主导航与集合按钮的真实可见译文变化，原集合按钮、选中状态和实际焦点12/12保留；布局无横向溢出，前后共24张截图。驱动还等待目标页面 URL，避免读取前一页的 DOM。第一次 Chrome 启动读取自己的 DevToolsActivePort 遇到短暂 EBUSY，添加仅针对该临时端口文件的有限等待后复核通过。

本机同目录保存定向失败/成功、完整检查日志、截图与 `visual-results.json`。本片没有字典/字体、pin 或 Rust 修改，没有个人 Vault、真实 Provider、原生/安装或人工验收。
