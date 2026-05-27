[CmdletBinding()]
param(
  [string]$WgExe
)

$ErrorActionPreference = "Stop"

function Resolve-WgExe {
  param([string]$ExplicitPath)

  if ($ExplicitPath) {
    return (Resolve-Path -LiteralPath $ExplicitPath).Path
  }

  $command = Get-Command wg.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $candidates = @(
    "$env:ProgramFiles\WireGuard\wg.exe",
    "${env:ProgramFiles(x86)}\WireGuard\wg.exe"
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }

  throw "Could not find wg.exe. Install WireGuard for Windows or pass -WgExe."
}

$wg = Resolve-WgExe -ExplicitPath $WgExe
$privateKey = & $wg genkey
$publicKey = $privateKey | & $wg pubkey

Write-Host "CLIENT_PRIVATE_KEY=$privateKey"
Write-Host "CLIENT_PUBLIC_KEY=$publicKey"
Write-Host ""
Write-Host "Keep CLIENT_PRIVATE_KEY private. Put CLIENT_PUBLIC_KEY into public-tunnel\tunnel.env."

