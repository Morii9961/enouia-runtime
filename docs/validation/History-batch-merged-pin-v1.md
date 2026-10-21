# 历史批次接入：合并依赖与正式pin

日期：2026-10-21（Asia/Shanghai）。Runtime合并前基线 `9880541eddf74540f1bbdb1a06f6be5e340697da`。Morii明确补充授权：本项任务完成后直接合并；此前“保持草稿、不自行合并”的临时限制由本次授权取代，其他阶段边界不变。

## Memory实际合并

[Memory #39](https://github.com/Morii9961/enouia-memory/pull/39) 于2026-10-21T04:36:36Z合并，实际SHA为 `18f4081d5fe8eef879d4383e306c24660f416c5e`，父提交为原main `a6e4da9958730ac8d7a151ce49c1108ff80f4228` 和功能提交 `d565181e0cb3bf14c938eb66a945269bba57ac8d`。合并使用精确head保护，没有跳过检查或强制合并。

合并前在功能提交上重新完成：414项离线Rust测试、fmt、严格all-target Clippy、Python3.12.10/jsonschema4.26.0独立Schema检查，以及已记录/已日志化的Runtime接入面检查。最初系统Python缺少jsonschema；随后在本任务target目录建立隔离虚拟环境，按Memory仓库六项精确版本安装验证依赖后通过。未修改全局Python或任何生产依赖。

获取实际合并对象后，验证功能提交是其祖先，且 `git diff` 为零：二者的tree均为 `ae532b3e9aa3dc73e67b0fade2fad10ed58522f9`。因此没有在Memory相同文件树上重复另一轮全套测试。Memory原checkout保持功能分支，两个未跟踪集中交接文档原样保留。

## Runtime正式接入

三个manifest依赖、八个锁定Memory包及memory-pin.json统一采用实际合并SHA。独立接入面仍为Workspace IPC v1、53 commands，aggregate `9b25885480cf2e220b37f231fe9973afaecb3bd68b8939fdf1c918d42ac233b2`。pin采用 `adoption.state=merged`，记录原功能SHA和实际合并时间。未使用branch、path、patch或本地分叉；没有升级其他依赖。

实际合并pin上重新通过：

| 检查 | 结果 |
| --- | --- |
| 桌面Rust单元/固定Core消费者 | 68 + 8，通过；准备及错误hash零凭据读取/零transport，正确独立确认后一次fake exchange |
| Rust fmt / all-target Clippy | 通过 |
| pin/实际合并对象surface | 通过，8项负例 |
| 解析后的生产/build依赖边界 | 通过，8个Memory包精确同SHA，7项负例 |
| 生产TypeScript和完整前端门禁 | 122项Node测试、71个隔离DOM场景、953项断言，通过 |
| 独立exe + 全新合成Vault的真实WebView2流程 | 63/63，通过；包括精确请求、head变动、锁/解锁、完整进程退出重启、同键新handle及新检查 |
| 标准Windows no-bundle / NSIS构建 | 通过；保留既有大于500 kB的chunk提示 |
| 实际rendered installer检查 | 26/26，通过；包未安装 |

原生模式只控制自己启动的进程，要求虚构模型metadata、hash绑定隔离exe/同构建WebView2Loader.dll、专用配置目录和空合成Vault。实际准备结果来自嵌入的合并Core。进程重启的键观察只读合成IPC请求体并原样转发；测试不激活Send，报告无external_send operation。Core消费者的fake exchange与此原生无发送流程分别计证据。

正常工件、隔离测试工件、loader和原始报告的独立哈希见 [JSON](History-batch-merged-pin-v1.json)。完整前端与native日志保存在各自ignored target/node_modules目录。初始未合并开发pin及此前失败复现仍保留为历史证据，不能替代本记录的最终pin结果。

## Runtime合并和证据界限

[Runtime #92](https://github.com/Morii9961/enouia-runtime/pull/92) 依本次授权，在以上检查及最终pin提交推送后标为ready并以精确head保护合并。本记录属于合并前证据，不预先猜测其main合入SHA；实际状态及合入对象以PR页面为准，合并后需获取对象、核对已测head祖先关系及文件树相等。

本轮只合并当前历史批次依赖及接入PR。没有真实历史、个人Vault、凭据/真实Provider调用、真实Send、安装、部署、生产启用、候选结果入队/批准、语义分析、MV-8或云端工作。Activity独立；物理键盘、Narrator、主人统一验收和真实模型质量仍是各自独立的后续证据。
