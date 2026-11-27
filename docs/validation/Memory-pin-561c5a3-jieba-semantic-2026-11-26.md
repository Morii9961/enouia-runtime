# Memory pin `561c5a3`：jieba 名词加权与语义护栏（2026-11-26）

Memory 合并了两项召回改动：
- [#215](https://github.com/Morii9961/enouia-memory/pull/215)（ADR-MEM-219）：jieba 分词移到 host，问句里的名词加权；“时候”“时间”这类框架名词只算 1 倍。
- [#216](https://github.com/Morii9961/enouia-memory/pull/216)（ADR-MEM-222）：语义绝对下限从 500 提到 530，加分封顶在 4 个标准差。

pin 从 `ea3f59f` 升到 `561c5a37c7646d7646c15de57e687bd9e78ed073`，surface aggregate `79d7afb9f4ba5bd640cb802240c0ab8171847ea6e54d6b47f469244ac9434837`，仍是 61 个命令。Runtime 的代码没有改。

`jieba-rs` 成为 host 的新依赖。这台机器上 cargo 连不上 crates.io 索引，所以 Cargo.lock 按 Memory 在同一提交的 lock 手工补齐：
- 新增 `jieba-rs` 及其依赖共 19 个包；
- cargo 解析时又加入了 `jobserver`；
- 之后 `--locked` 构建通过。

## 验证

| 检查 | 结果 |
| --- | --- |
| `check-memory-integration --memory-checkout <561c5a3>` | 一致 |
| `cargo test --locked -- --test-threads=1` | 75 + 9 通过；clippy 无警告；fmt 通过 |
| release 程序在真实库上只读运行（原登记账户和 operation） | 语义索引 `ready 351/351`；退出码 0，探针前后 CURRENT 不变 |

## 真实库对比

两个 release 程序都带 custom-protocol 构建，同一组通用问句，limit 8，分别用 16KB 和 64KB 预算：
- `561c5a3`：jieba 加语义；
- `ea3f59f`：只有语义。

| 问题类型 | 只有语义（`ea3f59f`） | jieba + 语义（`561c5a3`） |
| --- | --- | --- |
| 某事第一次发生在什么时候 | 16KB 下答案不在结果里，64KB 下排第 2 | 16KB 和 64KB 下都排第 1 |
| 喜欢什么画风 | 第 1 条无关，答案排第 3 | 16KB 前 2 条都是答案 |
| 我去过某地吗 | 前 3 条相关 | 同样前 3 条，分数拉开；64KB 前 6 条都相关 |
| 作品名 | 第 1 条正确 | 第 1 条正确，后面多是字面相关的记录 |
| 项目迁移 | 16KB 第 3 条相关 | 16KB 第 3 条换成一条不太相关的；64KB 多带出一条相关记录 |
| 某种日常偏好（库里没有相关记录） | 带出无关记录 | 同样是无关记录，字面分偏高（已告诉 Memory） |
| 最近在学什么、界面风格 | 正确 | 相同 |
| 我的大学在哪里 | 找不到 | 同样找不到 |

结论：没有变差，两项改善，可以采用。

语义 z 值（对全部记录估算，每题标准差 41–84）：
- 直接答案：3.6–6.3；
- 画风答案：2.7–2.9，只是加分；
- 迁移相关：2.4–2.7。

## “我的大学在哪里”为什么找不到

trace 里，答案那条（z 3.61）的排除原因是 `not_adopted`：它还没有被采纳，和排序无关。另有几条标题含“大学”或城市名的记录被判 `no_cue`，已交给 Memory 检查分词后的线索。

trace 每次 considered 351 条，排除列表只有约 130 条，其余被条数上限或预算挤掉的记录没有写原因。这一点也已告诉 Memory。

## 复查时发现的读取故障（Memory 处理）

当天，Morii 在已安装的应用里把几个人物合并成同一人，库从 CURRENT 440 前进到 441。此后：
- 提到这些人的 4 条记忆在读详情时，Memory 返回 `Invalid`，界面显示 `catalog_read_refused`；
- 记忆列表翻页一旦碰到其中任何一条，整页都会失败，只有 347/351 条能列出来；
- 召回不受影响。

`ea3f59f` 和 `561c5a3` 表现相同，与这次 pin 无关，已交给 Memory。装在本机的候选版本同样会碰到这个问题。

## 环境

- 构建前，本机 Cargo 的 crate 缓存和 Runtime 的 release 缓存已被磁盘清理删掉。重新下载时，cargo 要关掉证书吊销检查（`CARGO_HTTP_CHECK_REVOKE=false`）才能连上。
- 旧探针用的调试端口落进了 Windows 的保留端口段，WebView2 绑不上，改用别的端口。

## 未完成

- 没有打包候选，也没有装到 Morii 电脑上。
- 人物合并后的读取故障已由 `76ef079` 修好，见下文。

## 后续：pin `76ef079`（2026-11-27）

Memory 合并了两项：
- [#217](https://github.com/Morii9961/enouia-memory/pull/217)（ADR-MEM-223）：关系图页列出语义近邻；
- [#218](https://github.com/Morii9961/enouia-memory/pull/218)（ADR-MEM-224）：修复上面的读取故障。原因是目录读取项、邻居关系和会话摘要的原生校验，不认人物确认为同一身份时附上的证明，读取器拒绝了自己的输出。数据本身没有问题。

pin 升到 `76ef079328bc6261967e617fb49c85efc4fd31a9`，surface aggregate `daf7ba3a83b68ce1cc4e7c6beff960fc49d473730bb0248b22df3c1a791bc42c`。依赖没有变化，Runtime 的代码也没有改：星图本来就会画 `semantic_neighbor`，图读取器也已经挂着语义索引。

| 检查 | 结果 |
| --- | --- |
| `check-memory-integration --memory-checkout <76ef079>` | 一致 |
| `cargo test --locked -- --test-threads=1` | 75 + 9 通过；clippy 无警告；fmt 通过 |
| 真实库只读复查（CURRENT 441，前后不变，退出码 0） | 记忆列表翻完 351/351 条，不再出错；之前读不出的 4 条，详情都能打开 |
| 星图 | 351 个节点；`semantic_neighbors_available` 为 true；语义近邻 466 条，覆盖 466/466；相似度 532–830 |
| 同一组召回问题 | 与 `561c5a3` 完全相同 |

抽看相似度最高的几对语义近邻：同一段时间的睡眠记录、同一门课的两次考试、两次迁移、两个社交账号，都是合理的关联。

## 后续：pin `0024ed0`（2026-11-27，分词结果直接认词）

[Memory #219](https://github.com/Morii9961/enouia-memory/pull/219)（ADR-MEM-225）：宿主用 jieba 切出问句里两个字以上的词，交给合约。和这些词完全相同的两字片段直接算词，不再按字频判成偶然拼合。

原来“大学”没被算成词，原因在字频：“大学”出现在 21 条记忆里，按规则要超过 min(“大”, “学”) 的四分之一才算词，即 21 × 4 > min(94, 87)，结果 84 < 87，差一点。“学”字在库里大多出现在“学习”里。

pin 升到 `0024ed01c70de77a7c8fde9c3a1a65ef2b490a61`，surface aggregate `d43510fe768aa9405351c2a73ad1f985d82966bef7f77fcfbed55c623fea28a4`。依赖没有变化，Runtime 的代码也没有改。

合并前，我先用候选 `c67a3d4` 在真实库上只读对比过（CURRENT 441，前后不变，退出码 0）：与 `76ef079` 比，同一组问题，16KB 和 64KB 两档。合并后的 Memory 代码和候选完全相同，只改了 ADR 文档，所以没有重跑。

| 问题类型 | `76ef079` | `0024ed0`（候选 `c67a3d4`） |
| --- | --- | --- |
| 我的大学在哪里 | 第 1 条是高中，后面都是无关记录 | 16KB 前 3 条都是大学记录，64KB 的 8 条都和大学有关；答案那条仍然还没被采纳 |
| 某种日常偏好、项目迁移、我去过某地吗、作品名、最近在学什么、界面风格 | — | 完全相同 |
| 喜欢什么画风 | 第 1 条是答案 | 16KB 顺序不变，答案分数更高；64KB 前 4 条不变，第 5–8 条换成分数更低的记录 |
| 某事第一次发生在什么时候 | 前 4 条正确 | 前 4 条不变；第 5–8 条本来就是噪声，换了一批，分数更低 |

| 检查 | 结果 |
| --- | --- |
| `check-memory-integration --memory-checkout <0024ed0>` | 一致 |
| `cargo test --locked -- --test-threads=1` | 75 + 9 通过；clippy 无警告；fmt 通过 |

## 后续：pin `e876cc7`（2026-11-27，身份确认和胶囊的结果校验）

[Memory #220](https://github.com/Morii9961/enouia-memory/pull/220)（ADR-MEM-226）：`NativeOwnerOutcome` 的原生检查补上 `entity_identity` 和 `capsule`，schema 本来就允许这两种。之前“确认同一身份”和“保存胶囊”提交成功后，返回的结果（以及用 `outcome` 找回的那份）过不了 `validate()`；提交本身不受影响。

Runtime 从来没有对这些结果调用 `validate()`：适配层直接序列化返回，界面只检查 `action` 是字符串。所以在 Runtime 里做这两种操作，界面本来就显示为已写入，不会误报失败。

pin 升到 `e876cc7164d6f5b793b420b30025ad3743a05f33`，surface aggregate `d28c992834377186e512e0eddeae5fd122f3fcc7b67aea1275a7adcd69c89184`。格式、依赖和 Runtime 代码都没有变。这一版不影响召回，所以没有在真实库上重跑对比。

| 检查 | 结果 |
| --- | --- |
| `check-memory-integration` | 一致 |
| `cargo test --locked -- --test-threads=1` | 75 + 9 通过；clippy 无警告；fmt 通过 |
