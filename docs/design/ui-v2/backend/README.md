# UI v2 对 Memory 后端的三份要求

日期：2026-10-26。Runtime 前端写给 Enouia Memory 的需求文档。它们说明 UI v2 要显示什么、因此后端要存什么和提供什么；不是 Memory 的契约或 ADR。

| 文档 | 回答什么 | 交给哪个会话 |
| --- | --- | --- |
| [01 后端缺口报告](01-BACKEND_GAPS.md) | 对照 Memory `main` `c9bf1be`，UI v2 接真实数据还缺哪 24 项；每项的证据、修法、验收与顺序 | S1：缺口修复（Memory 仓库） |
| [02 重新初始化的数据要求](02-MEMORY_INIT_REQUIREMENTS.md) | 新库每条来源、记忆、实体、主人动作、附注、投影要存什么；初始化过程与验收 | S2：重新初始化（Memory 仓库） |
| [03 MCP 要求](03-MCP_REQUIREMENTS.md) | Agent 日常经 MCP 采集与召回时怎样产出同样完整的数据；开源项目的做法；工具面与分片 | S3：MCP 开发（Memory 仓库） |

初稿 [MEMORY_DATA_REQUIREMENTS.md](../MEMORY_DATA_REQUIREMENTS.md)（2026-10-25）保留，内容已并入这三份。

## 三个会话的先后

```text
S1 第一片：记录字段与投影规则的 ADR（01 §3 第一片 = 02 §4–§6 的字段）
   ├─→ S2 可以开始：初始化管线先在合成根上跑通，再等 Morii 授权真实数据
   ├─→ S3 可以开始 MCP-3（采集进形成管线）；MCP-2（新格式只读）不必等
   └─→ S1 继续：读取、时间与图、过程、主人动作
最后：Core-8 由 Runtime 的独立采用切片接真实库（Morii 另行开始）
```

- S1 的第一片是另外两个会话的前提：字段定下之前，S2 不在真实数据上形成记录，S3 不定采集工具的字段。
- 三个会话都在 Memory 仓库工作，各自在自己的分支或工作树里，开工前列出自己负责的文件，不同时改同一组文件。进行中的 MCP-Resume-1（`codex/mcp-native-agent`）先完成它自己的范围，S3 从它之后接。
- 启动词与本机路径在本机的私有交接包里，不在仓库中。

## 核对过的版本

- Enouia Memory `main` = `c9bf1be7819dba19915adf6031b1900c032b73d1`；进行中的 MCP 分支 `codex/mcp-native-agent`（未提交，只读）。
- 参考项目（与 Memory 仓库 `docs/research/memory-systems-2026-10-24/01-source-review.md` 固定的版本相同，2026-10-26 复核未变）：OmbreBrain-folio `bf6887575fa8`、Ombre-Brain `115d831d979b`、MemoryConstellations `9ad9825910bb`、Latent-memory `835250d080c0`；另读了 Graphiti `5c27edfa8d3e` 的 MCP 服务器与 modelcontextprotocol/servers `ef9808f71090` 的 memory 服务器。只读源码，没有运行。
