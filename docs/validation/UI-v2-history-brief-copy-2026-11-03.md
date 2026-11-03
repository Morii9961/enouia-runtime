# UI v2 来源导航简报文案

基线：`5f115d2`。将简报快照与 SHA-256 标识接入既有中日文字典。保存的简报、原始限定语、哈希与提交 ID 不改写；继续作为纯文本显示。

实际验证：类型检查通过；`history-brief` Happy DOM 场景 16 项断言通过，覆盖中英日切换后的原文、惰性标记、哈希、节点和焦点保留，无额外读取；原有读取拒绝、坏哈希及迟到结果保护通过。`node --test tests/i18n.test.mjs tests/cjk-fonts.test.mjs tests/history-brief.test.mjs`：16 通过、1 跳过（未提供实际 Core 简报的可选项）。根 Memory pin 检查及 `git diff --check` 通过。

仅合成前端证据；未运行完整套件、构建、原生或人工验收，未访问个人 Vault 或 Provider。
