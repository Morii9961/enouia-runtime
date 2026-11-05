# UI v2：Quick Search 虚构截图桩（2026-11-06）

基线 `59df0b5b620dce40be70c74f60faf6b2d6579404`，分支 `codex/ui-v2-quick-search-fixture`，接续草稿 #137，处理 OPEN_ISSUES #11。未合并，不代表人工接受。

新增独立 `e2e/quick-search-preview.html` / `.tsx`，直接渲染原 QuickSearch，SDK 事件/宿主动作和 Memory transport 全由 mock 拦截，仅允许合成 memory_search 读取。空白、结果、无结果、错误四态都带固定英文技术水印 FICTIONAL FIXTURE · NO NATIVE CONNECTION，与已有 native-home-preview 口径一致。水印位于装饰记录带内、无指针交互，不占用或覆盖搜索控件。真实组件、默认入口和历史截图不改，原始结果正文与 current 枚举保持。

实际检查：TypeScript、Memory pin、Activity 退役守卫通过。既有 Quick Search DOM 28 项通过，含迟到结果撤销、编辑不搜索、只读 scope/limit、焦点归还、恢复与跨窗口语言不重试；其中 14 次搜索和 2 次隐藏均在 mock。没有字典、字体或产品 UI 词变动，未重跑 i18n/CJK。

自有 Edge 156/profile、560×420：三语双主题四状态 24 项与 24 张截图；结果/错误各场景再经三种偏好事件切换，共 36 项，合计 60 项。水印始终在视口内且不覆盖标题/表单/页脚，无横向溢出；查询/结果节点与输入焦点保留，搜索始终是空白态 0 次或其他态 1 次，宿主动作 0。页面错误零，启动器退出 0；复核日文结果和中文错误截图。

首次诊断带 ?lang 锁定语言，按既有约定不会接收存储偏好；最终先设置隔离偏好再导航无固定语言 URL。还将前台焦点建立放到合成查询之前，避免按产品规则重新聚焦清空。这两项只修正诊断前提，不改 QuickSearch。

复现入口为本地 Vite 的 `/e2e/quick-search-preview.html?lang=ja&theme=light&state=results`；诊断脚本覆盖完整矩阵。没有完整 npm test、构建、Rust、原生 smoke、真实 Vault/Owner/Provider、物理窗口/热键或托盘接受。旧截图保留其原证据，不追溯贴标。
