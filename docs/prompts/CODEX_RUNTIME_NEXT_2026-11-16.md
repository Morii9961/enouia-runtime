# Runtime 接续提示词（2026-11-16 建立，11-17 更新）

在Enouia Runtime项目工作，使用中文。先读AGENTS.md、docs/integration/RUNTIME_ROADMAP_2026-11-16.md、docs/MEMORY_INTEGRATION_v1.md和docs/integration/memory-pin.json；状态快照不是已安装状态。

R1已实施并完成本机合成验证：Memory采用已合并PR111的a543c1eb81e5d7150ebe7820592eea35a9042697，aggregate为723ec245e7ddcd0c5a5a81b84ac1cb7bbd794c99dab0ed99e4e88b480971d50f，仍为61命令。先核对本地/云端Git和本片PR是否已合并，不重复做兼容采用。证据在docs/validation/Memory-pin-a543c1e-2026-11-16.md；包括最终原生目录39/39，也保留先前权限失败、进程中断、归属拒绝与busy超时，不能宣称偶发问题已修复。

先核对本地/在线main、工作树与未提交修改，保留.claude和不明资料。清理已在新会话创建前执行，以启动消息为准。构建缓存缺失时按锁文件恢复，不升级依赖，不把缓存缺失误认作业务回归；不共用其他工作树target或调用未知CLI。

Morii在11月17日要求继续按路线持续推进，最小只读范围据此继续。PR181已采用已有System catalog的memory_detail_native与memory_source_excerpt_native，不能再把它们误报为Memory契约缺失；原生42/42，见docs/validation/Catalog-native-detail-source-2026-11-17.md。PR182已明确两个ADR037的引用别名。随后ADR038切片增加显式受信任原生启动参数，读取原OS账户/home/operation登记的同一Owner根，锁定释放句柄，页面不能重认证；桌面合成14/14，见docs/validation/Registered-owner-readonly-2026-11-17.md和docs/integration/REGISTERED_OWNER_READONLY.md。先核对该切片当前PR/main，不重复实现。

下一片统一独立只读入口的壳层状态和Home/Settings提示，保持旧Workspace真实为none，不能把新根伪装成v1 Vault或承诺Context/Sessions已接通。图形目录选择的认证入口仍另核；不能把页面请求路由到bootstrap CLI，也不能用同账户进程事实单独证明人的授权。不创建OwnerReadGrant或复用形成策略授予长期读取；个人库打开/迁移、真实Provider、安装或部署仍不在当前开发执行范围。

Memory另一个会话负责真实建库、工程交付与独立恢复，不修改Memory仓库或合并其待审PR、不重做fresh驱动。Runtime只核对公共工程交付，不读取私人材料。旧5175284仍含731edd56，不是新Owner候选；本片构建程序也不是R3交付包。新候选和日用验收按R3边界；云端、自动采集另排，不操作Dashboard或刷新手动状态快照。

真实验收另核授权。专用登记合成home在非Git/非临时目录，由显式ignored测试创建，带synthetic_validation_only及保留标识，不能当缓存删除；本地忽略manifest只指向该测试的假库，不用它选择私人根。新切片执行必要集成检查（必须node scripts/check-memory-integration.mjs），按实际风险验证，提交时保留Codex co-author trailer；Runtime既有授权允许验证后推送、开PR与合并，无需逐PR重问。不要靠重复构建或扩张范围维持工作。
