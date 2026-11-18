param(
    [int]$WebPort = 3001,
    [int]$ApiPort = 8081,
    [switch]$SkipChecks,
    [switch]$BackendOnly,
    [string[]]$PlaywrightArgs = @()
)
$ErrorActionPreference = 'Stop'
$samplingRoot = Split-Path -Parent $PSScriptRoot
$samplingRun = 'qa_' + [guid]::NewGuid().ToString('N').Substring(0, 12)
$samplingRunDir = Join-Path $samplingRoot ".local\qa\$samplingRun"
$samplingPsql = 'C:\Program Files\PostgreSQL\16\bin\psql.exe'
if (-not (Test-Path -LiteralPath $samplingPsql)) { throw 'PostgreSQL 16 command-line tools are required; update samplingPsql for your installation.' }
$samplingEnv = @{}
Get-Content -LiteralPath (Join-Path $samplingRoot '.env') | ForEach-Object {
    if ($_ -match '^([^#=]+)=(.*)$') { $samplingEnv[$Matches[1].Trim()] = $Matches[2].Trim().Trim('"').Trim("'") }
}
$samplingDb = [UriBuilder]::new($(if ($env:TEST_DATABASE_URL) { $env:TEST_DATABASE_URL } else { $samplingEnv['DATABASE_URL'] }))
if (-not $env:TEST_DATABASE_URL) { $samplingDb.Path = '/sampling_platform_qa_test' }
if (-not $samplingDb.Path.EndsWith('_test')) { throw 'The test database name must end in _test.' }
if ($samplingDb.Path.TrimStart('/') -notmatch '^[a-zA-Z0-9_]+_test$') { throw 'Use an alphanumeric test database name ending in _test.' }
if ($samplingRun -notmatch '^qa_[a-f0-9]{12}$') { throw 'Invalid isolated schema name.' }
$samplingKeys = @('PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','DATABASE_URL','TEST_DATABASE_URL','API_PORT','UPLOAD_DIR','APP_ENV','ENABLE_DEMO','E2E_TEST_MODE','E2E_BASE_URL','E2E_API_URL')
$samplingSaved = @{}
foreach ($samplingKey in $samplingKeys) { $samplingSaved[$samplingKey] = [Environment]::GetEnvironmentVariable($samplingKey, 'Process') }
$samplingNextEnvPath = Join-Path $samplingRoot 'web\next-env.d.ts'
$samplingNextEnv = [IO.File]::ReadAllText($samplingNextEnvPath)
$samplingApiProcess = $null
$samplingSchemaCreated = $false
New-Item -ItemType Directory -Path $samplingRunDir -Force | Out-Null
function Set-SamplingPgEnvironment {
    $samplingUser = $samplingDb.UserName
    $samplingPass = $samplingDb.Password
    $env:PGHOST = $samplingDb.Host
    $env:PGPORT = [string]$samplingDb.Port
    $env:PGUSER = [Uri]::UnescapeDataString($samplingUser)
    $env:PGPASSWORD = [Uri]::UnescapeDataString($samplingPass)
    $env:PGDATABASE = $samplingDb.Path.TrimStart('/')
}
try {
    foreach ($samplingPort in @($WebPort,$ApiPort)) {
        $samplingClient = [Net.Sockets.TcpClient]::new()
        try { $samplingConnected = $samplingClient.ConnectAsync('127.0.0.1',$samplingPort).Wait(500); if ($samplingConnected -and $samplingClient.Connected) { throw "Test port $samplingPort is already in use. Choose a different test port." } }
        catch [System.AggregateException] { } finally { $samplingClient.Dispose() }
    }
    Set-SamplingPgEnvironment
    $env:PGDATABASE = 'postgres'
    $samplingExists = & $samplingPsql -X -t -A -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname='$($samplingDb.Path.TrimStart('/'))'"
    if ($LASTEXITCODE -ne 0) { throw 'Cannot connect to PostgreSQL.' }
    if ($samplingExists -ne '1') {
        & (Join-Path (Split-Path $samplingPsql) 'createdb.exe') $samplingDb.Path.TrimStart('/')
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated test database.' }
    }
    Set-SamplingPgEnvironment
    $env:TEST_DATABASE_URL = $samplingDb.Uri.AbsoluteUri
    if (-not $SkipChecks) {
        Push-Location (Join-Path $samplingRoot 'backend')
        try {
            & go test -count=1 -v ./...
            if ($LASTEXITCODE -ne 0) { throw 'Go tests failed.' }
            & go vet ./...
            if ($LASTEXITCODE -ne 0) { throw 'Go vet failed.' }
        } finally { Pop-Location }
    }
    if ($BackendOnly) { return }
    & $samplingPsql -X -v ON_ERROR_STOP=1 -c "CREATE SCHEMA $samplingRun"
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the isolated QA schema.' }
    $samplingSchemaCreated = $true
    $samplingQuery = $samplingDb.Query.TrimStart('?')
    $samplingDb.Query = $(if ($samplingQuery) { "$samplingQuery&search_path=$samplingRun" } else { "search_path=$samplingRun" })
    $env:DATABASE_URL = $samplingDb.Uri.AbsoluteUri
    $env:API_PORT = [string]$ApiPort
    $env:UPLOAD_DIR = Join-Path $samplingRunDir 'uploads'
    $env:APP_ENV = 'development'
    $env:ENABLE_DEMO = 'true'
    $samplingApi = Join-Path $samplingRunDir 'sampling-api.exe'
    Push-Location (Join-Path $samplingRoot 'backend')
    try { & go build -o $samplingApi ./cmd/api; if ($LASTEXITCODE -ne 0) { throw 'Go API build failed.' } } finally { Pop-Location }
    $samplingApiProcess = Start-Process -FilePath $samplingApi -WorkingDirectory (Join-Path $samplingRoot 'backend') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $samplingRunDir 'api.stdout.log') -RedirectStandardError (Join-Path $samplingRunDir 'api.stderr.log') -PassThru
    foreach ($samplingKey in @('DATABASE_URL','TEST_DATABASE_URL','PGPASSWORD')) { [Environment]::SetEnvironmentVariable($samplingKey,$samplingSaved[$samplingKey],'Process') }
    $samplingReady = $false
    for ($samplingAttempt = 0; $samplingAttempt -lt 40; $samplingAttempt++) {
        try { $samplingHealth = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/health" -TimeoutSec 2; if ($samplingHealth.status -eq 'ok') { $samplingReady = $true; break } } catch { }
        Start-Sleep -Milliseconds 250
    }
    if (-not $samplingReady) { throw "Test API did not become ready. See $samplingRunDir\api.stderr.log" }
    $env:E2E_TEST_MODE = '1'
    $env:E2E_BASE_URL = "http://127.0.0.1:$WebPort"
    $env:E2E_API_URL = "http://127.0.0.1:$ApiPort"
    Write-Host "Testing isolated PostgreSQL schema $samplingRun through Go:$ApiPort and Next.js:$WebPort"
    Push-Location (Join-Path $samplingRoot 'web')
    try {
        & npm.cmd run test:e2e -- @PlaywrightArgs
        $samplingTestExit = $LASTEXITCODE
        if (-not $SkipChecks -and $samplingTestExit -eq 0) {
            Remove-Item Env:E2E_TEST_MODE
            & npm.cmd run typecheck
            if ($LASTEXITCODE -ne 0) { throw 'TypeScript check failed.' }
            & npm.cmd run build
            if ($LASTEXITCODE -ne 0) { throw 'Production build failed.' }
        }
    } finally { Pop-Location }
    if ($samplingTestExit -ne 0) { throw 'Browser integration tests failed; inspect web/test-results and web/playwright-report.' }
    Set-SamplingPgEnvironment
    & $samplingPsql -X -v ON_ERROR_STOP=1 -c "SELECT action,count(*) FROM $samplingRun.audit_events GROUP BY action ORDER BY action;"
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL audit verification failed.' }
    $samplingVerificationSql = @"
SELECT json_build_object(
 'negative_balances',(SELECT count(*) FROM(SELECT shift_id FROM $samplingRun.stock_movements GROUP BY shift_id HAVING sum(CASE WHEN kind IN('initial','added') THEN quantity ELSE -quantity END)<0) x),
 'multiple_open_attendances',(SELECT count(*) FROM(SELECT person_id FROM $samplingRun.attendance WHERE checked_out_at IS NULL GROUP BY person_id HAVING count(*)>1) x),
 'pending_completed_shifts',(SELECT count(*) FROM $samplingRun.shift_reports r JOIN $samplingRun.shifts s ON s.id=r.shift_id WHERE r.status IN('pending','returned') AND s.status='completed'),
 'unreconciled_completed_shifts',(SELECT count(*) FROM $samplingRun.shifts s WHERE s.status='completed' AND COALESCE((SELECT sum(CASE WHEN kind IN('initial','added') THEN quantity ELSE -quantity END) FROM $samplingRun.stock_movements m WHERE m.shift_id=s.id),0)<>0),
 'approved_qa_workflows',(SELECT count(*) FROM $samplingRun.shift_reports WHERE id ~ '^report-[a-f0-9]{24}$' AND status='approved'),
 'audit_events',(SELECT count(*) FROM $samplingRun.audit_events));
"@
    $samplingVerificationJson = & $samplingPsql -X -t -A -v ON_ERROR_STOP=1 -c $samplingVerificationSql
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL invariant query failed.' }
    $samplingVerification = $samplingVerificationJson | ConvertFrom-Json
    if ($samplingVerification.negative_balances -or $samplingVerification.multiple_open_attendances -or $samplingVerification.pending_completed_shifts -or $samplingVerification.unreconciled_completed_shifts) { throw 'PostgreSQL workflow invariants failed.' }
    Set-Content -LiteralPath (Join-Path $samplingRunDir 'postgres-verification.json') -Value $samplingVerificationJson
    $samplingVerificationJson | Write-Host
    Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$ApiPort/api/auth/demo" -ContentType 'application/json' -Headers @{'X-Requested-With'='FaraCode'} -Body '{"role":"admin"}' -SessionVariable samplingRestartSession | Out-Null
    $samplingBeforeRestart = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/workspace" -WebSession $samplingRestartSession
    Stop-Process -Id $samplingApiProcess.Id
    $samplingApiProcess.WaitForExit(5000) | Out-Null
    $env:DATABASE_URL = $samplingDb.Uri.AbsoluteUri
    $env:API_PORT = [string]$ApiPort
    $env:UPLOAD_DIR = Join-Path $samplingRunDir 'uploads'
    $env:APP_ENV = 'development'
    $env:ENABLE_DEMO = 'true'
    $samplingApiProcess = Start-Process -FilePath $samplingApi -WorkingDirectory (Join-Path $samplingRoot 'backend') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $samplingRunDir 'restart.stdout.log') -RedirectStandardError (Join-Path $samplingRunDir 'restart.stderr.log') -PassThru
    $samplingRestartReady = $false
    for ($samplingAttempt=0; $samplingAttempt -lt 40; $samplingAttempt++) {
        try { $samplingAfterRestart = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/workspace" -WebSession $samplingRestartSession -TimeoutSec 2; $samplingRestartReady=$true; break } catch { Start-Sleep -Milliseconds 250 }
    }
    if (-not $samplingRestartReady -or $samplingAfterRestart.user.id -ne $samplingBeforeRestart.user.id -or $samplingAfterRestart.campaigns.Count -ne $samplingBeforeRestart.campaigns.Count -or $samplingAfterRestart.reports.Count -ne $samplingBeforeRestart.reports.Count) { throw 'API restart did not preserve the session and PostgreSQL records.' }
    foreach ($samplingPhoto in $samplingAfterRestart.evidence) {
        $samplingPhotoResponse = Invoke-WebRequest -Uri "http://127.0.0.1:$ApiPort/api/evidence/$($samplingPhoto.id)" -WebSession $samplingRestartSession -UseBasicParsing
        if ($samplingPhotoResponse.StatusCode -ne 200) { throw 'Uploaded evidence did not survive API restart.' }
    }
    @{session_survived=$true; campaigns=$samplingAfterRestart.campaigns.Count; reports=$samplingAfterRestart.reports.Count; evidence=$samplingAfterRestart.evidence.Count} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $samplingRunDir 'restart-verification.json')
    Write-Host 'Verified PostgreSQL invariants, persisted sessions and evidence across Go API restart.'
    if ($SkipChecks -or $PlaywrightArgs.Count) { Write-Host 'Selected checks passed. Results: web/test-results/platform-results.json' }
    else { Write-Host 'Full platform verification passed. Results: web/test-results/platform-results.json' }
} finally {
    if ($samplingApiProcess -and -not $samplingApiProcess.HasExited) { Stop-Process -Id $samplingApiProcess.Id; $samplingApiProcess.WaitForExit(5000) | Out-Null }
    if ($samplingSchemaCreated) {
        Set-SamplingPgEnvironment
        & $samplingPsql -X -v ON_ERROR_STOP=1 -c "DROP SCHEMA $samplingRun CASCADE" *> (Join-Path $samplingRunDir 'schema-cleanup.log')
    }
    [IO.File]::WriteAllText($samplingNextEnvPath,$samplingNextEnv)
    foreach ($samplingKey in $samplingKeys) { [Environment]::SetEnvironmentVariable($samplingKey,$samplingSaved[$samplingKey],'Process') }
}
