#Requires -Version 7.2
[CmdletBinding()]
param([Parameter(Mandatory)][string] $InstallRoot)
Import-Module (Join-Path $PSScriptRoot 'activity-package.psm1') -Force
try { Uninstall-ActivityTask $InstallRoot | ConvertTo-Json -Depth 10 }
catch { [Console]::Error.WriteLine($_.Exception.Message); exit 5 }
