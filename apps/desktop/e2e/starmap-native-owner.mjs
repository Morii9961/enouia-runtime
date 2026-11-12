// Copied from memory-smoke.mjs; scoped to the standalone measurement child.
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
export async function unusedPort() {
  // Windows may assign port 1720 for listen(0), which Fetch refuses before
  // connecting. Use the dynamic range, above Fetch's bad-port table.
  for (let attempt = 0; attempt < 8; attempt++) {
    const listener = createServer();
    const port = 49152 + Math.floor(Math.random() * 16384);
    try {
      await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(port, '127.0.0.1', resolve); });
    } catch (error) {
      if (error.code === 'EADDRINUSE') continue;
      throw error;
    }
    await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    return port;
  }
  throw new Error('no free loopback debug port in the dynamic range');
}
export function ownedWindowMetrics(app, size = null, state = null) {
  if (app.exitCode !== null) throw new Error('test host is not running');
  if (state !== null && !['maximize','restore'].includes(state)) throw new Error('invalid owned window state');
  const script = `$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
Add-Type -TypeDefinition @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class OwnedWindow {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window,out uint process);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr window,StringBuilder title,int count);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window,out Rect rect);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr window,out Rect rect);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window,int command);
}
'@
$process=Get-Process -Id ${app.pid}
$window=${app.windowHandle ? `[IntPtr]([long]'${app.windowHandle}')` : '$process.MainWindowHandle'}
[uint32]$owner=0
[OwnedWindow]::GetWindowThreadProcessId($window,[ref]$owner) | Out-Null
$title=New-Object System.Text.StringBuilder 256
[OwnedWindow]::GetWindowText($window,$title,256) | Out-Null
if($window -eq [IntPtr]::Zero -or $owner -ne ${app.pid} -or $title.ToString() -ne 'Enouia starmap measurement') { throw 'main window ownership mismatch' }
$previousContext=[OwnedWindow]::SetThreadDpiAwarenessContext([IntPtr](-4))
if($previousContext -eq [IntPtr]::Zero) { throw 'DPI context unavailable' }
try {
  ${state ? `[OwnedWindow]::ShowWindow($window,${state === 'maximize' ? 3 : 9}) | Out-Null
  Start-Sleep -Milliseconds 200` : ''}
  $dpi=[OwnedWindow]::GetDpiForWindow($window)
  if($dpi -eq 0) { throw 'window DPI unavailable' }
  $outer=New-Object OwnedWindow+Rect; $client=New-Object OwnedWindow+Rect
  if(-not [OwnedWindow]::GetWindowRect($window,[ref]$outer) -or -not [OwnedWindow]::GetClientRect($window,[ref]$client)) { throw 'window bounds unavailable' }
  ${size ? `$width=[int][Math]::Round(${size.width}*$dpi/96)+($outer.Right-$outer.Left-$client.Right)
  $height=[int][Math]::Round(${size.height}*$dpi/96)+($outer.Bottom-$outer.Top-$client.Bottom)
  if(-not [OwnedWindow]::SetWindowPos($window,[IntPtr]::Zero,0,0,$width,$height,0x16)) { throw 'owned resize failed' }
  Start-Sleep -Milliseconds 200
  if(-not [OwnedWindow]::GetClientRect($window,[ref]$client)) { throw 'resized bounds unavailable' }` : ''}
  @{window=$window.ToInt64().ToString();dpi=$dpi;width=$client.Right;height=$client.Bottom;maximized=[OwnedWindow]::IsZoomed($window);minimized=[OwnedWindow]::IsIconic($window)} | ConvertTo-Json -Compress
} finally { [OwnedWindow]::SetThreadDpiAwarenessContext($previousContext) | Out-Null }`;
  const result=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:15000,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim());
  app.windowHandle=result.window;
  return result;
}

export function assertDebugOwner(port, child) {

  if (!child || child.exitCode !== null) throw new Error('test host is not running');
  const script = `$ErrorActionPreference = 'Stop'
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort ${port})
if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -notin @('127.0.0.1','::1')) { throw 'unexpected debug listeners' }
$ancestor = [uint32]$listeners[0].OwningProcess
for ($depth = 0; $depth -lt 16 -and $ancestor -ne 0; $depth++) {
  if ($ancestor -eq ${child.pid}) { Write-Output 'owned'; exit 0 }
  $entry = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $ancestor)
  if (-not $entry) { break }
  $ancestor = [uint32]$entry.ParentProcessId
}
throw 'debug listener does not belong to test process'`;
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000, stdio: ['ignore', 'ignore', 'pipe'] });
  } catch {
    throw new Error('debug listener does not belong to test process');
  }
}
