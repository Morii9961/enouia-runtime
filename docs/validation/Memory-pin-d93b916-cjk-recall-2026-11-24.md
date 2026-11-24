# Memory pin `d93b916`：中文召回（2026-11-24）

用装好的 `eaa410c` 只读测试召回预览时发现：整句中文问题一条也召回不到。比如“我平时喜欢喝什么茶？”选中 0 条，“Enouia迁移”选中 0 条，而加了空格的“Enouia 迁移”能选中 3 条。原因是 Memory 的共享召回合约只按空格切词。Runtime 请 Memory 在合约层统一处理，Memory 合并了 [#200](https://github.com/Morii9961/enouia-memory/pull/200)（ADR-MEM-209）：`recall_terms` 在按空格切出的词之外，再补上每段中日韩文字的相邻两字片段，以及混合词里的其余部分。不含中日韩文字的查询，词项和以前完全一样，算法仍是 `attention-rank-1`。

pin 从 `ca76892` 升到 `d93b916737e4b6422436ae2521c942a0e1fca635`，surface aggregate `fd8c2737716c334ec663b23467f941eddfa0a23fb03ae815d5414259b94260a1`，仍是 61 个命令。两个 pin 之间的 ADR-MEM-176 至 208 只改了远程服务和连接器；`workspace`、`vault`、`govern`、`provider` 四个 crate 没有改动，变化的只有 `contract` 和 `host`。Runtime 没有改代码。

## 验证

| 检查 | 结果 |
| --- | --- |
| `check-memory-integration --memory-checkout <d93b916>` | `memory_pin_consistent`，surface 与 pin 一致 |
| `cargo test --locked`（desktop） | 74 通过 + 9 通过 |
| `npm run desktop:bundle -- --no-sign -- --offline --locked`；生成的 NSIS 模板 `template-check.ps1` | 通过；26/26 |
| 新程序在真实库上只读测试召回预览（intent current，limit 8；原登记账户、迁移后的 home、原 operation） | 见下表；退出码 0，CURRENT 前后均为 440 |

| 查询 | `ca76892` 选中 | `d93b916` 选中 |
| --- | ---: | ---: |
| 我平时喜欢喝什么茶？ | 0 | 4 |
| Enouia迁移 | 0 | 3 |
| Enouia 迁移 | 3 | 3 |
| 喝 茶 | 2 | 2 |
| 摄影集 | 3 | 3 |

## 还不够好的地方

“Enouia迁移”选中的就是迁移相关的记录。“我平时喜欢喝什么茶？”选中的 4 条却都和茶无关：

- 它们是靠“喜欢”这类常见片段匹配上的，得分相同，顺序由注意力状态决定。
- 库里本来就没有喝茶偏好的记录。字面含“茶”的 3 条一条也没选中，因为单字“茶”在问句里只出现在“么茶”这个片段里，配不上这些记录里的写法。

这些数据已经发给 Memory，建议按片段在库里的稀有程度加权或去掉常见片段、让单个实义字也能低权重匹配、按匹配词数排序。由 Memory 决定怎么改，改好后 Runtime 再升级 pin。在那之前，问句越短、关键词越具体，结果越准。

真实记录的标题和正文只在本机查看，不入库。

## 后续：pin `abdcacf`（ADR-MEM-210）

Memory 按上面的建议合并了 [#201](https://github.com/Morii9961/enouia-memory/pull/201)：
- 中日韩文字的两字片段和单字按在候选里的稀有程度加权，超过一半候选都含有的词权重为 0。
- 单字也能匹配。
- 按加权得分排序。
- 只要查询里有中文词项，得分低于最高分一半的记录就排除。

不含中日韩文字的查询，结果和以前一样。pin 升到 `abdcacf041f58baf163454069a51981a0b36be24`，surface aggregate `7ae7f71198745834ab50fa097e6ceb4a69809ce32637c0baa49de75a392fee33`，两个 pin 之间只改了 `contract` crate。

检查：`check-memory-integration --memory-checkout` 一致；`cargo test --locked` 74 + 9 通过；bundle 与模板检查 26/26；真实库只读召回预览如下表，退出码 0，CURRENT 前后均为 440。

| 查询 | `d93b916` | `abdcacf` |
| --- | ---: | ---: |
| 我平时喜欢喝什么茶？ | 4（都不相关） | 3（相关程度明显提高，得分各不相同） |
| Enouia迁移 | 3 | 3 |
| 摄影集 | 3 | 3 |
| 一个“我去过某地吗”的问题 | — | 3，其中前两条无关 |

“我去过某地吗”这类问题还有问题。库里字面含这个地名的记录有 12 条，全部已采用，其中多条直接回答了这个问题，却一条也没选中。看起来最高分那条同时匹配了“去过”之类的片段，把最高分抬高了；只匹配地名这个最稀有、最相关的词的记录，得分不到最高分的一半，就被排除了。数据已经发给 Memory 继续改。