#Requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string] $Binary,
    [Parameter(Mandatory)][string] $Config,
    [Parameter(Mandatory)][string] $InstallRoot,
    [string] $RuntimeToolsRoot,
    [string] $TaskName = 'Enouia-Activity-Sandbox',
    [switch] $RegisterSandbox
)
Import-Module (Join-Path $PSScriptRoot 'activity-package.psm1') -Force
try { Install-ActivityPackage @PSBoundParameters | ConvertTo-Json -Depth 10 }
catch { [Console]::Error.WriteLine($_.Exception.Message); exit 5 }
