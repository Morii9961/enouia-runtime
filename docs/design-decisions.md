# 设计决定记录

每做出一个具体的设计决定，在最上面加一条。已记录的决定直接沿用，不重新讨论。推翻旧决定时，新增一条并写明替代了哪一条，不要直接改旧条目。

条目格式：

```
## YYYY-MM-DD · 标题

- 决定：做了什么选择（具体值）。
- 理由：为什么，对应概念里的哪一句。
- 影响：涉及哪些页面、组件或 token。
- 依据：看过的参考、截图、自检记录（只写实际看过的）。
- 状态：试验 / 定稿 / 已被替代（替代者：…）
```

---

## 2026-10-27 · W4 中日字体打包与按需加载

- 决定：更纱三字重与 M PLUS 可变 300–600 使用字典 CJK 子集；Enouia Text SC、Zen 四字重保留完整字符映射及 UVS，各字重 100 片。CJK 共 504 个 WOFF2、9,691,652 B。定义 CSS 随中日字典加载，不进入英文首屏；切片不内联。Settings 的完整授权文本另包加载，并提供原始 IPAexGothic 的本机恢复选择。
- 理由：保留选定字形、任意正文覆盖与 IPA 恢复权利，同时让英文启动仍只加载原有 67,892 B 拉丁字体。中文无库首页实测 474,908 B，日文 313,536 B（均含拉丁）。
- 影响：生成脚本、字体与 manifest、语言加载器、CJK 栈及 Settings；无新产品依赖、Memory pin 或原生权限变更。M PLUS 缺少的全角「／」「：」由 Zen 正文覆盖。
- 依据：[W4 原生/浏览器验证](validation/UI-v2-W4-fonts-2026-10-27.md)，完整来源、内部版本差异及生成方法见字体 README。
- 状态：定稿（实现与本地验证；不代表 owner 人工验收）

## 2026-10-26 · W4 IPA 字体派生、改名与恢复入口

- 决定：按 IPA 授权与官方 FAQ，将子集化和 TTF → WOFF2 都视为派生；中文正文字体的打包 family、PostScript 名和文件名改为 `Enouia Text SC`，对应 LXGW Neo XiHei v1.308 的字形，不沿用包含原名的派生名称。四条栈中原 `LXGW Neo XiHei` 的位置使用这个打包名称。附完整授权、来源、生成脚本与说明；Settings 提供可读授权及切换到用户自行安装的原始 IPAexGothic 的入口，不增加原生权限或自动下载。
- 理由：IPA 官方 FAQ §3.1 明确格式转换也是派生；§2.4、§3.3.2 要求内置字体的授权可读及恢复原始字体的方法。仅保留所有字形再转 WOFF2 并不能免除这些条件。
- 影响：CJK 字体包、四条字体栈、Settings 字体说明；原始 TTF 不提交。其余三款按 OFL 分发，Sarasa 的保留名 `Source` 不用于派生主名称，M PLUS / Zen 授权未声明保留名。
- 依据：打包前阅读的 [IPA 授权](https://moji.or.jp/ipafont/license/)、[官方 FAQ](https://moji.or.jp/ipafont/faq/)、[字体作者的说明](https://github.com/lxgw/lxgw/blob/main/documents/xizhi_embedding_instructions.md)与三款 OFL 全文；详细实施条件见 `apps/desktop/src/assets/fonts/README.md`。
- 状态：定稿（本轮已授权的字体打包所必需；恢复操作的实测边界另记验证记录）

## 2026-10-26 · W3 原生启动底色

- 决定：Tauri 创建窗口之前，通过现有 Windows Registry API 只读查询 `AppsUseLightTheme`，将主窗口和 Quick Search 的 `background_color` 设为黛蓝 `#0F1C23` 或宣纸 `#F1F0EB`；缺失/不可读时使用 Windows 默认浅色。JSON 留浅色保底。HTML 用两条带 `media` 的 `theme-color` 和极小的头部样式，在模块脚本运行前使用同样的纸色。这是 DESIGN.md §2 颜色集中规则的启动阶段例外。
- 理由：首帧不能等 React 或 `.setup()` 再改变窗口底色；owner 已在本轮明确批准相关原生修改。
- 影响：`src-tauri/src/appearance.rs`、`main.rs`、`tauri.conf.json` 与 `index.html`；无新依赖、权限或 Memory 路由变更。
- 依据：锁定的 Tauri 2.12.0 / tauri-utils 2.10.1 源码、[WindowConfig](https://docs.rs/tauri-utils/2.10.1/tauri_utils/config/struct.WindowConfig.html#structfield.background_color)、[Context::config_mut](https://docs.rs/tauri/2.12.0/tauri/struct.Context.html#method.config_mut)、[RegGetValueW](https://learn.microsoft.com/en-us/windows/win32/api/winreg/nf-winreg-reggetvaluew)、[HTML theme-color 媒体查询](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/theme-color)；[本机 W3 验证与测量边界](validation/UI-v2-W3-background-2026-10-26.md)。
- 状态：定稿

## 2026-10-26 · 中日字体定稿；首页「I'm here.」不翻译

- 决定：中文用 更纱等宽 Sarasa Mono SC（标签/标题）+ 霞鹜新晰黑 LXGW Neo XiHei（正文）；日文用 M PLUS 1 Code（标签/标题）+ Zen Kaku Gothic New（正文）。系统字体只作回退。首页的「I'm here.」与产品名一样在任何语言下都显示英文（浏览器演示与原生首页都改为 `lang="en"` 的固定文字，字典删去这一条，1,384 条）。具体栈与打包方式写入 DESIGN.md §3，落地步骤写入 HANDOFF_CODEX.md W4。替代了「界面三种语言」一条里「中文与日文的字体先用系统字体」的部分。
- 理由：Morii 2026-10-26 看了第二轮比较后选「中 2 + 日 1」，并要求「主页面的这个『我在』在中文下也用英文显示」「就这么敲定了」。第一轮的系统字体被认为太常规。
- 影响：`theme/cjk-fonts.css`、`assets/fonts/`（W4 由实现者打包）、`screens/Home.tsx`、`memory/status.tsx`、字典。
- 依据：`.design/review/fonts2/`（字样卡 + 真实界面 44 张截图，黛蓝 / 宣纸）；字体文件来自各自的官方 GitHub 发布或 google/fonts。打包体积尚未实测。
- 状态：定稿

## 2026-10-26 · 记忆星图默认改为三维球体，力导向「派」删除

- 决定：星图的第一种布局改为**球体**（三维、自转、透视，离中心的距离是年龄，黛蓝底上发光），并新增**星系**（对数螺旋臂，距离是年龄，回放时向外扩散）。原来的力导向布局删除；时间滚筒与主题聚类保留。具体值写入 DESIGN.md §7。替代了下面「记忆星图可以自己动」一条里关于力导向布局与「空闲时漂移、聚类缓慢转动」的部分，其余（拖动、弹簧、暂停、减少动画）不变。
- 理由：Morii 2026-10-26：力导向「看起来一块一块的，不太符合那种星图的发散的运动感」；看了 OmbreBrain-folio 的星图截图后要求「这种感觉，最后是一个三维球体的」；「其他方案也都可以保留，除了那个看起来是六等分的苹果派的那个」。
- 影响：`starLayout.ts`（`ball()`、`project()`、`galaxy()`，`forceSim` 改为拉向星系位置）、`StarMap.tsx`（球体投影、由远到近绘制、光晕、拖动转球与惯性、星系的旋转/涟漪/背景点、闪烁）、字典 3 条新文字（1,385 条）。主 JS 仍 500 kB；星图在懒加载分包里。
- 依据：参考 OmbreBrain-folio 星图截图（小红书功能巡览）、MemoryConstellations 的确定性螺旋摆位（`js/memory/layout.js`）。无头 Edge 1440×900：球体 700 条布局 6ms、5,000 条 28ms；空闲 1.2 秒内 11–25 万像素变化；暂停后静止，拖空白处转球；星系 5,000 条布局约 460ms（Worker），每帧绘制约 5ms、计算约 7ms。原生 WebView2 未测。
- 状态：试验

## 2026-10-26 · 界面三种语言：English、简体中文、日本語

- 决定：整个界面提供英文、简体中文、日文（`src/i18n/`：`t()`、`tn()` 复数、`tj()` 句中嵌元素、`msg()`/`labels()` 标记表格）。1,367 条界面字符串都有两种译文；产品名「Enouia Runtime」不翻译。Settings 新增 Language 一行（跟随系统 / English / 中文 / 日本語），切换就地重绘，不回首页。中文与日文的字体先用系统字体（雅黑 UI、游ゴシック UI），按 `<html lang>` 分开取字形；正式字体等 Morii 从 `.design/review/fonts/` 的比较里选。
- 理由：Morii 要求「整个界面都应该有中日英三语」「左上角的 Enouia Runtime 标题可以不本地化」「字体的选择必须格外注重」（2026-10-26）。
- 影响：几乎所有界面文件；新增 `i18n/index.ts`、`zh-Hans.ts`、`ja.ts`、`theme/cjk-fonts.css`、`tests/i18n-keys.mjs`、`tests/i18n.test.mjs`。英文输出不变（原有测试照旧通过）。字典按语言分包懒加载：主 JS 500 kB，中文字典 106 kB、日文 130 kB（未压缩）。
- 依据：`npm run check`；node 测试 124 通过、3 跳过（含新增 8 项翻译检查）；DOM 75/75；build；两个仓库检查；无头 Edge 在中文、日文下截了全部页面（`.design/shots/i18n/`）与语言切换（无控制台错误）。原生 WebView2 未看。
- 状态：试验（字体待定）

## 2026-10-26 · 记忆星图可以自己动（动效规则的唯一例外）

- 决定：星图改成实时渲染：力导向布局在 Worker 里分帧收敛并逐帧送回；拖动星星时有连线的星跟着走，松手回位；空闲时漂移、聚类缓慢转动；时间滚筒的笔固定在 12 点，年份在笔下转。新增「Pause motion」按钮。具体值写入 DESIGN.md §7「唯一例外」。另加独立预览页 `apps/desktop/starmap.html`（只在开发服务器上，生产构建不含）。
- 理由：Morii 要求星图「动态渲染，可以直接进行交互，没有进行交互的时候也要有自己的运行动效」（2026-10-26）。其余界面仍是「一次画出，然后安静」；星图的漂移不带含义，可以暂停，减少动画时关闭。
- 影响：`StarMap.tsx`（帧循环、弹簧、拖动、相机滑行）、`starLayout.ts`（`forceSim` 可分步）、`starWorker.ts`（分帧送回）、`automemory.css`（独立页样式）、新增 `starmap-preview.tsx`。主 JS 不变，星图仍在懒加载分包。
- 依据：无头 Edge 1440×900：空闲 1.2 秒内约 2.9 万像素变化，暂停后 0，减少动画时 0；拖动一颗星后它跟手、松手回位；回放时笔固定在顶端；5,000 条时每帧绘制中位约 1ms、弹簧计算中位约 1.5ms。截图与两套主题录像在 `.design/review/starmap/live/`。原生 WebView2 未测。
- 状态：试验

## 2026-10-25 · 全界面动效（第一批）

- 决定：采用 `redesign/v2-motion` 的动效原型，规则与时刻写入 DESIGN.md §7：页面沿导航顺序推进、导航反相块滑动、Memory 选中光标移动与 Inspector 翻帧、自动记忆视图推进、星图按身份重排、记录依次到达、首页记号落下、Quick Search 纸条落下、明暗切换显影、锁定斜线画过、悬停 80ms。替代 DESIGN.md 旧 §7 里「悬停/选中瞬时、导航与列表不动」的说法。
- 理由：Morii 希望整个界面有动效（2026-10-25），看完录像后确认「现有的都挺好的」。全部只沿时间或顺序移动，与「记录仪」一致。
- 影响：新增 `theme/motion.ts`、`theme/motion.css`；`App.tsx` 的 `show`/`select`、`AutoMemory.tsx` 的视图与选中、`Constellation.tsx` 的节点名、`main.tsx` 的明暗切换改走 `moveAlong`。行为与测试不变（测试环境无 View Transitions，直接更新）。主 JS 增约 0.6 kB。
- 依据：`.design/review/motion/` 的 16 段录像（8 场景 × 2 主题，无控制台错误）与 1/10 速抽帧；`npm test`（node 116 过 3 跳过，DOM 75/75）、build、两个仓库检查全过。原生 WebView2 尚未录制。
- 状态：定稿

## 2026-10-25 · 合并 main：用量账本界面一起删除，原生命令已撤下

- 决定：把 origin/main（到 PR #100）合入 `redesign/v2`。main 新增的私有用量账本界面（`src/usage/` 的视图、`UsageProvider` 包裹、`ActivityWorkspace`、其测试与 `usage-manual` fixture）按「移除 Activity / Usage 界面」一并删除；main 新的原生 Runtime Inspector 去掉「Activity producer」一节。main 带来的 Memory 历史任务、Provider 配置草稿、导入报告、合成自动记忆集合、原生 Runtime Inspector（Memory Core、Windows shell、Memory 操作）保留，套用 UI v2 外观。
- 理由：main 的交接说明（`docs/prompts/CLAUDE_ACTIVITY_BACKEND_HANDOFF_2026-10-25.md`）与 Morii 的范围调整一致：两块界面一起删，保留 Memory、Context、Sessions、Provider 配置、Memory 任务观察、会话请求的 token 信息与 Windows 外壳。
- 影响：替代上一条里「原生命令暂留」的说法：桌面 Activity/Usage 原生命令与授权已由 [ADR-037](adr/037-activity-usage-desktop-retirement.md) 撤下；独立采集/上传程序、账本、安装任务与数据仍保留，等 Moriium 替代链路完成后再清理。主 JS 增到 513.6 kB（超过 Vite 500 kB 提示线，OPEN_ISSUES #18）。
- 依据：`npm run check`；`npm test`（node 116 通过、3 跳过、0 失败；DOM 75/75）；`npm run build`；`node scripts/check-memory-integration.mjs`；`node scripts/check-activity-retirement.mjs`；浏览器演示重截，与合并前只差 Home 笔尖 27 像素。
- 状态：定稿

## 2026-10-25 · 移除 Activity / Usage 界面

- 决定：Runtime 前端删除公开 Activity 与私有用量账本的全部界面：导航项（原第 5 项）、Activity 页（浏览器演示与原生 `src/activity/`）、统计卡与操作入口；Home（原生）的 Activity 入口与「Activity uses a separate producer」、Settings 的「Activity producer · Pause scheduled runs」、Runtime Inspector 的「Activity producer」组件与「activity ipc」读数、标题栏状态牌与退出说明里的 Activity 句子；只服务它们的前端状态（`actFilter`、`actOpen`、`paused`）、演示数据（`D.ACT`、`DemoActivity`）、记录带的「第二条胶片」、CSS（`activity.css`、`.act-*`、`.bg-act-*`、`.bg-reading*`、`.qr172`–`.qr186` 中的 Activity 部分）、单元测试与驱动该页的 e2e 脚本。不留占位页，不新增 tokens.ci 面板。导航变为六项，Ctrl+1…6。
- 理由：Moriium 的 token 用量分析以后不集成到 Enouia Runtime；Runtime 前端只服务 Enouia Memory（Morii，2026-10-25）。
- 影响：保留不动的是 Activity / Usage 的后端、原生命令（`src-tauri/src/activity.rs` 与其 capability）、采集与同步程序、调度、数据与 `scripts/` 下的相关脚本（包括已无前端用途的 `prepare-activity-surface-sandbox.mjs`），等 Moriium 替代链路完成后另行清理；不停任务、不删账本、不归档，不处理其他分支或 PR。`docs/validation/` 里引用已删文件的历史记录不改。AGENTS.md 仍写「seven surfaces」与 ADR-028 的 Activity 页面，需要 owner 更新（OPEN_ISSUES #12）。
- 依据：`npm run check`、`npm test`（node 60/60，DOM 58/58）、`npm run build`、`node scripts/check-memory-integration.mjs` 全过；重截两套主题。
- 状态：定稿

## 2026-10-25 · 动效留在 Web 层，不换技术栈

- 决定：界面与动效继续用 React 19 + TypeScript，运行在 Tauri 2.12 的 WebView2 里；动效用 CSS 过渡/关键帧和 Web Animations API，不引入动画库。Rust 只负责窗口、托盘、热键、Memory 适配器，以及窗口级效果（首帧底色、以后可能的 Mica）。不改用原生 Rust 界面库。
- 理由：「一次画出，然后安静；移动只沿时间轴」需要的只是 `transform`/`opacity`/`clip-path` 这几种由合成器处理的属性，WebView2（Chromium）已经能稳定 60fps。换原生界面库要重写整个前端、丢掉 DOM 测试与 `.qr*` 接口挂钩，中文排版和动画能力也更弱。
- 影响：全部屏幕。星图规模化时按 Memory UI 规格先用合成规模样例测量，再在 SVG / Canvas / Web Worker 布局之间选（OPEN_ISSUES #6）；那时若要新增依赖，另记一条决定。
- 依据：`apps/desktop/package.json`（react 19.3.0，无动画依赖）；`src-tauri/Cargo.toml`（tauri =2.12.0）；Memory UI 规格 §10「现阶段不新增依赖」。
- 状态：定稿

## 2026-10-25 · 实现前先补设计：屏幕清单与顺序

- 决定：以 [SCREENS.md](design/ui-v2/SCREENS.md) 为唯一屏幕清单。标「已做」的按截图与规格实现；标「部分」「未做」的（记忆星图全库视图、月→日时间线、覆盖日历、记忆格的列表模式、主题簇/替代链/证据链、回看与淡出建议卡、冲突对照与修订 diff、十种状态、窄窗口与 200% 缩放）先在浏览器演示里用虚构数据设计、截图、过自检，再进入实现。
- 理由：Memory UI 规格 §11 要求原型至少覆盖十种状态；当前合成预览只有五个视图、15 条虚构记忆。
- 影响：Memory 区域与 Settings；不改变六个主表面的边界。
- 依据：Memory UI 规格 §1–§11；参考图 ref-01…ref-09（REFERENCES.md）；`.design/shots/v2/`。
- 状态：定稿

## 2026-10-25 · 本轮统一口径（待 owner 最终确认）

- 决定：① 星图的 `+ / −` 是缩放（0.85–1.5，另有「重置」）；② 所有时间按 Asia/Shanghai（UTC+8）显示，并在 Inspector 的时间区写明；③ 自动记忆合成预览用 `React.lazy` 懒加载（主 JS 475.3 kB，预览 57.8 kB 另包）。
- 理由：① Memory UI 规格 §10「缩放有 + / − / 重置按钮」；② 规格 §5 不按浏览器时区猜，演示数据本身是 Asia/Shanghai；③ 主 JS 回到 Vite 500 kB 警告线以下。
- 影响：`screens/automemory/*`、Inspector 时间区、`App.tsx` 的预览入口。
- 依据：第二轮三个变体都按此实现并截图（`.design/review/index-r2.html`）。
- 状态：试验

## 2026-10-25 · 两套配色：深色黛蓝、浅色宣纸

- 决定：深色 **Tile Blue · 黛蓝**（底 `#0F1C23`，墨 `#ECEDE8`，笔 `#93B6DC`），浅色 **Xuan Paper · 宣纸**（底 `#F1F0EB`，墨 `#1D1C1A`，笔 `#29528A`）；全部值见 DESIGN.md §2。跟随系统明暗，无应用内覆盖。所有颜色收进 `theme/palettes.css`，组件只读令牌；反相块 = 墨与底对调。
- 理由：两套是一对「粉墙黛瓦」——宣纸是墙，黛蓝是瓦；同一种墨、同一支石青笔，切换明暗只换底不换笔。做法学 04 标本馆：整个界面只有一个低彩度色相，墨也带这个色相，强调色只有一支。避开深海军蓝 + 青、紫色渐变、米色 + 陶土橙、纯黑 + 霓虹。
- 影响：全部屏幕；`quiet-runtime.css`、`theme/negative.css`、`theme/automemory.css` 里写死的色值改为令牌；Settings 的皮肤陈述句；时间小地图说明里的「amber frame」改为「frame」（笔色不再是琥珀）。替代 08 原来的近黑底 `#121312` + 琥珀笔 `#D2A24C`。
- 依据：三轮配色比较（`.design/review/index-palettes.html`、`index-palettes-dark2.html`、`index-palettes-tile.html`）：第一轮三深三浅 → 浅色选宣纸，深色都不满意（底太接近黑、只差一点色相）；第二轮黛瓦/灯下/旧绢 → 黛瓦；黛瓦底 OKLCH C 0.006 发灰，压深三版 → 黛蓝。逐节点对比度审计 0 处低于 4.5:1。
- 状态：定稿

## 2026-10-25 · 新视觉取代 Quiet Runtime 的视觉条文

- 决定：[FRONTEND_IMPLEMENTATION_v1.md](FRONTEND_IMPLEMENTATION_v1.md) 中关于布局、字体（Segoe UI Variable / Cascadia Code）、颜色（`#0C1117` 底、冰蓝 `#9FC2D2` 等）、间距与「Quiet Runtime」视觉语言的条文，由本 DESIGN.md 取代。保留不变的契约：主表面与它们的边界（Activity 已另行移除，见「移除 Activity / Usage 界面」）、浏览器演示的「fictional demo」标注与行为、原生里 Memory/Context/Sessions 走 Memory 适配器、Quick Search 独立窗口与权限、1100×700 最小窗口、CSP、所有 `.qr*` / `.mem-*` / `#quick-query` 接口类名、键盘（Ctrl+数字、↑↓）、减少动画、测试（Activity 部分随界面删除）。
- 理由：design-kit `existing-app.md` §2：保留语义，不保留具体长相；旧文档只在顶部加一行，不改正文。
- 影响：旧文档顶部加一行指向本条。
- 依据：`docs/design-kit/existing-app.md`；`.design/00-recon.md` 的契约/皮肤清单。
- 状态：定稿

## 2026-10-25 · 选定的方向与被放弃的方向

- 决定：选 **08 负片**（`redesign/08-negative` 53f9bb4）：01 的记录纸骨架（导航印在记录带上、Sessions 行距按真实时间）+ 05 的字体（Martian Mono + Geist）与时间小地图（取景框移动、图表沿时间平移），全暗/全浅各一套，一支笔色。
- 理由：它是唯一把 01 与 05 融成新东西的变体；时间小地图直接服务自动记忆的 Timeline（发生、收到、形成三种时间）；负片底同时解决了白纸夜里太亮与原生窗口首帧闪深色两个问题。
- 放弃的：
  - 01 气压记录纸：喜欢，作为 08 的骨架保留；放弃它的白纸、细坐标格、胭脂红过多、大写窄体。
  - 02 结绳、03 投币寄存柜：离「时间」这个主问题较远，Morii 未选。
  - 04 标本馆：未选为方向，但其配色方法被配色轮采用。
  - 05 胶片阅读机：喜欢，借走字体、编号习惯、裁切角、反相与斜线故障、载片台→时间小地图；放弃右侧控件栏。
  - 06 阅读机里的记录纸、07 铅笔稿：两者在截图里只拉开约两轴，Morii 选了 08。
- 影响：全部屏幕的视觉；不改任何行为、IPC、测试。
- 依据：`.design/review/index.html`（第一轮）、`.design/review/index-r2.html`（第二轮）与各方向 `critique-log.md`。
- 状态：定稿
