param([Parameter(Mandatory=$true)][string]$Destination,[switch]$SkipBuild)
$ErrorActionPreference='Stop'
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not [IO.Path]::IsPathFullyQualified($Destination)) { throw 'An absolute destination is required' }
$target=[IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $target) { throw 'Destination already exists; choose a new folder' }
$parent=Split-Path -Parent $target
if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw 'Destination parent must exist' }
if (-not $SkipBuild) {
    Push-Location -LiteralPath $repository
    try { & cargo build --release --offline --locked -p enouia-usage --bin enouia-usage; if ($LASTEXITCODE -ne 0) { throw 'Usage build failed' } }
    finally { Pop-Location }
}
$binary=Join-Path $repository 'target/release/enouia-usage.exe'
if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) { throw 'Release runner is missing' }
New-Item -ItemType Directory -Path $target | Out-Null
Copy-Item -LiteralPath $binary -Destination (Join-Path $target 'enouia-usage.exe')
$hash=(Get-FileHash -LiteralPath (Join-Path $target 'enouia-usage.exe') -Algorithm SHA256).Hash.ToLowerInvariant()
$manifest=[ordered]@{kind='enouia_usage_package';version=1;desktop_protocol=1;binary='enouia-usage.exe';sha256=$hash}
[IO.File]::WriteAllText((Join-Path $target 'usage-package.json'),($manifest | ConvertTo-Json)+"`n",[Text.UTF8Encoding]::new($false))
$guide=@'
Enouia Usage — 独立本地程序包

保持 usage-package.json 与 enouia-usage.exe 在同一目录。
在配套 Runtime 中进入 Activity → 私有用量，选择本程序包目录。
打开或新建仓库外的私有账本，再明确选择 Codex/Claude 日志根目录并手动采集。
先查看覆盖与冲突，核对计数后采用修订，最后导出新的聚合 JSON 给 Dashboard 手动导入。
程序不自动发现个人目录、不注册任务、不上传数据，也不定价。
旧格式缺少可靠请求开始时间，用量保持未归日；这不等于准确每日账单。
本包未签名；清单只用于核对所选择程序的一致性，请只使用自己核对过的构建产物。
命令帮助：enouia-usage.exe help
源码、完整说明与验证：https://github.com/Morii9961/enouia-runtime/pull/93
'@
[IO.File]::WriteAllText((Join-Path $target 'README.txt'),$guide,[Text.UTF8Encoding]::new($false))
Write-Output "Usage package prepared; binary SHA256 $hash"
