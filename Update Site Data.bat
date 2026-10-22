@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0generate_site_data.ps1"
if errorlevel 1 (
  pause
  exit /b 1
)
echo.
echo Site text and product data are ready. Open index.html in your browser.
pause
