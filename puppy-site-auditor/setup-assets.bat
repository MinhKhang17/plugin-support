@echo off
setlocal
where powershell >nul 2>nul || (echo PowerShell is required.& exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-assets.ps1"
if errorlevel 1 (
  echo.
  echo Setup failed. Make sure Git is installed and available in PATH.
  pause
  exit /b 1
)
pause
