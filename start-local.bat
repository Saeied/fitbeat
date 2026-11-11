@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title JustDance — Local Dev (test env)

echo.
echo ============================================
echo  JustDance — Start Local Dev Server
echo ============================================
echo.
echo Project: %CD%
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  echo Install from https://nodejs.org then run this file again.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm is not installed or not in PATH.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [1/3] First run — installing dependencies...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
  echo.
) else (
  echo [1/3] Dependencies OK ^(node_modules found^)
)

echo [2/3] Stopping any dev server on port 3000 / 3001...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
  taskkill /PID %%P /F >nul 2>&1
)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3001 " ^| findstr "LISTENING"') do (
  taskkill /PID %%P /F >nul 2>&1
)
if exist ".next\dev\lock" del /F /Q ".next\dev\lock" >nul 2>&1
echo       Done.
echo.

echo [3/3] Starting dev server ^(test env — Nakama 85.198.11.216^)...
echo.
echo   Open in browser ^(NOT just localhost:3000^):
echo   http://localhost:3000/dc/
echo.
echo   Song list appears after pairing ^(scan QR with phone app^).
echo   If list is empty: npm run verify:catalog
echo.
echo   Stop server: Ctrl+C
echo   Tip: page auto-reloads after code changes.
echo.
echo ============================================
echo.

start "" cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:3000/dc/"

call npm run dev:test
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
  echo Dev server exited with error code %EXITCODE%.
)
pause
exit /b %EXITCODE%
