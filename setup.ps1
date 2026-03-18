# SecureChat - One-Click Setup Script
# Run this script as Administrator for full functionality

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "   SecureChat - E2E Encrypted Messenger Setup   " -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "[WARNING] Not running as Administrator!" -ForegroundColor Yellow
    Write-Host "         Firewall rules will be skipped." -ForegroundColor Yellow
    Write-Host "         Right-click and 'Run as Administrator' for full setup." -ForegroundColor Yellow
    Write-Host ""
}

# Step 1: Check Node.js
Write-Host "[1/6] Checking Node.js..." -ForegroundColor White
try {
    $nodeVersion = node --version
    Write-Host "       Found Node.js $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "       Node.js not found! Please install from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Step 2: Install dependencies
Write-Host "[2/6] Installing dependencies..." -ForegroundColor White
npm install --silent
if ($LASTEXITCODE -eq 0) {
    Write-Host "       Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "       Failed to install dependencies" -ForegroundColor Red
    exit 1
}

# Step 3: Build client
Write-Host "[3/6] Building client..." -ForegroundColor White
npm run build --silent
if ($LASTEXITCODE -eq 0) {
    Write-Host "       Client built successfully" -ForegroundColor Green
} else {
    Write-Host "       Failed to build client" -ForegroundColor Red
    exit 1
}

# Step 4: Generate SSL certificates if missing
Write-Host "[4/6] Checking SSL certificates..." -ForegroundColor White
if (-not (Test-Path "ssl")) {
    New-Item -ItemType Directory -Path "ssl" -Force | Out-Null
}

if (-not (Test-Path "ssl/key.pem") -or -not (Test-Path "ssl/cert.pem")) {
    Write-Host "       Generating SSL certificates..." -ForegroundColor Yellow
    try {
        openssl req -x509 -newkey rsa:2048 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes -subj "/CN=SecureChat" 2>$null
        Write-Host "       SSL certificates generated" -ForegroundColor Green
    } catch {
        Write-Host "       OpenSSL not found - HTTPS will be disabled" -ForegroundColor Yellow
        Write-Host "       Install OpenSSL or generate certs manually" -ForegroundColor Yellow
    }
} else {
    Write-Host "       SSL certificates already exist" -ForegroundColor Green
}

# Step 5: Add firewall rules (requires admin)
Write-Host "[5/6] Configuring firewall..." -ForegroundColor White
if ($isAdmin) {
    # Remove old rules if exist
    netsh advfirewall firewall delete rule name="E2E Messenger HTTP" 2>$null | Out-Null
    netsh advfirewall firewall delete rule name="E2E Messenger HTTPS" 2>$null | Out-Null
    
    # Add new rules
    netsh advfirewall firewall add rule name="E2E Messenger HTTP" dir=in action=allow protocol=TCP localport=3000 | Out-Null
    netsh advfirewall firewall add rule name="E2E Messenger HTTPS" dir=in action=allow protocol=TCP localport=3443 | Out-Null
    Write-Host "       Firewall rules added (ports 3000, 3443)" -ForegroundColor Green
} else {
    Write-Host "       Skipped (requires Administrator)" -ForegroundColor Yellow
}

# Step 6: Get IP address
Write-Host "[6/6] Finding your IP address..." -ForegroundColor White
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -match "Wi-Fi|Ethernet" -and $_.PrefixOrigin -eq "Dhcp" } | Select-Object -First 1).IPAddress
if (-not $ip) {
    $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { -not $_.InterfaceAlias.Contains("Loopback") -and $_.PrefixOrigin -ne "WellKnown" } | Select-Object -First 1).IPAddress
}
if (-not $ip) { $ip = "YOUR_IP" }
Write-Host "       Your IP: $ip" -ForegroundColor Green

# Done!
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "              SETUP COMPLETE!                    " -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  PC Access:    http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Phone Access: https://${ip}:3443" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Starting server..." -ForegroundColor White
Write-Host ""

# Start the server
npm start
