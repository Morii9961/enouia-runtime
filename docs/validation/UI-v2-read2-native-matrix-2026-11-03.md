# read-2 合成目录原生三语 × 双主题 × 最小窗口复验

基线：`98d0cf9`（功能 `3a5dc33` + 交接文档），分支 `codex/read2-synthetic-surface`。Memory pin 仍为 `0d338f12f51a859363e0725071bcf43874b492c7`，没有改 Rust、adapter、权限或 Core。

## 复验方法

`memory-smoke.mjs --catalog-only` 在原有 21 项之后、翻页之前加入矩阵。窗口用自有主 HWND 实际缩到最小 1100×700（显示器 DPI 不变，本机截图为 1.5 倍），语言走真实跨窗口路径（在 Quick Search 窗口写 `enouia.lang`，主窗口通过 `storage` 事件切换，Memory 面板不卸载），配色用 CDP 模拟 `prefers-color-scheme`。zh-Hans / ja / en × 深 / 浅共 6 格，每格检查：根和四个窗格无横向/纵向溢出、标签文字在边框内、已观察页的记录标题/原文/标识不变且不重读，并截图。矩阵结束后清除配色模拟，后续锁定、重启和 autostart 检查照旧。

## 发现与修复

1. **英文标签越框（实际复现）**：1100 宽下 “Isolated synthetic read-2” 折成两行，但 `.mem-tag` 固定 `height:20px`，文字范围高 29.3 px，边框盒只有 21.3 px，文字压在边框上；中日文单行不受影响。仿照 #23 按钮的做法，基础规则改为 `min-height:20px`，不截断、不禁止换行、不缩字号。Quick Search 结果标签原来靠 `height:18px` 覆盖，新的基础 `min-height` 会把它撑到 20px，所以覆盖同步改成 `min-height:18px`。浏览器探针在构建后的 CSS 上测得：Quick Search 标签 18px，单行基础标签 20px，只有换行的标签变高。修复前同一新检查失败 37/39（en 深 / 浅），修复后通过。
2. **CJK 字形覆盖（HEAD 既有失败）**：完整 `npm test` 的 `cjk-fonts` 在 `3a5dc33` 上就失败。read-2 新增的中文「搜」「涵」两个子集都不覆盖，日文「械」「権」「継」「閲」不在标签子集中。按 `413d318` 的先例，改用已覆盖的等义措辞，字体包不变：中文搜索沿用界面已有的「检索」，「涵盖」改为「包括」；日文改为「連続して」「許可範囲内」「許可されているシステム記憶」。
3. **DOM 时序不稳（HEAD 既有）**：`changed_authorized_scope_withdraws_old_rows_before_new_stats` 在 HEAD 上 6 次失败 2 次。原因是 stats 请求先于 React 提交撤行渲染发出，测试立刻检查就会偶尔看到旧行。stats 一直被扣住，所以改为限时等待撤行后再断言；含义不变：新统计到达前旧行已撤下。修复后连续 11 次通过。

## 未改动、留给 Morii 决定

- 库状态（`库：open`）、观察时间（原始 ISO）和 kind / knowledge / adoption / validity / attention 枚举值，在三语界面里都按原样显示。这沿用 `413d318` 对 read-1 的决定：“保存内容、时间、状态值与实际引用不翻译”。曾试过翻译库状态并把时间改为本地显示（原值放在 `datetime` / `title`），因与该决定冲突已撤回，没有提交。
- 搜索表单内标签与输入同排、检索按钮通栏、按钮行与计数之间没有间距，与 read-1 面板一致，属视觉取舍，未改。

## 本片实际运行

- 完整 `npm test`：Node 141 项中 138 通过、3 跳过、0 失败；DOM 87 场景 / 1,399 断言全部通过，其中 catalog-memory 23 项。修 CJK 前同一套件失败 1 项（cjk-fonts）。
- catalog-memory DOM 在时序修复后单独运行 11 次全部通过；类型检查、前端构建通过，主 JS 460.45 kB / gzip 134.15 kB，与交接基线一致。
- 调试原生构建（custom-protocol）通过。最终新建临时 fixture `enouia-runtime-catalog-smoke-rFkOpJ`、自有进程和独立 WebView2 profile 的 `--catalog-only` 39/39 通过（原 21 项 + 矩阵 18 项）。已查看修复后的 en 深色、zh 深 / 浅、ja 深 / 浅截图。
- Memory pin、Activity 退役检查和 `git diff --check` 通过。没有重跑 Rust 测试 / Clippy（没有 Rust 改动），也没有重跑其他原生模式。

日志在忽略的 `apps/desktop/target/pin-verification/catalog-matrix-{build,native-build,npm-test,before-tag,final}.log`；截图在本机临时 fixture 的 `out/catalog-matrix-*.png`，未提交 Git。

## 边界

配色是 CDP 媒体模拟，没有改 Windows 主题；窗口缩放只用当前 DPI，不代表其他显示器 / DPI、Narrator 或人工验收。仍是固定三条合成记录，未打开个人 Vault、Owner、真实 Provider，也没有迁移或部署。
