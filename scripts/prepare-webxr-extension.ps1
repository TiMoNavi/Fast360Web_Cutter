$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$installedRoot = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data\Default\Extensions\cgffilbpcibhmcfbgggfhfolhkfbhmik"
$prepared = Join-Path $repoRoot ".tmp\immersive-web-emulator"

if (!(Test-Path $chrome)) {
  throw "Chrome was not found at $chrome"
}

$installedVersion = Get-ChildItem -LiteralPath $installedRoot -Directory -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (!$installedVersion -or !(Test-Path (Join-Path $installedVersion.FullName "manifest.json"))) {
  Start-Process -FilePath $chrome -ArgumentList @(
    "https://chromewebstore.google.com/detail/immersive-web-emulator/cgffilbpcibhmcfbgggfhfolhkfbhmik"
  )
  throw "Immersive Web Emulator was not found locally. Chrome Web Store page was opened for reinstall."
}

if (Test-Path $prepared) {
  Remove-Item -LiteralPath $prepared -Recurse -Force
}

Copy-Item -LiteralPath $installedVersion.FullName -Destination $prepared -Recurse -Force

$metadata = Join-Path $prepared "_metadata"
if (Test-Path $metadata) {
  Remove-Item -LiteralPath $metadata -Recurse -Force
}

Start-Process -FilePath $chrome -ArgumentList @("chrome://extensions")
Start-Process explorer.exe -ArgumentList $prepared

Write-Host ""
Write-Host "Prepared unpacked Immersive Web Emulator extension:"
Write-Host $prepared
Write-Host ""
Write-Host "In chrome://extensions:"
Write-Host "1. Turn on Developer mode."
Write-Host "2. Click Load unpacked."
Write-Host "3. Select this folder:"
Write-Host $prepared
Write-Host "4. Reopen DevTools on http://localhost:3000/xr/hello and look for WebXR."
