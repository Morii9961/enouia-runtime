#Requires -Version 7.2
[CmdletBinding()]
param(
    [string] $Binary = (Join-Path $PSScriptRoot '..\target\release\enouia-activity.exe'),
    [switch] $WaitForHourlyRepeat
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'activity-package.psm1') -Force
$module = Get-Module 'activity-package'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base = Join-Path $workspace ('target\timed-scheduler-' + [guid]::NewGuid().ToString('N'))
$taskName = 'Enouia-Activity-Test-' + [guid]::NewGuid().ToString('N')
$install = Join-Path $base 'installed & independent'
$state = Join-Path $base 'state'
$manifest = $null
$report = [ordered]@{
    schemaVersion = 1; scope = 'isolated_actual_time_trigger'; state = 'preparing'
    observedAt = [datetime]::UtcNow.ToString('o'); hourlyRepeatRequested = [bool]$WaitForHourlyRepeat
    demandStarts = 0; deliveryEnabled = $false; taskRemoved = $false
    checks = [Collections.Generic.List[string]]::new(); phases = [Collections.Generic.List[object]]::new()
    harnessSha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
    runnerSha256 = (Get-FileHash -LiteralPath $Binary -Algorithm SHA256).Hash.ToLowerInvariant()
    limitations = @('Synthetic state only; no authenticated source, receiver or public upload.', 'Actual logon, battery/sleep/resume and production behavior remain unverified.')
}
function Save-Report {
    [IO.File]::WriteAllText((Join-Path $base 'report.json'), ($report | ConvertTo-Json -Depth 10) + "`n", [Text.UTF8Encoding]::new($false))
}
function Assert($Condition, [string] $Id) {
    if (-not $Condition) { throw ('Timed scheduler check failed: ' + $Id) }
    if ($report.checks.Contains($Id)) { throw ('Duplicate timed check: ' + $Id) }
    $report.checks.Add($Id)
}
function TreeHash([string] $Root) {
    $files = @(Get-ChildItem -LiteralPath $Root -Recurse -Force)
    if (@($files | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'Synthetic data contains a reparse point.' }
    return (@($files | Where-Object { -not $_.PSIsContainer } | Sort-Object FullName | ForEach-Object {
        $_.FullName.Substring($Root.Length) + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    }) -join '|')
}
function Probe([string[]] $Arguments) {
    $reply = & $module { param($exe, $argsList) Invoke-ActivityProbe $exe $argsList } ([IO.Path]::GetFullPath($Binary)) $Arguments
    $options = @{ AsHashtable = $true }
    if ((Get-Command ConvertFrom-Json).Parameters.ContainsKey('DateKind')) { $options.DateKind = 'String' }
    return @{ code = $reply.exitCode; value = ($reply.output | ConvertFrom-Json @options) }
}
function Installed-Overview {
    $reply = & $module { param($exe, $cfg) Invoke-ActivityProbe $exe @('overview', '--config', $cfg) } $manifest.binary $manifest.config
    if ($reply.exitCode -ne 0) { throw 'Installed synthetic overview failed.' }
    $options = @{ AsHashtable = $true }
    if ((Get-Command ConvertFrom-Json).Parameters.ContainsKey('DateKind')) { $options.DateKind = 'String' }
    return $reply.output | ConvertFrom-Json @options
}
function Assert-OwnedIdle {
    $owned = & $module { param($m) Get-ActivityOwnedTask $m } $manifest
    if (-not $owned -or $owned.State -in 'Running', 'Queued') { throw 'The unique synthetic task is missing, unowned or active; no trigger changes made.' }
}
function Arm-TimeTrigger {
    Assert-OwnedIdle
    Disable-ScheduledTask -TaskName $taskName -TaskPath '\' | Out-Null
    Assert-OwnedIdle
    $task = Get-ScheduledTask -TaskName $taskName -TaskPath '\'
    $timers = @($task.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskTimeTrigger' })
    if ($timers.Count -ne 1 -or $timers[0].Repetition.Interval -ne 'PT1H') { throw 'Unexpected owned time-trigger definition.' }
    # Change only this fixture's initial boundary, preserving the actual PT1H
    # repetition, principal, action, logon trigger and all product policies.
    $timers[0].StartBoundary = (Get-Date).AddSeconds(30).ToString('yyyy-MM-ddTHH:mm:ss', [Globalization.CultureInfo]::InvariantCulture)
    Set-ScheduledTask -TaskName $taskName -TaskPath '\' -Trigger $task.Triggers | Out-Null
    Assert-OwnedIdle
    Enable-ScheduledTask -TaskName $taskName -TaskPath '\' | Out-Null
    $next = (Get-ScheduledTaskInfo -TaskName $taskName -TaskPath '\').NextRunTime.ToUniversalTime()
    if ($next -le [datetime]::UtcNow -or $next -gt [datetime]::UtcNow.AddSeconds(60)) { throw 'Time trigger was not armed in the short observation window.' }
    return $next
}
function Wait-TimeTrigger([string] $Phase, [datetime] $Expected, [int] $Code) {
    $previous = (Get-ScheduledTaskInfo -TaskName $taskName -TaskPath '\').LastRunTime
    $report.state = 'waiting_' + $Phase
    $report['nextExpectedAt'] = $Expected.ToString('o')
    Save-Report
    Write-Output ('Waiting for owned time trigger: ' + $Phase + ' at ' + $Expected.ToString('o'))
    $deadline = $Expected.AddSeconds(120)
    do {
        Start-Sleep -Milliseconds 500
        $info = Get-ScheduledTaskInfo -TaskName $taskName -TaskPath '\'
        $task = Get-ScheduledTask -TaskName $taskName -TaskPath '\'
    } while (($info.LastRunTime -eq $previous -or $task.State -in 'Running', 'Queued') -and [datetime]::UtcNow -lt $deadline)
    $last = $info.LastRunTime.ToUniversalTime()
    Assert ($info.LastRunTime -gt $previous -and $task.State -eq 'Ready') ($Phase + ':actual_task_finished')
    Assert ($last -ge $Expected.AddSeconds(-2) -and $last -le $deadline) ($Phase + ':run_matches_time_boundary')
    Assert ($info.LastTaskResult -eq $Code) ($Phase + ':expected_exit_code')
    $report.phases.Add(@{ id = $Phase; expectedAt = $Expected.ToString('o'); lastRunAt = $last.ToString('o'); lastTaskResult = $info.LastTaskResult })
    Save-Report
}
try {
    [void][IO.Directory]::CreateDirectory($base)
    [IO.File]::WriteAllText((Join-Path $base 'TIMED_ACTIVITY_SANDBOX'), $taskName)
    Write-Output ('Synthetic timed task evidence: ' + (Join-Path $base 'report.json'))
    Assert (@(Get-Process -Name 'enouia-desktop' -ErrorAction SilentlyContinue).Count -eq 0) 'desktop_closed_before_timed_test'
    [void][IO.Directory]::CreateDirectory($state)
    $legacy = Join-Path $base 'legacy'
    [void][IO.Directory]::CreateDirectory($legacy)
    Copy-Item -LiteralPath (Join-Path $workspace 'tests\fixtures\activity\moriium-public-data.json') -Destination (Join-Path $legacy 'activity.json')
    [IO.File]::WriteAllText((Join-Path $legacy 'sequence.json'), '{"sequence":42}')
    $config = Join-Path $base 'source-config.json'
    [IO.File]::WriteAllText($config, (@{ version = 1; mode = 'sandbox'; dataRoot = $state; deliveryEnabled = $false } | ConvertTo-Json))
    $import = Probe @('migration-import', '--bundle', $legacy, '--config', $config, '--high-water', '50')
    Assert ($import.code -eq 0) 'synthetic_import_succeeds'
    $before = TreeHash $state
    $installed = Install-ActivityPackage -Binary ([IO.Path]::GetFullPath($Binary)) -Config $config -InstallRoot $install -TaskName $taskName
    Assert ($installed.paused -and -not $installed.taskRegistered) 'installed_paused_and_unregistered'
    $manifest = Get-Content -LiteralPath (Join-Path $install 'install.json') -Raw | ConvertFrom-Json -AsHashtable
    Register-ActivitySandbox $install
    Assert ((Get-ActivityPackageStatus $install).taskState -eq 'Disabled') 'registered_disabled'
    $first = Arm-TimeTrigger
    Wait-TimeTrigger 'paused_initial' $first 3
    Assert ((TreeHash $state) -eq $before) 'paused_timer_preserves_complete_store'
    $initial = Installed-Overview
    $resumed = Probe @('set-paused', 'false', '--config', $manifest.config)
    Assert ($resumed.code -eq 0 -and $resumed.value.paused -eq $false) 'resume_is_durable'
    if ($WaitForHourlyRepeat) {
        $second = (Get-ScheduledTaskInfo -TaskName $taskName -TaskPath '\').NextRunTime.ToUniversalTime()
        Assert (($second - $first).TotalSeconds -eq 3600) 'observed_repetition_is_exactly_one_hour'
        Wait-TimeTrigger 'resumed_hourly_repeat' $second 4
        Assert (($report.phases[1].lastRunAt | Get-Date) - ($report.phases[0].lastRunAt | Get-Date) -ge [timespan]::FromSeconds(3598)) 'actual_runs_span_elapsed_hour'
    } else {
        $second = Arm-TimeTrigger
        Wait-TimeTrigger 'resumed_rearmed_time' $second 4
        $report.limitations += 'Short rearmed boundaries are actual time-trigger evidence, not elapsed hourly repetition.'
    }
    $collected = Installed-Overview
    Assert ($collected.pending.sequence -eq ($initial.producer.highestReserved + 1) -and $collected.producer.highestReserved -eq $collected.pending.sequence) 'timer_commits_exactly_next_sequence'
    Assert (-not $collected.producer.deliveryEnabled -and -not $collected.producer.paused -and $collected.delivery.state -eq 'unconfigured') 'timer_keeps_delivery_disabled'
    foreach ($source in @('github', 'codex', 'claude')) {
        Assert ($collected.sources[$source].freshness -eq 'failed' -and $collected.sources[$source].total -ceq $initial.sources[$source].total -and $collected.sources[$source].lastSuccessAt -ceq $initial.sources[$source].lastSuccessAt) ('timer_retains_failed_source:' + $source)
    }
    $pendingTree = TreeHash $state
    $third = Arm-TimeTrigger
    Wait-TimeTrigger 'pending_rearmed_time' $third 4
    $retried = Installed-Overview
    Assert ($retried.pending.sequence -eq $collected.pending.sequence -and $retried.pending.exactSha256 -ceq $collected.pending.exactSha256 -and $retried.producer.highestReserved -eq $collected.producer.highestReserved) 'pending_timer_reuses_exact_batch'
    Assert ((TreeHash $state) -eq $pendingTree) 'pending_timer_preserves_complete_store'
    Assert (@(Get-Process -Name 'enouia-desktop' -ErrorAction SilentlyContinue).Count -eq 0) 'desktop_closed_after_timed_test'
    $report['sequence'] = $retried.pending.sequence
    $report['exactPendingSha256'] = $retried.pending.exactSha256
    $report.state = 'checks_passed_cleanup_pending'
} catch {
    $report.state = 'failed'
    # Do not export raw subprocess text, task XML or private paths.
    $report['failure'] = 'Timed rehearsal failed; inspect its private console log.'
    throw
} finally {
    try {
        if ($manifest) {
            $uninstalled = Uninstall-ActivityTask $install
            Assert ($uninstalled.activityDataPreserved -and $uninstalled.installedFilesPreserved) 'uninstall_preserves_fixture'
            Assert (-not (Get-ActivityPackageStatus $install).taskRegistered) 'owned_task_is_removed'
            $report.taskRemoved = $true
            if ($report.state -eq 'checks_passed_cleanup_pending') { $report.state = 'passed' }
        }
    } finally {
        if (Test-Path -LiteralPath $base) { Save-Report }
        Remove-Module 'activity-package' -Force
        # Preserve only this marked synthetic fixture for inspection; never
        # delete personal data or force-stop a still-running scheduler action.
    }
}
$report | ConvertTo-Json -Depth 10
