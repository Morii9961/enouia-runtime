# 历史批次准备键的完整进程恢复

日期：2026-10-21（Asia/Shanghai），基线 `23d3781`。固定 Memory 开发 revision、53条命令和 aggregate 未改变。

进程内随机键能够跨页面和锁定保留，但完全退出后无法重建。新增 owner 的回归在原实现中失败：相同 Vault/任务/批次/policy/输出参数得到另一随机键。改为对带版本命名空间的精确参数数组做 UTF-8/SHA-256，返回 `ui-history-batch-v1-` 加64位小写十六进制；符合 Core 的16–128位 ASCII字母、数字、连字符或下划线规则。字段次序与命名空间属于v1协议，不能无版本变更地修改。

实现使用浏览器原生 [Web Crypto digest](https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/#SubtleCrypto-method-digest)，没有新增依赖，也不把用户资料持久化到文件或浏览器存储。键只恢复本地准备；它不是确认、发送键或授权。完整重启后仍先读回任务、显式选择原参数，取得新handle并重新检查。旧版随机键无法逆推出，本片不声称迁移旧版不明回执。任何已有 invocation仍由保存状态和Core规则阻止重新准备。

异步digest增加了提交前等待窗口。实际组件用延迟键派生复现两项失败：批次A→B→A，以及组件卸载后，旧准备仍被提交。现于IPC提交前重查当前选择、不可回退的代次、挂载状态和Provider观察；收据发布前仍保留原检查。两项修正后通过。派生时也复制并冻结精确参数，避免等待期间变动其键/参数绑定。

最终完整 `npm test` 通过 **122项Node测试、71个DOM场景、953项断言**；扩展焦点/提交前取消fixture的10项通过。生产及受影响fixture TypeScript、两个harness的syntax、隔离Windows no-bundle及标准NSIS构建、26项rendered installer检查通过。Rust/Core、Clippy、pin/domain未受影响，复用仍适用的原批次验证。既有大于500 kB的前端chunk提示保留。

独立合成Vault/虚构模型/哈希绑定exe和loader下，最终真实WebView2报告为 **63/63**。新增完整进程退出、全新WebView用户目录重开、重新读取任务/选择原参数、实际请求键相等、新handle需重新检查、Session不增且无external_send operation，以及第三个测试宿主正常退出。读取的只是合成memory_call请求体，fetch全部参数原样转发，不读取headers，不替换或模拟Core结果；准备回执仍来自实际固定Core。

两次中间原生运行得到62/63，失败来自测试观察器：Tauri 2.12的invoke属性不可写，赋值没有安装钩子，捕获键数组为空；身份差异列表为空。依据已安装Tauri脚本，改在fetch请求体观察后63/63通过。原失败报告与各自合成Vault保留，没有记成产品键恢复失败或删去失败证据。

原生报告、失败项目、正常/隔离工件的独立哈希在 [JSON记录](History-batch-restart-v1.json)。始终未激活Send，未触及个人历史/Vault、凭据、真实Provider、候选入队/审核、安装、部署、MV-8或云端。此证据不替代物理键盘、Narrator、主人验收、真实模型质量或正式合并pin。
