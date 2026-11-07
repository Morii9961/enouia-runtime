# UI v2 #13：Memory 五工作区

基线 `5dd4e20`（#121 / #14），在 `codex/ui-v2-memory-workspaces` 接续。#120 星图性能片独立，不包含在此分支；本片不重新测星图帧率。

浏览器 Memory 区域现在以记忆 / 时间 / 关联 / 形成 / 召回作为二级导航。记忆下可选 Memory grid 与旧 Vault 列表；保留无演示 URL 时的原默认列表行为，明确标为主人审阅旧版。旧左栏的大预览入口、入口模块及对应样式撤下，不再挤占列表首屏。

五个合成工作区共用原选择和 Inspector：grid；timeline；constellation / star map；formation；recall。只有关联有两个子视图，其他工作区不重复显示单个视图的按钮。生成星图仍是独立合成样本。兼容列表维持 App 原有的选择、草稿和键盘路径，不混用两套记录身份。

演示链接保留语言、主题、当前 auto-dataset / auto-workspace；重载直接返回对应浏览器 Memory 工作区。修正了此前演示链接重载回 Home 的问题。原生忽略该演示路由，MemorySurface、Workspace 58 命令、pin、Rust 和合成原生 read-1/read-2 都未改；未将五区虚构数据塞入原生入口或静默回退。

验证：TypeScript 通过；i18n / cjk-fonts **12/12**。新工作区 DOM **33** 项，列表键盘 **13**、主导航三语 **21**、页面焦点 **7**，合计 **74 项通过**。覆盖工作区归属、跨五区共享 selection/Inspector、切语言保留导航焦点、返回旧列表及独立星图子视图。Memory pin 和 Activity 退役检查通过，原 fixture diff 为空。

浏览器：新建自有无头 Edge/profile；1100×700 中文黛蓝、1440×900 日文宣纸。五工作区 + 兼容列表 **12 组**，六个状态的时间工作区 **12 组**，均检查五区导航、无旧入口、无页面/头部横向溢出、真实状态链接重载返回。开放端无虚构时差，未知 key 保留。审阅截图后删除单视图冗余按钮行，补两尺寸 Memory grid **2 组通过**；该修改也通过类型及工作区 33 项复查。已查看窄窗 grid/旧列表及日文关联代表图。输出保留在忽略的 `apps/desktop/target/memory-workspaces-*`，定向结果见同名 JSON。

补拍过程中保留两次空白入口超时与一次 Page.navigate 超时。加入本地 HTTP 探测、CDP 导航回执、异常和网络记录后，最终两组通过，HTTP 200、页面脚本异常为空；初次超时根因仍未确认，不能宣称环境偶发问题消失。没有因此更改产品处理器、增加重试或调整超时。

未重跑完整 npm test、构建、Rust 或原生 smoke；没有个人 Vault、Owner、真实 Provider、持续形成、安装、部署或人工接受。物理托盘、默认热键、登录启动及安装升级仍按独立验收项处理。合成面板枚举/时间翻译继续待 Morii 决定。
