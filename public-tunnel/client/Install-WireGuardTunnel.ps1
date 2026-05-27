[CmdletBinding()]
param(
  [string]$EnvPath,
  [string]$TunnelName = "pc-to-tencent",
  [Parameter(Mandatory = $true)]
  [string]$ClientPrivateKey,
  [Parameter(Mandatory = $true)]
  [string]$ServerPublicKey,
  [string]$WireGuardExe,
  [switch]$SkipServiceInstall
)

$ErrorActionPreference = "Stop"

if (-not $EnvPath) {
  $EnvPath = Join-Path $PSScriptRoot "..\tunnel.env"
}

function Read-DotEnv {
  param([string]$Path)

  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $values
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#") -or ($trimmed -notmatch "=")) {
      continue
    }

    $name, $value = $trimmed -split "=", 2
    $values[$name.Trim()] = $value.Trim().Trim("'").Trim('"')
  }

  return $values
}

function Resolve-WireGuardExe {
  param([string]$ExplicitPath)

  if ($ExplicitPath) {
    return (Resolve-Path -LiteralPath $ExplicitPath).Path
  }

  $command = Get-Command wireguard.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $candidates = @(
    "$env:ProgramFiles\WireGuard\wireguard.exe",
    "${env:ProgramFiles(x86)}\WireGuard\wireguard.exe"
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }

  throw "Could not find wireguard.exe. Install WireGuard for Windows or pass -WireGuardExe."
}

$envValues = Read-DotEnv -Path $EnvPath
$serverEndpoint = $envValues["SERVER_ENDPOINT"]
$wgPort = if ($envValues["WG_PORT"]) { $envValues["WG_PORT"] } else { "51820" }
$clientCidr = if ($envValues["WG_CLIENT_CIDR"]) { $envValues["WG_CLIENT_CIDR"] } else { "10.77.0.2/32" }
$allowedIps = if ($envValues["WG_ALLOWED_IPS"]) { $envValues["WG_ALLOWED_IPS"] } else { "10.77.0.0/24" }

if (-not $serverEndpoint) {
  throw "SERVER_ENDPOINT is missing in $EnvPath."
}

$generatedDir = Join-Path $PSScriptRoot "..\generated"
New-Item -ItemType Directory -Force -Path $generatedDir | Out-Null
$configPath = Join-Path $generatedDir "$TunnelName.conf"

$config = @"
[Interface]
PrivateKey = $ClientPrivateKey
Address = $clientCidr

[Peer]
PublicKey = $ServerPublicKey
Endpoint = ${serverEndpoint}:$wgPort
AllowedIPs = $allowedIps
PersistentKeepalive = 25
"@

Set-Content -LiteralPath $configPath -Value $config -Encoding ascii
Write-Host "Wrote WireGuard config: $configPath"

if ($SkipServiceInstall) {
  Write-Host "Skipped WireGuard service install."
  exit 0
}

$wireGuard = Resolve-WireGuardExe -ExplicitPath $WireGuardExe
& $wireGuard /installtunnelservice $configPath
Write-Host "Installed WireGuard tunnel service: WireGuardTunnel`$$TunnelName"
