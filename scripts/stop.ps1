$ErrorActionPreference = 'Stop'
$samplingRoot = Split-Path -Parent $PSScriptRoot
$samplingPidFile = Join-Path $samplingRoot '.local\api.pid'
if (Test-Path -LiteralPath $samplingPidFile) {
    $samplingProcessId = [int](Get-Content -LiteralPath $samplingPidFile)
    $samplingProcess = Get-Process -Id $samplingProcessId -ErrorAction SilentlyContinue
    $samplingExpected = [IO.Path]::GetFullPath((Join-Path $samplingRoot '.local\sampling-api.exe'))
    if ($samplingProcess -and $samplingProcess.Path -eq $samplingExpected) { Stop-Process -Id $samplingProcessId }
    Remove-Item -LiteralPath $samplingPidFile
}
$samplingPgData = Join-Path $samplingRoot '.local\pgdata'
$samplingPgCtl = 'C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe'
if ((Test-Path -LiteralPath $samplingPgData) -and (Test-Path -LiteralPath $samplingPgCtl)) { & $samplingPgCtl -D $samplingPgData -m fast -w stop }
Write-Host 'Stopped the workspace API and database. Stop the frontend with Ctrl+C in its terminal.'
