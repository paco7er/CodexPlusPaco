param(
    [string]$Version = 'v1.11.1.S'
)

$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') {
    throw 'Version must be a filename component'
}
$portableRepo = Split-Path -Parent $PSScriptRoot
$portableSource = Join-Path $portableRepo 'target\release\codex-plus-plus.exe'
$portableAssets = Join-Path $portableRepo 'assets\windows-portable'
$portableName = "CodexPlusPlus-$Version-windows-x64-portable"
$portableOutput = Join-Path $portableRepo "dist\portable\$portableName"
$portableArchive = "$portableOutput.zip"
if (-not (Test-Path -LiteralPath $portableSource -PathType Leaf)) {
    throw 'Build the release binary before packaging'
}
if ((Test-Path -LiteralPath $portableOutput) -or (Test-Path -LiteralPath $portableArchive)) {
    throw 'Portable output already exists; choose another version to preserve its data'
}

New-Item -ItemType Directory -Path $portableOutput | Out-Null
Copy-Item -LiteralPath $portableSource -Destination (Join-Path $portableOutput 'codex-plus-plus.exe')
foreach ($portableFile in @('portable.flag', 'README.txt')) {
    Copy-Item -LiteralPath (Join-Path $portableAssets $portableFile) -Destination $portableOutput
}
$portableExpected = (Get-FileHash -LiteralPath $portableSource -Algorithm SHA256).Hash
$portableActual = (Get-FileHash -LiteralPath (Join-Path $portableOutput 'codex-plus-plus.exe') -Algorithm SHA256).Hash
if ($portableExpected -ne $portableActual) {
    throw 'Portable executable checksum mismatch'
}
Compress-Archive -LiteralPath $portableOutput -DestinationPath $portableArchive
Write-Output "Portable ZIP: $portableArchive"
Write-Output "SHA256: $((Get-FileHash -LiteralPath $portableArchive -Algorithm SHA256).Hash)"
