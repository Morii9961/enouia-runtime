# UI v2 W6 #18 · 历史任务与 Provider 面板按需加载

2026-10-27。基线 #16 `39b6a81`，分支 `codex/ui-v2-w6-18-lazy-panels`。

## 改动

`HistoryTaskPanel.tsx` 保留原有 `useHistoryTasks` owner hook 与导出入口，只把视图原样移到 `HistoryTaskView.tsx`，用已有 React.lazy/Suspense 模式按需加载。请求、重试键、批次 owner 与选择对象仍由 Import 持有。`status.tsx` 将 ProviderConfigDraft、ProviderSettingsStatus 分别延后加载；两个组件本身的逻辑不改。加载提示使用 `t()`，补齐中日文字；两种字典各 1,415 键，缺译文 0。

字典变动后重跑既有字体生成器，504 个 WOFF2、9,691,652 B 的内容没有变化；当前字典覆盖检查通过。没有新增依赖、改 Vite 警告阈值、Memory pin、原生命令、领域逻辑或 CSP。

## 构建与首屏

| 项目 | 实测 |
| --- | ---: |
| 上一片主 JS | 503.47 kB / gzip 146.65 kB |
| 本片主 JS | 436,152 B（436.15 kB）/ gzip 128.05 kB |
| HistoryTaskView | 15.40 kB / gzip 4.85 kB |
| ProviderConfigDraft | 9.05 kB / gzip 3.21 kB |
| ProviderSettingsStatus | 3.78 kB / gzip 1.61 kB |

build 的 500 kB 警告消失。额外启动本机生产预览（1421），先核对 HTML 引用与当前 dist 主包一致，再禁用缓存读取英文黛蓝 Home 的全部脚本请求。三个延后面板均未请求；首页 **8 个脚本合计 502,123 B**，包括主入口及 7 个共享包。436,152 B 是主入口，不是全部首屏下载量；没有拿旧版本同口径的冷首页数据，因此不推算首屏总下载节省比例。请求逐项记录于 `.design/w6-18/production.json`。

## 验证范围

- 重点 DOM：history-task-owner、history-batch-request、settings-exit-ownership 通过；使用现有合成端口验证生命周期、请求与退出边界，没有真实模型调用。
- 三语 × 两主题：在独立浏览器中用现有 `setTransport` 测试入口返回仓库已有 synthetic Settings 回应，只允许四类只读 mock 命令；12 张 Provider 草稿/状态截图均标明 `SYNTHETIC TEST · MOCKED PORT · NO VAULT ACCESS`。冷 Home 不请求延后面板，挂载 mock Settings 后两个 Provider 模块被请求；无 password 输入框，未生成/保存配置或读写密钥。截图在 `.design/w6-18/shots/`，测量 `browser.json`。查看英文宣纸草稿、日文黛蓝状态原图。不是 Runtime 原生接入、W7 启动集成或真实 Vault 验收。
- 六项检查全部通过：类型检查、`npm test`（127 通过 / 3 跳过，DOM 78/78）、独立 DOM（78/78）、build、两个根检查。另有 surfaces 渲染检查 24/24、字体检查 3/3、生成脚本实际执行。未重跑 Rust 全套测试。

## 保留的失败证据

首次 `npm test` 的同步静态渲染断言在懒加载尚未完成时检查完整面板，原样错误摘要：

```text
✖ native Settings exposes a non-secret configuration draft even before opening a Vault
AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Model configuration draft/. Input:
```

原始输入 HTML 与完整堆栈在 `.design/w6-18/test-initial.log`，包含两个 `Loading panel…` 占位。保留所有原内容/安全断言，将这一个渲染测试改为等待 stream.allReady 后读取最终 HTML，并增加不得残留加载占位的断言。依据已核对的本机 React DOM 19.3 导出与 [React 的 allReady 文档](https://react.dev/reference/react-dom/server/renderToReadableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation)。不是删除断言或把占位当成配置可用。

截图探针先因旧监听进程退出而拒绝连接（`browser-initial.log`），重建任务专用浏览器后又暴露 Vite 优化依赖仅提供默认导出，原样错误：

```text
TypeError: dom.createRoot is not a function
```

通过读取浏览器模块实际导出确认 `default.createRoot`，仅修正本地探针后通过；完整输出在 `browser-exports-initial.log`。产品代码未为截图修改。原始交付包图片及探索材料未上传。
