# R3 登记只读 Windows 候选 `1e96a6d`（2026-11-19）

应 Morii 要求，从 Runtime main `1e96a6d9e8d5e097c3f45f1d0e9d36a6ef9bc39a` 构建新候选，收入
[键盘锁定焦点修复](R3-owner-lock-keyboard-focus-2026-11-19.md)。内嵌 Memory pin 仍为
`506d23dc174a3e927d323f8f8d0b8ecfc9d1726d`，aggregate
`df3248e725f92952d0be265092babd5dbdbe6fec642720a0c400c71cbd9e7e53`，Workspace 61 命令。
沿用 x64、当前用户 NSIS 安装方式，产品版本 0.1.0，安装包和程序均为 `NotSigned`。产物在本机
忽略目录 `apps/desktop/target/candidate-1e96a6d/`。

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| `Enouia Runtime_0.1.0_x64-setup.exe` | 22,912,460 | `512b1ba9604c86e6aea6024949452c97c7fd9cf167eac3acd04fc0c24d18a053` |
| `enouia-desktop.exe` | 84,744,954 | `c4330e826fc1a4de9a86a1ee44cc077a95b25823024f27aebf0f0699675630b8` |
| `WebView2Loader.dll` | 160,880 | `86545b66cdb0603bc26b626fb9ad610cb6e71f28d468f5ea66df23b03dda96d5` |

`enouia-desktop.exe` 带 NSIS 打包类型信息，与焦点验证用的 `--no-bundle` 程序（`e2b29a12…`）
哈希不同；后者另存在 `apps/desktop/target/r3-lock-focus-verification/`。

## 与上一候选的差异

`12672683..1e96a6d` 的产品改动只有 `apps/desktop/src/memory/CatalogMemory.tsx`（锁定后焦点交给目录
标题），另有冒烟脚本和文档。`apps/desktop/src-tauri`、NSIS 模板与钩子、`scripts/desktop-installer`
和 Memory pin 均未变。

## 本候选上实际执行的检查

| 检查 | 结果 |
| --- | --- |
| `npm run desktop:bundle -- --no-sign -- --offline --locked`（TypeScript、Vite、Rust release、NSIS） | 通过 |
| 生成的 NSIS 模板 `template-check.ps1` | 26/26 |
| 候选程序与相邻 DLL `--owner-readonly-only`，新建的专用合成登记 | **25/25**，含键盘锁定后焦点落在目录标题 |
| 候选程序内置分段合成模式 `--catalog-only` | 42/42 |
| 冒烟后复核三份产物的大小与 SHA-256 | 一致 |

合成登记由忽略测试 `registered_native_owner_opens_same_root_reads_closes_and_reauthenticates` 在
`E:\EnouiaRuntimeSyntheticValidation` 下新建，授权一小时内使用。日志与结果位置记录
（`bundle.log`、`template-check.log`、`owner-smoke.log`、`catalog-smoke.log`、`*-location.txt`、
`artifacts.json`、`installer.nsi`）在候选目录。

## 未重跑的项目

隔离 NSIS 夹具（版本保护 7/7、登录项清理 5/5、锁定文件 2/2）只依赖模板与钩子，这两者自 `1267268`
未变，因此没有重跑。Workspace 快速导航、布局、无障碍、键盘流程的结果仍只属于 `1267268`，本候选
未重跑，不转记到这里。真实库代理实测同样只属于 `1267268`。

Morii 人工验收、实际安装与升级、托盘、全局热键、登录启动和分发仍待执行。上一候选
`apps/desktop/target/candidate-1267268/` 及其证据保留，用于对照。
