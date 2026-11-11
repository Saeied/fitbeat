@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
set "PROJECT_ROOT=%CD%"
set "OUT_DIR=%PROJECT_ROOT%\out"
set "DEPLOY_DIR=%PROJECT_ROOT%\justdance-apache"
set "PRESERVE_DIR=%TEMP%\justdance-apache-preserve-%RANDOM%"
set "BUILD_CMD=node scripts\build-tv.mjs production --no-deploy"
set "EXITCODE=0"

title JustDance Apache Production Build

echo.
echo ============================================
echo  JustDance Apache Production Build
echo ============================================
echo.
echo Project:
echo %PROJECT_ROOT%
echo.
echo Deployment:
echo %DEPLOY_DIR%
echo.

rem --- [1/5] Check Node.js and npm ---
echo [1/5] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
  call :fail "Node.js is not installed or not in PATH."
)
where npm >nul 2>&1
if errorlevel 1 (
  call :fail "npm is not installed or not in PATH."
)
echo [OK]
echo.

rem --- [2/5] Production build ---
echo [2/5] Running production build...
echo %BUILD_CMD%
echo.
call %BUILD_CMD%
if errorlevel 1 (
  call :fail "Production build command failed."
)
echo.
echo [OK] Production build completed.
echo.

rem --- [3/5] Verify out/ ---
echo [3/5] Checking output...
if not exist "%OUT_DIR%\" (
  call :fail "Build output folder not found: out\"
)
if not exist "%OUT_DIR%\index.html" (
  call :fail "Build output missing: out\index.html"
)
echo [OK] out\index.html found.
echo.

rem --- [4/5] Update deployment package ---
echo [4/5] Updating Apache deployment package...

rem Preserve deployment configuration before replacing build output
if exist "%DEPLOY_DIR%\" (
  mkdir "%PRESERVE_DIR%" 2>nul
  if exist "%DEPLOY_DIR%\.htaccess" copy /Y "%DEPLOY_DIR%\.htaccess" "%PRESERVE_DIR%\" >nul
  if exist "%DEPLOY_DIR%\README.md" copy /Y "%DEPLOY_DIR%\README.md" "%PRESERVE_DIR%\" >nul
  if exist "%DEPLOY_DIR%\DEPLOYMENT_CHECKLIST.md" copy /Y "%DEPLOY_DIR%\DEPLOYMENT_CHECKLIST.md" "%PRESERVE_DIR%\" >nul
  if exist "%DEPLOY_DIR%\apache\" xcopy /E /I /Y /Q "%DEPLOY_DIR%\apache" "%PRESERVE_DIR%\apache\" >nul
)

rem Remove previous build artifacts (keep preserve backup separate)
if exist "%DEPLOY_DIR%\" (
  rmdir /S /Q "%DEPLOY_DIR%"
)
if errorlevel 1 (
  call :fail "Could not clean previous deployment folder."
)
mkdir "%DEPLOY_DIR%"
if errorlevel 1 (
  call :fail "Could not create deployment folder."
)

rem Copy production output (frontend only — no videos)
xcopy /E /I /Y /Q "%OUT_DIR%\*" "%DEPLOY_DIR%\" >nul
if errorlevel 4 (
  call :fail "Copying files from out\ to justdance-apache\ failed."
)
if errorlevel 1 if not errorlevel 3 (
  rem xcopy returns 1 when files copied successfully
)

rem Restore preserved Apache deployment configuration
if exist "%PRESERVE_DIR%\" (
  if exist "%PRESERVE_DIR%\.htaccess" copy /Y "%PRESERVE_DIR%\.htaccess" "%DEPLOY_DIR%\" >nul
  if exist "%PRESERVE_DIR%\README.md" copy /Y "%PRESERVE_DIR%\README.md" "%DEPLOY_DIR%\" >nul
  if exist "%PRESERVE_DIR%\DEPLOYMENT_CHECKLIST.md" copy /Y "%PRESERVE_DIR%\DEPLOYMENT_CHECKLIST.md" "%DEPLOY_DIR%\" >nul
  if exist "%PRESERVE_DIR%\apache\" xcopy /E /I /Y /Q "%PRESERVE_DIR%\apache" "%DEPLOY_DIR%\apache\" >nul
  rmdir /S /Q "%PRESERVE_DIR%"
)

rem Seed apache/ config on first run if missing
if not exist "%DEPLOY_DIR%\apache\" mkdir "%DEPLOY_DIR%\apache"
if not exist "%DEPLOY_DIR%\apache\apache-dc.conf" (
  if exist "%PROJECT_ROOT%\deploy\apache-dc.conf" copy /Y "%PROJECT_ROOT%\deploy\apache-dc.conf" "%DEPLOY_DIR%\apache\" >nul
)
if not exist "%DEPLOY_DIR%\apache\setup-server.sh" (
  if exist "%PROJECT_ROOT%\deploy\setup-server.sh" copy /Y "%PROJECT_ROOT%\deploy\setup-server.sh" "%DEPLOY_DIR%\apache\" >nul
)

echo [OK]
echo.

rem --- [5/5] Verify deployment package ---
echo [5/5] Verifying deployment package...
if not exist "%DEPLOY_DIR%\index.html" (
  call :fail "Deployment package missing: justdance-apache\index.html"
)

rem Ensure no video content was copied into the frontend package
if exist "%DEPLOY_DIR%\dance_Content\" (
  call :fail "Unexpected video folder found in deployment package: dance_Content\"
)
dir /S /B "%DEPLOY_DIR%\*.mp4" >nul 2>&1
if not errorlevel 1 (
  call :fail "Unexpected video files (.mp4) found in deployment package."
)
dir /S /B "%DEPLOY_DIR%\*.webm" >nul 2>&1
if not errorlevel 1 (
  call :fail "Unexpected video files (.webm) found in deployment package."
)

echo [OK] index.html found.

rem Update BUILD_INFO.txt
(
  echo JustDance Apache Production Build
  echo.
  echo Build Date: %DATE%
  echo Build Time: %TIME%
  echo Project: %PROJECT_ROOT%
  echo Build Command: %BUILD_CMD%
  echo Output: %OUT_DIR%
  echo Deployment Folder: %DEPLOY_DIR%
  echo.
  echo Status: SUCCESS
) > "%DEPLOY_DIR%\BUILD_INFO.txt"

rem Count files and size
set "FILE_COUNT=0"
set "TOTAL_BYTES=0"
for /f "usebackq delims=" %%A in (`dir /s /b "%DEPLOY_DIR%" 2^>nul ^| find /c /v ""`) do set "FILE_COUNT=%%A"
for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "(Get-ChildItem -LiteralPath '%DEPLOY_DIR%' -Recurse -File | Measure-Object -Property Length -Sum).Sum"`) do set "TOTAL_BYTES=%%A"
set "SIZE_MB=?"
if defined TOTAL_BYTES (
  for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "[math]::Round(%TOTAL_BYTES%/1MB, 2)"`) do set "SIZE_MB=%%A"
)

echo.
echo ============================================
echo  BUILD SUCCESSFUL
echo ============================================
echo.
echo Apache package:
echo %DEPLOY_DIR%
echo.
echo Files: !FILE_COUNT!
echo Size:  !SIZE_MB! MB
echo.
if exist "%DEPLOY_DIR%\.htaccess" (
  echo [OK] .htaccess preserved
) else (
  echo [WARN] .htaccess not found
)
if exist "%DEPLOY_DIR%\README.md" (
  echo [OK] README.md preserved
) else (
  echo [WARN] README.md not found
)
if exist "%DEPLOY_DIR%\DEPLOYMENT_CHECKLIST.md" (
  echo [OK] DEPLOYMENT_CHECKLIST.md preserved
) else (
  echo [WARN] DEPLOYMENT_CHECKLIST.md not found
)
if exist "%DEPLOY_DIR%\apache\" (
  echo [OK] apache\ configuration preserved
) else (
  echo [WARN] apache\ folder not found
)
echo [OK] No video files in deployment package
echo.
echo Ready to upload to Apache server.
echo Copy justdance-apache\* to /var/www/html/dc/ on your server.
echo.
pause
exit /b 0

:fail
set "EXITCODE=1"
echo.
echo ============================================
echo  BUILD FAILED
echo ============================================
echo.
echo Reason:
echo %~1
echo.
echo The deployment package was NOT marked as successful.
echo.
if exist "%PRESERVE_DIR%\" rmdir /S /Q "%PRESERVE_DIR%" 2>nul
pause
exit /b 1
