# Rebuilds and installs the custom build into install/Mine-imator.
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$exe = Join-Path $repo "install\Mine-imator\Mine-imator.exe"

# The install step cannot overwrite a running exe
Get-Process | Where-Object { $_.Path -eq $exe } | Stop-Process -Force

if (-not $env:DEV_DIR) { $env:DEV_DIR = [Environment]::GetEnvironmentVariable("DEV_DIR", "Machine") }
$env:Path = "C:\Strawberry\c\bin;C:\Strawberry\perl\site\bin;C:\Strawberry\perl\bin;" + $env:Path

# When a GML change makes CppGen produce one generated file more or fewer, the first
# build still uses the old file list and fails; the second one has refreshed it.
foreach ($attempt in 1, 2) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo "Setup.ps1") Release
    if ($LASTEXITCODE -eq 0) { break }
    if ($attempt -eq 1) { Write-Host "Build failed, retrying once with the refreshed file list" }
}
exit $LASTEXITCODE
