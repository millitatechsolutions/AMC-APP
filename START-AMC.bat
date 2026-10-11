@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS or newer from nodejs.org first, then run this file again.
  pause
  exit /b 1
)
node scripts\start.mjs
if errorlevel 1 (
  echo The app could not start. Keep the error above and share it with your programming assistant.
  pause
)
