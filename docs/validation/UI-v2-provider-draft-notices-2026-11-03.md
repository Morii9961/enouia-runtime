# UI v2 设置草稿回执语言

基线：`587ab1a`。修复草稿复制、保存取消、保存成功及保存失败提示停留在操作时语言的问题。保存固定消息键；保存失败保留原错误，在显示时一起翻译错误说明。补齐流式能力及每会话尝试次数标签的中日文。草稿 JSON、输入值、保存/复制归属与显式重载边界不变。

未修改产品代码时，新增的 `zh-Hans_saved_notice_follows_language_without_resaving` 检查实际失败。修复后 `provider-draft-save` 场景 26 项断言通过，包括四种回执的三语切换、相同草稿节点/字节/焦点及不增加保存、复制或原生调用；`provider-config-draft` 13 项通过。定向 Node 检查（i18n、CJK、provider-settings-draft）19 项、类型检查、根 Memory pin 检查及 `git diff --check` 通过。

所有保存、剪贴板和失败均由注入的合成函数提供。未使用真实剪贴板、原生保存框或设置文件；没有重载 Core、读取凭据、调用服务商，未运行完整套件、构建或人工验收。
