param([Parameter(Mandatory = $true)][string]$MakeNsis)
# Exercise the actual uninstall macro on an isolated non-startup registry
# key. Production uses its fixed Run key; no real login entry is changed.
$ErrorActionPreference = 'Stop'
$tool = (Resolve-Path -LiteralPath $MakeNsis).Path
$root = Join-Path ([IO.Path]::GetTempPath()) ('enouia-runtime-startup-cleanup-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$parentName = 'Software\EnouiaRuntimeTests'
$testKey = $parentName + '\Cleanup-' + [guid]::NewGuid().ToString('N')
$hook = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\apps\desktop\src-tauri\windows\hooks.nsh')).Path
$source = @'
Unicode true
RequestExecutionLevel user
SilentInstall silent
OutFile "@OUTPUT@"
!include LogicLib.nsh
Var UpdateMode
!define ENOUIA_STARTUP_RUN_KEY "@KEY@"
!include "@HOOK@"
Section
  StrCpy $INSTDIR "C:\Synthetic install"
  StrCpy $UpdateMode 0
  WriteRegStr HKCU "${ENOUIA_STARTUP_RUN_KEY}" "EnouiaRuntime" '$\"$INSTDIR\enouia-desktop.exe$\" --autostart'
  WriteRegStr HKCU "${ENOUIA_STARTUP_RUN_KEY}" "EnouiaMemoryWorkspace" '"C:\Synthetic install\enouia-memory-workspace.exe" --autostart'
  !insertmacro NSIS_HOOK_POSTUNINSTALL
  ClearErrors
  ReadRegStr $R1 HKCU "${ENOUIA_STARTUP_RUN_KEY}" "EnouiaRuntime"
  IfErrors exact_removed failed
exact_removed:
  ReadRegStr $R1 HKCU "${ENOUIA_STARTUP_RUN_KEY}" "EnouiaMemoryWorkspace"
  StrCmpS $R1 '"C:\Synthetic install\enouia-memory-workspace.exe" --autostart' memory_value_preserved failed
memory_value_preserved:
  WriteRegStr HKCU "${ENOUIA_STARTUP_RUN_KEY}" "EnouiaRuntime" '"C:\Synthetic other\enouia-desktop.exe" --autostart'
  !insertmacro NSIS_HOOK_POSTUNINSTALL
  ReadRegStr $R1 HKCU "${ENOUIA_STARTUP_RUN_KEY}" "EnouiaRuntime"
  StrCmpS $R1 '"C:\Synthetic other\enouia-desktop.exe" --autostart' foreign_preserved failed
foreign_preserved:
  WriteRegStr HKCU "${ENOUIA_STARTUP_RUN_KEY}" "EnouiaRuntime" '"c:\synthetic install\enouia-desktop.exe" --autostart'
  !insertmacro NSIS_HOOK_POSTUNINSTALL
  ReadRegStr $R1 HKCU "${ENOUIA_STARTUP_RUN_KEY}" "EnouiaRuntime"
  StrCmpS $R1 '"c:\synthetic install\enouia-desktop.exe" --autostart' case_preserved failed
case_preserved:
  StrCpy $UpdateMode 1
  WriteRegStr HKCU "${ENOUIA_STARTUP_RUN_KEY}" "EnouiaRuntime" '$\"$INSTDIR\enouia-desktop.exe$\" --autostart'
  !insertmacro NSIS_HOOK_POSTUNINSTALL
  ReadRegStr $R1 HKCU "${ENOUIA_STARTUP_RUN_KEY}" "EnouiaRuntime"
  StrCmpS $R1 '$\"$INSTDIR\enouia-desktop.exe$\" --autostart' passed failed
passed:
  SetErrorLevel 0
  Goto cleanup
failed:
  SetErrorLevel 1
cleanup:
  DeleteRegKey HKCU "${ENOUIA_STARTUP_RUN_KEY}"
  DeleteRegKey /ifempty HKCU "@PARENT@"
SectionEnd
'@
$output = Join-Path $root 'startup-cleanup.exe'
$source = $source.Replace('@OUTPUT@', $output).Replace('@KEY@', $testKey).Replace('@HOOK@', $hook).Replace('@PARENT@', $parentName)
$script = Join-Path $root 'startup-cleanup.nsi'
Set-Content -LiteralPath $script -Value $source -Encoding UTF8
& $tool /V2 $script
if ($LASTEXITCODE -ne 0) { throw 'NSIS test compile failed.' }
$process = Start-Process -FilePath $output -WindowStyle Hidden -PassThru -Wait
if ($process.ExitCode -ne 0) { throw 'Startup cleanup macro failed.' }
if (Test-Path -LiteralPath ('HKCU:\' + $testKey)) { throw 'Isolated test key was not removed.' }
Write-Output '5/5 exact-match, Memory-value, foreign-value, case-sensitive and update-mode startup cleanup checks passed; isolated key removed.'
