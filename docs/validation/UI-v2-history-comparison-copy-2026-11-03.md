# UI v2 保存批次比较文案

基线：`main@61715c1`。本片沿当前 UI v2 接续路线补齐保存批次选择、比较结果、主题筛选、来源覆盖和候选详情的动态中日文。原始建议、人工修订、详情 JSON、引文、时间、状态码、来源 ID 与响应哈希原样插入，不翻译保存内容。没有更改读取、写入、Memory pin 或原生权限。

实际验证（2026-11-03）：

- `npm run check`：通过。
- `node --test tests/i18n.test.mjs tests/cjk-fonts.test.mjs tests/history-comparison.test.mjs`：17 通过、1 跳过。跳过项为未提供实际 Core 输出的可选用例。
- `node tests/dom-fixtures.mjs --worker history-comparison`：21 项断言通过。中英日切换保留筛选节点、焦点、批次勾选、原文与响应身份；不自动读取。刷新拒绝撤下旧来源；选择变更及卸载继续拒绝迟到结果。
- 根目录 `node scripts/check-memory-integration.mjs`、`node scripts/check-activity-retirement.mjs`、`git diff --check`：通过。

初次字典检查发现重复键及日文字形覆盖差异；复用既有日期键、采用已有字体覆盖的日文措辞后，上述检查通过。未重新打包字体。

这是合成传输与 Happy DOM 组件证据。没有运行完整前端套件、构建、原生窗口或 Windows 验收，没有读取个人 Vault、调用 Provider 或采用新 Owner 根。
