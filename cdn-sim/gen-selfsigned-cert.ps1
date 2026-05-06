# =====================================================================
# Task T1.6 · Sinh Self-Signed Certificate cho cdn-sim (TLS 1.3 + Pin)
# Chạy: pwsh -File cdn-sim/gen-selfsigned-cert.ps1
# Yêu cầu: OpenSSL trong PATH (Git for Windows / Chocolatey installed).
#
# Output (tương thích với gen-selfsigned-cert.sh):
#   cdn-sim/certs/fullchain.pem
#   cdn-sim/certs/privkey.pem
#   cdn-sim/certs/pin.sha256.txt    (RFC 7469: sha256-<base64>)
# =====================================================================

$CertsDir = Join-Path $PSScriptRoot "certs"
$KeyFile  = Join-Path $CertsDir "privkey.pem"
$CertFile = Join-Path $CertsDir "fullchain.pem"
$PinFile  = Join-Path $CertsDir "pin.sha256.txt"
$SanCnf   = Join-Path $CertsDir "san.cnf"

if (-not (Test-Path $CertsDir)) {
    New-Item -ItemType Directory -Path $CertsDir | Out-Null
}

Write-Host "[1/3] Sinh RSA-2048 private key..." -ForegroundColor Cyan
openssl genrsa -out $KeyFile 2048 2>$null
if ($LASTEXITCODE -ne 0) { throw "openssl genrsa failed" }

Write-Host "[2/3] Sinh self-signed cert (365 ngày, SAN: localhost + cdn.local + cdn-sim)..." -ForegroundColor Cyan

$SanContent = @"
[req]
default_bits       = 2048
prompt             = no
default_md         = sha256
distinguished_name = dn
x509_extensions    = v3_req

[dn]
C  = VN
ST = HCM
L  = UIT
O  = NT219
OU = Capstone
CN = cdn.local

[v3_req]
subjectAltName   = @alt_names
keyUsage         = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
DNS.1 = cdn.local
DNS.2 = localhost
DNS.3 = cdn-sim
IP.1  = 127.0.0.1
"@

$SanContent | Out-File -FilePath $SanCnf -Encoding ascii
openssl req -new -x509 -key $KeyFile -out $CertFile -days 365 -config $SanCnf 2>$null
Remove-Item $SanCnf -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { throw "openssl req failed" }

Write-Host "[3/3] Tính SPKI SHA-256 (RFC 7469) cho cert pinning..." -ForegroundColor Cyan

# Pipeline qua PowerShell stream để tương thích Windows (`|` không gọi tiếp openssl
# trực tiếp tốt như bash). Dùng tệp tạm trung gian.
$DerTmp = Join-Path $CertsDir "spki.der"
openssl x509 -in $CertFile -pubkey -noout 2>$null | openssl pkey -pubin -outform DER -out $DerTmp 2>$null
$PinRaw = (openssl dgst -sha256 -binary $DerTmp | openssl base64 -A)
Remove-Item $DerTmp -ErrorAction SilentlyContinue

@(
    "# SHA-256 SPKI pin của cdn-sim (RFC 7469 format)."
    "# Sinh tự động bởi gen-selfsigned-cert.ps1 — copy giá trị bên dưới"
    "# sang player/src/config/certPins.ts cho strict pinning."
    "sha256-$PinRaw"
) | Out-File -FilePath $PinFile -Encoding ascii

Write-Host ""
Write-Host "=== DONE ===" -ForegroundColor Green
Write-Host "  Private key : $KeyFile"
Write-Host "  Certificate : $CertFile"
Write-Host "  Pin file    : $PinFile"
Write-Host ""
Write-Host "Pin SHA-256 (copy vào player/src/config/certPins.ts):" -ForegroundColor Yellow
Write-Host "  sha256-$PinRaw" -ForegroundColor Yellow
Write-Host ""
Write-Host "Tiếp theo:"
Write-Host "  1. docker compose -f infra/docker-compose.yml up -d --build cdn-sim"
Write-Host "  2. curl -kI https://localhost:8443/healthz   (phải có HSTS + X-CDN-Cert-Pin)"
Write-Host "  3. Cập nhật pin vào player/src/config/certPins.ts rồi npm run dev"
