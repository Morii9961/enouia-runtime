# UI v2 #3 应用内主题选择

基线：`main@c5f4b2e`，分支 `claude/starmap-options-and-decisions`。Morii 授权 Claude 对 OPEN_ISSUES #3 做决定：Settings 增加三选一主题，默认仍跟随系统。

## 实现

- 新增 `src/theme/scheme.ts`，集中处理主题：`?theme=` 截图参数优先，其次是本机偏好 `enouia.theme`（`dark` / `light`），没有偏好时跟随系统 `prefers-color-scheme`。只有实际配色变化时才走既有的 `moveAlong('theme')` 显影过渡（DESIGN §7）。
- 浏览器状态在 `startTheme()` 里读取，所以只渲染 Settings 的模块在 Node / SSR 下也能加载（`surfaces.test.mjs`）。
- Quick Search 与主窗口用同一份偏好，通过 `storage` 事件跟随对方的选择，不回写，做法与语言偏好相同。
- Settings → 主题一行原本只显示 “Negative” 标签，现在改为“跟随系统 / 黛蓝 / 宣纸”按钮组，说明文字改为“默认跟随系统……只保存在这台设备上”。删除不再使用的 “Negative” 词条；中日文通过 `cjk-fonts`。

## 实际运行

- 新 DOM 场景 `theme-preference` 6 项：默认跟随系统；选黛蓝 / 宣纸会写入本机偏好并显示为按下；改回“跟随系统”会清除偏好；另一个窗口的 `storage` 事件会被跟随且不回写。
- 完整 `npm test`：Node 142 项中 139 通过、3 跳过、0 失败；DOM 88 个 fixture、1,405 项断言全部通过。第一次运行时 `scheme.ts` 在模块加载阶段读取 `location`，导致 `surfaces.test.mjs` 无法加载（Node 只跑了 119 项、失败 1 项）；改为在 `startTheme()` 中初始化后通过。
- 浏览器预览构建产物（中文，1280×800）：选择宣纸后保存为 `light`，过渡结束后页面变成宣纸配色；截图中主题一行与语言、动效两行的按钮组对齐。之后清除了测试偏好。
- 没有在原生窗口里验收这一行；原生 smoke 的主题检查仍是系统配色模拟。

## 边界

偏好只是本机便利设置，不进 Vault、不同步到其他设备，也不影响 Memory 数据。
