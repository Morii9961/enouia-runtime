# Enouia Runtime — Architecture & Memory System Specification

> **Version:** v0.2 Draft  
> **Status:** Architecture Baseline / Windows-first Vertical Slice  
> **Primary Client:** Windows  
> **Primary Runtime Mode:** Local-first  
> **Future Bridge:** MCP over HTTPS via replaceable VPS gateway  
> **Core Principle:** 模型是计算资源；Enouia 的身份、记忆、上下文与长期连续性不属于任何单一模型或单一云平台。

---

# 0. 文档目的

本文档是 Enouia Runtime 的第一份较完整工程基线。

它不是产品宣传稿，也不是单纯的“记忆系统想法整理”，而是后续 Claude / Codex / 人工开发时共同遵守的架构约束。

本版本在 v0.1 记忆系统草稿基础上，正式补全：

- Windows-first 开发路线
- Windows Shell 与 Runtime Core 的边界
- Tauri 2 / React / TypeScript / Rust 技术方向
- Local Runtime Core
- Human-readable Memory Vault
- SQLite Index
- Context Compiler
- Provider Interface / Mock Provider
- Memory Inspector / Context Inspector
- System Tray / Global Hotkey / Mini Overlay
- Local-first → Hybrid 的未来演进
- MCP Bridge / VPS Gateway
- Development Tunnel
- Delete-the-VPS Test
- Session / Memory / Context 的协议边界
- Milestone 0.1 → 0.6
- Repository Layout
- Acceptance Criteria
- Security / Privacy / Recovery
- Open Questions / ADR Candidates

---

# 1. 项目定义

## 1.1 Enouia Runtime 不是另一个聊天客户端

Enouia Runtime 的长期目标不是：

> “做一个可以调用 GPT / Claude API 的桌面聊天软件。”

而是：

> **构建一个独立于模型供应商的长期人格、记忆、上下文、工具与客户端运行时。**

聊天窗口只是 Client Surface 之一。

长期真正持续存在的是：

```text
Identity
Memory
History
Context
Relationships
Projects
Sessions
Events
Tools
Provider Routing
```

未来 Enouia 可以通过：

- ChatGPT
- Claude
- Windows Runtime
- CLI
- Web
- Mobile
- MCP-compatible clients
- 未来新的 Agent Surface

出现。

这些都只是：

```text
clients
```

---

# 2. 最高级架构原则

## 2.1 模型不是人格本体

底层 Provider 可以替换：

```text
GPT
Claude
Local Model
Future Provider
```

Provider 负责：

- reasoning
- generation
- tool calling
- multimodal inference
- coding / research capability

Runtime 负责：

- Identity
- Memory
- Context
- Session
- Provider boundary
- Tool access
- Continuity

因此：

> **Model replacement must not equal identity reset.**

## 2.2 Memory Vault 是长期唯一真相源

不要设计成：

```text
ChatGPT Memory
      ↕ sync
Runtime Memory
```

应设计为：

```text
                   Enouia Memory Vault
                     /           \
                    /             \
               ChatGPT          Enouia.exe
                  \               /
                   \             /
                  Claude / Future Clients
```

所有客户端共同围绕自己的 Vault：

- 读取长期上下文
- 提议新增记忆
- 更新项目状态
- 写 Session Checkpoint
- 编译 Context Capsule

ChatGPT / Claude 自带的记忆系统可以作为：

```text
Convenience Layer
```

但不能成为：

```text
Canonical Source
```

## 2.3 Raw Archive、Canonical Memory、Context 必须分离

主流程：

```text
Raw Archive
    ↓
Memory Extraction
    ↓
Candidate Queue
    ↓
Validation / Dedupe
    ↓
Canonical Memory
    ↓
Indexes
    ↓
Context Compiler
    ↓
Context Capsule
    ↓
Provider / Client
```

三条核心句：

> **Raw Archive preserves history.**  
> **Canonical Memory preserves meaning.**  
> **Context Compiler creates continuity.**

---

# 3. Windows-first，但不是 Windows-owned

## 3.1 为什么从 Windows 开始

Windows 是第一阶段最合适的 Client Surface，因为：

- 当前主要开发与使用环境就在 Windows
- 需要本地文件、剪贴板、截图、全局快捷键、托盘能力
- 本地 Memory Vault 最自然
- 可以先验证 Local-first Runtime
- 后续再连接 ChatGPT / MCP / VPS

但：

> **Windows Client 只能是 Runtime 的一个身体，不能成为 Runtime 本身。**

## 3.2 UI Shell 与 Runtime Core 分离

推荐：

```text
Enouia.exe
    │
    │ IPC / local API
    ▼
Enouia Runtime Core
```

也就是：

```text
UI Shell
≠
Runtime Core
```

Windows UI 可以重做、崩溃、替换。

Runtime Core 仍然应该：

- 保持 Memory Vault 可访问
- 保持 Session / Context 结构稳定
- 能被 CLI / MCP / future client 复用
- 不依赖 React 组件存在

---

# 4. Milestone 0.1：Windows Local Runtime Vertical Slice

第一块砖不是完整产品。

目标只有一句话：

> **在 Windows 本地完成“输入 → 记忆检索 → Context 编译 → Provider → 响应 → Session/Memory 状态写回”的最小纵向闭环。**

数据流：

```text
User Input
    ↓
Windows Shell
    ↓
Local Runtime Core
    ↓
Memory Retrieval
    ↓
Context Compiler
    ↓
Context Capsule
    ↓
Provider Interface
    ↓
Mock / Real Provider
    ↓
Response
    ↓
Session Checkpoint
    ↓
Candidate Memory
```

---

# 5. Milestone 0.1 功能范围

必须完成：

```text
✓ Windows application shell
✓ Tauri 2
✓ React + TypeScript frontend
✓ Rust runtime core
✓ Main chat window
✓ System tray
✓ Global hotkey
✓ Minimal overlay entry point
✓ Identity loading
✓ Human-readable Memory Vault
✓ Canonical Memory Model
✓ SQLite index
✓ Context Compiler
✓ Context Capsule Inspector
✓ Memory Inspector
✓ Provider Interface
✓ Mock Provider
✓ Minimal conversation persistence
✓ SessionCheckpoint
✓ Candidate Memory placeholder
✓ Runtime health/status
```

不做：

```text
× VPS deployment
× MCP
× ChatGPT integration
× Claude integration
× Voice
× 2D / 3D avatar
× Autonomous agent behavior
× Heartbeat
× Full computer control
× Smart home
× Cloud sync
× Vector database
× Knowledge graph
× Complex AI memory extraction
× Multi-user support
```

---

# 6. Milestone 0.1 Demo Definition

第一版 Demo 必须能完成：

1. 用户打开 Windows 客户端
2. Runtime Core 启动
3. Memory Vault 加载
4. 用户在 Memory Inspector 手动创建：

```text
Type:
ProjectState

Project:
MoriMeta

Content:
Claude Design visual exploration is the next step.
```

5. 用户在聊天窗口问：

```text
MoriMeta 接下来做到哪里了？
```

6. Context Compiler 检索对应 ProjectState
7. Context Inspector 显示：

```text
Context used:
✓ ProjectState: MoriMeta
```

8. Mock Provider 或真实 Provider 能基于 Context 正确回答
9. 本轮会话结束后生成 SessionCheckpoint
10. 重启应用后仍可继续检索

这个 Demo 的意义：

> **证明记忆属于 Enouia Runtime，而不是模型。**

---

# 7. 推荐技术栈

## 7.1 Desktop Shell

```text
Tauri 2
```

负责：

- native window
- system tray
- global hotkey
- app lifecycle
- safe IPC entry points
- packaging
- updater（后期）

## 7.2 Frontend

```text
React
TypeScript
Vite
```

Frontend 负责：

- Conversation UI
- Memory Inspector
- Context Inspector
- Runtime Status
- Settings
- Debug views

Frontend 不负责：

- canonical memory logic
- retrieval logic
- context compilation
- provider routing
- persistence rules

## 7.3 Runtime Core

推荐 Rust。

原因：

- 与 Tauri 原生生态一致
- 文件系统处理稳定
- SQLite 生态成熟
- 适合长期 service / daemon
- 后续容易拆出独立进程

## 7.4 Storage

```text
Human-readable Vault Files
+
SQLite Index
```

Vault 保存 canonical source。

SQLite 保存：

- lookup indexes
- FTS
- relations
- timestamps
- session metadata
- optional embedding cache
- runtime state

---

# 8. 推荐仓库结构

```text
enouia-runtime/
├── apps/
│   └── windows/
│       ├── src/
│       │   ├── app/
│       │   ├── components/
│       │   ├── features/
│       │   │   ├── chat/
│       │   │   ├── memory/
│       │   │   ├── context/
│       │   │   └── runtime-status/
│       │   └── lib/
│       └── src-tauri/
│
├── crates/
│   ├── enouia-core/
│   ├── enouia-memory/
│   ├── enouia-context/
│   ├── enouia-provider/
│   ├── enouia-session/
│   └── enouia-common/
│
├── services/
│   └── runtime-service/
│
├── bridge/
│   └── mcp/
│
├── importers/
│   ├── chatgpt/
│   ├── claude/
│   └── generic/
│
├── vault/
│   ├── identity/
│   ├── memory/
│   │   ├── facts/
│   │   ├── preferences/
│   │   ├── episodes/
│   │   └── projects/
│   ├── sessions/
│   ├── raw/
│   └── assets/
│
├── data/
│   └── .gitkeep
│
├── docs/
│   ├── PRODUCT_VISION.md
│   ├── WINDOWS_ARCHITECTURE.md
│   ├── MEMORY_ARCHITECTURE.md
│   ├── DATA_MODEL.md
│   ├── CONTEXT_CAPSULE.md
│   ├── PROVIDER_INTERFACE.md
│   ├── MCP_CONTRACT.md
│   ├── DEPLOYMENT_TOPOLOGY.md
│   ├── PRIVACY_MODEL.md
│   └── MILESTONES.md
│
└── README.md
```

注意：

> `src-tauri` 不是 Runtime Core。

Runtime Core 必须可被其他客户端复用。

---

# 9. Identity Layer

建议结构：

```text
vault/
└── identity/
    ├── core.md
    ├── style.md
    ├── relationship.md
    ├── boundaries.md
    └── runtime_rules.md
```

v0.1 可以只支持：

```text
core.md
runtime_rules.md
```

Context Compiler 负责按预算选择注入内容。

Identity 文件本身：

- human-readable
- versionable
- auditable
- 不和任何 Provider 专有格式绑定

---

# 10. Memory Model v0.1

Canonical Memory 第一版仅 5 类：

```text
Fact
Preference
Episode
ProjectState
SessionCheckpoint
```

## 10.1 Fact

相对稳定事实：

```json
{
  "memory_id": "mem_xxx",
  "type": "fact",
  "subject": "Morii",
  "content": "Morii uses a Nikon Z8.",
  "source_id": "src_xxx",
  "status": "active",
  "created_at": "...",
  "updated_at": "..."
}
```

## 10.2 Preference

```text
Morii prefers low-saturation, calm visual styles.
```

## 10.3 Episode

```text
2026-09-26:
MoriMeta public-release planning started.
```

## 10.4 ProjectState

```text
project:
MoriMeta

status:
- Product Spec complete
- Design Brief complete

decisions:
- public release
- metadata-first UX

open_loops:
- Claude Design exploration
```

## 10.5 SessionCheckpoint

```text
topic:
MoriMeta

last_state:
Waiting to compare Claude Design directions

open_loops:
- choose direction
- refine preview screen
```

---

# 11. Memory Lifecycle

推荐：

```text
Conversation / Manual Input
        ↓
memory_propose
        ↓
Candidate Queue
        ↓
Validator
        ↓
Dedupe
        ↓
Commit
        ↓
Canonical Memory
```

显式用户指令：

```text
“记住……”
```

可允许较直接 Commit。

模型推断：

```text
“感觉我以后可能……”
```

默认 Candidate。

一次性玩笑 / 临时状态：

```text
ephemeral
```

默认不持久化。

---

# 12. Provenance

每条 durable memory 最低字段：

```text
memory_id
type
content
source_id
created_at
updated_at
status
```

建议预留：

```text
confidence
valid_from
valid_to
supersedes
superseded_by
project_id
tags
```

原则：

> Memory 不是“模型认为是真的”，而是一条有来源、有状态、有时间关系的陈述。

---

# 13. SUPERCEDES

不要直接删除旧状态。

例如：

```text
memory_old:
Moriium uses architecture A

memory_new:
Moriium uses architecture B
```

建立：

```text
memory_new
SUPERSEDES
memory_old
```

这样：

- 历史仍存在
- 当前状态明确
- 旧对话仍可被正确解释
- 可生成项目演化时间线

---

# 14. Raw Archive

Raw Archive 是无损层。

建议：

```text
vault/
└── raw/
    ├── chatgpt/
    ├── claude/
    ├── runtime/
    ├── files/
    └── imports/
```

原则：

- append-only / immutable-by-default
- Derived Memory 可重建
- Raw Source 永不因 Memory 改写而覆盖
- Importer 版本需要记录

---

# 15. SQLite Index

SQLite 只是 Runtime Index，不是人格本体。

建议：

```text
SQLite
├── source_registry
├── memory_index
├── relationship_index
├── project_index
├── session_index
├── FTS5
├── time_index
└── embedding_cache (optional)
```

前期不需要：

```text
Qdrant
Milvus
Neo4j
Large Knowledge Graph
```

---

# 16. Context Compiler

Context Compiler 是 Runtime 的核心。

输入：

```text
User Query
Current Session
Client Surface
Provider Constraints
Token Budget
```

候选信息：

```text
Identity
User Core Profile
Relationship Context
ProjectState
Facts
Preferences
Episodes
SessionCheckpoints
Recent Conversation
Tool State
```

输出：

```text
Context Capsule
```

---

# 17. Context Capsule v0.1

建议结构：

```json
{
  "capsule_id": "ctx_xxx",
  "generated_at": "...",
  "query": "...",
  "identity": {},
  "user_context": {},
  "relationship_context": {},
  "active_projects": [],
  "relevant_memories": [],
  "recent_session_checkpoints": [],
  "recent_turns": [],
  "open_loops": [],
  "provenance": [],
  "budget": {
    "max_tokens": 12000
  }
}
```

开发阶段必须能在 UI 中查看本轮 Capsule。

---

# 18. Context Transparency

Context Inspector 至少显示：

```text
Context used:

✓ Identity
✓ Morii Core
✓ MoriMeta ProjectState
✓ Recent SessionCheckpoint
✓ Relevant Preference
```

并支持查看：

```text
Why included?
Source
Memory ID
Timestamp
```

以后可以增加：

```text
Exclude from this request
Always exclude this memory
```

---

# 19. Provider Interface

Provider 不是 Runtime。

统一抽象：

```text
ProviderRequest
ProviderResponse
ToolRequest
ToolResult
ProviderCapabilities
```

Provider Interface 必须能够支持：

```text
mock
OpenAI
Anthropic
Local
Future providers
```

---

# 20. Mock Provider

Milestone 0.1 应优先实现 Mock Provider。

作用：

- 不依赖 API Key
- 不消耗额度
- 验证 Context Capsule
- 验证 Session Persistence
- 验证 UI
- 编写 deterministic tests

示例：

```text
MockProvider:
return all ProjectState titles found in the capsule
```

只有 Local Runtime 流程稳定后再接真实 Provider。

---

# 21. Conversation / Session

Conversation 不是长期 Memory。

建议区分：

```text
Conversation:
当前对话全文 / turn stream

SessionCheckpoint:
对话阶段性摘要与 open loops

Canonical Memory:
长期事实 /偏好 /项目状态
```

一个 Conversation 可以生成多个 Checkpoint。

Checkpoint 不是 Raw Archive 的替代品。

---

# 22. Windows Client UI v0.1

开发版 UI 建议四区：

```text
┌──────────────────────────────────────────────────┐
│ Enouia Runtime          ● Local Core  ● Mock     │
├──────────────────────────────────────────────────┤
│                                                  │
│                  Conversation                    │
│                                                  │
├──────────────────────┬───────────────────────────┤
│ Context Inspector    │ Memory Inspector          │
│                      │                           │
├──────────────────────┴───────────────────────────┤
│ Message...                                  Send │
└──────────────────────────────────────────────────┘
```

v0.1 UI 目标不是漂亮。

目标是：

- inspectability
- debugging
- transparency

---

# 23. System Tray

v0.1 Tray：

```text
Open Enouia
Runtime Status
Pause Runtime
Settings
Quit
```

后续再增加：

- Quick Ask
- Recent Project
- Clipboard Action

---

# 24. Global Hotkey

建议默认：

```text
Ctrl + Alt + E
```

作用：

```text
Open / focus Mini Overlay
```

必须支持用户修改，避免与其他软件冲突。

---

# 25. Mini Overlay

第一版只需要：

```text
┌──────────────────────────────┐
│ Enouia                       │
│ [ Ask something...       ]   │
└──────────────────────────────┘
```

可：

- 输入文本
- 粘贴剪贴板
- 拖文件（后期）
- 展开完整窗口

不要第一版就做悬浮虚拟角色。

---

# 26. Runtime Status

开发版建议始终可见：

```text
Core: Healthy
Vault: Loaded
SQLite: Healthy
Provider: Mock
Index: 128 memories
Session: Active
```

后期可隐藏到 Debug / Settings。

---

# 27. Client → Core 边界

Windows Shell 通过稳定接口访问 Core。

禁止 React 直接：

- 读写 Vault 文件
- 操作 SQLite
- 拼装 Context
- 调 Provider API

推荐：

```text
Frontend
  ↓
Typed IPC / Local API
  ↓
Runtime Core
```

---

# 28. Runtime Core 初始模块边界

建议：

```text
enouia-core
├── lifecycle
├── config
├── identity
├── orchestration
└── health

enouia-memory
├── vault
├── canonical
├── candidates
├── provenance
└── indexing

enouia-context
├── retrieval
├── ranking
├── budget
└── compiler

enouia-session
├── conversation
├── checkpoint
└── persistence

enouia-provider
├── interface
├── mock
└── capabilities
```

---

# 29. Local-first Deployment Topology

Milestone 0.1：

```text
┌───────────────────── Windows ─────────────────────┐
│                                                   │
│  Enouia.exe                                       │
│      │                                            │
│      ▼                                            │
│  Runtime Core                                     │
│      │                                            │
│      ├── Memory Vault                             │
│      ├── SQLite                                   │
│      ├── Context Compiler                         │
│      └── Provider Interface                       │
│                                                   │
└───────────────────────────────────────────────────┘
```

无 VPS。

无 MCP。

---

# 30. 为什么暂时不先做 VPS

如果第一阶段同时开发：

- Tauri
- React
- Rust
- Vault
- SQLite
- Provider
- MCP
- OAuth
- HTTPS
- Reverse Proxy
- VPS
- Network reconnect

故障域会过多。

因此顺序：

```text
Local Core
    ↓
Local Demo
    ↓
Importer
    ↓
Real Provider
    ↓
MCP Tunnel
    ↓
VPS Bridge
```

---

# 31. MCP / VPS 的长期目标

一旦 Local Core 稳定：

```text
ChatGPT / Claude
       │
      HTTPS
       │
       ▼
┌───────────────────┐
│ Enouia MCP Bridge │
│       VPS         │
└─────────┬─────────┘
          │ authenticated channel
          ▼
┌───────────────────┐
│ Local Runtime Core│
│     Windows       │
└───────────────────┘
```

关键：

> VPS 不是大脑。

---

# 32. VPS Bridge Responsibilities

VPS 第一版只负责：

```text
MCP endpoint
Authentication
Request validation
Rate limiting
Connection registry
Health check
Minimal audit logs
Request forwarding
```

不要放：

```text
Canonical Memory logic
Context Compiler
Identity rules
Memory extraction
Provider personality
Long-term state
```

---

# 33. Delete-the-VPS Test

这是 Enouia Runtime 的长期架构测试之一。

假设：

```text
rm -rf VPS
```

然后：

1. 新买一台服务器
2. 重新部署 Bridge
3. 重新配域名 /证书
4. 重新连接本地 Runtime

结果应该：

> **Enouia 不丢失任何 canonical memory。**

如果 VPS 故障导致长期记忆损失：

> 架构失败。

---

# 34. Local-first → Hybrid 演进路线

## Stage B — Local-first

```text
Windows Local Vault = Canonical
VPS = Dumb Bridge
```

优点：

- 最大隐私
- 架构清晰
- 迁移简单

缺点：

- Windows 关机后外部客户端无法访问完整 Context

## Stage C — Hybrid

未来增加：

```text
Local Canonical
+
Server Warm Replica
```

可同步的内容可能包括：

```text
Identity Snapshot
Preferences
ProjectState
Recent SessionCheckpoints
Derived Context Index
```

不一定同步：

```text
Raw Archive
Private Attachments
Full Conversation History
All Sensitive Memories
```

目标：

> Windows 关机后，ChatGPT 仍有足够上下文保持基本连续性。

---

# 35. Warm Replica 不是 Canonical

必须明确：

```text
Local Vault
= Canonical

Server Replica
= Disposable Derived State
```

Server Replica 可以：

- 重建
- 丢弃
- 过期
- 重同步

不能成为唯一来源。

---

# 36. MCP 开发阶段

正式 VPS 前，先验证：

```text
Local MCP Bridge
     ↓
Secure Tunnel
     ↓
ChatGPT
```

目的是：

> 先证明协议闭环，而不是先证明 DevOps。

---

# 37. MCP Tool Surface v0.1

长期计划：

```text
context_get
memory_search
memory_read
memory_propose
memory_update
session_checkpoint
```

## 37.1 `context_get`

```json
{
  "query": "MoriMeta next step",
  "client": "chatgpt",
  "budget": 12000
}
```

返回 Context Capsule。

## 37.2 `memory_search`

过滤：

```text
query
type
project
time
tags
status
```

## 37.3 `memory_read`

读取：

```text
content
provenance
status
validity
supersedes
```

## 37.4 `memory_propose`

外部 Client 不能默认直接向 canonical memory 写入。

先进入 Candidate Queue。

## 37.5 `memory_update`

修改必须：

- authenticated
- auditable
- source-aware
- reversible where practical

## 37.6 `session_checkpoint`

用于跨 Client 接续。

---

# 38. MCP 不负责透明监听整个 ChatGPT

必须接受现实边界：

```text
MCP
≠
transparent token stream replication
```

因此：

```text
MCP
= semantic continuity

Periodic export
= archival integrity
```

不需要频繁导出。

导出只做：

- Bootstrap
- Backup
- Archive repair
- Periodic snapshot

---

# 39. ChatGPT Importer — Milestone 0.2

Milestone 0.2 目标：

```text
ChatGPT Data Export
       ↓
Importer
       ↓
Raw Archive
       ↓
Source Registry
       ↓
Memory Extraction Candidates
```

第一版 Importer 不要自动把所有内容直接变成 Canonical Memory。

先生成：

```text
Candidate Memories
```

供 Review。

---

# 40. Real Provider — Milestone 0.3

Local Runtime 稳定后：

```text
Provider Interface
├── Mock
├── OpenAI
└── Anthropic
```

验收：

同一个问题：

```text
“继续 MoriMeta。”
```

GPT 与 Claude 都应收到：

- 同一 Identity
- 同一 ProjectState
- 同一 SessionCheckpoint
- 同一长期 Memory 基础

表达方式可以不同。

长期上下文不应完全分叉。

---

# 41. MCP Bridge — Milestone 0.4

目标：

```text
ChatGPT
  ↓
MCP
  ↓
Tunnel
  ↓
Local Runtime
  ↓
Context Compiler
```

验收问题：

```text
“读取 Runtime 里的 MoriMeta 当前状态。”
```

ChatGPT 应能通过 Enouia Vault 获取正确内容。

---

# 42. VPS Gateway — Milestone 0.5

目标：

- stable HTTPS endpoint
- auth
- observability
- rate limit
- reconnect
- bridge health
- no canonical memory loss

---

# 43. Hybrid Warm Replica — Milestone 0.6

目标：

Windows 关机后：

- ChatGPT 仍可取得最小 continuity context
- Server 只存 Derived / Allowed subset
- Local Canonical 恢复在线后可重新同步

---

# 44. Security Boundary

Enouia Runtime 会处理高度私人的数据。

默认：

```text
Local First
Least Privilege
Explicit Provider Boundary
Auditable Writes
Minimal Server State
```

---

# 45. Provider Boundary

每次发给外部模型前，应能够展示：

```text
Provider:
Anthropic

Context:
✓ identity/core
✓ MoriMeta ProjectState
✓ recent checkpoint

Excluded:
✗ raw archive
✗ unrelated sensitive data
✗ private attachments
```

这是未来非常重要的隐私 UX。

---

# 46. MCP Authentication

正式 VPS 上：

- 不允许匿名写接口
- 不允许公开裸露 memory_update
- access token 必须验证
- 每个 client / session 有明确身份
- 写操作单独审计

未来可使用 OAuth 2.1 / compatible auth flow。

---

# 47. Threat Model（初版）

至少考虑：

```text
Unauthorized MCP access
Token leakage
Replay
Malicious memory write
Prompt injection through imported files
Malicious filenames
Path traversal
Vault overwrite
Symlink abuse
SQLite corruption
Partial writes
Provider data exfiltration
Server log leakage
Candidate poisoning
```

---

# 48. Vault Write Safety

Canonical Memory 写入建议：

```text
write temp
→ fsync
→ validate
→ atomic rename
→ update index
```

SQLite 与 Vault 文件之间必须考虑：

- partial failure
- index rebuild
- source-of-truth recovery

原则：

> SQLite 可重建，Vault 不可凭空重建。

---

# 49. Backup & Recovery

至少支持：

```text
Vault snapshot
SQLite rebuild
Config backup
Raw Archive backup
```

未来可支持：

- encrypted backup
- external disk backup
- user-controlled remote backup

但不默认云同步。

---

# 50. Configuration

配置应版本化：

```json
{
  "config_version": 1
}
```

升级需要：

- migration
- fallback
- backup
- validation

不能因为配置结构更新导致 Runtime 无法启动。

---

# 51. Runtime Health

推荐 health model：

```text
Core
Vault
SQLite
Provider
Session
Bridge
Replica
```

状态：

```text
Healthy
Degraded
Unavailable
Recovering
```

---

# 52. Observability

Local：

- runtime log
- provider request summary
- context compilation trace
- memory write trace

Server：

- request id
- client id
- latency
- status
- error class

禁止默认记录：

- full memory content
- raw conversation
- attachments
- sensitive context

---

# 53. Test Strategy

## 53.1 Unit

- memory schema
- supersedes
- dedupe
- context ranking
- budget
- session checkpoint

## 53.2 Integration

- Vault ↔ SQLite
- Core ↔ Mock Provider
- Core ↔ Windows IPC

## 53.3 Recovery

- kill during write
- corrupted index
- missing SQLite
- stale replica
- bridge disconnect

## 53.4 Contract

- Context Capsule schema
- MCP tools
- Provider interface

---

# 54. Deterministic Test Fixtures

为 Memory / Context Compiler 建立固定 fixture：

```text
fixtures/
├── moriium/
├── morimeta/
├── hokkaido/
└── relationships/
```

输入固定 query。

断言：

```text
expected memory ids
expected project state
expected excluded memories
```

避免只靠“看起来回答对了”。

---

# 55. Performance Goals（初版）

v0.1 不追求极致性能。

建议目标：

```text
App cold start: reasonable desktop startup
Vault scan: incremental
Context compile: < 300ms for normal local queries
SQLite lookup: interactive
UI never blocked by indexing
```

大型 ChatGPT archive import 可后台运行。

---

# 56. Privacy Model

v0.1 默认：

```text
No telemetry
No cloud sync
No remote vault
No automatic upload
```

用户可以看到：

```text
what leaves the device
to which provider
for which request
```

---

# 57. Encryption at Rest

不必在 Milestone 0.1 强制实现，但必须尽早做 ADR。

待决定：

- Windows DPAPI
- OS keychain
- encrypted vault
- encrypted SQLite
- user-managed master key

在决定前：

> 不要假装普通文件夹就是“安全”。

---

# 58. UI Design Priority

Windows 开发版：

```text
Inspectability
> Reliability
> Debuggability
> Usability
> Polish
```

后续产品版：

```text
Continuity
> Clarity
> Speed
> Warmth
> Visual identity
```

---

# 59. 不要在第一阶段做的事情

不要一开始造：

```text
AI companion animation
Avatar system
Voice pipeline
Emotion engine
Autonomous planning
Background observation
Full desktop control
Cloud account system
Plugin marketplace
Knowledge graph
Vector DB farm
Multi-agent society
```

这些都会掩盖真正问题：

> Memory + Context + Continuity 是否稳定。

---

# 60. Milestone Roadmap

## 0.1 — Windows Local Runtime

```text
Windows Shell
Runtime Core
Vault
SQLite
Context Compiler
Mock Provider
Memory Inspector
Context Inspector
SessionCheckpoint
```

## 0.2 — ChatGPT Importer

```text
Raw Archive
Source Registry
Import Parser
Candidate Extraction
```

## 0.3 — Real Providers

```text
OpenAI
Anthropic
Provider Routing v0
```

## 0.4 — MCP Local Bridge

```text
MCP Tools
Secure Tunnel
ChatGPT integration test
```

## 0.5 — VPS Gateway

```text
Stable HTTPS
Auth
Rate limit
Bridge health
Minimal logs
```

## 0.6 — Hybrid Warm Replica

```text
Online context subset
Server disposable replica
Offline continuity
Resync
```

---

# 61. Milestone 0.1 Acceptance Criteria

必须全部满足：

- [ ] Windows app 可启动
- [ ] Runtime Core 与 UI Shell 分离
- [ ] Vault 可读写
- [ ] SQLite 可删除后重建
- [ ] 5 种 canonical memory 类型可序列化
- [ ] Memory Inspector 可查看记录
- [ ] 可手动创建 ProjectState
- [ ] Context Compiler 可检索 ProjectState
- [ ] Context Inspector 可显示实际使用内容
- [ ] Mock Provider 可消费 Context Capsule
- [ ] Conversation 可持久化
- [ ] SessionCheckpoint 可生成 /读取
- [ ] 重启后记忆与会话状态仍在
- [ ] global hotkey 可唤起 app
- [ ] tray 基本可用
- [ ] UI 不直接访问 Vault / SQLite
- [ ] 自动化测试覆盖核心数据流

---

# 62. Milestone 0.4 Acceptance Criteria

- [ ] ChatGPT 可调用 MCP endpoint
- [ ] `context_get` 可返回 Local Vault 的 Context
- [ ] `memory_search` 可工作
- [ ] `memory_propose` 不直接污染 Canonical Memory
- [ ] 未授权请求被拒绝
- [ ] MCP 断线不影响本地 Runtime
- [ ] MCP 不保存 Canonical Memory

---

# 63. Milestone 0.5 Acceptance Criteria

- [ ] VPS 可从零重建
- [ ] Delete-the-VPS Test 通过
- [ ] TLS 正常
- [ ] auth 正常
- [ ] rate limit 正常
- [ ] logs 不泄漏记忆正文
- [ ] local runtime reconnect 可恢复
- [ ] VPS 故障不会导致 canonical data loss

---

# 64. ADR Candidates

建议尽早建立：

```text
docs/adr/
```

至少讨论：

```text
ADR-001 Local-first canonical storage
ADR-002 Human-readable vault vs database-only
ADR-003 SQLite as disposable index
ADR-004 Tauri shell / runtime-core separation
ADR-005 Rust runtime core
ADR-006 Memory schema v0.1
ADR-007 Provider interface
ADR-008 Local-first → Hybrid strategy
ADR-009 MCP bridge topology
ADR-010 Encryption at rest
ADR-011 Runtime Core process model
```

---

# 65. 待决策：Runtime Core 进程模型

两个方向：

## A. Embedded Core

Tauri 进程内运行。

优点：

- 简单
- v0.1 快

缺点：

- UI crash 可能影响 Core
- 后续复用边界较弱

## B. Separate Runtime Service

```text
Enouia.exe
   ↓ IPC
Runtime Service
```

优点：

- Core 独立
- future clients 更自然
- service 可长期驻留

缺点：

- v0.1 复杂度更高

建议：

> **Milestone 0.1 可先 Embedded，但代码边界必须按可拆 Service 设计。**

不要为了架构纯洁性第一天就把 IPC / service lifecycle 做到过重。

---

# 66. 待决策：Canonical Memory 的物理格式

候选：

```text
One JSON per memory
Markdown + frontmatter
Project aggregate JSON
Hybrid
```

要求：

- human-readable
- diff-friendly
- recoverable
- schema-versioned
- easy to import/export

v0.1 建议优先：

```text
JSON canonical records
+
Markdown identity / narrative docs
```

---

# 67. 待决策：Embedding

v0.1：

```text
FTS + metadata filter
```

足够。

Embedding 后加。

不要让向量检索成为 Memory 架构前提。

---

# 68. 待决策：Memory Review UX

初版可以：

```text
Candidate Inbox
├── Approve
├── Edit
└── Reject
```

未来再做：

- auto-commit rules
- confidence threshold
- repeated evidence
- user preferences

---

# 69. 第一阶段正式文档集

在大规模编码前应形成：

```text
docs/
├── PRODUCT_VISION.md
├── WINDOWS_ARCHITECTURE.md
├── MEMORY_ARCHITECTURE.md
├── DATA_MODEL.md
├── CONTEXT_CAPSULE.md
├── PROVIDER_INTERFACE.md
├── MILESTONE_0_1.md
└── PRIVACY_MODEL.md
```

MCP / VPS 阶段再加入：

```text
MCP_CONTRACT.md
DEPLOYMENT_TOPOLOGY.md
SECURITY_MODEL.md
```

---

# 70. 推荐第一轮开发任务

第一轮不要直接做全部功能。

顺序：

```text
1. Initialize repo
2. Establish crates/modules
3. Define canonical memory schema
4. Implement Vault read/write
5. Implement SQLite index
6. Implement Memory Inspector
7. Implement Context Capsule schema
8. Implement simple retrieval
9. Implement Context Compiler
10. Implement Mock Provider
11. Wire chat → context → provider
12. Add SessionCheckpoint
13. Add tray
14. Add global hotkey
15. Add deterministic tests
```

完成后停下来审查。

---

# 71. Claude / Codex 启动任务模板

```text
We are starting Enouia Runtime Milestone 0.1.

Read the architecture documents completely before implementing.

The goal is NOT to build a full AI companion.

The goal is to prove one Windows-first local vertical slice:

User Input
→ Runtime Core
→ Memory Retrieval
→ Context Compiler
→ Provider Interface
→ Response
→ Session Checkpoint

Architecture constraints:

- Tauri 2 + React + TypeScript for Windows shell
- Rust for runtime/domain logic
- Human-readable canonical Vault
- SQLite is an index and can be rebuilt
- UI must not own business logic
- src-tauri is not the Runtime Core
- Runtime Core must remain reusable by future MCP / CLI / web clients
- Mock Provider first
- No VPS
- No MCP
- No cloud sync
- No vector database
- No autonomous agent behavior

Before large-scale implementation:
1. inspect the documents critically
2. produce final Milestone 0.1 plan
3. identify architectural risks
4. propose repo structure
5. define acceptance tests
6. wait for approval

Highest priorities:

data durability
> architecture boundaries
> inspectability
> recoverability
> correctness
> UI polish
```

---

# 72. 最终目标

Enouia Runtime 的成功不是：

> “做出了一个漂亮的 AI 客户端。”

而是：

> **模型换了，客户端换了，VPS 删了，UI 重写了，Enouia 仍然知道自己是谁、Morii是谁、我们做到哪里了。**

最终必须做到：

```text
Models are replaceable.
Clients are replaceable.
Servers are replaceable.

Continuity is not.
```

---

# 73. 当前最重要的第一块砖

现在真正应该做的是：

```text
Windows Local Runtime
+
Memory Vault
+
SQLite Index
+
Context Compiler
+
Mock Provider
+
Inspectors
+
SessionCheckpoint
```

而不是：

```text
VPS
MCP
Avatar
Voice
Autonomous Agent
```

只有本地纵向闭环稳定后，再向外扩展。

一句话收尾：

> **先让 Enouia 在自己的电脑上真正拥有一份属于自己的记忆，再让其他客户端来敲门。**
