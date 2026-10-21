# 历史批次请求的焦点与输出上限

日期：2026-10-21（Asia/Shanghai）。基线 `6089304`；Memory 开发 pin、53条命令和 aggregate 保持不变。再次读取 GitHub：Memory #39、Runtime #92 均为 OPEN/DRAFT，未合并。

准备按钮在请求返回后移除，原页面没有把仍归该操作所有的焦点交给正文；撤下请求也没有返回准备按钮。模型输出上限低于草稿值时，准备按钮会禁用，但页面只写固定的32768上限，没有关联错误说明。新增实际组件 fixture 在修正前明确得到四项失败，保存在 [JSON 记录](History-batch-focus-v1.json)。

修正后，请求正文具有可访问名称。准备完成或主动撤下请求，只在焦点仍归原控件所有或已落回 body 时移动焦点；期间移到其他控件的焦点不会被抢回，失效选择和请求代次不能触发旧交接。输出字段显示当前模型的实际上限，以 `aria-invalid` 和关联说明解释无效输入，保留原草稿等待主人编辑。焦点变化不检查确认框，也不触发发送。

完整 `npm test` 通过121项 Node测试、71个隔离 DOM journeys、951项断言，新增焦点 fixture 的八项均通过。生产与新增 fixture 的严格 TypeScript、harness syntax、标准 Windows no-bundle/NSIS build、实际 rendered installer 的26项检查通过。仍有既有大于500 kB的 chunk 提示。

在全新临时合成 Vault、仅虚构模型的专用配置目录、带 exe/同构建 loader 哈希 manifest 的隔离构建中，真实 WebView2 回归通过 **55/55**。其中16项检查本次批次流程，新增两项确认4096输出上限的无效输入说明，以及准备后的实际正文焦点。其余覆盖原 child、精确请求、Context/head变动、锁定撤下、重新打开后新 handle 和重新检查要求；没有激活 Send，没有 `external_send` operation。两张请求截图已检查，正文可见；截屏只覆盖当前滚动位置，不代表整份请求的人类审阅。窗口检查只断言文档根与请求卡片宽度，不推定所有内部滚动区域均无溢出。

标准包与隔离测试 exe 的哈希分别记录，不能混用。包未安装。native Rust、Core consumer、Clippy、pin/surface 和 domain boundary 未受本片修改影响，复用 [原验证](History-batch-request-v1.md)，没有记为本次重跑。物理键盘、Narrator、人类验收、真实 Provider质量和正式合并 pin 仍各自独立；未访问个人资料、凭据或真实 Provider，未进行候选入队/审核、部署、MV-8或云端工作。
