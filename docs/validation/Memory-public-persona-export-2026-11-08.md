# 公开人设导出：pin 升级与界面（2026-11-08）

Runtime 基线 `128ae13`（origin/main）。Memory pin 从 `b9faf54` 升到已合并的 `731edd56a276ffa752c736b7d2be667b9e12776c`（[Memory #87](https://github.com/Morii9961/enouia-memory/pull/87)，源提交 `8834b60`，ADR-MEM-128），surface 聚合 `f93f39ad59dd36824ee1dcdd430f01c0ee95acbb55fc6c4a67bab9117846fec4`。授权来自 Morii 的启动提示词：升 pin，并在 Memory 界面加“公开人设导出”。只用合成 Vault；没有打开私人 Vault，也不涉及任何微信功能。

## 改了什么

- **pin**：五个 Memory 依赖的 `rev`、`Cargo.lock` 里九个 Memory 包的 source、`memory-pin.json`（61 条命令、聚合摘要、#87）。锁文件除 source 外只多了一条依赖边：新增的 dev-dependency `enouia-memory-govern`（同一 SHA，只供测试生成合成 Identity；Workspace IPC v1 没有写 Identity 的命令）。Memory 这次没有改任何 Cargo 清单，也没有改 vault crate。
- **适配层**（`src/memory.rs`）：`memory_pick` 认识 `persona_destination`，打开系统文件夹选择器，只把令牌交给页面。`persona_export` 是写命令，自动走共享门（Vault 生命周期切换时等待），测试清单同步更新。
- **页面**：`src/memory/PersonaExport.tsx`，位于 Memory → Vault → 公开人设导出。六步依次是身份修订、公开知识、预览、确认、保存位置、回执。`src/memory/persona.ts` 按 Memory 的规范字节（键排序、两空格缩进、LF、末尾换行）渲染全文。`client.ts` 的 `WRITES`、`PICK_KINDS` 和 persona 规则文案也做了相应更新。设计决定见 `docs/design-decisions.md` 2026-11-08 条。
- **结果未知**：同一次主人决定只用一个 key。首次尝试被 Memory 以 `invalid_request / revision_conflict / idempotency_conflict / not_found / permission_denied / vault_locked / vault_recovering` 拒绝时，按拒绝处理。其他失败，以及重发时的任何失败，都保留原请求（key、参数、预览）并锁定选择，切页也不丢。只有主人点击后才用同一个 key 和原参数重发；`workspace.token_unknown` 时可以重新选文件夹，但仍用同一个 key。前端从不自动重试。

## 实际跑过的检查

- `node scripts/check-memory-integration.mjs --memory-checkout "E:/Enouia Memory"`：pin 一致，6 个 crate、9 个锁定包，surface 与固定修订一致；`--self-test` 8 项反例通过。`check-domain-boundaries.mjs`（桌面 locked metadata）`--self-test`：9 个 Memory 包都在同一 SHA，7 项反例通过。`check-activity-retirement.mjs` 通过。
- Rust（`apps/desktop/src-tauri`）：`cargo fmt -- --check`；`cargo test --locked` 二进制 58 项、`memory_core` 9 项通过，1 项忽略（用于生成种子 Vault）；`cargo clippy --locked --all-targets -- -D warnings` 通过。
- 新的消费者测试 `public_persona_export_writes_exactly_the_previewed_file`，直接驱动固定修订的真实 Core 和合成 Vault：
  - 选项只列出 2 条公开记录，私密记录不出现；
  - 勾选了私密记录的预览里没有私密正文、块外文字和未勾选记录，并计入 `selectedNotPublic`；
  - Git 仓库内的文件夹被拒绝（`persona.destination_rejected`、`root.inside_repository`），Vault 内的文件夹被拒绝（`persona.destination_in_vault`），拒绝时什么都没写；
  - 写出的文件字节等于“预览投影 + 回执的 `exported_at`”的规范文本，SHA-256 等于 `fileSha256`；
  - 同一个 key 重放回执（`replayed: true`）；
  - 导出后旧预览被拒绝（`persona.preview_changed`），重新预览时版本和摘要都不变；
  - 新决定写到同一文件夹时被拒绝（`persona.destination_exists`），原文件不变；
  - `lastExport` 与回执一致。
- 前端：`npm run check`（TypeScript）；`npm test`：Node 测试 148 项通过、3 项原有跳过，DOM 夹具 121 个全部通过，其中新的 `persona-export` 有 27 项断言；`npm run build` 通过（主 JS 498.58 kB）；`i18n` 和 `cjk-fonts` 通过。`tests/persona-file.test.mjs` 用 Memory 自己的合成样例（`tests/fixtures/persona/`，原样复制自 `731edd5`）证明页面渲染的全文加上回执时间后，SHA-256 正好等于样例回执。
- 原生：`cargo build --locked --features custom-protocol` 生成 debug 可执行文件，`memory-smoke.mjs --persona-only` 在种子合成 Vault（由忽略测试 `seed_synthetic_persona_vault` 生成）上 8/8 通过。用的是真实窗口、真实 Tauri IPC 和真实系统文件夹选择器（UI Automation 填写）：只列公开记录；预览里没有私密文字；Git 仓库内的文件夹被拒绝，`invalid_request · persona.destination_rejected · root.inside_repository` 原样显示，且没有写入；导出后回执里的文件名和 SHA-256 与磁盘文件一致，磁盘文件与页面显示的全文一字不差；进程正常退出。截图和报告留在被忽略的本地输出里。
- 视觉：`e2e/persona-export-preview.html` 截图桩（虚构水印，所有回应都是 mock）用 `tools/shot.mjs` 截了 1440/1100 宽，五种状态，深浅两套配色，中日英三种语言，共 14 张。最小字号 12px，没有横向溢出；唯一一条控制台报错是首次加载 favicon 时的 404。截图在被忽略的 `.design/shots/persona/`。

## 没有验证的

- 没有用私人 Identity 或私人 Vault，没有人工验收，也没有在另一台电脑上导入文件。
- 没有模拟真正的崩溃（Memory 已预留版本但文件状态未知）：Runtime 只在 DOM 里模拟了回应丢失和存储失败两种情况，“重发后写出预留字节”这一步是 Memory 的测试覆盖的。
- 没有重跑其他原生 smoke（automatic、catalog 等）。本次 Memory 没有改 vault、host、provider 或 Cargo 清单，其他 Workspace 命令也没有变化，Rust 消费者测试全部通过。
- 本机 1100×700 原生窗口和缩放没有单独取证，只看了截图桩的 1100 宽。

## 待 Morii 决定（已按最保守的做法实现，不阻塞）

1. 上次导出里、现在不在公开列表中的记录：不预选、不发送，只显示条数，差异里会显示为删除。另一种做法是照原样发给 Memory，让它计入“已选中但不是公开 / 不可用”。
2. 结果未知的请求只保存在当前窗口进程里，退出 Runtime 就忘了，不写磁盘（适配层本来就不持久化任何内容）。退出后再做同样内容的导出，就是一次新决定。
3. 中文标签字体子集缺“公、群、友、套”，“公开”和“群友”都是需求原话里的词。按日文已有的先例，在 `cjk-manifest.json` 里把它们登记为标签位置回落到正文字体，没有重新切字体子集；其他缺字都改了措辞。
4. 页面放在 Memory → Vault 分组（导入与记忆库与恢复之间）。
5. Memory 契约 §5 的五项仍待 Morii 在 Memory 侧决定。其中“目标文件夹策略”会影响使用：现在同步文件夹和可移动磁盘都会被拒绝，所以要先导出到本机固定磁盘上的文件夹，再拷到别的电脑。
