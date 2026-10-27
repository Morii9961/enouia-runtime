# UI v2 W6 #7 · 视图模型只传状态

2026-10-27。基线 W5 `f03d360`，分支 `codex/ui-v2-w6-07-view-state`。

`App.renderVals()` 移除旧 Quiet 的导航/集合/行/开关背景、前景、TONE 和状态色；不再创建未被使用的旧呼吸圆环。Context fixture/type 移除颜色，视图输出 section 标识；Sessions 输出 speaker、写入状态，Runtime 保留 tone。相关 JSX 移除行内颜色与点尺寸，交给已有 CSS token/状态规则，并移除三处已无需压过行内样式的 `!important`。

现有类名、data 属性与键盘契约保留；Memory 的 `data-status`、Sessions 的 `data-kind` 从领域状态取稳定值，不再从翻译后的标签推导。没有新增 UI 文字、依赖、原生代码、Memory pin 或领域行为。

独立无头 Edge，1440×900、DPR 1.5，三语 × 两主题 ×（Memory 正式/候选、Context、Sessions、Runtime），30 张截图在 `.design/w6-07/shots/`，结果在 `visual.json`。30 个状态未输出旧行内色值；候选状态在三种语言下均是 `candidate`。查看中文黛蓝候选及英文宣纸 Runtime 原图；#8 长 ID、#16 组件名拥挤仍存在，分别留到指定切片。此处为明确虚构的浏览器演示验证，不代表 native/Vault 或 owner 验收。

六项检查全部通过：`npm run check`、`npm test`（127 通过 / 3 跳过，DOM 77/77）、独立 `npm run test:dom`（77/77）、`npm run build`、两个根检查；日志在 `.design/w6-07/`。#18 的既有包体积警告仍在。此前自动审批因额度限制未执行截图和完整检查，恢复后重新执行；未将其当作测试通过。首次编辑脚本从错误工作目录调用，出现 `MODULE_NOT_FOUND`，未修改源码；从根目录执行后类型检查通过。
