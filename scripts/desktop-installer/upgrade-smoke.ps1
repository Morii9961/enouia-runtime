param(
    [Parameter(Mandatory = $true)][string]$OldInstaller,
    [Parameter(Mandatory = $true)][string]$OldBuiltExecutable,
    [Parameter(Mandatory = $true)][string]$NewInstaller,
    [Parameter(Mandatory = $true)][string]$NewBuiltExecutable,
    [Parameter(Mandatory = $true)][string]$MemoryCli
)
# Upgrade, downgrade refusal and uninstall of Runtime's installer (ADR-027)
# on a fresh, owned installation and newly created synthetic Vaults. While
# the old version runs in the tray with a Vault open, the upgrade closes it
# through Restart Manager. tao turns its WM_ENDSESSION into RunEvent::Exit,
# which runs the Memory shutdown and exits 0; a forced termination would
# end it with another code. The drill's own exact startup value must survive
# the silent upgrade and refused downgrade and be removed by uninstall.
# Never use an installed version or an existing Vault as input.
$ErrorActionPreference = 'Stop'
$product = 'Enouia Runtime'
$exeName = 'enouia-desktop.exe'
$productKey = "HKCU:\Software\enouia\$product"
$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$product"

function Assert-NoRunningRuntime {
    if (Get-Process -Name enouia-desktop -ErrorAction SilentlyContinue) {
        throw 'Running Enouia Runtime: drill refused.'
    }
}

function Get-BundleHash([string]$Executable) {
    # Pinned Tauri CLI 2.12.0 changes this single marker for NSIS, then
    # restores the original executable. All remaining bytes must match.
    $encoding = [Text.Encoding]::GetEncoding(28591)
    $text = $encoding.GetString([IO.File]::ReadAllBytes($Executable))
    $marker = '__TAURI_BUNDLE_TYPE_VAR_UNK'
    $offset = $text.IndexOf($marker, [StringComparison]::Ordinal)
    if ($offset -lt 0 -or $text.IndexOf($marker, $offset + $marker.Length, [StringComparison]::Ordinal) -ge 0) {
        throw 'Expected one unpatched Tauri bundle marker.'
    }
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        return [BitConverter]::ToString($sha.ComputeHash($encoding.GetBytes(
            $text.Replace($marker, '__TAURI_BUNDLE_TYPE_VAR_NSS')))).Replace('-', '')
    } finally { $sha.Dispose() }
}

function Invoke-MemoryCli([string[]]$CliArguments) {
    $output = & $cliPath @CliArguments
    if ($LASTEXITCODE -ne 0) { throw ('Synthetic Vault command failed: ' + ($output -join "`n")) }
    return ($output -join "`n") | ConvertFrom-Json
}

function Get-VaultSnapshot {
    $snapshot = [ordered]@{}
    foreach ($file in Get-ChildItem -LiteralPath $vaultDir -Recurse -File | Sort-Object FullName) {
        if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw 'Unexpected reparse point in synthetic Vault.'
        }
        $relative = $file.FullName.Substring($vaultDir.Length + 1)
        $snapshot[$relative] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    }
    if ($snapshot.Count -eq 0) { throw 'Synthetic Vault is empty.' }
    return ConvertTo-Json -InputObject $snapshot -Compress
}

function Assert-OwnedRegistration([string]$ExpectedVersion) {
    $registration = Get-ItemProperty -LiteralPath $uninstallKey
    if ($registration.InstallLocation.Trim('"') -cne $installDir -or
        $registration.UninstallString -cne ('"' + (Join-Path $installDir 'uninstall.exe') + '"')) {
        throw 'Installation registration is outside this drill.'
    }
    if ($ExpectedVersion -and $registration.DisplayVersion -cne $ExpectedVersion) {
        throw 'Registered version did not match the installer.'
    }
}

# True while some process holds Memory's host lock on the running app's Vault.
function Test-HostLockHeld {
    $lock = Join-Path $appVaultDir 'indexes\host.lock'
    if (-not (Test-Path -LiteralPath $lock)) { return $false }
    $file = [IO.File]::Open($lock, 'Open', 'ReadWrite', 'ReadWrite')
    try { $file.Lock(0, 1); $file.Unlock(0, 1); return $false }
    catch [IO.IOException] { return $true }
    finally { $file.Dispose() }
}

Assert-NoRunningRuntime
foreach ($key in @($productKey, $uninstallKey,
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$product",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\$product")) {
    if (Test-Path -LiteralPath $key) { throw 'Existing installation metadata: drill refused.' }
}
$manufacturerKey = 'HKCU:\Software\enouia'
$manufacturerExisted = Test-Path -LiteralPath $manufacturerKey
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$run = Get-Item -LiteralPath $runKey
foreach ($name in @($product, 'EnouiaRuntime')) {
    if ($null -ne $run.GetValue($name, $null)) { throw 'Existing startup entry: drill refused.' }
}
$oldInstallerPath = (Resolve-Path -LiteralPath $OldInstaller).Path
$newInstallerPath = (Resolve-Path -LiteralPath $NewInstaller).Path
$oldExecutablePath = (Resolve-Path -LiteralPath $OldBuiltExecutable).Path
$newExecutablePath = (Resolve-Path -LiteralPath $NewBuiltExecutable).Path
$cliPath = (Resolve-Path -LiteralPath $MemoryCli).Path
$oldVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($oldInstallerPath).ProductVersion
$newVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($newInstallerPath).ProductVersion
if ($oldVersion -notmatch '^\d+\.\d+\.\d+$' -or $newVersion -notmatch '^\d+\.\d+\.\d+$' -or
    [version]$newVersion -le [version]$oldVersion) {
    throw 'Drill requires two ascending stable package versions.'
}
$oldHash = Get-BundleHash $oldExecutablePath
$newHash = Get-BundleHash $newExecutablePath
if ($oldHash -eq $newHash) { throw 'Upgrade must replace the installed payload.' }
$root = Join-Path ([IO.Path]::GetTempPath()) ('enouia-runtime-upgrade-' + [guid]::NewGuid().ToString('N'))
$installDir = Join-Path $root 'Synthetic install'
$vaultDir = Join-Path $root 'Synthetic Vault'
$appVaultDir = Join-Path $root 'Synthetic open Vault'
$installedExe = Join-Path $installDir $exeName
$startupCommand = '"' + $installedExe + '" --autostart'
$checks = [ordered]@{}
New-Item -ItemType Directory -Path $root | Out-Null
New-Item -ItemType Directory -Path $vaultDir | Out-Null
New-Item -ItemType Directory -Path $appVaultDir | Out-Null
$failure = $null
$app = $null
try {
    $null = Invoke-MemoryCli @('init', $vaultDir, '--confirm-new-vault')
    $assertion = 'Synthetic upgrade evidence: preserve this acknowledged source.'
    $null = Invoke-MemoryCli @('assert', $vaultDir, '--text', $assertion, '--confirm-text', $assertion, '--key', 'synthetic-upgrade-source-0001')
    $before = Invoke-MemoryCli @('verify', $vaultDir)
    if (-not $before.clean -or $before.records_checked -lt 2) { throw 'Synthetic Vault failed initial verification.' }
    $vaultSnapshot = Get-VaultSnapshot
    $checks.initial_vault_verified = $true
    $null = Invoke-MemoryCli @('init', $appVaultDir, '--confirm-new-vault')

    $process = Start-Process -FilePath $oldInstallerPath -ArgumentList "/S /NS /D=$installDir" -WindowStyle Hidden -PassThru -Wait
    if ($process.ExitCode -ne 0) { throw 'Old installer failed.' }
    Assert-OwnedRegistration $oldVersion
    $checks.old_payload_matches = (Get-FileHash -LiteralPath $installedExe -Algorithm SHA256).Hash -eq $oldHash
    $checks.old_version_registered = $true
    $checks.vault_preserved_after_install = (Get-VaultSnapshot) -ceq $vaultSnapshot
    # The owner turned startup on for this installation, as Settings would.
    # No Run value existed before the drill, so this one is the drill's own.
    Set-ItemProperty -LiteralPath $runKey -Name 'EnouiaRuntime' -Value $startupCommand

    # The installed old version runs in the tray, as after a login start,
    # with the second synthetic Vault open and its own WebView2 profile.
    $env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $root 'webview2'
    try {
        $app = Start-Process -FilePath $installedExe -PassThru -ArgumentList "--autostart --hotkey-key Q --memory-vault `"$appVaultDir`""
    } finally { Remove-Item Env:WEBVIEW2_USER_DATA_FOLDER }
    $null = $app.Handle
    $deadline = (Get-Date).AddSeconds(30)
    while (-not (Test-HostLockHeld) -and (Get-Date) -lt $deadline -and -not $app.HasExited) { Start-Sleep -Milliseconds 250 }
    $checks.old_app_holds_its_vault = Test-HostLockHeld
    # Let start-up settle, as for a tray app that is already running. Just
    # after launch the executable can still be locked; an upgrade then fails
    # with exit code 2 (AllowSkipFiles off) rather than replacing it.
    Start-Sleep -Seconds 5

    # /D is deliberately omitted: upgrade must find the previous owned path.
    $process = Start-Process -FilePath $newInstallerPath -ArgumentList '/S /NS' -WindowStyle Hidden -PassThru -Wait
    if ($process.ExitCode -ne 0) { throw 'Upgrade installer failed.' }
    $checks.running_app_ended = $app.WaitForExit(60000)
    $checks.running_app_exited_zero = $checks.running_app_ended -and $app.ExitCode -eq 0
    $checks.vault_lock_free_after_close = -not (Test-HostLockHeld)
    $opened = Invoke-MemoryCli @('verify', $appVaultDir)
    $checks.opened_vault_verified = [bool]$opened.clean
    Assert-OwnedRegistration $newVersion
    $checks.upgrade_exit_zero = $true
    $checks.previous_install_location_retained = $true
    $checks.new_version_registered = $true
    $checks.new_payload_matches = (Get-FileHash -LiteralPath $installedExe -Algorithm SHA256).Hash -eq $newHash
    $checks.vault_preserved_after_upgrade = (Get-VaultSnapshot) -ceq $vaultSnapshot
    $checks.startup_value_kept_by_upgrade = (Get-Item -LiteralPath $runKey).GetValue('EnouiaRuntime', $null) -ceq $startupCommand

    Assert-NoRunningRuntime
    $process = Start-Process -FilePath $oldInstallerPath -ArgumentList '/S /NS' -WindowStyle Hidden -PassThru -Wait
    $checks.downgrade_refused = $process.ExitCode -ne 0
    Assert-OwnedRegistration $newVersion
    $checks.new_payload_retained_after_downgrade = (Get-FileHash -LiteralPath $installedExe -Algorithm SHA256).Hash -eq $newHash
    $checks.new_version_retained_after_downgrade = $true
    $checks.vault_preserved_after_downgrade = (Get-VaultSnapshot) -ceq $vaultSnapshot
    $checks.startup_value_kept_after_refused_downgrade = (Get-Item -LiteralPath $runKey).GetValue('EnouiaRuntime', $null) -ceq $startupCommand
} catch { $failure = $_ } finally {
    if ($app -and -not $app.HasExited) { $app.Kill(); $app.WaitForExit() }
    $uninstaller = Join-Path $installDir 'uninstall.exe'
    if (Test-Path -LiteralPath $uninstaller) {
        # Refuse cleanup if the global registration was changed by another
        # installation. Only execute an uninstaller inside our fresh root.
        Assert-OwnedRegistration ''
        Assert-NoRunningRuntime
        $ownedUninstaller = (Resolve-Path -LiteralPath $uninstaller).Path
        if (-not $ownedUninstaller.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Uninstaller escaped the test root.'
        }
        $process = Start-Process -FilePath $ownedUninstaller -ArgumentList "/S _?=$installDir" -WindowStyle Hidden -PassThru -Wait
        $checks.uninstall_exit_zero = $process.ExitCode -eq 0
        $checks.app_removed = -not (Test-Path -LiteralPath $installedExe)
        $checks.registration_removed = -not (Test-Path -LiteralPath $uninstallKey)
        $checks.startup_value_removed_by_uninstall = $null -eq (Get-Item -LiteralPath $runKey).GetValue('EnouiaRuntime', $null)
    }
    # Never leave the drill's startup value behind, and never touch another.
    if ((Get-Item -LiteralPath $runKey).GetValue('EnouiaRuntime', $null) -ceq $startupCommand) {
        Remove-ItemProperty -LiteralPath $runKey -Name 'EnouiaRuntime'
    }
    if (Test-Path -LiteralPath $productKey) {
        if ((Get-Item -LiteralPath $productKey).GetValue('') -ceq $installDir) {
            Remove-Item -LiteralPath $productKey
        }
    }
    # NSIS creates the manufacturer key for that preference; remove it only
    # when this drill created it and it is empty again.
    if (-not $manufacturerExisted -and (Test-Path -LiteralPath $manufacturerKey)) {
        $manufacturer = Get-Item -LiteralPath $manufacturerKey
        if ($manufacturer.SubKeyCount -eq 0 -and $manufacturer.ValueCount -eq 0) { Remove-Item -LiteralPath $manufacturerKey }
    }
    if ($vaultSnapshot) {
        $checks.vault_preserved_after_uninstall = (Get-VaultSnapshot) -ceq $vaultSnapshot
        $after = Invoke-MemoryCli @('verify', $vaultDir)
        $checks.final_vault_verified = $after.clean -and $after.commit_id -ceq $before.commit_id
    }
    [ordered]@{ oldVersion = $oldVersion; newVersion = $newVersion; checks = $checks } |
        ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $root 'report.json')
    foreach ($name in $checks.Keys) { Write-Output "$name=$($checks[$name])" }
    Write-Output "Synthetic evidence: $root"
}
if ($failure) { throw $failure }
if ($checks.Count -ne 26 -or $checks.Values -contains $false) { throw 'Upgrade drill failed.' }
