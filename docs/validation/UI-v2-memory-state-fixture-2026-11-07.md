# UI v2：记忆库列表的加载、无结果与索引不可用截图桩（2026-11-07）

接续草稿 #145，分支 `claude/ui-v2-memory-state-fixture`。SCREENS §9 中“初次载入、无结果、索引暂不可用”在原生 `MemorySurface` 里早有行为，但没有截图。本片只取证，不改产品。

新增独立 memory-state-preview.html / .tsx：直接渲染原 `MemorySurface`（含左栏导航和 Inspector），`MemoryStatusProvider` 照常轮询；Workspace transport 只允许 `workspace_status`、`memory_list`、`memory_search`，其他命令和全部宿主动作都会被拒绝并计数。固定英文水印 FICTIONAL FIXTURE · NO NATIVE CONNECTION，两条记录明确写着 Fictional fixture。七态：读取中、列表、空库、检索无匹配、列表索引未就绪（`index_not_ready`）、索引忙（`busy` + `index.busy`）、检索时索引未就绪。

自有 Edge 156、1100×700：三语双主题七态 42 张截图；英文深色的空库、无匹配和两种索引错误再各切三语，共 54 行。页面错误 0、宿主动作 0，启动器退出 0。英文文案逐条核对：读取中、“No approved memories here yet.”、“Nothing matches this search.”、计数位显示“Results unavailable”，警告含对应索引说明并带“重试”。切换语言不重发读取、检索词保留，提示随语言变化。复核中文深色“检索时索引未就绪”截图。

第一次运行停在诊断自身的断言上：语言切换步骤里按循环变量而不是页面实际语言比对英文。只修正诊断，产品当时显示的中文是正确的。

没覆盖：revision 冲突时保留草稿、换库 / 撤销权限时清空面板（各自已有 DOM 场景，但没有截图）。没有 Rust、原生 smoke、实际缩放、真实索引重建、个人 Vault、Owner、Provider、迁移或部署；Memory pin 不变。

复现：`node e2e/memory-state-diagnostics.mjs <Edge executable> target/<owned-directory>`（cwd `apps/desktop`）。
