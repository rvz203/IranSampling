param([int]$WebPort = 3000)
$ErrorActionPreference = 'Stop'
$samplingRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $samplingRoot '.env'))) { throw 'Create .env from .env.example and configure DATABASE_URL first.' }
if (-not (Test-Path -LiteralPath (Join-Path $samplingRoot 'web\node_modules\next'))) {
    Push-Location (Join-Path $samplingRoot 'web')
    try { & npm.cmd ci --no-fund --no-audit; if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' } } finally { Pop-Location }
}
# This workspace can use its own PostgreSQL cluster on 55432; existing services are not changed.
$samplingPgData = Join-Path $samplingRoot '.local\pgdata'
$samplingPgCtl = 'C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe'
if ((Test-Path -LiteralPath $samplingPgData) -and (Test-Path -LiteralPath $samplingPgCtl)) {
    & $samplingPgCtl -D $samplingPgData status *> $null
    if ($LASTEXITCODE -ne 0) {
        $samplingPgArgs = @('-D', ('"' + $samplingPgData + '"'), '-l', ('"' + (Join-Path $samplingRoot '.local\postgres.log') + '"'), '-o', '"-p 55432 -h 127.0.0.1"', '-w', 'start')
        $samplingPgProcess = Start-Process -FilePath $samplingPgCtl -ArgumentList $samplingPgArgs -WindowStyle Hidden -PassThru
        if (-not $samplingPgProcess.WaitForExit(30000) -or $samplingPgProcess.ExitCode -ne 0) { throw 'Could not start the workspace database; inspect .local/postgres.log.' }
    }
}
$samplingLocal = Join-Path $samplingRoot '.local'
New-Item -ItemType Directory -Path $samplingLocal -Force | Out-Null
if (-not (Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue)) {
    Push-Location (Join-Path $samplingRoot 'backend')
    try { & go build -o (Join-Path $samplingLocal 'sampling-api.exe') ./cmd/api; if ($LASTEXITCODE -ne 0) { throw 'Go build failed' } } finally { Pop-Location }
    $samplingApiProcess = Start-Process -FilePath (Join-Path $samplingLocal 'sampling-api.exe') -WorkingDirectory (Join-Path $samplingRoot 'backend') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $samplingLocal 'api.stdout.log') -RedirectStandardError (Join-Path $samplingLocal 'api.stderr.log') -PassThru
    Set-Content -LiteralPath (Join-Path $samplingLocal 'api.pid') -Value $samplingApiProcess.Id
}
Write-Host "FaraCode: http://127.0.0.1:$WebPort"
Push-Location (Join-Path $samplingRoot 'web')
try { & npm.cmd run dev -- --port $WebPort } finally { Pop-Location }
