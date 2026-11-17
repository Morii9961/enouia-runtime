# Runtime 接续提示词（2026-11-16 建立，11-17 更新）

在Enouia Runtime项目工作，使用中文。先读AGENTS.md、docs/integration/RUNTIME_ROADMAP_2026-11-16.md、docs/MEMORY_INTEGRATION_v1.md和docs/integration/memory-pin.json；状态快照不是已安装状态。

R1已实施并完成本机合成验证：Memory采用已合并PR111的a543c1eb81e5d7150ebe7820592eea35a9042697，aggregate为723ec245e7ddcd0c5a5a81b84ac1cb7bbd794c99dab0ed99e4e88b480971d50f，仍为61命令。先核对本地/云端Git和本片PR是否已合并，不重复做兼容采用。证据在docs/validation/Memory-pin-a543c1e-2026-11-16.md；包括最终原生目录39/39，也保留先前权限失败、进程中断、归属拒绝与busy超时，不能宣称偶发问题已修复。

先核对本地/在线main、工作树与未提交修改，保留.claude和不明资料。清理已在新会话创建前执行，以启动消息为准。构建缓存缺失时按锁文件恢复，不升级依赖，不把缓存缺失误认作业务回归；不共用其他工作树target或调用未知CLI。

Morii在11月17日要求继续按路线持续推进，最小只读范围据此继续。PR181已采用已有System catalog的memory_detail_native与memory_source_excerpt_native，不能再把它们误报为Memory契约缺失；原生42/42，见docs/validation/Catalog-native-detail-source-2026-11-17.md。PR182已明确两个ADR037的引用别名。随后ADR038切片增加显式受信任原生启动参数，读取原OS账户/home/operation登记的同一Owner根，锁定释放句柄，页面不能重认证；桌面合成14/14，见docs/validation/Registered-owner-readonly-2026-11-17.md和docs/integration/REGISTERED_OWNER_READONLY.md。先核对该切片当前PR/main，不重复实现。

独立只读入口的壳层、Home/Settings状态已统一，见docs/validation/Registered-owner-shell-status-2026-11-17.md；先核对当前PR/main，不重复实现。锁定回执撤回旧打开观察，旧Workspace仍真实为none；不能把新根伪装成v1 Vault或承诺Context/Sessions已接通。R3验收准备见下文，继续核对Memory公开工程交付，门槛未满足不产出新生产候选。图形目录选择的认证入口仍另核；不能把页面请求路由到bootstrap CLI，也不能用同账户进程事实单独证明人的授权。不创建OwnerReadGrant或复用形成策略授予长期读取；个人库打开/迁移、真实Provider、安装或部署仍不在当前开发执行范围。

R3只读验收分流与证据清单已准备在docs/RUNTIME_OWNER_READONLY_ACCEPTANCE_2026-11-17.md，旧指南已加分流链接。核对公共Memory main至d0e7f9f：新提交是初始化标题投影/准备性能，无reader/存储格式/Runtime surface变化；没有因此更新pin。公开交接未提供真实形成与独立恢复ready证明，新候选/真实验收仍未执行。不要把准备稿或合并当作门槛完成。

11月17日后续：PR184壳层状态、PR185验收分流、PR186登记空范围文案均已合并。空状态组件回归先复现四项失败，再修正为46/46，见docs/validation/Registered-owner-empty-state-2026-11-17.md。复用PR184程序的1100×700三语/三页定向布局观察通过，见docs/validation/Registered-owner-minimum-layout-2026-11-17.md；没有因此改样式或冒称HEAD原生复验。接续不重做这些切片。下一有效出口是Memory不含私人内容的真实形成/关闭重开/来源/独立恢复工程摘要，再按R3核对候选与授权条件；摘要缺失时保持待交付，不以重复测试或扩展未批准入口补进度。

Memory另一个会话负责真实建库、工程交付与独立恢复，不修改Memory仓库或合并其待审PR、不重做fresh驱动。Runtime只核对公共工程交付，不读取私人材料。旧5175284仍含731edd56，不是新Owner候选；本片构建程序也不是R3交付包。新候选和日用验收按R3边界；云端、自动采集另排，不操作Dashboard或刷新手动状态快照。

真实验收另核授权。专用登记合成home在非Git/非临时目录，由显式ignored测试创建，带synthetic_validation_only及保留标识，不能当缓存删除；本地忽略manifest只指向该测试的假库，不用它选择私人根。新切片执行必要集成检查（必须node scripts/check-memory-integration.mjs），按实际风险验证，提交时保留Codex co-author trailer；Runtime既有授权允许验证后推送、开PR与合并，无需逐PR重问。不要靠重复构建或扩张范围维持工作。
