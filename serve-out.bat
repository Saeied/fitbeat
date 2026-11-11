@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title JustDance — Preview Production Build

echo.
echo ============================================
echo  JustDance — Preview Static Build
echo ============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  pause
  exit /b 1
)

if not exist "out\index.html" (
  echo [1/2] No build found — running test production build...
  echo.
  call npm run build:tv:test -- --no-deploy
  if errorlevel 1 (
    echo.
    echo [ERROR] Build failed.
    pause
    exit /b 1
  )
  echo.
) else (
  echo [1/2] Using existing out\ folder
  echo       Tip: run build-apache.bat or npm run build:tv:test -- --no-deploy to rebuild
  echo.
)

echo [2/2] Serving preview at http://localhost:3000/dc/
echo.
echo IMPORTANT: Open http://localhost:3000/dc/  ^(NOT just localhost:3000^)
echo Do NOT use: npx serve out
echo.

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
  taskkill /PID %%P /F >nul 2>&1
)

start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000/dc/"

node scripts\serve-out.mjs 3000
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
  echo Preview server exited with error code %EXITCODE%.
)
pause
exit /b %EXITCODE%
