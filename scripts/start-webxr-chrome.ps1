$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$installedExtension = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data\Default\Extensions\cgffilbpcibhmcfbgggfhfolhkfbhmik\1.5.0_0"
$extension = Join-Path $repoRoot ".tmp\immersive-web-emulator"
$profile = Join-Path $repoRoot ".tmp\chrome-webxr-profile"
$url = "http://localhost:3000/xr/hello"
$logPath = Join-Path $repoRoot "logs\chrome-webxr.log"
$outPath = Join-Path $repoRoot "logs\chrome-webxr.out.log"

if (!(Test-Path $chrome)) {
  throw "Chrome was not found at $chrome"
}

if (!(Test-Path (Join-Path $installedExtension "manifest.json"))) {
  throw "Immersive Web Emulator extension was not found at $installedExtension"
}

New-Item -ItemType Directory -Force $profile | Out-Null
New-Item -ItemType Directory -Force (Split-Path $logPath) | Out-Null
if (Test-Path $logPath) {
  Remove-Item -LiteralPath $logPath -Force
}
if (Test-Path $outPath) {
  Remove-Item -LiteralPath $outPath -Force
}
if (Test-Path $extension) {
  Remove-Item -LiteralPath $extension -Recurse -Force
}
Copy-Item -LiteralPath $installedExtension -Destination $extension -Recurse -Force
$metadata = Join-Path $extension "_metadata"
if (Test-Path $metadata) {
  Remove-Item -LiteralPath $metadata -Recurse -Force
}

$arguments = @(
  "--user-data-dir=$profile",
  "--remote-debugging-port=9232",
  "--remote-allow-origins=*",
  "--enable-logging=stderr",
  "--v=1",
  "--disable-extensions-except=$extension",
  "--load-extension=$extension",
  "--auto-open-devtools-for-tabs",
  "--no-first-run",
  "--disable-default-apps",
  $url
)

Start-Process -FilePath $chrome -ArgumentList $arguments -RedirectStandardError $logPath -RedirectStandardOutput $outPath

Write-Host "Opened Chrome with Immersive Web Emulator loaded."
Write-Host "URL: $url"
Write-Host "Extension path: $extension"
Write-Host "Chrome log: $logPath"
Write-Host "In DevTools, look for the WebXR tab. If it is hidden, click >>."
