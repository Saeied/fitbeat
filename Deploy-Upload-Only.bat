@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Upload only - PRODUCTION

echo.
echo Upload existing out/ folder to server (no rebuild)
echo.

if not exist "out\index.html" (
  echo [ERROR] out\index.html not found. Run Deploy-TV.bat first or npm run build
  pause
  exit /b 1
)

node scripts\upload-tv-prod.mjs
set EXITCODE=!ERRORLEVEL!

echo.
if !EXITCODE! equ 0 (
  echo [OK] Upload done - http://85.198.11.216/dc/
) else (
  echo [ERROR] Upload failed
)
echo.
pause
exit /b !EXITCODE!
