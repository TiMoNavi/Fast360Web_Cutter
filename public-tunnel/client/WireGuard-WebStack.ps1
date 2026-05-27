[CmdletBinding()]
param(
  [ValidateSet("detect", "status", "on", "off")]
  [string]$Action = "status",
  [string]$EnvPath,
  [int]$FrontendPort = 0,
  [int]$BackendPort = 0,
  [switch]$NoStart,
  [switch]$StopLocalServices
)

$ErrorActionPreference = "Stop"

if (-not $EnvPath) {
  $EnvPath = Join-Path $PSScriptRoot "..\tunnel.env"
}

$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")
$generatedDir = Join-Path $PSScriptRoot "..\generated"
$statePath = Join-Path $generatedDir "wireguard-web-stack-state.json"
New-Item -ItemType Directory -Force -Path $generatedDir | Out-Null

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

function Invoke-LocalProbe {
  param(
    [string]$Url,
    [int]$TimeoutSec = 4
  )

  try {
    if ($Url.StartsWith("https://")) {
      [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    }

    return Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec -ErrorAction Stop
  } catch {
    return $null
  } finally {
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = $null
  }
}

function Invoke-CurlProbe {
  param(
    [string]$Url,
    [int]$TimeoutSec = 4
  )

  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if (-not $curl) {
    return $null
  }

  try {
    $lines = & $curl.Source -k -I --max-time $TimeoutSec $Url 2>$null
    if (-not $lines) {
      return $null
    }

    $statusLine = $lines | Where-Object { $_ -match "^HTTP/" } | Select-Object -Last 1
    if (-not $statusLine -or $statusLine -notmatch "^HTTP/\S+\s+(\d+)") {
      return $null
    }
    $statusCode = [int]$matches[1]

    $headers = @{}
    foreach ($line in $lines) {
      if ($line -match "^([^:]+):\s*(.*)$") {
        $headers[$matches[1]] = $matches[2]
      }
    }

    return [pscustomobject]@{
      StatusCode = $statusCode
      Headers = $headers
      Content = ""
    }
  } catch {
    return $null
  }
}

function Invoke-ServiceProbe {
  param(
    [string]$Url,
    [int]$TimeoutSec = 4
  )

  $response = Invoke-LocalProbe -Url $Url -TimeoutSec $TimeoutSec
  if ($response) {
    return $response
  }

  return Invoke-CurlProbe -Url $Url -TimeoutSec $TimeoutSec
}

function Get-PortCandidates {
  param(
    [hashtable]$EnvValues,
    [string]$Name,
    [int[]]$Fallback
  )

  if (-not $EnvValues[$Name]) {
    return $Fallback
  }

  return @($EnvValues[$Name].Split(",") | ForEach-Object { [int]$_.Trim() } | Where-Object { $_ -gt 0 })
}

function Test-PortListening {
  param([int]$Port)

  return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Find-Frontend {
  param([int[]]$Candidates)

  foreach ($port in $Candidates) {
    if (-not (Test-PortListening -Port $port)) {
      continue
    }

    foreach ($scheme in @("http", "https")) {
      $url = "${scheme}://127.0.0.1:$port/"
      $response = Invoke-ServiceProbe -Url $url
      if (-not $response) {
        continue
      }

      $poweredBy = ""
      if ($response.Headers -and $response.Headers["X-Powered-By"]) {
        $poweredBy = [string]$response.Headers["X-Powered-By"]
      }

      $content = ""
      if ($response.Content) {
        $content = [string]$response.Content
      }

      $statusCode = [int]$response.StatusCode
      $looksLikeNext = ($poweredBy -match "Next") -or ($content -match "__next|Next.js|The Invisible Director")
      if ($looksLikeNext -or $statusCode -lt 500) {
        return [pscustomobject]@{
          Kind = "frontend"
          Port = $port
          Scheme = $scheme
          Url = $url
          StatusCode = $statusCode
          Detected = $true
        }
      }
    }
  }

  return $null
}

function Find-Backend {
  param([int[]]$Candidates)

  foreach ($port in $Candidates) {
    if (-not (Test-PortListening -Port $port)) {
      continue
    }

    foreach ($path in @("/health", "/openapi.json", "/docs")) {
      $url = "http://127.0.0.1:$port$path"
      $response = Invoke-ServiceProbe -Url $url
      if (-not $response) {
        continue
      }

      $content = ""
      if ($response.Content) {
        $content = [string]$response.Content
      }

      $statusCode = [int]$response.StatusCode
      $looksLikeApi = ($content -match "openapi|FastAPI|status|ok|healthy") -or ($statusCode -lt 500)
      if ($looksLikeApi) {
        return [pscustomobject]@{
          Kind = "backend"
          Port = $port
          Scheme = "http"
          Url = "http://127.0.0.1:$port"
          ProbePath = $path
          StatusCode = $statusCode
          Detected = $true
        }
      }
    }
  }

  return $null
}

function Start-Backend {
  param([int]$Port)

  $out = Join-Path $generatedDir "api-$Port.out.log"
  $err = Join-Path $generatedDir "api-$Port.err.log"
  $command = "Set-Location '$repoRoot'; `$env:PORT='$Port'; python -m uvicorn app.main:app --reload --app-dir apps/api --host 127.0.0.1 --port $Port"
  $process = Start-Process powershell.exe -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command)
  return $process.Id
}

function Start-Frontend {
  param(
    [int]$Port,
    [int]$ApiPort
  )

  $out = Join-Path $generatedDir "web-$Port.out.log"
  $err = Join-Path $generatedDir "web-$Port.err.log"
  $webDir = Join-Path $repoRoot "apps\web"
  $apiBase = "http://127.0.0.1:$ApiPort"
  $command = "Set-Location '$webDir'; `$env:API_BASE_URL='$apiBase'; `$env:NEXT_PUBLIC_API_BASE_URL=''; `$env:NEXT_DIST_DIR='.next-public-tunnel'; node server.mjs --hostname 127.0.0.1 --port $Port"
  $process = Start-Process powershell.exe -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command)
  return $process.Id
}

function Wait-ForService {
  param(
    [scriptblock]$Detector,
    [int]$TimeoutSec = 45
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    $service = & $Detector
    if ($service) {
      return $service
    }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  return $null
}

function Save-State {
  param([hashtable]$State)

  $State | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statePath -Encoding ascii
}

function Read-State {
  if (-not (Test-Path -LiteralPath $statePath)) {
    return $null
  }

  return Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
}

function Stop-RecordedProcess {
  param([int]$ProcessId)

  if ($ProcessId -le 0) {
    return
  }

  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if ($process) {
    Stop-Process -Id $ProcessId -Force
  }
}

$envValues = Read-DotEnv -Path $EnvPath
$frontendCandidates = Get-PortCandidates -EnvValues $envValues -Name "LOCAL_WEB_PORT_CANDIDATES" -Fallback @(3081, 3000, 3080, 5173, 4173)
$backendCandidates = Get-PortCandidates -EnvValues $envValues -Name "LOCAL_API_PORT_CANDIDATES" -Fallback @(8000, 8010, 5000, 5001)

if ($FrontendPort -gt 0) {
  $frontendCandidates = @($FrontendPort) + @($frontendCandidates | Where-Object { $_ -ne $FrontendPort })
}

if ($BackendPort -gt 0) {
  $backendCandidates = @($BackendPort) + @($backendCandidates | Where-Object { $_ -ne $BackendPort })
}

$frontend = Find-Frontend -Candidates $frontendCandidates
$backend = Find-Backend -Candidates $backendCandidates

if ($Action -eq "detect" -or $Action -eq "status") {
  [pscustomobject]@{
    Action = $Action
    Frontend = $frontend
    Backend = $backend
    WireGuardService = [string]((Get-Service -Name "WireGuardTunnel`$pc-to-tencent" -ErrorAction SilentlyContinue).Status)
    PortProxy = (netsh interface portproxy show v4tov4) -join "`n"
    StateFile = $statePath
  } | ConvertTo-Json -Depth 6
  exit 0
}

if ($Action -eq "off") {
  if (-not (Test-IsAdmin)) {
    $argList = @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"", "-Action", "off")
    if ($StopLocalServices) {
      $argList += "-StopLocalServices"
    }
    Start-Process powershell.exe -Verb RunAs -ArgumentList $argList
    exit 0
  }

  $wgClientIp = if ($envValues["WG_CLIENT_IP"]) { $envValues["WG_CLIENT_IP"] } else { "10.77.0.2" }
  $gatewayPort = if ($envValues["PUBLIC_WEB_GATEWAY_PORT"]) { [int]$envValues["PUBLIC_WEB_GATEWAY_PORT"] } else { 39080 }
  netsh interface portproxy delete v4tov4 listenaddress=$wgClientIp listenport=$gatewayPort | Out-Null
  Get-NetFirewallRule -DisplayName "Public Tunnel Gateway $wgClientIp`:$gatewayPort" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  Stop-Service -Name "WireGuardTunnel`$pc-to-tencent" -ErrorAction SilentlyContinue

  if ($StopLocalServices) {
    $state = Read-State
    if ($state) {
      Stop-RecordedProcess -ProcessId ([int]$state.FrontendPid)
      Stop-RecordedProcess -ProcessId ([int]$state.BackendPid)
    }
  }

  Write-Host "WireGuard public web tunnel is off."
  exit 0
}

if ($Action -eq "on") {
  $startedBackendPid = 0
  $startedFrontendPid = 0
  $shouldStart = -not $NoStart

  if (-not $backend -and $shouldStart) {
    $targetBackendPort = if ($BackendPort -gt 0) { $BackendPort } else { $backendCandidates[0] }
    $startedBackendPid = Start-Backend -Port $targetBackendPort
    $backend = Wait-ForService -Detector { Find-Backend -Candidates @($targetBackendPort) }
  }

  if (-not $backend) {
    throw "No backend was detected. Start it first or rerun with -BackendPort."
  }

  if (-not $frontend -and $shouldStart) {
    $targetFrontendPort = if ($FrontendPort -gt 0) { $FrontendPort } else { $frontendCandidates[0] }
    $startedFrontendPid = Start-Frontend -Port $targetFrontendPort -ApiPort $backend.Port
    $frontend = Wait-ForService -Detector { Find-Frontend -Candidates @($targetFrontendPort) } -TimeoutSec 60
  }

  if (-not $frontend) {
    throw "No frontend was detected. Start it first or rerun with -FrontendPort."
  }

  Save-State -State @{
    FrontendPort = $frontend.Port
    FrontendUrl = $frontend.Url
    BackendPort = $backend.Port
    BackendUrl = $backend.Url
    FrontendPid = $startedFrontendPid
    BackendPid = $startedBackendPid
    UpdatedAt = (Get-Date).ToString("o")
  }

  & (Join-Path $PSScriptRoot "Activate-ProjectTunnel.ps1") -LocalWebPort $frontend.Port

  Write-Host "WireGuard public web tunnel is on."
  Write-Host "Frontend: $($frontend.Url)"
  Write-Host "Backend:  $($backend.Url)"
  if ($envValues["PUBLIC_HOST"]) {
    $publicHost = $envValues["PUBLIC_HOST"]
    Write-Host "Public:   https://$publicHost/"
  }
}
