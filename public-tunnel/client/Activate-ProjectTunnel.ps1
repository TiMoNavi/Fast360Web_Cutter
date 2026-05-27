[CmdletBinding()]
param(
  [int]$LocalWebPort = 0,
  [string]$TunnelName = "pc-to-tencent",
  [switch]$StartWeb
)

$ErrorActionPreference = "Stop"

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Resolve-WireGuardExe {
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

  throw "Could not find wireguard.exe. Install WireGuard for Windows first."
}

if (-not (Test-IsAdmin)) {
  $argsList = @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$PSCommandPath`"",
    "-TunnelName", "`"$TunnelName`""
  )

  if ($LocalWebPort -gt 0) {
    $argsList += @("-LocalWebPort", "$LocalWebPort")
  }

  if ($StartWeb) {
    $argsList += "-StartWeb"
  }

  Start-Process powershell.exe -Verb RunAs -ArgumentList $argsList
  exit 0
}

$configPath = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\generated\$TunnelName.conf")
$serviceName = "WireGuardTunnel`$$TunnelName"
$service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

if (-not $service) {
  $wireGuard = Resolve-WireGuardExe
  & $wireGuard /installtunnelservice $configPath
  Start-Sleep -Seconds 1
}

$startScript = Join-Path $PSScriptRoot "Start-ProjectPublicTunnel.ps1"
$startArgs = @{
  TunnelName = $TunnelName
}

if ($LocalWebPort -gt 0) {
  $startArgs["LocalWebPort"] = $LocalWebPort
}

if ($StartWeb) {
  $startArgs["StartWeb"] = $true
}

& $startScript @startArgs

