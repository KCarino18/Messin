$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir = Join-Path $Root "app"
$Port = if ($env:PORT) { $env:PORT } else { "3000" }

Write-Host ""
Write-Host "========================================"
Write-Host "  MTG Budget installer"
Write-Host "========================================"
Write-Host ""

function Assert-Node {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    throw "Node.js is required but was not found. Install Node 20+ from https://nodejs.org then run this installer again."
  }
  $major = [int]((node -p "process.versions.node.split('.')[0]").Trim())
  if ($major -lt 20) {
    throw "Node.js 20+ is required (found $(node -v))."
  }
}

Assert-Node
Set-Location $AppDir

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example"
}

Write-Host "Installing dependencies..."
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

Write-Host "Setting up database..."
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw "prisma migrate failed" }
npm run db:seed
if ($LASTEXITCODE -ne 0) { throw "db seed failed" }

Write-Host "Building app..."
npm run build
if ($LASTEXITCODE -ne 0) { throw "build failed" }

Write-Host ""
Write-Host "Install complete. Starting MTG Budget on http://localhost:$Port"
Write-Host "Press Ctrl+C to stop."
Write-Host ""

Start-Process "http://localhost:$Port"
npm run start -- -p $Port
