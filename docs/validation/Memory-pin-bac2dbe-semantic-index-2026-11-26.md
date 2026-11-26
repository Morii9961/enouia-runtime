# Memory pin `bac2dbe`：本机 bge-m3 语义索引（2026-11-26）

Memory 完成了 ADR-MEM-220 的语义向量层：
- 召回打分：#211，合约的 `SemanticVector`、`semantic_milli`，召回理由 `semantic`；
- 语义近邻：#212，`semantic_neighbor`；
- 调用约定文档：#213。

Runtime 按 Morii 的授权接入。Morii 在 Memory 会话里同意安装，并让代理继续推进。Ollama 0.40.18 和 `bge-m3:latest` 由 Memory 会话安装。

pin 从 `b7a0269` 升到 `bac2dbebf41a35c7ef6a91f3be7813fa7f122b91`，surface aggregate `8456dbaf204c669ec78cf884bc78eb543eb0dc36dcbff77b22b7cc6a46683237`，仍是 61 个命令。

## Runtime 的做法

- **新模块 `memory_semantic.rs`**：实现 Memory 定义的 `SemanticIndex`。
  - `query()`：用标准库 TCP 直接向 `127.0.0.1:11434/api/embed` 发 HTTP/1.1 请求，不经过系统代理，不新增依赖。最多等 1.5 秒；Ollama 没装、没运行、超时或出错时返回 `None`，召回退回字面匹配。
  - `memory()`：只查内存缓存，不阻塞。
- **后台补算**：登记库的状态轮询最多每分钟取一次读取器的 `semantic_texts(上限)`，缺的向量交给后台线程，每批 16 条调 Ollama 计算；清单里已经没有的目标（撤回、遗忘、删除）从缓存清掉。
- **缓存位置**：`%APPDATA%\com.enouia.runtime\semantic-bge-m3.json`，和本机 Agent 名称放在一起，不进库、不进导出、不进仓库。
- **挂点**：同一个索引挂在完整历史读取器上（召回预览和 Context），也挂在每个本机 Agent 连接的宿主上。
- **界面**：Settings 显示语义检索状态（检查中、建立索引 n/总数、就绪、本机模型没运行）。召回理由 `semantic` 和关联边 `semantic_neighbor` 显示为“语义相近”。

## 验证

| 检查 | 结果 |
| --- | --- |
| `check-memory-integration --memory-checkout <bac2dbe>` | 一致 |
| `cargo test --locked -- --test-threads=1` | 75 + 9 通过（新增缓存读回与按目标查询的测试）；clippy 无警告；fmt 通过 |
| tsc；`npm test`（含 i18n、CJK 字体）；DOM 夹具 | 通过 |
| release 程序在真实库上只读运行（原登记账户、迁移后的 home、原 operation） | 后台 13 秒算完 351 条向量（状态 `ready 351/351`）；召回预览里出现 `semantic` 理由；退出码 0，CURRENT 前后均为 440 |

真实库上的变化（limit 8；问句本身是通用问法，不含记录内容）：

| 问题类型 | 没有语义 | 有语义 |
| --- | --- | --- |
| 我去过某地吗 | 第 1 条无关 | 前 2 条都是直接相关的记录，带语义理由 |
| 某个项目的迁移 | 迁移记录排第 1 | 同样排第 1，分数拉开 |
| 某事第一次发生在什么时候 | 正确记录排第 1 | 语义把一条相近的记录排到第 1；正确记录分数第 2，但 16KB 预算放不下这条长记录 |
| 我的大学在哪里、我喜欢什么画风 | 找不到 | 仍然找不到：没有一条达到语义线索门槛 |

## 相似度分布（交给 Memory 定阈值）

10 个通用问句 × 351 条记忆，共 3510 对：中位数 385，第 90 百分位 488，第 99 百分位 560，最高 648。没有任何一对达到线索门槛 650。直接相关的记录大多在 540–650，无关记录也可以到 550 左右。按现在的阈值（下限 550、线索 650），语义只能给少数记录加分，不能单独带出记录。数据已发给 Memory，阈值由它定。真实记录的标题只在本机查看，不入库。

## 未完成

- 没有打包候选，也没有装到 Morii 电脑上。
- 阈值校准等 Memory 根据上面的分布调整后再验证。
- 关系图整页的语义近邻还没做，Memory 计划等真实开销测出来后再加。
