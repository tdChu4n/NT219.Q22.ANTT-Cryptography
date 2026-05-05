# T3.1: Sinh Self-Signed Certificate cho CDN-sim (TLS 1.3)
# Chạy: pwsh -File cdn-sim/gen-selfsigned-cert.ps1
# Yêu cầu: OpenSSL phải được cài và có trong PATH

$CertsDir = "$PSScriptRoot\certs"
$KeyFile   = "$CertsDir\privkey.pem"
$CertFile  = "$CertsDir\fullchain.pem"
$FingerprintFile = "$CertsDir\fingerprint.sha256.txt"

if (-not (Test-Path $CertsDir)) {
    New-Item -ItemType Directory -Path $CertsDir | Out-Null
}

Write-Host "[1/3] Sinh RSA-2048 Private Key..." -ForegroundColor Cyan
openssl genrsa -out $KeyFile 2048

Write-Host "[2/3] Sinh Self-Signed Certificate (365 ngày, SAN: localhost + cdn.drm-local.dev)..." -ForegroundColor Cyan

# Tạo config file tạm để thêm SAN (Subject Alternative Names)
$SanConfig = @"
[req]
default_bits       = 2048
prompt             = no
default_md         = sha256
distinguished_name = dn
x509_extensions    = v3_req

[dn]
C  = VN
ST = Ho Chi Minh
L  = Ho Chi Minh
O  = NT219 DRM Lab
OU = Security
CN = cdn.drm-local.dev

[v3_req]
subjectAltName = @alt_names
keyUsage       = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
DNS.1 = localhost
DNS.2 = cdn.drm-local.dev
DNS.3 = license-server
IP.1  = 127.0.0.1
"@

$SanConfig | Out-File -FilePath "$CertsDir\san.cnf" -Encoding ascii

openssl req -new -x509 -key $KeyFile -out $CertFile -days 365 -config "$CertsDir\san.cnf"

# Xóa config tạm
Remove-Item "$CertsDir\san.cnf"

Write-Host "[3/3] Tính fingerprint SHA-256 (dùng để Cert Pinning trong Player)..." -ForegroundColor Cyan
$FingerprintRaw = openssl x509 -in $CertFile -pubkey -noout | openssl pkey -pubin -outform DER | openssl dgst -sha256 -binary | openssl base64
"# SHA-256 Public Key Fingerprint (dùng trong Player cert pinning)" | Out-File $FingerprintFile
"# Cập nhật giá trị này vào player/src/config/certPins.ts" | Out-File $FingerprintFile -Append
$FingerprintRaw | Out-File $FingerprintFile -Append

Write-Host ""
Write-Host "=== DONE ===" -ForegroundColor Green
Write-Host "Private Key : $KeyFile"
Write-Host "Certificate : $CertFile"
Write-Host "Fingerprint : $FingerprintFile"
Write-Host ""
Write-Host "Fingerprint SHA-256 (copy vào certPins.ts):"
Write-Host $FingerprintRaw -ForegroundColor Yellow
Write-Host ""
Write-Host "Tiếp theo:"
Write-Host "  1. Chạy: docker compose up --build"
Write-Host "  2. Mở: https://localhost:443/healthz (chấp nhận warning cert tự ký)"
Write-Host "  3. Cập nhật fingerprint vào player/src/config/certPins.ts"
