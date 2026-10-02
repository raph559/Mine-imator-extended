# Rebuilds and installs the custom build into install/Mine-imator.
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$exe = Join-Path $repo "install\Mine-imator\Mine-imator.exe"

# The install step cannot overwrite a running exe
Get-Process | Where-Object { $_.Path -eq $exe } | Stop-Process -Force

if (-not $env:DEV_DIR) { $env:DEV_DIR = [Environment]::GetEnvironmentVariable("DEV_DIR", "Machine") }
$env:Path = "C:\Strawberry\c\bin;C:\Strawberry\perl\site\bin;C:\Strawberry\perl\bin;" + $env:Path
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo "Setup.ps1") Release
exit $LASTEXITCODE
