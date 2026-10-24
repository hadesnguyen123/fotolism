# ==============================================================================
# FOTOLISM 3.0 — PACKAGING & DOWNLOAD SCRIPT
# Tự động dọn dẹp, biên dịch bản phát hành và xuất bản ra thư mục Downloads
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [1/5] BIEN DICH BAN BUILD PRODUCTION CHO FOTOLISM 3.0   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$rootDir = "f:\JoyBooth"
$desktopDir = "$rootDir\desktop"
$downloadDir = "$rootDir\download"
$outAppDir = "$downloadDir\Fotolism-Kiosk-v3.0"
$userDownloadsDir = "$env:USERPROFILE\Downloads"
$userAppDir = "$userDownloadsDir\Fotolism-Kiosk-v3.0"
$zipPath = "$downloadDir\Fotolism-Kiosk-v3.0.zip"
$userZipPath = "$userDownloadsDir\Fotolism-Kiosk-v3.0.zip"

# 1. Chay build Vite + TypeScript
Set-Location $desktopDir
Write-Host "-> Dang chay build React + TypeScript + Electron main process..." -ForegroundColor Yellow
npm run build

# 2. Don dep thu muc download cu
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [2/5] KHOI TAO THU MUC DONG GOI                           " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

if (Test-Path $outAppDir) {
    Remove-Item -Path $outAppDir -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $outAppDir -Force | Out-Null
New-Item -ItemType Directory -Path "$outAppDir\resources\app" -Force | Out-Null

# 3. Sao chep Electron Runtime
Write-Host "-> Sao chep Electron Windows Runtime (x64)..." -ForegroundColor Yellow
$electronDist = "$desktopDir\node_modules\electron\dist"
Copy-Item -Path "$electronDist\*" -Destination $outAppDir -Recurse -Force

# Doi ten electron.exe thanh Fotolism.exe
Rename-Item -Path "$outAppDir\electron.exe" -NewName "Fotolism.exe" -Force

# Xoa default_app.asar de Electron uu tien chay resources\app
if (Test-Path "$outAppDir\resources\default_app.asar") {
    Remove-Item -Path "$outAppDir\resources\default_app.asar" -Force
}

# Don dep cac file locales ngon ngu thua khong dung den (chi giu en-US va vi)
Write-Host "-> Toi uu hoa thu muc locales (xoa 50+ goi ngon ngu thua)..." -ForegroundColor Yellow
Get-ChildItem -Path "$outAppDir\locales" -Filter "*.pak" | Where-Object {
    $_.Name -ne "en-US.pak" -and $_.Name -ne "vi.pak"
} | Remove-Item -Force -ErrorAction SilentlyContinue

# 4. Sao chep ung dung da bien dich vao resources\app
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [3/5] DONG GOI TAI NGUYEN UNG DUNG VA DAEMON CANON       " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Write-Host "-> Sao chep React Frontend (dist)..." -ForegroundColor Yellow
Copy-Item -Path "$desktopDir\dist" -Destination "$outAppDir\resources\app\dist" -Recurse -Force

Write-Host "-> Sao chep Electron Process (dist-electron)..." -ForegroundColor Yellow
Copy-Item -Path "$desktopDir\dist-electron" -Destination "$outAppDir\resources\app\dist-electron" -Recurse -Force

Write-Host "-> Sao chep Canon EDSDK C# Daemon..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path "$outAppDir\resources\app\electron" -Force | Out-Null
if (Test-Path "$desktopDir\electron\fotolism_canon_daemon.exe") {
    Copy-Item -Path "$desktopDir\electron\fotolism_canon_daemon.exe" -Destination "$outAppDir\resources\app\electron\fotolism_canon_daemon.exe" -Force
}
if (Test-Path "$desktopDir\electron\fotolism_canon_capture.exe") {
    Copy-Item -Path "$desktopDir\electron\fotolism_canon_capture.exe" -Destination "$outAppDir\resources\app\electron\fotolism_canon_capture.exe" -Force
}

# Tao package.json thuc thi
$appPackageJson = @{
    name = "fotolism-kiosk"
    version = "3.0.0"
    main = "dist-electron/main.cjs"
} | ConvertTo-Json
Set-Content -Path "$outAppDir\resources\app\package.json" -Value $appPackageJson -Encoding UTF8

# Tao file huong dan va file chay .bat
$batContent = @"
@echo off
title Fotolism 3.0 Photobooth Kiosk
cd /d "%~dp0"
echo ===================================================
echo     KHOI DONG FOTOLISM 3.0 PHOTOBOOTH KIOSK
echo ===================================================
start "" "Fotolism.exe"
"@
Set-Content -Path "$outAppDir\START_FOTOLISM.bat" -Value $batContent -Encoding UTF8

$readmeContent = @"
# FOTOLISM 3.0 — BAN PHAT HANH KIOSK CLIENT (STANDALONE)

1. Huong dan su dung:
   - Nhan dup chuot vao file `Fotolism.exe` hoac `START_FOTOLISM.bat` de khoi dong.
   - Ung dung da duoc tich hop san toan bo giao dien Photobooth va C# Canon Persistent Daemon (port 8899).
   - Ma PIN quan tri mac dinh: 888888 (co the doi trong menu Cai Dat).

2. Yeu cau phan cung:
   - Windows 10/11 64-bit.
   - May anh Canon EOS R100 (cam qua cap USB 3.0).
   - May in nhiet DNP DS-RX1HS / HiTi P525L.
"@
Set-Content -Path "$outAppDir\HUONG_DAN_SU_DUNG.txt" -Value $readmeContent -Encoding UTF8

# 5. Tao file ZIP va dong bo sang thu muc Downloads cua Windows bang tar.exe
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [4/5] NEN FILE ZIP VA XUAT BAN RA THU MUC DOWNLOADS       " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Write-Host "-> Dang nen goi Fotolism-Kiosk-v3.0.zip bang tar.exe..." -ForegroundColor Yellow
Set-Location $outAppDir
tar.exe -a -cf "$zipPath" *

Write-Host "-> Sao chep sang thu muc Downloads nguoi dung ($userDownloadsDir)..." -ForegroundColor Yellow
if (Test-Path $userAppDir) { Remove-Item $userAppDir -Recurse -Force -ErrorAction SilentlyContinue }
Copy-Item -Path $outAppDir -Destination $userAppDir -Recurse -Force
Copy-Item -Path $zipPath -Destination $userZipPath -Force

Set-Location $rootDir

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " HOAN TAT! BAN BUILD FOTOLISM 3.0 DA SAN SANG:            " -ForegroundColor Green
Write-Host " 1. Thu muc go: $outAppDir" -ForegroundColor Green
Write-Host " 2. File ZIP:   $zipPath" -ForegroundColor Green
Write-Host " 3. Downloads:  $userAppDir" -ForegroundColor Green
Write-Host " 4. Zip Down:   $userZipPath" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
