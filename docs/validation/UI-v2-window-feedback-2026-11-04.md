# UI v2：窗口控制失败提示的语言切换

基线 `dca832b`（#123），独立接续片；没有改窗口控制处理器、原生权限、Rust 或 Memory pin。

App 在窗口命令失败时把已经翻译的提示写进 state，之后切语言，错误仍停在旧语言。实际组件 + SDK mock 复现最小化、最大化/还原、关闭三条路径：中文/日文共 **6 项失败**。产品只改两行：失败时保存 `msg()` 原始键，错误区域渲染时 `t()`。没有修改请求、自动重试、失败原因处理或后续成功清除错误的原逻辑。

验证：TypeScript 和 Memory pin 检查通过；新 Happy DOM fixture **29 项通过**。覆盖三种命令失败后三语往返、保留未发送草稿/记录 ID/焦点/原始错误键、不增加命令，以及下一次显式成功清除错误。SDK mock 只记录 1 次 is_maximized 初始观察、3 次显式失败命令和 1 次后续显式成功；全部 label 为 main，无其他命令。

mock 使用安装的 `@tauri-apps/api` **2.12.0** 的 `mockIPC` / `mockWindows` / `clearMocks`，先安装替身，再动态导入 App，避免窗口模块读取未模拟 metadata。核对了本机 `mocks.d.ts`、`core.js`、`window.js`，并按 [Tauri 官方 mocking 文档](https://v2.tauri.app/develop/tests/mocking/)验证此用法。测试进程结束前卸载组件并清理 mock。

这是实际前端组件在 Happy DOM 中的命令替身证据，没有 Rust backend、真实窗口移动/关闭、真实 Vault 或物理托盘/热键/登录启动/安装验收。没有新增文案或改动字体、CSS，本片未重复 i18n/CJK 门禁、截图矩阵、完整 npm test、构建或 Rust 检查；上一片的 12 项字典/字体结果仍只属于上一片。没有个人数据、真实 Provider、Owner 或部署。新 fixture 已登记到默认 DOM 门禁。

修复前后原始断言与模拟命令见同名 JSON；本地输出位于忽略的 `apps/desktop/target/window-feedback-languages/`。原有其他 PR 未自动合并。
