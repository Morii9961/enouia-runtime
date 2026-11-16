# Runtime 接续提示词（2026-11-16）

在Enouia Runtime项目工作，使用中文。先读AGENTS.md、docs/integration/RUNTIME_ROADMAP_2026-11-16.md、docs/MEMORY_INTEGRATION_v1.md和docs/integration/memory-pin.json；状态快照不是已安装状态。

Morii要求整理状态/路线后开启GPT-6.1 Sol high新会话继续。第一片为R1：核实Memory已合并ADR146文字视图回放兼容要求，采用最小合适的已合并精确pin/aggregate，同步锁文件并必要验证。此前eb70509采用已完成，但不覆盖ADR146。不要重做Memory fresh驱动，不修改Memory仓库或合并其PR。

先核对本地/在线main、工作树与未提交修改，保留.claude和不明资料。清理已在新会话创建前执行，以启动消息为准。构建缓存缺失时按锁文件恢复，不升级依赖，不把缓存缺失误认作业务回归；不共用其他工作树target或调用未知CLI。

R1不启动正式Owner GUI、个人库打开/迁移、真实Provider、读取授权、安装或部署。必须执行node scripts/check-memory-integration.mjs，其他检查按配方及风险；未跑不写通过。验证后提交（保留Codex co-author trailer）、推送、开PR，按Runtime既有授权合并。

R1与Memory建库可并行。随后核对工程交付，准备R2最小打开/检索/来源/锁定重开入口的具体建议，未决定产品范围前不实现。旧5175284不是新Owner候选；新候选和日用验收按R3边界。云端、自动采集另排，不操作Dashboard或刷新手动状态快照。

第一条回复简述核实基线与本片范围，然后直接推进R1，不重复询问已授权常规开发/PR合并，不重复无关测试矩阵。
