# Script tự động biên dịch Canon EDSDK Persistent Daemon 64-bit
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceFiles = Get-ChildItem -Path $scriptDir -Filter *.cs | ForEach-Object { $_.FullName }
$outputExe = Join-Path (Split-Path -Parent $scriptDir) "electron\fotolism_canon_daemon.exe"
$cscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

if (-not (Test-Path $cscPath)) {
    Write-Error "Không tìm thấy trình biên dịch C# 64-bit tại: $cscPath"
    exit 1
}

# Tắt daemon cũ nếu đang chạy để mở khóa file exe
try {
    Invoke-WebRequest -Uri "http://127.0.0.1:8899/quit" -TimeoutSec 1 -UseBasicParsing -ErrorAction SilentlyContinue | Out-Null
    Start-Sleep -Milliseconds 400
} catch {}

Write-Host "=== ĐANG BIÊN DỊCH FOTOLISM CANON DAEMON 64-BIT ===" -ForegroundColor Cyan
Write-Host "Output: $outputExe"

& $cscPath /target:exe /platform:x64 /optimize+ "/out:$outputExe" $sourceFiles

if ($LASTEXITCODE -eq 0 -and (Test-Path $outputExe)) {
    $size = (Get-Item $outputExe).Length
    Write-Host "✅ Biên dịch thành công! Kích thước: $size bytes" -ForegroundColor Green
} else {
    Write-Error "❌ Lỗi trong quá trình biên dịch!"
    exit 1
}
