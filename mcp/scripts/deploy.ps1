# Usage: .\deploy.ps1 -Target <folder of the Mine-imator install to update>
#    or: set MINEIMATOR_HOME and run .\deploy.ps1
# Copies the built program files from install/Mine-imator into an existing
# Mine-imator folder. Projects, skins, settings, the upgrade key and the recent
# list in the target are never touched, and nothing is deleted there.
param([string] $Target = $env:MINEIMATOR_HOME)

$ErrorActionPreference = "Stop"
if (-not $Target) { throw "Give the install folder with -Target or MINEIMATOR_HOME." }
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$source = Join-Path $repo "install\Mine-imator"
$Target = (Resolve-Path -LiteralPath $Target).Path
if (-not (Test-Path -LiteralPath (Join-Path $Target "Data"))) { throw "$Target does not look like a Mine-imator folder (no Data folder)." }

$exe = Join-Path $Target "Mine-imator.exe"
if (Get-Process | Where-Object { $_.Path -eq $exe }) { throw "Mine-imator is running from $Target. Close it first." }

# User data, relative to the install folder
$keep = '^(Projects|Skins)\\|^Data\\(settings|key|recent|languages)\.midata$|^Data\\log\.txt$|\.test-backup$'

$copied = 0
foreach ($file in Get-ChildItem -LiteralPath $source -Recurse -File) {
    $relative = $file.FullName.Substring($source.Length + 1)
    if ($relative -match $keep) { continue }

    $destination = Join-Path $Target $relative
    if ((Test-Path -LiteralPath $destination) -and
        (Get-FileHash -LiteralPath $destination).Hash -eq (Get-FileHash -LiteralPath $file.FullName).Hash) { continue }

    New-Item -ItemType Directory -Force (Split-Path -Parent $destination) | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
    Write-Host "updated $relative"
    $copied++
}
Write-Host "$copied file(s) updated in $Target"
