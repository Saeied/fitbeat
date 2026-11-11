@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Pack for Server - manual-deploy

echo.
echo Building production and packing manual-deploy folder...
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not installed
  pause
  exit /b 1
)

node scripts\pack-for-server.mjs
set EXITCODE=!ERRORLEVEL!

echo.
if !EXITCODE! equ 0 (
  echo [OK] Ready: manual-deploy\
  echo      Copy manual-deploy\dc\ to /var/www/html/dc/ on server
) else (
  echo [ERROR] Pack failed
)
echo.
pause
exit /b !EXITCODE!
