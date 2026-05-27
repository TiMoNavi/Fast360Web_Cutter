[CmdletBinding()]
param(
  [string]$EnvPath,
  [string]$TunnelName = "pc-to-tencent",
  [int]$LocalWebPort = 0,
  [int]$GatewayPort = 0,
  [string]$GatewayListenAddress,
  [string]$LocalWebHost = "127.0.0.1",
  [switch]$StartWeb
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

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-FirstListeningPort {
  param([int[]]$Candidates)

  foreach ($port in $Candidates) {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
      return $port
    }
  }

  return 0
}

if (-not (Test-IsAdmin)) {
  throw "Run this script from an elevated PowerShell window. netsh portproxy and WireGuard services require administrator rights."
}

$envValues = Read-DotEnv -Path $EnvPath

if (-not $GatewayListenAddress) {
  $GatewayListenAddress = if ($envValues["WG_CLIENT_IP"]) { $envValues["WG_CLIENT_IP"] } else { "10.77.0.2" }
}

if ($GatewayPort -le 0) {
  $GatewayPort = if ($envValues["PUBLIC_WEB_GATEWAY_PORT"]) { [int]$envValues["PUBLIC_WEB_GATEWAY_PORT"] } else { 39080 }
}

if ($LocalWebPort -le 0) {
  $candidateText = if ($envValues["LOCAL_WEB_PORT_CANDIDATES"]) { $envValues["LOCAL_WEB_PORT_CANDIDATES"] } else { "3080,3000" }
  $candidates = $candidateText.Split(",") | ForEach-Object { [int]$_.Trim() }
  $LocalWebPort = Get-FirstListeningPort -Candidates $candidates
  if ($LocalWebPort -le 0) {
    $LocalWebPort = $candidates[0]
  }
}

$serviceName = "WireGuardTunnel`$$TunnelName"
$service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($service) {
  if ($service.Status -ne "Running") {
    Start-Service -Name $serviceName
  }
  Write-Host "WireGuard service is running: $serviceName"
} else {
  Write-Warning "WireGuard service $serviceName was not found. Run Install-WireGuardTunnel.ps1 first, or start the tunnel manually."
}

netsh interface portproxy delete v4tov4 listenaddress=$GatewayListenAddress listenport=$GatewayPort | Out-Null
netsh interface portproxy add v4tov4 listenaddress=$GatewayListenAddress listenport=$GatewayPort connectaddress=$LocalWebHost connectport=$LocalWebPort | Out-Null

$firewallRuleName = "Public Tunnel Gateway $GatewayListenAddress`:$GatewayPort"
$existingRule = Get-NetFirewallRule -DisplayName $firewallRuleName -ErrorAction SilentlyContinue
if (-not $existingRule) {
  New-NetFirewallRule `
    -DisplayName $firewallRuleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalAddress $GatewayListenAddress `
    -LocalPort $GatewayPort | Out-Null
}

Write-Host "Mapped ${GatewayListenAddress}:$GatewayPort -> ${LocalWebHost}:$LocalWebPort"
Write-Host "Server HTTPS should reverse proxy to http://${GatewayListenAddress}:$GatewayPort"

if ($StartWeb) {
  $repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")
  Write-Host "Starting Next dev on 0.0.0.0:$LocalWebPort ..."
  Push-Location $repoRoot
  try {
    $env:PORT = "$LocalWebPort"
    npm --workspace apps/web run dev:host
  } finally {
    Pop-Location
  }
}
