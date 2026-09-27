param([string]$Mode = 'echo')

if ($Mode -eq 'silent') {
  Start-Sleep -Seconds 3
  exit 0
}

if ($Mode -eq 'flood') {
  [Console]::Error.Write(('x' * 20000))
  Start-Sleep -Seconds 3
  exit 0
}

if ($Mode -eq 'linger') {
  [Console]::Out.WriteLine($PID)
  Start-Sleep -Seconds 30
  exit 0
}

$null = [Console]::In.ReadLine()
[Console]::Out.WriteLine('{"id":1,"result":{"userAgent":"fixture"}}')
$null = [Console]::In.ReadLine()
$null = [Console]::In.ReadLine()
[Console]::Out.WriteLine('{"id":2,"result":{"summary":{"lifetimeTokens":0},"dailyUsageBuckets":[{"startDate":"2026-09-26","tokens":0}]}}')
