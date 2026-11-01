# UI v2 · 已保存检查点的事件覆盖，2026-11-01

基线 `365189d`，同一修复分支。此前时间尺切片仅标记 `checkpoint_created`；本片补齐当前 pin 已提供的真实覆盖字段，不改 Memory。

## 先核对拥有方源码

通过 GitHub 连接器读取固定 `bf6bfd10bf3c870ae2ce7ceb5c6bd635b08bf327` 的 [session_detail 实现](https://github.com/Morii9961/enouia-memory/blob/bf6bfd10bf3c870ae2ce7ceb5c6bd635b08bf327/crates/enouia-memory-workspace/src/lib.rs#L1720-L1785)。它按选定 Session/branch 过滤检查点，输出 `checkpoint_id`、`coverage_hash`、`covered_event_ids`、`created_at` 等保存字段，转录最多返回最近200事件。该证据解决先前未证明覆盖字段时留下的限制；不依赖 Memory 当前 main 的漂移。

## 行为与边界

- 默认不选择覆盖。选择某个已保存检查点后，只给本次加载事件中出现在 `covered_event_ids` 的行画括号，连续可见段分别有起止；不会跨过未覆盖事件或依据时间推断覆盖。
- 去重计算页外覆盖 ID 数，明确说明其不在本次转录中，不画不可见延伸。未知/无效覆盖形状不提供该选项；空覆盖不制造事件。
- 读取中或失败撤下覆盖，恢复后从当前回执重新派生；离开/换分支由既有组件所有权清理。未知时间仍可呈现确定的已保存 ID 覆盖，但时间地图继续停用。
- 没有新的 IPC，不读取额外事件，不验证或声明 coverage_hash，不把临时检查点说成已批准记忆。扩展现有 ResizeObserver 到内容父容器，使覆盖说明出现时地图重新测量可见范围。

## 验证

- 纯计算7/7：原4项时间计算及3项覆盖分段、页外去重、未知/无效覆盖用例。
- `session-time-map` 18/18：增加默认未选、精确保存 ID、读取中/失败撤下、恢复及未知时间仍可按 ID 覆盖六项断言，保留原有仅读取/生命周期断言。
- 字典/字体11/11；新增4键。初次日文「括弧」超出标签子集，按同义「対象の線」说明后通过；未改变字体回退或字体文件。
- `npm run check`、`npm run build` 通过，主 JS 450.56 kB（十进制）；两个根检查和 `git diff --check` 通过。完整 `npm test` 通过：Node 134通过、3跳过、0失败；内含 DOM 85场景、1149项断言全部通过。

三语 × 两主题 × 两尺寸共12组真实 App 合成预览，每组200事件、一个覆盖选择、8条可见覆盖及1个页外 ID。12/12无文档/转录横向溢出、分段为 start/mid×6/end、括号线宽2px，200条边界说明保留；保存起点/终点24张水印截图。已目视查看中文1440深色起点、日文1100浅色起点和终点。

本机 `.design/native-session-coverage-2026-11-01/` 保存 `visual-results.json`、24张 PNG、测试与构建日志。这仍是合成组件和浏览器验证；没有个人 Vault、真实 Provider、原生 WebView2/Windows 验收、pin 变更或合并。它替代初始 Sessions 记录中「覆盖字段仍待证明」的后续项，不改写该片原始验证范围。
