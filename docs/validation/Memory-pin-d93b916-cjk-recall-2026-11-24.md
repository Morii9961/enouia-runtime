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
