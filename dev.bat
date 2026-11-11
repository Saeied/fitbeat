@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title JustDance Dev Server

echo.
echo Stopping any existing Next.js dev server for this project...
echo.

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
  taskkill /PID %%P /F >nul 2>&1
)

if exist ".next\dev\lock" del /F /Q ".next\dev\lock" >nul 2>&1

echo Starting dev server...
echo Open: http://localhost:3000/dc/
echo.
echo Tip: after code changes, the page auto-reloads — you usually do NOT need to restart.
echo Press Ctrl+C to stop the server.
echo.

npm run dev
