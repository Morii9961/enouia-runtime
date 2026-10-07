#Requires -Version 7.2
# B5 Stage 5 (ADR-030): register the production task disabled, or with -Enable
# enable it after a manual production cycle was observed published.
[CmdletBinding()]
param([Parameter(Mandatory)][string] $InstallRoot, [Parameter(Mandatory)][string] $ConfirmTaskName, [switch] $Enable)
Import-Module (Join-Path $PSScriptRoot 'activity-package.psm1') -Force
try {
    if ($Enable) { Enable-ActivityProduction $InstallRoot $ConfirmTaskName | ConvertTo-Json -Depth 5 }
    else { Register-ActivityProduction $InstallRoot $ConfirmTaskName | ConvertTo-Json -Depth 5 }
}
catch { [Console]::Error.WriteLine($_.Exception.Message); exit 5 }
