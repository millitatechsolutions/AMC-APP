@echo off
cd /d "%~dp0"
echo Stop the running AMC app with Ctrl+C first.
echo This replaces all local users with the three requested demo accounts.
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 or newer first.
  pause
  exit /b 1
)
if not exist node_modules\exceljs\package.json (
  call npm ci --ignore-scripts
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node --env-file-if-exists=.env scripts\reset-demo-users.mjs --confirm-reset
set "AMC_RESET_EXIT=%ERRORLEVEL%"
if not "%AMC_RESET_EXIT%"=="0" (
  echo Reset failed. Keep the error above for troubleshooting.
)
pause
exit /b %AMC_RESET_EXIT%
