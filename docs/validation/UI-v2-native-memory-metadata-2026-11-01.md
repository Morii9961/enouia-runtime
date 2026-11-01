# UI v2 · 已保存记忆行元数据，2026-11-01

2026-11-02 补正：浏览器语言/焦点检查新增真实导航译文变化的条件，复用实际已加载模块后重跑12/12通过，替代热更新下不足的旧驱动条件；本机截图/JSON已重生成。见[原因与证据](UI-v2-browser-language-harness-2026-11-02.md)。其余原有检查仍只适用于所记基线。

基线 `d045096`。先核对固定 pin `bf6bfd10…` 的[记忆行输出](https://github.com/Morii9961/enouia-memory/blob/bf6bfd10bf3c870ae2ce7ceb5c6bd635b08bf327/crates/enouia-memory-workspace/src/views.rs#L21-L37)：已有 title、projectId、evidenceCount。检索的[输出](https://github.com/Morii9961/enouia-memory/blob/bf6bfd10bf3c870ae2ce7ceb5c6bd635b08bf327/crates/enouia-memory-workspace/src/lib.rs#L967-L992)有 projectId/evidenceCount，但没有 title。

## 改动

- 非空保存标题单独显示，保留原样；正文片段仍显示原片段，缺标题不生成新内容。
- 项目只显示已返回的逻辑 ID，完整值留在 title；不推断项目名称或发起查询。
- 证据引用数使用已有复数字典，0也显示；它是每条记录的引用数，不是不同来源数或全库统计。缺字段不填假0。
- 搜索结果仅使用自己的回执，不借先前列表标题。选中、焦点、分页与请求不变。

[MemoryListArgs / SearchArgs](https://github.com/Morii9961/enouia-memory/blob/bf6bfd10bf3c870ae2ce7ceb5c6bd635b08bf327/crates/enouia-memory-contract/src/workspace.rs#L65-L85)是拒绝未知字段的闭合参数，没有项目/种类筛选。因此本片没有伪造分类导航、前端全页抓取或额外筛选参数，F5仍不标为完整复刻。

## 验证

`memory-row-metadata` 7/7：标题与片段字面保留、HTML不解释、项目完整ID、0/非0引用、空标题与缺字段、搜索不借标题、无新读写。字典/字体11/11通过；只有 Project 标签是新键，引用数复用既有键。首次类型检查发现重复追加了两个既有引用数字典键，移除新重复项并保留原译文后类型检查通过。

`npm run check` / `npm run build` 通过，主 JS 451.00 kB（十进制）；两个根检查及 `git diff --check` 通过。完整 `npm test` 通过：Node 134通过、3跳过、0失败；内含 DOM 86场景、1156项断言全部通过。

三语 × 两主题 × 两尺寸12组真实 App 合成预览：无文档/列表横向溢出，保存标题、项目标签和引用数均在行边界内；每组切换语言后仍保留原行节点与实际焦点，12/12。已目视查看中文1440深色与日文1100浅色，保留虚构水印。

本机 `.design/native-memory-metadata-2026-11-01/` 保存12张 PNG、`visual-results.json`、测试/构建日志。没有个人 Vault、真实 Provider、原生/安装或人工验收；没有改 pin 或合并。固定 pin 的完整项目/来源分类能力仍需领域契约，不能从本片的局部元数据推断。
