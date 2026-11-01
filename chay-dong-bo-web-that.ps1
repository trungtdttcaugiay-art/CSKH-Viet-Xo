# Chạy phần mềm CSKH với đồng bộ từ website VietXO THẬT.
# Mật khẩu chỉ nhập tại đây (ẩn khi gõ), chỉ nằm trong bộ nhớ của tiến trình, không ghi ra file.
# Dùng: bấm chuột phải file này > "Run with PowerShell", hoặc: powershell -ExecutionPolicy Bypass -File .\chay-dong-bo-web-that.ps1
Set-Location $PSScriptRoot

$url = (Read-Host "Địa chỉ website VietXO (VD: https://ten-mien.vn)").Trim().TrimEnd('/')
$email = (Read-Host "Email tài khoản admin hoặc lễ tân của website").Trim()
$secure = Read-Host "Mật khẩu (không hiện khi gõ)" -AsSecureString

$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $env:VIETXO_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
$env:VIETXO_URL = $url
$env:VIETXO_EMAIL = $email

Write-Host "`nĐang chạy tại http://localhost:3100 — đăng nhập admin của CSKH, vào 'Tài khoản & đồng bộ' > 'Đồng bộ ngay'." -ForegroundColor Cyan
Write-Host "Dữ liệu thật lưu ở data\db.json (không phải bản demo). Nhấn Ctrl+C để dừng.`n"
node server.js
