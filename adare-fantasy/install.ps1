<#
.SYNOPSIS
  Twenty-Eight — installer for Windows.

.DESCRIPTION
  Checks what is already installed and fills in what is missing, without asking
  for administrator rights:

    1. Node.js 20+ — a private copy goes into %LOCALAPPDATA%\TwentyEight\node.
    2. npm dependencies, including the Postgres server binaries (they are npm
       packages, so no installer and no admin).
    3. A Postgres cluster in .data\pg, the database, and db\schema.sql.
    4. .env.local with a session secret, an admin token, the database URL and a
       local mail outbox.
    5. A browser for the end-to-end test (Chrome or Edge; downloaded if neither).
    6. The production build, and a smoke test of it.

.PARAMETER Check
  Report what is installed and what is missing. Changes nothing.

.PARAMETER NoPostgres
  Keep the JSON file store instead of setting up Postgres.

.PARAMETER NoBuild
  Skip `next build`.

.EXAMPLE
  .\install.ps1
  .\install.ps1 -Check
  .\install.ps1 -NoPostgres
#>
[CmdletBinding()]
param(
  [switch]$Check,
  [switch]$NoPostgres,
  [switch]$NoBuild,
  [switch]$SkipDeps
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Set-Location -LiteralPath $PSScriptRoot

$MinMajor = 20
$NodeDir = if ($env:TWENTY_EIGHT_NODE_DIR) { $env:TWENTY_EIGHT_NODE_DIR } else { Join-Path $env:LOCALAPPDATA "TwentyEight\node" }

function Write-Ok($message, $detail) {
  if ($detail) { Write-Host "OK  $message" -ForegroundColor Green -NoNewline; Write-Host "  $detail" -ForegroundColor DarkGray }
  else { Write-Host "OK  $message" -ForegroundColor Green }
}
function Write-Step($message, $detail) {
  if ($detail) { Write-Host "..  $message" -NoNewline; Write-Host "  $detail" -ForegroundColor DarkGray }
  else { Write-Host "..  $message" }
}
function Write-Bad($message, $detail) {
  Write-Host "XX  $message" -ForegroundColor Red
  if ($detail) { Write-Host "    $detail" -ForegroundColor DarkGray }
}

# ---- Node ------------------------------------------------------------------

function Get-NodeMajor {
  try { return [int](& node -p "process.versions.node.split('.')[0]" 2>$null) } catch { return 0 }
}

function Install-Node {
  Write-Step "Downloading a private copy of Node.js (no admin rights)"
  $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -UseBasicParsing
  $release = $index | Where-Object { $_.lts -ne $false } | Select-Object -First 1
  if (-not $release) { $release = $index | Select-Object -First 1 }
  $version = $release.version
  $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
  $base = "node-$version-win-$arch"
  $zip = Join-Path $env:TEMP "$base.zip"
  $sums = Join-Path $env:TEMP "SHASUMS256-$version.txt"

  Write-Step "Node $version for win-$arch (about 30 MB)" "https://nodejs.org/dist/$version/"
  Invoke-WebRequest -Uri "https://nodejs.org/dist/$version/$base.zip" -OutFile $zip -UseBasicParsing
  Invoke-WebRequest -Uri "https://nodejs.org/dist/$version/SHASUMS256.txt" -OutFile $sums -UseBasicParsing

  $expected = (Select-String -Path $sums -Pattern "$base.zip" | Select-Object -First 1).Line.Split(" ")[0]
  $actual = (Get-FileHash -Path $zip -Algorithm SHA256).Hash.ToLower()
  if (-not $expected -or $expected -ne $actual) {
    throw "The downloaded Node archive did not match its published checksum. Install Node from https://nodejs.org and run this again."
  }

  New-Item -ItemType Directory -Force -Path $NodeDir | Out-Null
  Expand-Archive -Path $zip -DestinationPath $NodeDir -Force
  $bin = Join-Path $NodeDir $base
  $env:PATH = "$bin;$env:PATH"
  Set-Content -Path (Join-Path $NodeDir "bin-path.txt") -Value $bin -Encoding ASCII
  Remove-Item $zip, $sums -Force -ErrorAction SilentlyContinue
  Write-Ok "Node $version installed" $bin
}

$major = Get-NodeMajor
if ($major -lt $MinMajor) {
  $previous = Join-Path $NodeDir "bin-path.txt"
  if ((Test-Path $previous) -and (Test-Path (Join-Path (Get-Content $previous) "node.exe"))) {
    $env:PATH = "$(Get-Content $previous);$env:PATH"
    $major = Get-NodeMajor
  }
}
if ($major -lt $MinMajor) {
  try { Install-Node; $major = Get-NodeMajor } catch {
    Write-Bad "Node.js 20+ is required and could not be installed" $_.Exception.Message
    exit 1
  }
}
Write-Ok "Node.js" ((& node -v) + " on windows")

# ---- hand over to the shared installer -------------------------------------

$forward = @()
if ($Check) { $forward += "--check" }
if ($NoPostgres) { $forward += "--no-postgres" }
if ($NoBuild) { $forward += "--no-build" }
if ($SkipDeps) { $forward += "--skip-deps" }

& node "scripts\install.mjs" @forward
exit $LASTEXITCODE
