# Usage: .\add-gml-script.ps1 <name>
# Creates GmProject/scripts/<name>/<name>.gml + .yy and registers it in Mine-imator.yyp.
param([Parameter(Mandatory = $true)][string] $Name)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$dir = Join-Path $repo "GmProject\scripts\$Name"
if (Test-Path $dir) { throw "Script $Name already exists" }

$yyp = Join-Path $repo "GmProject\Mine-imator.yyp"
$text = [IO.File]::ReadAllText($yyp)
$anchor = '{"id":{"name":"app_event_http","path":"scripts/app_event_http/app_event_http.yy",},"order":35,},'
if (-not $text.Contains($anchor)) { throw "Anchor entry not found in Mine-imator.yyp" }

New-Item -ItemType Directory $dir | Out-Null
$yy = "{`n  `"resourceType`": `"GMScript`",`n  `"resourceVersion`": `"1.0`",`n  `"name`": `"$Name`",`n  `"isDnD`": false,`n  `"isCompatibility`": false,`n  `"parent`": {`n    `"name`": `"App`",`n    `"path`": `"folders/Scripts/App.yy`",`n  },`n}"
[IO.File]::WriteAllText((Join-Path $dir "$Name.yy"), $yy)
[IO.File]::WriteAllText((Join-Path $dir "$Name.gml"), "")

$entry = '{"id":{"name":"' + $Name + '","path":"scripts/' + $Name + '/' + $Name + '.yy",},"order":35,},'
$newline = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
[IO.File]::WriteAllText($yyp, $text.Replace($anchor, $anchor + $newline + "    " + $entry))
Write-Host "Added script $Name"
