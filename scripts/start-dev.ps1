<#
.SYNOPSIS
  Starts the Next.js dev server with stdout/stderr captured to a timestamped
  log file, and purges log files older than the configured retention window.

.PARAMETER RetentionDays
  Overrides and persists the retention window (days) in dev-logs.config.json.
  Omit to use the value already in the config file (default 7).
#>
param(
    [int]$RetentionDays
)

$ErrorActionPreference = "Stop"

$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$logsDir     = Join-Path $projectRoot "logs"
$configPath  = Join-Path $scriptDir "dev-logs.config.json"

if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir | Out-Null
}

if (Test-Path $configPath) {
    $config = Get-Content $configPath -Raw | ConvertFrom-Json
} else {
    $config = [PSCustomObject]@{ retentionDays = 7 }
}

if ($RetentionDays) {
    $config.retentionDays = $RetentionDays
    $config | ConvertTo-Json | Set-Content $configPath -Encoding utf8
}

$retention = [int]$config.retentionDays
Write-Output "Log retention: $retention day(s)"

$cutoff = (Get-Date).AddDays(-$retention)
Get-ChildItem -Path $logsDir -Filter "dev-*.log" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    ForEach-Object {
        Write-Output "Purging old log: $($_.Name)"
        Remove-Item $_.FullName -Force
    }

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logFile   = Join-Path $logsDir "dev-$timestamp.log"

$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")

# Route through cmd.exe so stdout+stderr merge into one real-time-tailable file
# (Start-Process -RedirectStandardOutput/-Error cannot share a single file).
$cmdArgs = "/c npm run dev > `"$logFile`" 2>&1"
$proc = Start-Process -FilePath "cmd.exe" -ArgumentList $cmdArgs -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru

Write-Output "Dev server starting (PID $($proc.Id))"
Write-Output "Log file: $logFile"
Write-Output "Tail live with: scripts\tail-dev-log.ps1"
