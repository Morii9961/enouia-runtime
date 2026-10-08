#Requires -Version 7.2
[CmdletBinding()]
param([string] $Binary = (Join-Path $PSScriptRoot '..\target\release\enouia-activity.exe'))
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base = Join-Path ([IO.Path]::GetTempPath()) ('enouia-activity-independent-' + [guid]::NewGuid().ToString('N'))
$install = Join-Path $base 'installed & independent'
$state = Join-Path $base 'state'
$seed = Join-Path $base 'bootstrap'
$config = Join-Path $base 'bootstrap-config.json'
$result = $null
Import-Module (Join-Path $PSScriptRoot 'activity-package.psm1') -Force
$module = Get-Module 'activity-package'
try {
    for ($ancestor = $base; ; $ancestor = [IO.Path]::GetDirectoryName($ancestor)) {
        if (Test-Path -LiteralPath (Join-Path $ancestor '.git')) { throw 'Independent acceptance must stay outside a Git working tree.' }
        if ([IO.Path]::GetDirectoryName($ancestor) -eq $ancestor -or -not [IO.Path]::GetDirectoryName($ancestor)) { break }
    }
    [void][IO.Directory]::CreateDirectory($seed)
    [void][IO.Directory]::CreateDirectory($state)
    [void][IO.Directory]::CreateDirectory((Join-Path $base 'work'))
    Copy-Item -LiteralPath (Join-Path $workspace 'tests\fixtures\activity\moriium-public-data.json') -Destination (Join-Path $seed 'activity.json')
    [IO.File]::WriteAllText((Join-Path $seed 'sequence.json'), '{"sequence":42}')
    [IO.File]::WriteAllText($config, (@{ version = 1; mode = 'sandbox'; dataRoot = $state } | ConvertTo-Json))
    $binaryPath = (Resolve-Path -LiteralPath $Binary).Path
    $imported = & $module { param($exe, $cfg, $bundle) Invoke-ActivityProbe $exe @('migration-import', '--bundle', $bundle, '--config', $cfg, '--high-water', '50') } $binaryPath $config $seed
    if ($imported.exitCode -ne 0) { throw 'Synthetic bootstrap failed.' }
    $package = Install-ActivityPackage -Binary $binaryPath -Config $config -InstallRoot $install -TaskName ('Enouia-Activity-Test-' + [guid]::NewGuid().ToString('N'))
    if ($package.taskRegistered -or $package.taskEnabled -or -not $package.paused) { throw 'Independent package must remain paused and unregistered.' }

    # Only this checked, freshly created bootstrap root and config are removed.
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    $resolvedBase = [IO.Path]::GetFullPath($base)
    if (-not $resolvedBase.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolvedBase) -notmatch '^enouia-activity-independent-[a-f0-9]{32}$') { throw 'Test root escaped local temporary storage.' }
    if ([IO.Path]::GetFullPath($seed) -ne (Join-Path $resolvedBase 'bootstrap')) { throw 'Unexpected bootstrap path.' }
    Remove-Item -LiteralPath $seed -Recurse -Force
    Remove-Item -LiteralPath $config -Force

    $worker = Join-Path $base 'worker.ps1'
    [IO.File]::WriteAllText($worker, @'
#Requires -Version 7.2
param([string] $InstallRoot)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$checks = [Collections.Generic.List[string]]::new()
function Assert($value, [string] $name) { if (-not $value) { throw $name }; $checks.Add($name) }
function Tree([string] $root) { return (@(Get-ChildItem -LiteralPath $root -Recurse -File | Sort-Object FullName | ForEach-Object { $_.FullName.Substring($root.Length) + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }) -join '|') }
$parent = [IO.Path]::GetDirectoryName($InstallRoot)
$manifest = Get-Content -LiteralPath (Join-Path $InstallRoot 'install.json') -Raw | ConvertFrom-Json -AsHashtable
$state = Join-Path $parent 'state'
$cfg = Get-Content -LiteralPath $manifest.config -Raw | ConvertFrom-Json -AsHashtable
Assert ($manifest.mode -eq 'sandbox' -and $cfg.mode -eq 'sandbox' -and -not $cfg['deliveryEnabled']) 'sandbox delivery stays disabled'
Assert (@($cfg.Keys | Where-Object { $_ -notin 'version', 'mode', 'dataRoot' }).Count -eq 0) 'no collector or credential configuration exists'
Assert ($cfg.dataRoot -eq $state -and $manifest.binary -eq (Join-Path $InstallRoot 'enouia-activity.exe')) 'installed paths use only the independent root'
Assert (-not (Test-Path -LiteralPath (Join-Path $parent 'bootstrap')) -and -not (Test-Path -LiteralPath (Join-Path $parent 'bootstrap-config.json'))) 'bootstrap source files are absent'
Assert ($PWD.Path -eq (Join-Path $parent 'work')) 'child working directory is independent'
Assert (@('git','node','cargo','gh','codex','claude' | Where-Object { Get-Command $_ -ErrorAction SilentlyContinue }).Count -eq 0) 'source and build tools are absent from child PATH'
Import-Module (Join-Path $InstallRoot 'management\activity-package.psm1') -Force
$module = Get-Module 'activity-package'
Assert ($module.Path -eq (Join-Path $InstallRoot 'management\activity-package.psm1')) 'management loads from the installed copy'
function InvokeInstalledCli([string[]] $arguments) {
    $r = & $module { param($exe,$list) Invoke-ActivityProbe $exe $list } $manifest.binary ($arguments + @('--config',$manifest.config))
    return @{ code=$r.exitCode; value=($r.output | ConvertFrom-Json -AsHashtable) }
}
$installedTree = Tree $InstallRoot
$initialTree = Tree $state
$initial = InvokeInstalledCli @('overview')
Assert ($initial.code -eq 0 -and $initial.value.producer.highestReserved -eq 50 -and $initial.value.producer.paused) 'installed runner reads the paused imported state'
$query = & (Join-Path $InstallRoot 'management\query-activity.ps1') -InstallRoot $InstallRoot | ConvertFrom-Json -AsHashtable
Assert (-not $query.taskRegistered -and $query.policyBasis -eq 'package_definition' -and $query.activity.paused) 'installed management query works without a registered task'
Assert ((Tree $state) -eq $initialTree) 'status reads leave Activity bytes unchanged'
$resumed = InvokeInstalledCli @('set-paused','false')
Assert ($resumed.code -eq 0 -and -not $resumed.value.paused) 'installed runner resumes without source configuration'
$sync = InvokeInstalledCli @('sync')
Assert ($sync.code -eq 4 -and $sync.value.sequence -eq 51 -and $sync.value.collectionAttempted) 'independent sync commits exactly the next pending sequence'
$current = (InvokeInstalledCli @('overview')).value
Assert ($current.pending.sequence -eq 51 -and $current.producer.highestReserved -eq 51 -and -not $current.producer.deliveryEnabled) 'pending and reservation remain delivery disabled'
foreach ($id in 'github','codex','claude') {
    Assert ($current.sources[$id].freshness -eq 'failed' -and $current.sources[$id].total -ceq $initial.value.sources[$id].total -and $current.sources[$id].lastSuccessAt -eq $initial.value.sources[$id].lastSuccessAt) ('unconfigured ' + $id + ' retains exact history')
}
$pendingTree = Tree $state
$retry = InvokeInstalledCli @('retry-pending')
Assert ($retry.code -eq 4) 'independent retry remains unresolved with no delivery configuration'
$after = (InvokeInstalledCli @('overview')).value
Assert ($after.pending.sequence -eq 51 -and $after.pending.exactSha256 -ceq $current.pending.exactSha256 -and $after.producer.highestReserved -eq 51) 'retry preserves pending identity without another reservation'
Assert ((Tree $state) -eq $pendingTree) 'unconfigured retry is byte identical'
$uninstalled = & (Join-Path $InstallRoot 'management\uninstall-activity.ps1') -InstallRoot $InstallRoot | ConvertFrom-Json -AsHashtable
Assert ($uninstalled.activityDataPreserved -and $uninstalled.installedFilesPreserved) 'unregistered installed uninstall preserves files'
Assert ((Tree $state) -eq $pendingTree -and (Tree $InstallRoot) -eq $installedTree) 'query and uninstall leave installation and latest Activity state intact'
@{ schemaVersion=1; state='passed'; scope='isolated_installed_package_clean_environment'; checks=@($checks); checkCount=$checks.Count; deliveryEnabled=$false; taskRegistered=$false; bootstrapRemoved=$true; childPath='Windows System32 only'; sequence=$after.pending.sequence; exactPendingSha256=$after.pending.exactSha256; runnerSha256=(Get-FileHash -LiteralPath $manifest.binary -Algorithm SHA256).Hash.ToLowerInvariant(); limitations=@('Source checkouts still exist on the host; this is not filesystem-denial or physical-absence evidence.','No real task is registered, enabled or removed.','No desktop, Memory index repair, production receiver, credentials or authenticated collectors are used.') } | ConvertTo-Json -Depth 6
'@)
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = Join-Path $PSHOME 'pwsh.exe'
    $start.WorkingDirectory = Join-Path $base 'work'
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($arg in @('-NoProfile','-NonInteractive','-File',$worker,'-InstallRoot',$install)) { $start.ArgumentList.Add($arg) }
    $start.Environment.Clear()
    $start.Environment['SystemRoot'] = $env:SystemRoot
    $start.Environment['WINDIR'] = $env:SystemRoot
    $start.Environment['PATH'] = Join-Path $env:SystemRoot 'System32'
    $start.Environment['TEMP'] = $base
    $start.Environment['TMP'] = $base
    $start.Environment['PSModulePath'] = (Join-Path $PSHOME 'Modules') + ';' + (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\Modules')
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $start
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(60000)) { $process.Kill($true); $process.WaitForExit(); throw 'Owned independent worker timed out.' }
        if ($process.ExitCode -ne 0) { throw ('Independent worker failed: ' + $stderr.GetAwaiter().GetResult()) }
        $result = $stdout.GetAwaiter().GetResult() | ConvertFrom-Json -AsHashtable
        if ($result.state -ne 'passed' -or $result.checkCount -ne $result.checks.Count) { throw 'Independent report is incomplete.' }
    } finally { $process.Dispose() }
    $result['harnessSha256'] = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $result | ConvertTo-Json -Depth 6
} finally {
    Remove-Module 'activity-package' -Force
    # Failures preserve the marked synthetic fixture for inspection. There is
    # no registered task; successful cleanup is restricted to our GUID root.
    if ($null -ne $result -and $result.state -eq 'passed') {
        $resolved = [IO.Path]::GetFullPath($base)
        $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
        if (-not $resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notmatch '^enouia-activity-independent-[a-f0-9]{32}$') { throw 'Cleanup escaped the marked temporary root.' }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
