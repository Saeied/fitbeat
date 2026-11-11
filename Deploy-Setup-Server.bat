@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Setup Apache on PROD server

set HOST=85.198.11.216
set USER=root

echo.
echo ============================================================
echo   One-time setup: /var/www/html/dc on %USER%@%HOST%
echo   After this, http://%HOST%/dc/ will work
echo ============================================================
echo.

where scp >nul 2>&1
if errorlevel 1 (
  echo [ERROR] scp not found. Install OpenSSH Client.
  pause
  exit /b 1
)

scp deploy\apache-dc.conf %USER%@%HOST%:/tmp/apache-dc.conf
if errorlevel 1 goto :failed

scp deploy\setup-server.sh %USER%@%HOST%:/tmp/setup-server.sh
if errorlevel 1 goto :failed

ssh %USER%@%HOST% "bash /tmp/setup-server.sh"
if errorlevel 1 goto :failed

echo.
echo [OK] Apache configured. Now run Deploy-TV.bat
echo Open: http://%HOST%/dc/
echo.
pause
exit /b 0

:failed
echo.
echo [ERROR] Setup failed. Check SSH password/key for %USER%@%HOST%
echo.
pause
exit /b 1
