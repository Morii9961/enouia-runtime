#Requires -Version 7.2
[CmdletBinding()]
param([string] $Binary = (Join-Path $PSScriptRoot '..\target\release\enouia-activity.exe'), [switch] $LiveScheduler)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'activity-package.psm1') -Force
$module = Get-Module 'activity-package'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base = Join-Path $workspace ('target\scheduler-test-' + [guid]::NewGuid().ToString('N'))
$taskName = 'Enouia-Activity-Test-' + [guid]::NewGuid().ToString('N')
$checks = 0
function Assert($Condition, [string] $Message) {
    if (-not $Condition) { throw $Message }
    $script:checks++
}
function Reject([scriptblock] $Action, [string] $Message) {
    $failed = $false
    try { & $Action | Out-Null } catch { $failed = $true }
    Assert $failed $Message
}
function TreeHash([string] $Root) {
    return (@(Get-ChildItem -LiteralPath $Root -Recurse -File | Sort-Object FullName | ForEach-Object {
        $_.FullName.Substring($Root.Length) + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    }) -join '|')
}
function RunCli([string[]] $Arguments) {
    $result = & $module { param($exe, $argsList) Invoke-ActivityProbe $exe $argsList } ([IO.Path]::GetFullPath($Binary)) $Arguments
    return @{ code = $result.exitCode; value = ($result.output | ConvertFrom-Json -AsHashtable) }
}
try {
    [void][IO.Directory]::CreateDirectory($base)
    $state = Join-Path $base 'state'
    $legacy = Join-Path $base 'legacy'
    $install = Join-Path $base 'installed & independent'
    $config = Join-Path $base 'source-config.json'
    [void][IO.Directory]::CreateDirectory($state)
    [void][IO.Directory]::CreateDirectory($legacy)
    Copy-Item -LiteralPath (Join-Path $workspace 'tests\fixtures\activity\moriium-public-data.json') -Destination (Join-Path $legacy 'activity.json')
    [IO.File]::WriteAllText((Join-Path $legacy 'sequence.json'), '{"sequence":42}')
    [IO.File]::WriteAllText($config, (@{version = 1; mode = 'sandbox'; dataRoot = $state} | ConvertTo-Json))
    $import = RunCli @('migration-import', '--bundle', $legacy, '--config', $config, '--high-water', '50')
    Assert ($import.code -eq 0) 'Synthetic bootstrap failed.'
    Assert ((Get-ActivityPeSubsystem ([IO.Path]::GetFullPath($Binary))) -eq 2) 'Release console hiding is absent.'
    $pwsh = (Get-Command pwsh.exe -CommandType Application).Source
    $version = & $module { param($exe) Get-ActivityTool 'synthetic-version-probe' $exe 'unused.exe' @('--version') } $pwsh
    Assert ($version.configured -and $version.version -match '^7\.') 'Configured executable version probe failed.'
    Reject { & $module { param($exe) Invoke-ActivityProbe $exe @('-NoProfile', '-Command', '[Console]::Write("x" * 5000)') } $pwsh } 'Oversized probe output accepted.'
    Reject { & $module { param($missing) Get-ActivityTool 'missing' $missing 'unused.exe' } (Join-Path $base 'missing.exe') } 'Missing configured executable accepted.'
    $before = TreeHash $state
    $installed = Install-ActivityPackage -Binary ([IO.Path]::GetFullPath($Binary)) -Config $config -InstallRoot $install -TaskName $taskName
    Assert ($installed.taskEnabled -eq $false -and $installed.taskRegistered -eq $false -and $installed.paused) 'Install defaults must be disabled and paused.'
    Assert (($installed | ConvertTo-Json -Depth 10) -notmatch [regex]::Escape($base)) 'Exported install summary leaked a private path.'
    Assert ((TreeHash $state) -eq $before) 'Installation changed Activity data.'
    Assert (Test-Path -LiteralPath (Join-Path $install 'management\query-activity.ps1')) 'Installed management tools are missing.'
    $manifest = Get-Content -LiteralPath (Join-Path $install 'install.json') -Raw | ConvertFrom-Json -AsHashtable
    $xml = [xml](Get-Content -LiteralPath (Join-Path $install 'task.xml') -Raw)
    Assert ($xml.Task.Actions.Exec.Command -eq $manifest.binary -and $xml.Task.Actions.Exec.WorkingDirectory -eq $install) 'Action is not independently installed.'
    Assert ($xml.Task.Actions.Exec.Arguments -eq ('sync --config "' + $manifest.config + '"')) 'Escaped config argument did not round trip.'
    Assert ($xml.Task.Principals.Principal.LogonType -eq 'InteractiveToken' -and $xml.Task.Principals.Principal.RunLevel -eq 'LeastPrivilege') 'Wrong login policy.'
    Assert ($xml.Task.Triggers.TimeTrigger.Repetition.Interval -eq 'PT1H' -and $xml.Task.Triggers.LogonTrigger.Delay -eq 'PT15M') 'Wrong schedule.'
    Assert ($xml.Task.Settings.Enabled -eq 'false' -and $xml.Task.Settings.MultipleInstancesPolicy -eq 'IgnoreNew' -and $xml.Task.Settings.ExecutionTimeLimit -eq 'PT15M') 'Wrong disable/overlap/budget settings.'
    Assert ($xml.Task.Settings.StartWhenAvailable -eq 'true' -and $xml.Task.Settings.WakeToRun -eq 'false' -and $xml.Task.Settings.DisallowStartIfOnBatteries -eq 'false' -and $xml.Task.Settings.StopIfGoingOnBatteries -eq 'false') 'Wrong resume/battery policy.'
    Reject { Install-ActivityPackage -Binary ([IO.Path]::GetFullPath($Binary)) -Config $config -InstallRoot $install } 'Existing installation overwritten.'
    Reject { Install-ActivityPackage -Binary ([IO.Path]::GetFullPath($Binary)) -Config $config -InstallRoot (Join-Path $state 'nested') } 'Data/installation overlap accepted.'
    Reject { New-ActivityTaskXml 'relative.exe' $config $manifest.userSid $manifest.marker } 'Relative executable accepted.'
    Reject { New-ActivityTaskXml $manifest.binary $config 'S-1-5-18' $manifest.marker } 'SYSTEM principal accepted.'
    $production = Join-Path $base 'production.json'
    [IO.File]::WriteAllText($production, (@{version = 1; mode = 'production'; dataRoot = $state; deliveryEnabled = $false} | ConvertTo-Json))
    Reject { Install-ActivityPackage -Binary ([IO.Path]::GetFullPath($Binary)) -Config $production -InstallRoot (Join-Path $base 'blocked-production') -RegisterSandbox } 'Production registration was allowed.'
    Assert (-not (Test-Path -LiteralPath (Join-Path $base 'blocked-production'))) 'Rejected production registration left an install.'
    $prod = Install-ActivityPackage -Binary ([IO.Path]::GetFullPath($Binary)) -Config $production -InstallRoot (Join-Path $base 'production-package') -TaskName 'Enouia-Activity-Production'
    Assert (-not $prod.taskRegistered -and -not $prod.taskEnabled) 'Production package did not stay disabled.'
    Reject { Register-ActivitySandbox (Join-Path $base 'production-package') } 'Production package registered through separate API.'
    $productionManifestPath = Join-Path $base 'production-package\install.json'
    $productionManifest = Get-Content -LiteralPath $productionManifestPath -Raw | ConvertFrom-Json -AsHashtable
    $productionManifest.mode = 'sandbox'
    [IO.File]::WriteAllText($productionManifestPath, ($productionManifest | ConvertTo-Json -Depth 8))
    Reject { Register-ActivitySandbox (Join-Path $base 'production-package') } 'Relabeled production manifest bypassed config mode.'
    $deliveryConfig = Join-Path $base 'delivery-enabled.json'
    [IO.File]::WriteAllText($deliveryConfig, (@{version = 1; mode = 'sandbox'; dataRoot = $state; deliveryEnabled = $true} | ConvertTo-Json))
    Reject { Install-ActivityPackage -Binary ([IO.Path]::GetFullPath($Binary)) -Config $deliveryConfig -InstallRoot (Join-Path $base 'blocked-delivery') } 'Delivery-enabled package accepted before rehearsal.'
    $resume = RunCli @('set-paused', 'false', '--config', $config)
    Assert ($resume.code -eq 0) 'Synthetic resume failed.'
    Reject { Install-ActivityPackage -Binary ([IO.Path]::GetFullPath($Binary)) -Config $config -InstallRoot (Join-Path $base 'blocked-unpaused') } 'Unpaused installation accepted.'
    $pause = RunCli @('set-paused', 'true', '--config', $config)
    Assert ($pause.code -eq 0) 'Synthetic pause failed.'
    $before = TreeHash $state
    $installedConfig = $manifest.config
    $paused = & $module { param($exe, $cfg) Invoke-ActivityProbe $exe @('sync', '--config', $cfg) } $manifest.binary $installedConfig
    Assert ($paused.exitCode -eq 3 -and ($paused.output | ConvertFrom-Json).state -eq 'paused') 'Installed release did not preserve pause.'
    $lock = [IO.File]::Open((Join-Path $state 'sync.lock'), [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    try {
        $busy = & $module { param($exe, $cfg) Invoke-ActivityProbe $exe @('sync', '--config', $cfg) } $manifest.binary $installedConfig
        Assert ($busy.exitCode -eq 3 -and ($busy.output | ConvertFrom-Json).state -eq 'busy') 'Manual overlap did not observe the shared lock.'
    } finally { $lock.Dispose() }
    # Inject scheduler-only doubles; executable, files, probes, pause and lock above are real.
    if (-not $LiveScheduler) {
        & $module {
            param($name, $taskXml)
            $script:testTask = $null
            $script:testXml = $taskXml
            $script:testName = $name
            function script:Get-ScheduledTask { param($TaskPath, $ErrorAction) if ($script:testTask) { $script:testTask } }
            function script:Export-ScheduledTask { param($TaskName, $TaskPath, $ErrorAction) $script:testXml }
            function script:Register-ScheduledTask { param($TaskName, $TaskPath, $Xml, $ErrorAction) $script:testXml = $Xml; $script:testTask = [pscustomobject]@{TaskName = $TaskName; State = 'Disabled'} }
            function script:Get-ScheduledTaskInfo { param($TaskName, $TaskPath, $ErrorAction) [pscustomobject]@{LastTaskResult = 3} }
            function script:Disable-ScheduledTask { param($TaskName, $TaskPath, $ErrorAction) $script:testTask.State = 'Disabled' }
            function script:Unregister-ScheduledTask { param($TaskName, $TaskPath, $Confirm, $ErrorAction) $script:testTask = $null }
        } $taskName $xml.OuterXml
    }
    Register-ActivitySandbox $install
    $query = Get-ActivityPackageStatus $install
    Assert ($query.taskRegistered -and $query.taskState -eq 'Disabled' -and $query.activity.paused) 'Registered/query state mismatch.'
    Assert (($query | ConvertTo-Json -Depth 10) -notmatch [regex]::Escape($base)) 'Query leaked local paths.'
    if (-not $LiveScheduler) {
        & $module { $script:testXml = $script:testXml.Replace('<RunLevel>LeastPrivilege</RunLevel>', '').Replace('<WakeToRun>false</WakeToRun>', '').Replace('<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>', '') }
        $effective = Get-ActivityPackageStatus $install
        Assert (-not $effective.wakesComputer -and $effective.multipleInstancesPolicy -eq 'IgnoreNew') 'Omitted Windows defaults did not preserve effective policy.'
        & $module { param($original) $script:testXml = $original } $xml.OuterXml
    }
    Reject { Register-ActivitySandbox $install } 'Existing task replaced.'
    if ($LiveScheduler) {
        # Only this unique disabled sandbox task can be enabled; all data is synthetic and delivery is disabled.
        Enable-ScheduledTask -TaskName $taskName -TaskPath '\' | Out-Null
        $last = (Get-ScheduledTaskInfo -TaskName $taskName -TaskPath '\').LastRunTime
        Start-ScheduledTask -TaskName $taskName -TaskPath '\'
        $deadline = [datetime]::UtcNow.AddSeconds(30)
        do {
            Start-Sleep -Milliseconds 200
            $info = Get-ScheduledTaskInfo -TaskName $taskName -TaskPath '\'
            $task = Get-ScheduledTask -TaskName $taskName -TaskPath '\'
        } while (($info.LastRunTime -eq $last -or $task.State -eq 'Running') -and [datetime]::UtcNow -lt $deadline)
        Assert ($info.LastRunTime -gt $last -and $info.LastTaskResult -eq 3) 'Actual scheduled paused invocation failed.'
        $lock = [IO.File]::Open((Join-Path $state 'sync.lock'), [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
        try {
            $last = $info.LastRunTime
            Start-ScheduledTask -TaskName $taskName -TaskPath '\'
            $deadline = [datetime]::UtcNow.AddSeconds(30)
            do {
                Start-Sleep -Milliseconds 200
                $info = Get-ScheduledTaskInfo -TaskName $taskName -TaskPath '\'
                $task = Get-ScheduledTask -TaskName $taskName -TaskPath '\'
            } while (($info.LastRunTime -eq $last -or $task.State -eq 'Running') -and [datetime]::UtcNow -lt $deadline)
            Assert ($info.LastRunTime -gt $last -and $info.LastTaskResult -eq 3) 'Actual scheduled overlap did not return the busy code.'
        } finally { $lock.Dispose() }
    } else {
        & $module { $script:testTask.State = 'Running' }
        Reject { Uninstall-ActivityTask $install } 'Running task uninstalled.'
        & $module { $script:testTask.State = 'Disabled'; $script:testXml = $script:testXml -replace 'Enouia\.Activity\.Package\.v1:[a-f0-9-]{36}', 'unowned' }
        Reject { Uninstall-ActivityTask $install } 'Unowned task uninstalled.'
        & $module { param($original) $script:testXml = $original } $xml.OuterXml
    }
    $uninstalled = Uninstall-ActivityTask $install
    Assert ($uninstalled.activityDataPreserved -and $uninstalled.installedFilesPreserved) 'Uninstall retention report failed.'
    Assert ((TreeHash $state) -eq $before) 'Scheduler checks/uninstall changed Activity data.'
    Assert (Test-Path -LiteralPath $manifest.binary) 'Uninstall deleted installed binary.'
    Assert (-not (Get-ActivityPackageStatus $install).taskRegistered) 'Uninstall left a task registered.'
    $again = Uninstall-ActivityTask $install
    Assert ($again.activityDataPreserved) 'Uninstall is not idempotent.'
    # Config tampering blocks later registration before any scheduler mutation.
    Add-Content -LiteralPath $installedConfig -Value ' '
    Reject { Register-ActivitySandbox $install } 'Changed config registered.'
    @{ checks = $checks; scheduler = $(if ($LiveScheduler) { 'real_unique_sandbox_task' } else { 'scheduler_doubles' }); state = 'passed' } | ConvertTo-Json
} finally {
    if ($LiveScheduler -and (Test-Path -LiteralPath (Join-Path $base 'installed & independent\install.json'))) {
        # Cleanup uses the same source/action/user ownership check and never force-kills a running task.
        Uninstall-ActivityTask (Join-Path $base 'installed & independent') | Out-Null
    }
    $resolved = [IO.Path]::GetFullPath($base)
    $targetRoot = [IO.Path]::GetFullPath((Join-Path $workspace 'target')) + '\'
    if (-not $resolved.StartsWith($targetRoot, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notmatch '^scheduler-test-[a-f0-9]{32}$') { throw 'Cleanup path escaped the synthetic test root.' }
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
    Remove-Module 'activity-package' -Force
}
