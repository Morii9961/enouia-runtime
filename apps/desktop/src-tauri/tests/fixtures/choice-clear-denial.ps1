param(
    [Parameter(Mandatory=$true)][string]$Directory,
    [string]$ProbeExecutable,
    [string]$ReleasePath
)
$ErrorActionPreference='Stop'
$directoryPath=[IO.Path]::GetFullPath($Directory)
$tempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$leaf=[IO.Path]::GetFileName($directoryPath)
$parentLeaf=[IO.Path]::GetFileName([IO.Path]::GetDirectoryName($directoryPath))
if(-not $directoryPath.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -or
   (-not $leaf.StartsWith('enouia-atomic-choice-') -and -not $parentLeaf.StartsWith('enouia-handback-ui-'))){throw 'Not an owned choice fixture'}
if([bool]$ProbeExecutable -eq [bool]$ReleasePath){throw 'Choose one probe or hold mode'}
if($ReleasePath -and [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($ReleasePath)) -ne [IO.Path]::GetDirectoryName($directoryPath)){throw 'Release marker must be an owned sibling'}
$file=Join-Path $directoryPath 'activity-install.json'
$bytes=[IO.File]::ReadAllBytes($file)
$directoryBefore=([IO.Directory]::GetAccessControl($directoryPath)).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::All)
$fileBefore=([IO.File]::GetAccessControl($file)).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::All)
$sid=([Security.Principal.WindowsIdentity]::GetCurrent()).User
$directoryAcl=[IO.Directory]::GetAccessControl($directoryPath)
$directoryRights=[Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [Security.AccessControl.FileSystemRights]::ListDirectory -bor [Security.AccessControl.FileSystemRights]::ReadAttributes
$directoryAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,$directoryRights,[Security.AccessControl.AccessControlType]::Deny))
$fileAcl=[IO.File]::GetAccessControl($file)
$fileAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,([Security.AccessControl.FileSystemRights]::Delete -bor [Security.AccessControl.FileSystemRights]::ReadAttributes),[Security.AccessControl.AccessControlType]::Deny))
$probeCode=0
try {
    [IO.File]::SetAccessControl($file,$fileAcl)
    [IO.Directory]::SetAccessControl($directoryPath,$directoryAcl)
    if([IO.File]::Exists($file)){throw 'Existence must be unobservable during this denial'}
    'denied'
    if($ProbeExecutable){
        & $ProbeExecutable --exact activity::tests::saved_choice_clear_denial_child --nocapture
        $probeCode=$LASTEXITCODE
    } else {
        $watch=[Diagnostics.Stopwatch]::StartNew()
        while($watch.Elapsed.TotalSeconds -lt 90 -and -not [IO.File]::Exists($ReleasePath)){[Threading.Thread]::Sleep(50)}
        if(-not [IO.File]::Exists($ReleasePath)){throw 'Owned denial release timed out'}
    }
} finally {
    $directoryRestore=[Security.AccessControl.DirectorySecurity]::new()
    $directoryRestore.SetSecurityDescriptorSddlForm($directoryBefore,[Security.AccessControl.AccessControlSections]::Access)
    [IO.Directory]::SetAccessControl($directoryPath,$directoryRestore)
    $fileRestore=[Security.AccessControl.FileSecurity]::new()
    $fileRestore.SetSecurityDescriptorSddlForm($fileBefore,[Security.AccessControl.AccessControlSections]::Access)
    [IO.File]::SetAccessControl($file,$fileRestore)
    if([Convert]::ToBase64String([IO.File]::ReadAllBytes($file)) -ne [Convert]::ToBase64String($bytes)){throw 'Owned choice bytes changed'}
    if(([IO.Directory]::GetAccessControl($directoryPath)).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::All) -ne $directoryBefore){throw 'Directory descriptor not restored exactly'}
    if(([IO.File]::GetAccessControl($file)).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::All) -ne $fileBefore){throw 'File descriptor not restored exactly'}
    'exact_owned_descriptors_and_bytes_restored=true'
}
exit $probeCode
