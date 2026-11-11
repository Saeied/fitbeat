@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Deploy TV - PRODUCTION

echo.
echo ============================================================
echo   Deploy TV - PRODUCTION - 85.198.11.216
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed. https://nodejs.org
  pause
  exit /b 1
)

where scp >nul 2>&1
if errorlevel 1 (
  echo [ERROR] scp not found. Enable OpenSSH Client in Windows Optional Features.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed
    pause
    exit /b 1
  )
)

if not exist "deploy\prod-version.txt" (
  (echo 1)>deploy\prod-version.txt
)

echo.
node scripts\deploy-tv-prod.mjs
set EXITCODE=!ERRORLEVEL!

echo.
if !EXITCODE! equ 0 (
  echo ============================================================
  echo   [OK] Deploy PRODUCTION completed
  echo ============================================================
) else (
  echo ============================================================
  echo   [ERROR] Deploy failed - exit code !EXITCODE!
  echo ============================================================
)
echo.
pause
exit /b !EXITCODE!
