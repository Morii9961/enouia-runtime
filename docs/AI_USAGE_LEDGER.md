# 本地 AI Usage Ledger

这是一套独立的 Windows 手动用量账本，可在桌面 Activity 的“私有用量”页操作，也可使用命令。它只读取每次明确选择的目录，把计量事实保存在仓库外私有账本中，再按要求生成离线 JSON。它不随桌面或 Activity 自动采集，不注册任务，不上传数据，也不计算货币价格。

**导出只含聚合，不含源正文。** 当前支持的旧格式没有可靠的请求开始时间，因此计量保留在协议的 `unallocated` 中：观测日期用于说明来源，不冒充每日用量归属。`days: not_collected` 不表示用量为零。Dashboard 可以显示这些未归日事实及质量原因，不能据此生成准确的上海日桶或完整价格。

## 查看命令与选择目录

桌面操作：进入 **Activity → 私有用量**，先选择配套程序包，再打开或新建账本。选择 Codex/Claude 来源，添加授权的日志根目录，按需填写确认可公开的模型名称，然后点击“采集所选目录”。采集结束后先查看覆盖诊断；冲突通过“读取冲突列表 → 查看计数 → 核对并采用/排除”处理。最后选择一个新 JSON 文件导出，供 Dashboard 手动导入。来源、程序包和目录选择只在本次应用运行期间保留，页面不会收到原始路径。

`scripts/package-usage.ps1 -Destination ABSOLUTE_NEW_FOLDER` 会从锁定源码离线构建并生成配套程序包，不安装或注册任务。桌面选择该文件夹中的清单与程序，并在每次启动前重新核对 SHA-256；选择令牌绑定当时核对的二进制摘要，即使同时更换程序与配套清单，也须重新选择。这不是数字签名，只选择自己核对过的本次构建产物。停止按钮只停止当前 Usage 子进程，已确认记录保留；离开页面不会把仍在进行的采集当作成功。源目录和账本都必须先由 Morii 明确选择，开发验证不包含个人日志。

在仓库内运行 `cargo run --offline --locked -p enouia-usage -- help`，或使用编译生成的 `enouia-usage.exe help`。独立 Usage 程序包不执行安装，也没有自动采集入口。

先由 Morii 选择一个新的账本目录。其父目录应已存在；账本必须位于本地磁盘，与源目录、仓库、程序目录和同步目录分开。首次 `init` 只接受新目录，不覆盖旧账本。新目录只允许当前 Windows 用户和 SYSTEM 访问；账本不是跨 Windows 账号可直接携带的备份格式。

以下大写名称均为需要自行替换的参数，文档不预选任何个人日志目录：

```text
enouia-usage init LEDGER
enouia-usage scan LEDGER codex_local SELECTED_CODEX_ROOT --model APPROVED_PUBLIC_MODEL
enouia-usage scan LEDGER claude_local SELECTED_CLAUDE_ROOT_1 SELECTED_CLAUDE_ROOT_2 --model APPROVED_PUBLIC_MODEL
enouia-usage health LEDGER codex_local
enouia-usage health LEDGER claude_local
```

所有路径均应为绝对路径，含空格时加引号。每次扫描重新传入源根，不自动查找用户主目录、Cowork 存储或历史会话。多个根必须互不包含。模型标签由 `--model` 明确批准，可重复指定；未批准的源模型映射为 `unknown`。只批准公开模型名称，勿使用私人名称、路径或标识。

扫描只接受支持形状的未压缩 JSONL；不会安装或升级 ccusage。当前正在被其他程序写入的文件可能无法取得安全只读句柄，会报告未读并保留旧事实。扫描受字节、行、目录、事件数量和时间限制；默认 120 秒，确需较长手动试验可使用 `--deadline-seconds 600`。不完整尾行留待下一次扫描。

## 看健康度并导出

`health` 分别报告最近尝试、最近完成、最近完整成功扫描、失败原因、覆盖计数、冲突组和已确认事实数量。这里的“完整成功”只表示本次选择范围内的受支持文件读取完成，不证明个人全部历史完整，也不证明计量可归日。未知缓存、模型和定价条件仍会保留。

```text
enouia-usage export LEDGER codex_local 2026-10-19 2026-10-26 NEW_OUTPUT_JSON
```

日期范围为左闭右开，最多 366 天。输出目标的父目录必须存在，文件必须尚不存在。命令会返回聚合提示与健康度；错误只返回固定代码，不回显私有路径。失败的文件写入可能留下不完整目标文件，须人工检查；命令不会自动覆盖它。

导出版本为 Dashboard `UsageSnapshot 1.1`，协议固定到 `Moriium-Dashboard@b66a472d04da3f7767dc5ba747ba1d5b9c494a9d`，详见 [usage-pin.json](integration/usage-pin.json)。同一账本修订和相同生成元数据会得到相同字节；命令行使用当前生成时间，因此不保证相隔运行的文件字节相同。随机 `dataset_id` 按来源分开，不能把另一个来源当作该账本的修订。

`unallocated` 始终携带整个数据集的当前集合，可能包含范围外的观测日期。它不是增量，也不能与每日行重复相加。超过 2,000 个聚合维度或 1 MiB 时整个导出拒绝，不会截断；缩小日期范围不能移除全数据集的未归日集合。当前版本没有跨数据集分片或压缩导出。

质量原因的计数遵守协议单位。不同作用域可能重叠，不能相加。目录不可读时无法得知文件数，Claude 消息冲突也无法得知会话数，此类次数使用 `null`。消失的文件保留已确认计量，并报告缺失与未重新观测。

## 重放与人工修订

```text
enouia-usage replay LEDGER SOURCE
enouia-usage candidates LEDGER SOURCE
enouia-usage inspect LEDGER SOURCE GROUP IDENTITY DIGEST
enouia-usage resolve LEDGER SOURCE GROUP IDENTITY DIGEST
enouia-usage resolve LEDGER SOURCE GROUP IDENTITY exclude
```

`SOURCE` 为 `codex_local` 或 `claude_local`。`candidates` 每页返回最多 64 个不透明的组、身份和版本摘要，并提供 `next_cursor`；下一次命令可在来源后传入该游标。`inspect` 只展示该候选的计数与受支持维度，供人工比较。确认后才能选择准确摘要，或明确排除某身份。Codex 分支冲突可能需要逐个排除歧义边；命令不会猜测哪条历史正确。桌面页提供前后翻页，并在证据变化时拒绝旧游标和旧审阅，要求刷新。

未解决冲突保留上次确认投影；若此前没有确认值，相关组保持隔离。选择修订后会形成新版本，可以向下修正，不会叠加旧值。同一身份以后出现新的不同计量，会重新要求解决冲突；明确排除整个身份的决定继续有效。保留的旧候选和历史修订不会被清理。`replay` 只从规范化证据重建投影，不能恢复已删除的原始日志，也不会更新最近成功采集时间；要改变源解析证据，必须再次明确选择根进行扫描。

账本损坏或权限变化会拒绝打开，不自动重建空库。`busy` 表示另一个手动命令持有独立写入锁；等待该命令结束。不要删除锁文件、SQLite WAL/SHM、身份文件或替换成 Activity 状态。

## 验证与下一步人工验收

合成实现证据见 [R1](validation/AI-usage-ledger-R1.md)、[R2](validation/AI-usage-ledger-R2.md)、[R3](validation/AI-usage-ledger-R3.md) 和 [桌面手动操作](validation/AI-usage-ledger-U1-desktop.md)。默认 Rust 测试不需要 Dashboard 检出；跨仓校验需要明确传入一个与固定提交一致的 Dashboard 协议工作树，既不安装依赖，也不修改该仓库。

真实小样本验收仍由 Morii 决定：先明确源目录与时间范围，再比较已选择样本中的累计链、重复副本、缓存字段和质量诊断；检查导出没有正文、路径和原始标识后，才决定是否手动导入 Dashboard。本轮未读取个人日志，也未启用调度、实时监视、VPS 传输或真实 Provider。物理断电恢复、全部历史覆盖和生产接受度仍未验收。
