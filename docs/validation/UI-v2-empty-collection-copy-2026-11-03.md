# UI v2 演示记忆库：空分组与无匹配分开说明

基线：`233571b`，分支 `codex/read2-synthetic-surface`。只改浏览器演示的 `screens/Memory.tsx` 和两份字典。

## 问题

演示里“已归档”分组为 0 条。没有输入任何搜索词时打开它，列表显示 “Nothing here matches. No reading on this strip for that text.”，说的是搜索文字没有命中，与实际情况不符。原生 `MemorySurface` 已经区分这两种情况（“Nothing matches this search.” 与 “No approved memories here yet.”）。

## 修复

有搜索词时保留原句；没有搜索词时显示 “No records here yet.”（中文「这里还没有记录。」，日文「ここにはまだ記録がありません。」）。不改数据、计数或其他状态。这是 SCREENS §4 的一处小修正，不等于完成“空库”整屏状态：空库牵涉 Home、Context、Sessions 对固定记忆的引用，需要整套演示状态，仍为 OPEN_ISSUES #14 待办。

## 实际运行

- 类型检查、i18n + cjk-fonts 12 项通过。
- 浏览器预览构建产物：英文“已归档”（0 条、无搜索词）显示 “No records here yet.”；在“全部正式记忆”输入不存在的词，显示原来的无匹配句。
- 完整 `npm test`：Node 142 项中 139 通过、3 跳过、0 失败；DOM 87 个 fixture、1,399 项断言全部通过。
