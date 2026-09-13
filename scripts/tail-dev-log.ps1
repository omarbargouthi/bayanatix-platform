<#
.SYNOPSIS
  Streams the most recent dev-server log file in real time (like `tail -f`).

.PARAMETER Lines
  How many trailing lines to show before following. Default 50.
#>
param(
    [int]$Lines = 50
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$logsDir = Join-Path $projectRoot "logs"

$latest = Get-ChildItem -Path $logsDir -Filter "dev-*.log" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $latest) {
    Write-Output "No dev log files found in $logsDir. Start the server with scripts\start-dev.ps1 first."
    exit 1
}

Write-Output "Tailing: $($latest.FullName)"
Get-Content -Path $latest.FullName -Tail $Lines -Wait
