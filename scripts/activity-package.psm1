#Requires -Version 7.2
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-ActivityPath([string] $Path, [switch] $File, [switch] $New) {
    if (-not [IO.Path]::IsPathFullyQualified($Path) -or $Path -notmatch '^[A-Za-z]:\\' -or $Path -match '["\r\n]') {
        throw 'An absolute local Windows path without quotes or newlines is required.'
    }
    $full = [IO.Path]::GetFullPath($Path)
    $cursor = $full
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse paths are not supported.' }
        }
        $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
    if ($New) {
        if (Test-Path -LiteralPath $full) { throw 'Destination already exists; updates require a new install directory.' }
    } elseif (-not (Test-Path -LiteralPath $full)) { throw 'Required path is missing.' }
    elseif ($File -and -not (Test-Path -LiteralPath $full -PathType Leaf)) { throw 'A regular file is required.' }
    elseif (-not $File -and -not (Test-Path -LiteralPath $full -PathType Container)) { throw 'A directory is required.' }
    return $full
}

function Test-ActivityWithin([string] $Child, [string] $Parent) {
    return $Child.Equals($Parent, [StringComparison]::OrdinalIgnoreCase) -or
        $Child.StartsWith($Parent.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)
}

function Invoke-ActivityProbe([string] $Executable, [string[]] $Arguments) {
    # Version/help/diagnostic probes are private, bounded, hidden, and never login commands.
    $info = [Diagnostics.ProcessStartInfo]::new($Executable)
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    foreach ($arg in $Arguments) { $info.ArgumentList.Add($arg) }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $info
    $started = $false
    try {
        if (-not $process.Start()) { throw 'Tool probe could not start.' }
        $started = $true
        $stdout = [char[]]::new(4097)
        $stderr = [char[]]::new(4097)
        $outRead = $process.StandardOutput.ReadBlockAsync($stdout, 0, $stdout.Length)
        $errRead = $process.StandardError.ReadBlockAsync($stderr, 0, $stderr.Length)
        if (-not $process.WaitForExit(10000)) {
            $process.Kill($true)
            $process.WaitForExit()
            throw 'Tool probe timed out.'
        }
        if (-not $outRead.Wait(1000) -or -not $errRead.Wait(1000) -or $outRead.Result -gt 4096 -or $errRead.Result -gt 4096) {
            throw 'Tool probe exceeded its output bound.'
        }
        return @{ exitCode = $process.ExitCode; output = [string]::new($stdout, 0, $outRead.Result) + [string]::new($stderr, 0, $errRead.Result) }
    } finally {
        if ($started -and -not $process.HasExited) { $process.Kill($true); $process.WaitForExit() }
        $process.Dispose()
    }
}

function Get-ActivityTool([string] $Name, [string] $ConfiguredPath, [string] $CommandName, [string[]] $VersionArgs = @('--version')) {
    $selected = $ConfiguredPath
    if (-not $selected) {
        $command = Get-Command $CommandName -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command) { $selected = $command.Source }
    }
    if (-not $selected) { return @{ name = $Name; configured = $false; status = 'not_found'; version = $null; path = $null } }
    try {
        $selected = Resolve-ActivityPath $selected -File
        if ([IO.Path]::GetExtension($selected) -ine '.exe') { throw 'Select the actual executable, not a shell wrapper.' }
        $probe = Invoke-ActivityProbe $selected $VersionArgs
        $match = [regex]::Match($probe.output, '(?<!\d)\d+\.\d+(?:\.\d+)?(?!\d)')
        if ($probe.exitCode -ne 0 -or -not $match.Success) { throw 'Tool version probe failed; raw output is not exported.' }
    } catch {
        if ($ConfiguredPath) { throw }
        return @{ name = $Name; configured = $false; status = 'requires_explicit_path'; version = $null; path = $null }
    }
    return @{ name = $Name; configured = [bool]$ConfiguredPath; status = 'version_only'; version = $match.Value; path = $selected }
}

function Get-ActivityPeSubsystem([string] $Binary) {
    $stream = [IO.File]::OpenRead($Binary)
    $reader = [IO.BinaryReader]::new($stream)
    try {
        if ($reader.ReadUInt16() -ne 0x5a4d) { throw 'Invalid Windows executable.' }
        $stream.Position = 0x3c
        $offset = $reader.ReadInt32()
        if ($offset -lt 64 -or $offset + 94 -gt $stream.Length) { throw 'Invalid Windows executable.' }
        $stream.Position = $offset
        if ($reader.ReadUInt32() -ne 0x4550) { throw 'Invalid Windows executable.' }
        $stream.Position = $offset + 24
        if ($reader.ReadUInt16() -notin 0x10b, 0x20b) { throw 'Invalid Windows executable.' }
        $stream.Position = $offset + 24 + 68
        return $reader.ReadUInt16()
    } finally { $reader.Dispose(); $stream.Dispose() }
}

function New-ActivityTaskXml([string] $Binary, [string] $Config, [string] $UserSid, [string] $Marker, [datetime] $Start = (Get-Date).AddHours(1)) {
    if ($UserSid -notmatch '^S-1-5-21-\d+-\d+-\d+-\d+$') { throw 'An interactive user SID is required.' }
    foreach ($path in @($Binary, $Config)) {
        if (-not [IO.Path]::IsPathFullyQualified($path) -or $path -match '["\r\n]') { throw 'Invalid action path.' }
    }
    $binaryXml = [Security.SecurityElement]::Escape($Binary)
    $configXml = [Security.SecurityElement]::Escape('sync --config "' + $Config + '"')
    $workXml = [Security.SecurityElement]::Escape([IO.Path]::GetDirectoryName($Binary))
    $markerXml = [Security.SecurityElement]::Escape($Marker)
    $startXml = $Start.ToString('yyyy-MM-ddTHH:mm:ss', [Globalization.CultureInfo]::InvariantCulture)
    # Hidden hides the task entry, not its process. Install requires a GUI-subsystem release binary.
    return @"
<?xml version="1.0"?>
<Task version="1.3" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Source>$markerXml</Source><Description>Enouia Activity; interactive login required; data pause is independent of task state.</Description></RegistrationInfo>
  <Triggers>
    <TimeTrigger><Enabled>true</Enabled><StartBoundary>$startXml</StartBoundary><Repetition><Interval>PT1H</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition></TimeTrigger>
    <LogonTrigger><Enabled>true</Enabled><UserId>$UserSid</UserId><Delay>PT15M</Delay></LogonTrigger>
  </Triggers>
  <Principals><Principal id="User"><UserId>$UserSid</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate><StartWhenAvailable>true</StartWhenAvailable><RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand><Enabled>false</Enabled><Hidden>true</Hidden><RunOnlyIfIdle>false</RunOnlyIfIdle><WakeToRun>false</WakeToRun><ExecutionTimeLimit>PT15M</ExecutionTimeLimit>
  </Settings>
  <Actions Context="User"><Exec><Command>$binaryXml</Command><Arguments>$configXml</Arguments><WorkingDirectory>$workXml</WorkingDirectory></Exec></Actions>
</Task>
"@
}

function Write-ActivityNewFile([string] $Path, [string] $Text) {
    $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $bytes = [Text.UTF8Encoding]::new($false).GetBytes($Text); $stream.Write($bytes); $stream.Flush($true) }
    finally { $stream.Dispose() }
}

function Install-ActivityPackage {
    param([string] $Binary, [string] $Config, [string] $InstallRoot, [string] $RuntimeToolsRoot, [string] $TaskName = 'Enouia-Activity-Sandbox', [switch] $RegisterSandbox, [switch] $Production)
    if ($TaskName -notmatch '^Enouia-Activity-[A-Za-z0-9_-]{1,80}$') { throw 'Use an Enouia-Activity- task name.' }
    $binaryPath = Resolve-ActivityPath $Binary -File
    $configPath = Resolve-ActivityPath $Config -File
    $installPath = Resolve-ActivityPath $InstallRoot -New
    if ((Get-ActivityPeSubsystem $binaryPath) -ne 2) { throw 'Install the hidden release binary, not a console/debug binary.' }
    if ((Get-Item -LiteralPath $configPath).Length -gt 65536) { throw 'Configuration exceeds its size limit.' }
    $settings = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json -AsHashtable
    $dataRoot = Resolve-ActivityPath $settings.dataRoot
    if ((Test-ActivityWithin $dataRoot $installPath) -or (Test-ActivityWithin $installPath $dataRoot)) { throw 'Install and Activity data directories must be disjoint.' }
    if ($Production) {
        # B5 (ADR-030): an explicit production package may deliver; it is still installed paused and unregistered.
        $delivery = $settings['delivery']
        if ($settings.mode -ne 'production' -or $settings['deliveryEnabled'] -ne $true -or -not $delivery -or $RegisterSandbox -or
            "$($delivery['publicOrigin'])" -notmatch '^https://[A-Za-z0-9.-]+$' -or "$($delivery['restrictedAlias'])" -notmatch '^[A-Za-z0-9._-]{1,64}$') {
            throw 'A production package needs mode production, delivery enabled, an HTTPS origin and a restricted alias.'
        }
    } elseif ($settings.mode -notin 'sandbox', 'production' -or $settings['deliveryEnabled']) { throw 'Packaging requires a sandbox/production configuration with delivery disabled.' }
    if ($RegisterSandbox -and $settings.mode -ne 'sandbox') { throw 'Production task registration belongs to the B5 cutover, not this installer.' }
    $diagnostic = Invoke-ActivityProbe $binaryPath @('diagnostics', '--config', $configPath)
    if ($diagnostic.exitCode -ne 0) { throw 'The configuration must diagnose a valid idle store before installation.' }
    $health = $diagnostic.output | ConvertFrom-Json -AsHashtable
    if ($health.paused -ne $true) { throw 'Pause the Activity store explicitly before installation.' }
    $claude = if ($settings['claude']) { $settings['claude'] } else { @{} }
    $github = if ($settings['github']) { $settings['github'] } else { @{} }
    $codex = if ($settings['codex']) { $settings['codex'] } else { @{} }
    $delivery = if ($settings['delivery']) { $settings['delivery'] } else { @{} }
    $tools = @(
        Get-ActivityTool 'node' $claude['nodeExecutable'] 'node.exe'
        Get-ActivityTool 'gh' $github['executable'] 'gh.exe'
        Get-ActivityTool 'codex' $codex['executable'] 'codex.exe'
        Get-ActivityTool 'ssh' $delivery['sshExecutable'] 'ssh.exe' @('-V')
        Get-ActivityTool 'curl' $delivery['curlExecutable'] 'curl.exe'
    )
    if ($claude.Count) {
        $owned = Resolve-ActivityPath $RuntimeToolsRoot
        $cli = Resolve-ActivityPath $settings.claude.ccusageCli -File
        if (-not (Test-ActivityWithin $cli $owned)) { throw 'ccusage must be inside the explicitly selected Runtime-owned tools directory.' }
        $packagePath = Resolve-ActivityPath (Join-Path ([IO.Path]::GetDirectoryName([IO.Path]::GetDirectoryName($cli))) 'package.json') -File
        if ((Get-Item -LiteralPath $packagePath).Length -gt 65536) { throw 'Invalid ccusage package metadata.' }
        $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json -AsHashtable
        if ($package.name -ne 'ccusage' -or $package.version -ne '20.0.20') { throw 'Runtime requires ccusage@20.0.20.' }
        $tools += @{ name = 'ccusage'; configured = $true; status = 'package_metadata_only'; version = $package.version; path = $cli }
    } else { $tools += @{ name = 'ccusage'; configured = $false; status = 'unconfigured'; version = $null; path = $null } }
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $marker = 'Enouia.Activity.Package.v1:' + [guid]::NewGuid().ToString('D')
    $installedBinary = Join-Path $installPath 'enouia-activity.exe'
    $installedConfig = Join-Path $installPath 'activity-config.json'
    $xml = New-ActivityTaskXml $installedBinary $installedConfig $sid $marker
    [void][IO.Directory]::CreateDirectory($installPath)
    # No credential/config-directory copying, package download, PATH change, or data deletion.
    [IO.File]::Copy($binaryPath, $installedBinary, $false)
    [IO.File]::Copy($configPath, $installedConfig, $false)
    $management = Join-Path $installPath 'management'
    [void][IO.Directory]::CreateDirectory($management)
    foreach ($script in @('activity-package.psm1', 'install-activity.ps1', 'query-activity.ps1', 'uninstall-activity.ps1', 'register-activity-production.ps1')) {
        [IO.File]::Copy((Join-Path $PSScriptRoot $script), (Join-Path $management $script), $false)
    }
    Write-ActivityNewFile (Join-Path $installPath 'task.xml') $xml
    $manifest = [ordered]@{ schemaVersion = 1; marker = $marker; taskName = $TaskName; mode = $settings.mode; userSid = $sid; binary = $installedBinary; config = $installedConfig; dataRoot = $dataRoot; binaryHash = (Get-FileHash -LiteralPath $installedBinary -Algorithm SHA256).Hash; configHash = (Get-FileHash -LiteralPath $installedConfig -Algorithm SHA256).Hash; tools = $tools; installedAt = [datetime]::UtcNow.ToString('o') }
    Write-ActivityNewFile (Join-Path $installPath 'install.json') ($manifest | ConvertTo-Json -Depth 8)
    $check = Invoke-ActivityProbe $installedBinary @('diagnostics', '--config', $installedConfig)
    if ($check.exitCode -ne 0 -or ($check.output | ConvertFrom-Json -AsHashtable).paused -ne $true) { throw 'Installed paused-state diagnostic failed; package preserved for inspection, no task registered.' }
    if ($RegisterSandbox) { Register-ActivitySandbox $installPath }
    return @{ schemaVersion = 1; state = 'installed'; mode = $settings.mode; taskRegistered = [bool]$RegisterSandbox; taskEnabled = $false; paused = $true; toolVersions = @($tools | ForEach-Object { @{ name = $_.name; version = $_.version; status = $_.status; configured = $_.configured } }) }
}

function Read-ActivityPackage([string] $InstallRoot) {
    $root = Resolve-ActivityPath $InstallRoot
    $path = Resolve-ActivityPath (Join-Path $root 'install.json') -File
    if ((Get-Item -LiteralPath $path).Length -gt 65536) { throw 'Invalid package manifest.' }
    $manifest = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json -AsHashtable
    if ($manifest.schemaVersion -ne 1 -or $manifest.marker -notmatch '^Enouia\.Activity\.Package\.v1:[a-f0-9-]{36}$' -or $manifest.taskName -notmatch '^Enouia-Activity-[A-Za-z0-9_-]{1,80}$' -or $manifest.userSid -ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value) { throw 'Package identity does not match the current interactive user.' }
    foreach ($pair in @(@('binary', 'enouia-activity.exe'), @('config', 'activity-config.json'))) {
        if ($manifest[$pair[0]] -ne (Join-Path $root $pair[1])) { throw 'Package paths do not match the install root.' }
    }
    return $manifest
}

function Get-ActivityOwnedTask($Manifest) {
    $tasks = @(Get-ScheduledTask -TaskPath '\' -ErrorAction Stop | Where-Object { $_.TaskName -eq $Manifest.taskName })
    if ($tasks.Count -eq 0) { return $null }
    if ($tasks.Count -ne 1) { throw 'Ambiguous task identity.' }
    $xml = [xml](Export-ScheduledTask -TaskName $Manifest.taskName -TaskPath '\' -ErrorAction Stop)
    $action = @($xml.Task.Actions.Exec)
    # Scheduler export may omit the principal's default LeastPrivilege element.
    $runLevel = $xml.Task.Principals.Principal.GetElementsByTagName('RunLevel')
    if ($xml.Task.RegistrationInfo.Source -ne $Manifest.marker -or $action.Count -ne 1 -or $xml.Task.Actions.ChildNodes.Count -ne 1 -or $xml.Task.Principals.ChildNodes.Count -ne 1 -or
        $action[0].Command -ne $Manifest.binary -or $action[0].Arguments -ne ('sync --config "' + $Manifest.config + '"') -or
        $action[0].WorkingDirectory -ne [IO.Path]::GetDirectoryName($Manifest.binary) -or
        $xml.Task.Principals.Principal.UserId -ne $Manifest.userSid -or $xml.Task.Principals.Principal.LogonType -ne 'InteractiveToken' -or
        ($runLevel.Count -gt 0 -and $runLevel[0].InnerText -ne 'LeastPrivilege')) { throw 'Existing task is not owned by this package; no changes made.' }
    return [pscustomobject]@{ TaskName = $tasks[0].TaskName; State = $tasks[0].State; Definition = $xml }
}

function Register-ActivitySandbox([string] $InstallRoot) {
    $manifest = Read-ActivityPackage $InstallRoot
    if ($manifest.mode -ne 'sandbox') { throw 'Production registration is blocked until B5.' }
    foreach ($kind in @('binary', 'config')) {
        $path = Resolve-ActivityPath $manifest[$kind] -File
        if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $manifest[$kind + 'Hash']) { throw 'Installed content changed; prepare a new package before registration.' }
    }
    $settings = Get-Content -LiteralPath $manifest.config -Raw | ConvertFrom-Json -AsHashtable
    if ($settings.mode -ne 'sandbox' -or $settings['deliveryEnabled']) { throw 'Only a delivery-disabled sandbox configuration can be registered here.' }
    $health = Invoke-ActivityProbe $manifest.binary @('diagnostics', '--config', $manifest.config)
    if ($health.exitCode -ne 0 -or ($health.output | ConvertFrom-Json -AsHashtable).paused -ne $true) { throw 'Sandbox registration requires a valid paused store.' }
    if (@(Get-ScheduledTask -TaskPath '\' -ErrorAction Stop | Where-Object { $_.TaskName -eq $manifest.taskName }).Count) { throw 'Task already exists; it will not be overwritten.' }
    # Rebuild from owned metadata rather than registering editable task.xml blindly.
    $xml = New-ActivityTaskXml $manifest.binary $manifest.config $manifest.userSid $manifest.marker
    [void](Register-ScheduledTask -TaskName $manifest.taskName -TaskPath '\' -Xml $xml -ErrorAction Stop)
    $task = Get-ActivityOwnedTask $manifest
    if (-not $task -or $task.State -ne 'Disabled') { throw 'Registered task did not remain disabled.' }
}

function Assert-ActivityProductionPackage($Manifest, [string] $ConfirmTaskName) {
    if ($Manifest.mode -ne 'production' -or $ConfirmTaskName -cne $Manifest.taskName) { throw 'Confirm the exact production task name of a production package.' }
    foreach ($kind in @('binary', 'config')) {
        $path = Resolve-ActivityPath $Manifest[$kind] -File
        if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $Manifest[$kind + 'Hash']) { throw 'Installed content changed; prepare a new package before registration.' }
    }
    $settings = Get-Content -LiteralPath $Manifest.config -Raw | ConvertFrom-Json -AsHashtable
    if ($settings.mode -ne 'production' -or $settings['deliveryEnabled'] -ne $true) { throw 'Only a delivery-enabled production configuration can be scheduled.' }
}

# B5 Stage 5 (ADR-030). Registration creates the task disabled; enabling is a
# separate call that requires an observed publication and no pending batch.
function Register-ActivityProduction([string] $InstallRoot, [string] $ConfirmTaskName) {
    $manifest = Read-ActivityPackage $InstallRoot
    Assert-ActivityProductionPackage $manifest $ConfirmTaskName
    if (@(Get-ScheduledTask -TaskPath '' -ErrorAction Stop | Where-Object { $_.TaskName -eq $manifest.taskName }).Count) { throw 'Task already exists; it will not be overwritten.' }
    $xml = New-ActivityTaskXml $manifest.binary $manifest.config $manifest.userSid $manifest.marker
    [void](Register-ScheduledTask -TaskName $manifest.taskName -TaskPath '' -Xml $xml -ErrorAction Stop)
    $task = Get-ActivityOwnedTask $manifest
    if (-not $task -or $task.State -ne 'Disabled') { throw 'Registered task did not remain disabled.' }
    return @{ schemaVersion = 1; state = 'production_registered_disabled'; taskName = $manifest.taskName }
}

function Enable-ActivityProduction([string] $InstallRoot, [string] $ConfirmTaskName) {
    $manifest = Read-ActivityPackage $InstallRoot
    Assert-ActivityProductionPackage $manifest $ConfirmTaskName
    $task = Get-ActivityOwnedTask $manifest
    if (-not $task -or $task.State -ne 'Disabled') { throw 'Enable only a registered, disabled task owned by this package.' }
    $probe = Invoke-ActivityProbe $manifest.binary @('overview', '--config', $manifest.config)
    if ($probe.exitCode -ne 0) { throw 'The production store must be readable before scheduling.' }
    $overview = $probe.output | ConvertFrom-Json -AsHashtable
    if ($overview.producer.paused -or $overview.pending -or $overview.delivery.state -ne 'observed') { throw 'Enable only after a manual production cycle was observed published, with sync resumed and nothing pending.' }
    [void](Enable-ScheduledTask -TaskName $manifest.taskName -TaskPath '' -ErrorAction Stop)
    $task = Get-ActivityOwnedTask $manifest
    if (-not $task -or $task.State -notin 'Ready', 'Running') { throw 'Task did not become enabled.' }
    return @{ schemaVersion = 1; state = 'production_enabled'; taskName = $manifest.taskName; publicHash = $overview.delivery.publicHash }
}

function Get-ActivityPackageStatus([string] $InstallRoot) {
    $manifest = Read-ActivityPackage $InstallRoot
    foreach ($kind in @('binary', 'config')) { [void](Resolve-ActivityPath $manifest[$kind] -File) }
    $task = Get-ActivityOwnedTask $manifest
    $lastResult = $null
    if ($task) { $lastResult = (Get-ScheduledTaskInfo -TaskName $manifest.taskName -TaskPath '\' -ErrorAction Stop).LastTaskResult }
    $health = Invoke-ActivityProbe $manifest.binary @('diagnostics', '--config', $manifest.config)
    $diagnostic = $health.output | ConvertFrom-Json -AsHashtable
    $definition = if ($task) { $task.Definition } else { [xml](New-ActivityTaskXml $manifest.binary $manifest.config $manifest.userSid $manifest.marker) }
    $settings = $definition.Task.Settings
    # Use documented effective defaults when Windows omits default XML values.
    $effective = @{}
    foreach ($pair in @(@('DisallowStartIfOnBatteries', 'true'), @('StopIfGoingOnBatteries', 'true'), @('WakeToRun', 'false'), @('StartWhenAvailable', 'false'), @('ExecutionTimeLimit', 'PT72H'), @('MultipleInstancesPolicy', 'IgnoreNew'))) {
        $nodes = $settings.GetElementsByTagName($pair[0])
        $effective[$pair[0]] = if ($nodes.Count) { $nodes[0].InnerText } else { $pair[1] }
    }
    return @{ schemaVersion = 1; mode = $manifest.mode; taskRegistered = [bool]$task; taskState = $(if ($task) { [string]$task.State } else { 'not_registered' }); lastTaskResult = $lastResult; activity = $diagnostic; policyBasis = $(if ($task) { 'registered_task' } else { 'package_definition' }); interactiveLoginRequired = $true; batteryAllowed = ($effective.DisallowStartIfOnBatteries -eq 'false' -and $effective.StopIfGoingOnBatteries -eq 'false'); wakesComputer = ($effective.WakeToRun -eq 'true'); startWhenAvailable = ($effective.StartWhenAvailable -eq 'true'); executionLimitSeconds = [Xml.XmlConvert]::ToTimeSpan($effective.ExecutionTimeLimit).TotalSeconds; multipleInstancesPolicy = $effective.MultipleInstancesPolicy }
}

function Uninstall-ActivityTask([string] $InstallRoot) {
    $manifest = Read-ActivityPackage $InstallRoot
    $task = Get-ActivityOwnedTask $manifest
    if ($task) {
        if ($task.State -eq 'Running') { throw 'Task is running; wait for completion before uninstalling.' }
        [void](Disable-ScheduledTask -TaskName $manifest.taskName -TaskPath '\' -ErrorAction Stop)
        $task = Get-ActivityOwnedTask $manifest
        if ($task.State -eq 'Running') { throw 'Task started concurrently; it remains disabled, wait before uninstalling.' }
        Unregister-ScheduledTask -TaskName $manifest.taskName -TaskPath '\' -Confirm:$false -ErrorAction Stop
    }
    return @{ schemaVersion = 1; state = 'uninstalled'; activityDataPreserved = $true; installedFilesPreserved = $true }
}

Export-ModuleMember -Function Install-ActivityPackage, Register-ActivitySandbox, Register-ActivityProduction, Enable-ActivityProduction, Get-ActivityPackageStatus, Uninstall-ActivityTask, New-ActivityTaskXml, Get-ActivityPeSubsystem
