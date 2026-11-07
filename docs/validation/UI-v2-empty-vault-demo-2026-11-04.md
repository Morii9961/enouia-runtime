# UI v2 #14 接续：旧 Vault 整屏空库与仅候选

基线 `a1f882f`（#124）。只扩展浏览器设计样本，不创建磁盘 Vault、Owner 或 Provider，不升级 pin。

## 改动

`?vault-dataset=empty` 是完整空样本：没有记忆、候选、会话或 Capsule；`candidates` 只有两条独立导入候选，其他集合为空。`original` 恢复原始样本，未知值也按原始样本处理。新记录在 `vault-demo-states.ts`，原始数据保留为冻结的 `originalDemoData`；自动记忆 `fixture.ts` 没改。选择在模块加载时确定，无存储或轮询；SDK 原生标记下忽略该参数，主窗口不会因 URL 采用演示数据。

App 原先每次渲染都取固定 `m7` 和会话/Capsule 引用。清空记忆的模型复现返回 `Unknown demo memory`。现在一致的数据集同时撤下依赖，Context/Sessions 以 null 表示确实不存在，Home 的缺失日期/ID 不再用旧记录填补；无检查点时撤掉引线并禁用入口。Sessions 的非空 transcript 单独挂载，空分支不建立时间地图 hook。记录带也只接收实际存在的 sessionKey，修复了后续实测的空会话崩溃；没有在地图里补假日期。

Memory 兼容列表说明当前空库/仅候选状态，并提供候选收件箱和原始示例入口。Context/Sessions 有各自空说明；恢复链接保留语言/主题，重载回旧 Vault 列表。只在此窗口批准候选后，Home 计数会更新；不会凭此创建 Capsule、会话或检查点。Runtime Inspector 仍是独立、明确虚构的样本。

## 验证

- TypeScript 通过；演示纯逻辑 4 项、i18n/CJK 12 项通过。最初 Node 直接执行发现新 TS import 缺扩展名，已按现有模式修正；字体包未改。
- 新原始/空库/仅候选 DOM 分别 **20/32/35** 项通过；空库修复前 14 项失败，其中有固定引用异常。覆盖三语六表面、缺失记录/时间、显式批准及冻结样本。
- 原生标记读取模块 **1 项**通过，证明浏览器参数分支被忽略；不是原生进程或 Core 验收。
- 受影响的既有列表键盘 13、工作区 33、演示反馈 51、页面焦点 7 项通过。没有重跑完整 npm test。
- 自有隔离无头 Edge/profile：两状态 × Home/Memory/Context/Sessions ×（1100×700 中文黛蓝、1440×900 日文宣纸）**16 组**；另有两组候选收件箱和四次实际恢复链接检查。无横向溢出、NaN 日期或虚构 Capsule/会话/检查点；四次恢复均回原始 9 条正式记忆列表并保留语言和主题。共 18 张截图，已查看空 Home、空 Sessions、仅候选说明及日文收件箱代表图。
- 诊断首次因脚本选择器引号失败，随后一次发现仅候选列表缺恢复入口，补齐后复验通过；旧输出未删除。产物在忽略的 `apps/desktop/target/vault-demo-*`，原始断言见同名 JSON。
- Memory pin 与 Activity 退役检查通过；没有构建、Rust、完整前端或真实原生/物理 Windows 验收，也没有个人数据、真实 Provider、持续形成、迁移或部署。
