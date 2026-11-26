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
- 人物合并后的读取故障等 Memory 修复，修好后再升 pin、复查。
