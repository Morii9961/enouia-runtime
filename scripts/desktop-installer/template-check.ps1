param([string]$RenderedTemplate)
# Static ownership checks for Runtime's installer (ADR-027). They complement
# the real installer drills and cover UI-only deletion branches that a
# silent uninstall cannot select.
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$desktop = Join-Path $repo 'apps\desktop'
$shell = Join-Path $desktop 'src-tauri'
$config = Get-Content -LiteralPath (Join-Path $shell 'tauri.conf.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$package = Get-Content -LiteralPath (Join-Path $desktop 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$cargo = Get-Content -LiteralPath (Join-Path $shell 'Cargo.toml') -Raw -Encoding UTF8
$startup = Get-Content -LiteralPath (Join-Path $shell 'src\startup.rs') -Raw -Encoding UTF8
$nsis = $config.bundle.windows.nsis
$templatePath = (Resolve-Path -LiteralPath (Join-Path $shell $nsis.template)).Path
$hooksPath = (Resolve-Path -LiteralPath (Join-Path $shell $nsis.installerHooks)).Path
$template = Get-Content -LiteralPath $templatePath -Raw -Encoding UTF8
$hooks = Get-Content -LiteralPath $hooksPath -Raw -Encoding UTF8
$license = Get-Content -LiteralPath (Join-Path $shell 'windows\installer-LICENSE-MIT.txt') -Raw -Encoding UTF8
# The copy of Memory's derived template recorded in windows/README.md.
$expectedTemplate = 'F067BB1C4801A55B70D0B88BD30589D75F511874E768A0C3F7406A82B159F365'
$binary = if ($cargo -match '(?m)^name\s*=\s*"([^"]+)"') { $Matches[1] } else { '' }
$command = '$\"$INSTDIR\' + $binary + '.exe$\" --autostart'
$checks = [ordered]@{
    configured_owned_template = $templatePath -ceq (Join-Path $shell 'windows\installer.nsi')
    configured_owned_hooks = $hooksPath -ceq (Join-Path $shell 'windows\hooks.nsh')
    template_matches_recorded_copy = (Get-FileHash -LiteralPath $templatePath -Algorithm SHA256).Hash -ceq $expectedTemplate
    pinned_cli_matches_template = $package.devDependencies.'@tauri-apps/cli' -ceq '2.12.0'
    current_user_nsis_only = $config.bundle.active -and ($config.bundle.targets -join ',') -ceq 'nsis' -and $nsis.installMode -ceq 'currentUser'
    downgrades_disabled = $config.bundle.windows.allowDowngrades -eq $false
    no_appdata_delete_option = $template -notmatch 'DeleteAppDataCheckbox|\$\(deleteAppData\)'
    no_recursive_appdata_deletion = $template -notmatch '(?i)RmDir\s+/r\s+"\$(LOCALAPPDATA|APPDATA)\\'
    no_generic_startup_deletion = $template -notmatch '(?i)DeleteRegValue\s+HKCU\s+"Software\\Microsoft\\Windows\\CurrentVersion\\Run"'
    # Install: the version guard runs before the running-app check closes Runtime.
    downgrade_hook_before_running_app_check = $template.IndexOf('!insertmacro NSIS_HOOK_PREINSTALL') -ge 0 -and
        $template.IndexOf('!insertmacro NSIS_HOOK_PREINSTALL') -lt $template.IndexOf('!insertmacro CheckIfAppIsRunning')
    # Uninstall: the startup cleanup runs only after that check succeeded.
    startup_hook_after_running_app_check = $template.IndexOf('!insertmacro NSIS_HOOK_POSTUNINSTALL') -gt $template.LastIndexOf('!insertmacro CheckIfAppIsRunning')
    no_preuninstall_hook = -not $hooks.Contains('NSIS_HOOK_PREUNINSTALL')
    app_payload_removal_retained = $template.Contains('Delete "$INSTDIR\${MAINBINARYNAME}.exe"')
    uninstaller_creation_retained = $template.Contains('WriteUninstaller "$INSTDIR\uninstall.exe"')
    upstream_license_retained = $license.Contains('Permission is hereby granted, free of charge')
    hook_names_the_app_value = $startup.Contains('const VALUE_NAME: &str = "EnouiaRuntime";') -and $hooks.Contains('"EnouiaRuntime"')
    hook_matches_the_app_command = $binary -ne '' -and $startup.Contains('format!("\"{path}\" --autostart")') -and $hooks.Contains("'$command'")
    hook_guards_versions = $hooks.Contains('nsis_tauri_utils::SemverCompare "${VERSION}" $R0')
    hook_skips_update_mode = $hooks.Contains('${If} $UpdateMode <> 1')
    locked_files_fail_install = $hooks -match '(?m)^AllowSkipFiles off\s*$' -and $template -notmatch '(?im)^\s*AllowSkipFiles\s+on'
}
if ($RenderedTemplate) {
    $rendered = Get-Content -LiteralPath (Resolve-Path -LiteralPath $RenderedTemplate).Path -Raw -Encoding UTF8
    $checks.rendered_no_appdata_delete_option = $rendered -notmatch 'DeleteAppDataCheckbox|\$\(deleteAppData\)'
    $checks.rendered_no_recursive_appdata_deletion = $rendered -notmatch '(?i)RmDir\s+/r\s+"\$(LOCALAPPDATA|APPDATA)\\'
    $checks.rendered_no_generic_startup_deletion = $rendered -notmatch '(?i)DeleteRegValue\s+HKCU\s+"Software\\Microsoft\\Windows\\CurrentVersion\\Run"'
    $checks.rendered_startup_hook_after_running_app_check = $rendered.IndexOf('!insertmacro NSIS_HOOK_POSTUNINSTALL') -gt $rendered.LastIndexOf('!insertmacro CheckIfAppIsRunning')
    $checks.rendered_includes_hooks = $rendered.Contains('hooks.nsh')
}
foreach ($name in $checks.Keys) { Write-Output "$name=$($checks[$name])" }
if ($checks.Values -contains $false) { throw 'Installer ownership checks failed.' }
Write-Output "$($checks.Count)/$($checks.Count) installer ownership checks passed."
