#Requires -Version 7.2
[CmdletBinding()]
param([string] $Binary = (Join-Path $PSScriptRoot '..\target\release\enouia-activity.exe'), [switch] $LiveScheduler, [switch] $ClosedUiSync)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($ClosedUiSync -and -not $LiveScheduler) { throw '-ClosedUiSync requires -LiveScheduler and its independently owned synthetic task.' }
Import-Module (Join-Path $PSScriptRoot 'activity-package.psm1') -Force
$module = Get-Module 'activity-package'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base = Join-Path $workspace ('target\scheduler-test-' + [guid]::NewGuid().ToString('N'))
$taskName = 'Enouia-Activity-Test-' + [guid]::NewGuid().ToString('N')
$checks = 0
$closedUi = $null
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
    # $PSHOME is the real executable; a Store install's PATH entry is an app-execution alias.
    $pwsh = Join-Path $PSHOME 'pwsh.exe'
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
            function script:Enable-ScheduledTask { param($TaskName, $TaskPath, $ErrorAction) $script:testTask.State = 'Ready' }
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
        if ($ClosedUiSync) {
            Assert (@(Get-Process -Name 'enouia-desktop' -ErrorAction SilentlyContinue).Count -eq 0) 'Close the desktop before closed-UI acceptance; the test never closes user applications.'
            Assert ((TreeHash $state) -eq $before) 'Paused/busy scheduled runs changed Activity data.'
            $initial = (& $module { param($exe, $cfg) Invoke-ActivityProbe $exe @('overview', '--config', $cfg) } $manifest.binary $installedConfig).output | ConvertFrom-Json -AsHashtable
            $resumed = & $module { param($exe, $cfg) Invoke-ActivityProbe $exe @('set-paused', 'false', '--config', $cfg) } $manifest.binary $installedConfig
            Assert ($resumed.exitCode -eq 0 -and ($resumed.output | ConvertFrom-Json).paused -eq $false) 'Synthetic installed runner did not resume.'
            function Invoke-ClosedUiScheduledRun {
                $previous = (Get-ScheduledTaskInfo -TaskName $taskName -TaskPath '\').LastRunTime
                Start-ScheduledTask -TaskName $taskName -TaskPath '\'
                $end = [datetime]::UtcNow.AddSeconds(30)
                do {
                    Start-Sleep -Milliseconds 200
                    $runInfo = Get-ScheduledTaskInfo -TaskName $taskName -TaskPath '\'
                    $runTask = Get-ScheduledTask -TaskName $taskName -TaskPath '\'
                } while (($runInfo.LastRunTime -eq $previous -or $runTask.State -in 'Running', 'Queued') -and [datetime]::UtcNow -lt $end)
                Assert ($runInfo.LastRunTime -gt $previous -and $runTask.State -eq 'Ready') 'Scheduled closed-UI invocation did not finish.'
                Assert ($runInfo.LastTaskResult -eq 4) 'Delivery-disabled sync should retain pending and return the unresolved-delivery exit code.'
                Assert (@(Get-Process -Name 'enouia-desktop' -ErrorAction SilentlyContinue).Count -eq 0) 'A desktop process appeared during closed-UI acceptance.'
                return $runInfo.LastTaskResult
            }
            $firstResult = Invoke-ClosedUiScheduledRun
            $collected = (& $module { param($exe, $cfg) Invoke-ActivityProbe $exe @('overview', '--config', $cfg) } $manifest.binary $installedConfig).output | ConvertFrom-Json -AsHashtable
            Assert ($collected.pending.sequence -eq ($initial.producer.highestReserved + 1) -and $collected.producer.highestReserved -eq $collected.pending.sequence) 'Scheduled sync did not commit exactly the next sequence.'
            Assert (-not $collected.producer.deliveryEnabled -and -not $collected.producer.paused -and $collected.delivery.state -eq 'unconfigured') 'Scheduled sync changed isolated delivery/pause policy.'
            foreach ($source in @('github', 'codex', 'claude')) {
                Assert ($collected.sources[$source].freshness -eq 'failed' -and $collected.sources[$source].total -ceq $initial.sources[$source].total -and $collected.sources[$source].lastSuccessAt -eq $initial.sources[$source].lastSuccessAt) ('Scheduled failure lost retained source history: ' + $source)
            }
            $pendingTree = TreeHash $state
            $secondResult = Invoke-ClosedUiScheduledRun
            $retried = (& $module { param($exe, $cfg) Invoke-ActivityProbe $exe @('overview', '--config', $cfg) } $manifest.binary $installedConfig).output | ConvertFrom-Json -AsHashtable
            Assert ($retried.pending.sequence -eq $collected.pending.sequence -and $retried.pending.exactSha256 -ceq $collected.pending.exactSha256 -and $retried.producer.highestReserved -eq $collected.producer.highestReserved) 'Scheduled unresolved pending collected again or changed its identity.'
            Assert ((TreeHash $state) -eq $pendingTree) 'Delivery-disabled scheduled retry rewrote stored files.'
            $closedUi = @{ desktopClosed = $true; deliveryEnabled = $false; taskResults = @($firstResult, $secondResult); sequence = $collected.pending.sequence; exactPendingSha256 = $collected.pending.exactSha256; retainedSources = 3; pendingRetryByteIdentical = $true }
            # Uninstall must preserve the newly committed state, rather than
            # compare it against the pre-sync seed as the paused-only mode does.
            $before = TreeHash $state
        }
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
    if (-not $LiveScheduler) {
        # B5 production path (ADR-030), scheduler doubles only: explicit flag, exact name, disabled first, enable gated.
        $prodConfig = Join-Path $base 'production-delivery.json'
        $prodDelivery = @{ sshExecutable = (Join-Path $env:SystemRoot 'System32\OpenSSH\ssh.exe'); restrictedAlias = 'enouia-test-upload'; curlExecutable = (Join-Path $env:SystemRoot 'System32\curl.exe'); publicOrigin = 'https://status.invalid' }
        [IO.File]::WriteAllText($prodConfig, (@{version = 1; mode = 'production'; dataRoot = $state; deliveryEnabled = $true; delivery = $prodDelivery} | ConvertTo-Json -Depth 4))
        $releaseBinary = [IO.Path]::GetFullPath($Binary)
        Reject { Install-ActivityPackage -Binary $releaseBinary -Config $prodConfig -InstallRoot (Join-Path $base 'prod-unflagged') } 'Delivery-enabled production package accepted without -Production.'
        Reject { Install-ActivityPackage -Binary $releaseBinary -Config $deliveryConfig -InstallRoot (Join-Path $base 'prod-sandbox') -Production } 'Sandbox configuration accepted as production.'
        Reject { Install-ActivityPackage -Binary $releaseBinary -Config $production -InstallRoot (Join-Path $base 'prod-disabled') -Production } 'Delivery-disabled configuration accepted as a production package.'
        $prodRoot = Join-Path $base 'production-delivery-package'
        $prodName = 'Enouia-Activity-Production-Test'
        $prodInstalled = Install-ActivityPackage -Binary $releaseBinary -Config $prodConfig -InstallRoot $prodRoot -TaskName $prodName -Production
        Assert (-not $prodInstalled.taskRegistered -and $prodInstalled.paused -and $prodInstalled.mode -eq 'production') 'Production package was not installed paused and unregistered.'
        Assert (Test-Path -LiteralPath (Join-Path $prodRoot 'management\register-activity-production.ps1')) 'Production management script missing.'
        Reject { Register-ActivityProduction $prodRoot $prodName.ToLowerInvariant() } 'Inexact production confirmation accepted.'
        Reject { Register-ActivityProduction $install $taskName } 'Sandbox package registered as production.'
        $registered = Register-ActivityProduction $prodRoot $prodName
        Assert ($registered.state -eq 'production_registered_disabled' -and (& $module { $script:testTask.State }) -eq 'Disabled') 'Production task not registered disabled.'
        Reject { Register-ActivityProduction $prodRoot $prodName } 'Existing production task replaced.'
        Reject { Enable-ActivityProduction $prodRoot $prodName } 'Production task enabled without an observed publication.'
        Assert ((& $module { $script:testTask.State }) -eq 'Disabled') 'Refused enable changed the task.'
        # Model only the producer reply for the activation gate. Scheduler
        # calls remain doubles: no publication or real production task exists.
        $observed = @{
            schemaVersion = 1; kind = 'activity_overview'; pending = $null
            producer = @{ mode = 'production'; deliveryEnabled = $true; paused = $false }
            delivery = @{ state = 'observed'; pendingSequence = $null; publicHash = ('a' * 64); publicationObservedAt = '2026-10-08T00:00:00.000Z' }
        }
        & $module {
            $script:originalProbe = (Get-Item Function:Invoke-ActivityProbe).ScriptBlock
            function script:Invoke-ActivityProbe {
                param($Executable, $Arguments)
                if ($Arguments[0] -ne 'overview') { throw 'Activation model only supports overview.' }
                return @{ exitCode = 0; output = $script:activationReply }
            }
        }
        try {
            $mutations = @(
                @{ name = 'paused'; change = { param($v) $v.producer.paused = $true } },
                @{ name = 'pending'; change = { param($v) $v.pending = @{sequence = 51} } },
                @{ name = 'unobserved'; change = { param($v) $v.delivery.state = 'transported' } },
                @{ name = 'null pause'; change = { param($v) $v.producer.paused = $null } },
                @{ name = 'nonboolean pause'; change = { param($v) $v.producer.paused = 0 } },
                @{ name = 'sandbox reply'; change = { param($v) $v.producer.mode = 'sandbox' } },
                @{ name = 'delivery disabled'; change = { param($v) $v.producer.deliveryEnabled = $false } },
                @{ name = 'wrong kind'; change = { param($v) $v.kind = 'activity_public_preview' } },
                @{ name = 'wrong schema'; change = { param($v) $v.schemaVersion = 2 } },
                @{ name = 'pending delivery'; change = { param($v) $v.delivery.pendingSequence = 51 } },
                @{ name = 'missing pending'; change = { param($v) $v.Remove('pending') } },
                @{ name = 'missing public hash'; change = { param($v) $v.delivery.publicHash = $null } },
                @{ name = 'invalid public hash'; change = { param($v) $v.delivery.publicHash = 'unverified' } },
                @{ name = 'missing observation'; change = { param($v) $v.delivery.publicationObservedAt = $null } },
                @{ name = 'invalid observation'; change = { param($v) $v.delivery.publicationObservedAt = '2026-02-30T00:00:00.000Z' } }
            )
            foreach ($mutation in $mutations) {
                $reply = $observed | ConvertTo-Json -Depth 8 | ConvertFrom-Json -AsHashtable
                & $mutation.change $reply | Out-Null
                & $module { param($json) $script:activationReply = $json } ($reply | ConvertTo-Json -Depth 8)
                Reject { Enable-ActivityProduction $prodRoot $prodName } ('Invalid activation reply accepted: ' + $mutation.name)
                Assert ((& $module { $script:testTask.State }) -eq 'Disabled') ('Refused activation changed task: ' + $mutation.name)
            }
            & $module { param($json) $script:activationReply = $json } ($observed | ConvertTo-Json -Depth 8)
            $enabled = Enable-ActivityProduction $prodRoot $prodName
            Assert ($enabled.state -eq 'production_enabled' -and $enabled.publicHash -ceq ('a' * 64) -and (& $module { $script:testTask.State }) -eq 'Ready') 'Valid modeled publication did not enable the owned task double.'
            Reject { Enable-ActivityProduction $prodRoot $prodName } 'An already enabled production task was accepted.'
            Assert ((TreeHash $state) -eq $before) 'Production activation gates changed Activity data.'
        } finally {
            & $module { Set-Item Function:script:Invoke-ActivityProbe $script:originalProbe }
        }
        Assert ((Uninstall-ActivityTask $prodRoot).activityDataPreserved) 'Production uninstall failed.'
    }
    # Config tampering blocks later registration before any scheduler mutation.
    Add-Content -LiteralPath $installedConfig -Value ' '
    Reject { Register-ActivitySandbox $install } 'Changed config registered.'
    @{ checks = $checks; scheduler = $(if ($LiveScheduler) { 'real_unique_sandbox_task' } else { 'scheduler_doubles' }); state = 'passed'; closedUiSync = $closedUi } | ConvertTo-Json -Depth 6
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
