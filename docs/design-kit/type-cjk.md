# 字体与中文排版

字体是风格里最容易被默认值吃掉的一层。这一份给出：已核实授权的字体表、中文硬规则、加载方式、搭配配方。

## 1. 授权已核实的字体

下表授权来自 npm 注册表的 `license` 字段（2026-10-17 查询）。**这只核实了打包的授权标记**，嵌入网页前请在字体项目页再确认一次，并把结果写进 `DESIGN.md` 的字体表。

| 角色 | 字体 | 授权 | 包名 |
| --- | --- | --- | --- |
| 衬线 展示 | Instrument Serif | OFL-1.1 | `@fontsource/instrument-serif` |
| 衬线 展示/正文 | Newsreader | OFL-1.1 | `@fontsource/newsreader` |
| 衬线 古典 | Cormorant Garamond | OFL-1.1 | `@fontsource/cormorant-garamond` |
| 衬线 古典 | Libre Caslon Text | OFL-1.1 | `@fontsource/libre-caslon-text` |
| 衬线 高反差 | Playfair Display / Bodoni Moda | OFL-1.1 | `@fontsource/playfair-display` `@fontsource/bodoni-moda` |
| 衬线 报刊 | Old Standard TT | OFL-1.1 | `@fontsource/old-standard-tt` |
| 衬线 有表情 | Fraunces / Young Serif / Gloock | OFL-1.1 | `@fontsource/fraunces` `@fontsource/young-serif` `@fontsource/gloock` |
| 无衬线 中性 | Hanken Grotesk / Schibsted Grotesk / Instrument Sans | OFL-1.1 | `@fontsource/hanken-grotesk` `@fontsource/schibsted-grotesk` `@fontsource/instrument-sans` |
| 无衬线 现代 | Geist | OFL-1.1 | `@fontsource/geist` |
| 无衬线 有个性 | Bricolage Grotesque / Syne / Unbounded | OFL-1.1 | `@fontsource/bricolage-grotesque` `@fontsource/syne` `@fontsource/unbounded` |
| 无衬线 宽度轴 | Archivo | OFL-1.1 | `@fontsource/archivo` |
| 窄体工业 | Barlow Condensed / Big Shoulders Display / Anton | OFL-1.1 | `@fontsource/barlow-condensed` `@fontsource/big-shoulders-display` `@fontsource/anton` |
| 等宽 | IBM Plex Mono / DM Mono / Spline Sans Mono / Space Mono / Courier Prime / Martian Mono / Fragment Mono / Geist Mono | OFL-1.1 | `@fontsource/ibm-plex-mono` 等 |
| 打字机 | Special Elite | Apache-2.0 | `@fontsource/special-elite` |
| 七段数码 | DSEG | OFL-1.1 | `dseg` |
| 像素/点阵 | VT323 / Silkscreen / DotGothic16 | OFL-1.1 | `@fontsource/vt323` `@fontsource/silkscreen` `@fontsource/dotgothic16` |
| 手写 | Caveat | OFL-1.1 | `@fontsource/caveat` |
| 中文 衬线 | Noto Serif SC | OFL-1.1 | `@fontsource/noto-serif-sc` |
| 中文 无衬线 | Noto Sans SC | OFL-1.1 | `@fontsource/noto-sans-sc` |
| 中文 楷体 | 霞鹜文楷 / 文楷 Screen | npm 包标 MIT，字体本体请以项目页为准 | `lxgw-wenkai-webfont` `lxgw-wenkai-screen-webfont` |
| 中文 展示 | ZCOOL XiaoWei / ZCOOL KuaiLe / ZCOOL QingKe HuangYou | OFL-1.1 | `@fontsource/zcool-xiaowei` `@fontsource/zcool-kuaile` `@fontsource/zcool-qingke-huangyou` |
| 中文 书法 | Ma Shan Zheng / Zhi Mang Xing / Long Cang / Liu Jian Mao Cao | OFL-1.1 | `@fontsource/ma-shan-zheng` `@fontsource/zhi-mang-xing` `@fontsource/long-cang` `@fontsource/liu-jian-mao-cao` |
| 日文 黑体 | Zen Kaku Gothic New / Zen Maru Gothic | OFL-1.1 | `@fontsource/zen-kaku-gothic-new` `@fontsource/zen-maru-gothic` |
| 日文 明朝 | Shippori Mincho / Zen Old Mincho / Kaisei Tokumin | OFL-1.1 | `@fontsource/shippori-mincho` `@fontsource/zen-old-mincho` `@fontsource/kaisei-tokumin` |
| 日文 手写 | Klee One | OFL-1.1 | `@fontsource/klee-one` |

**没有核实到授权的（用前自查，不确定就不用）：** 得意黑（Smiley Sans）、缝合像素字体（Fusion Pixel）、Zpix、MiSans、阿里巴巴普惠体、HarmonyOS Sans、以及所有商业字体（Helvetica Neue、Tiempos、Canela、PP 系列等）。

## 2. 选字的顺序

1. 先从**概念**里拿声线（海图要斜体衬线，站牌要点阵，展签要极细无衬线），而不是从「好看的字体」里挑。
2. 展示字体最多两个，其中一个可以只出现一次。
3. 拉丁和中文**分别选**，不要让中文字体自带的拉丁字形做主角。
4. 数字：表格和读数必须能用 `font-variant-numeric: tabular-nums`，或者用等宽字体。很多展示衬线没有等宽数字，数字密集的地方换字体。
5. 先用真实的中文内容试排，再定。

## 3. 中文硬规则

- 用 `:lang(zh-Hans)` 单独写字体栈，页面和内容块都标对 `lang`。
- 拉丁字体写在前，中文字体写在后（大多数拉丁字体没有汉字，大多数中文字体带拉丁）。
- 中文正文行高约 1.7；标题 1.2–1.4；数字密集的表格可以更紧，需要实测。
- 中文没有真正的斜体，不要对中文用 `italic`（浏览器会合成倾斜，很难看）。设 `font-synthesis: none`。强调用字重、颜色或着重号（`text-emphasis`）。
- 引号用弯引号 `“ ”`，省略号用 `……`，破折号用 `——`。
- 中英文之间的空隙：较新的浏览器支持 `text-autospace: normal`，用它而不是手敲空格，但要实测。
- 同字号下拉丁字母显得偏小，混排时可对拉丁字体用 `size-adjust` 微调。
- 竖排用 `writing-mode: vertical-rl`；竖排里的数字和拉丁用 `text-orientation: mixed` 并检查。
- 等宽网格里的中文宽度是 2ch，按 2ch 的倍数设计（行打印纸、终端类方向）。

## 4. 加载

- 自托管，不用 CDN。优先 Fontsource（`npm i @fontsource/…` 或 `@fontsource-variable/…`），可变字体字重范围宽、文件少。
- 中文字体很大。Fontsource 和霞鹜的 webfont 包都按 `unicode-range` 分片，浏览器只下载页面用到的片。仍要实测首屏字体体积。
- 预算：拉丁字体合计 ≤ 150KB（woff2），中文首屏分片合计要实测并写进 `DESIGN.md`。
- `font-display: swap`，并为主要字体设置 `size-adjust` 的回退字体，减少跳动。

## 5. 搭配配方（可直接起手，再改）

| 配方 | 展示 | 正文 | 数据 | 中文 | 适合 |
| --- | --- | --- | --- | --- | --- |
| 暗房 | Newsreader 斜体 | Newsreader | IBM Plex Mono | Noto Serif SC | 01、14 |
| 图版 | Cormorant Garamond 斜体 | Libre Caslon Text | Courier Prime | 霞鹜文楷 | 02、03 |
| 孔版 | Bricolage Grotesque 800 | Hanken Grotesk | Space Mono | ZCOOL QingKe HuangYou + Noto Sans SC | 04 |
| 工业 | Barlow Condensed | Instrument Sans | DSEG7 / IBM Plex Mono | Noto Sans SC | 05、06 |
| 报刊 | Playfair Display 900 | Old Standard TT | IBM Plex Mono | Noto Serif SC | 07 |
| 打印 | IBM Plex Mono | IBM Plex Mono | IBM Plex Mono | Noto Sans SC | 09 |
| 海报 | Archivo 宽 800 | Schibsted Grotesk | Geist Mono | Noto Sans SC | 13 |
| 夜墨 | Shippori Mincho | Noto Serif SC | Martian Mono | Noto Serif SC | 11 |
| 点阵 | Silkscreen | VT323 | VT323 | Noto Sans SC（保底） | 12 |
