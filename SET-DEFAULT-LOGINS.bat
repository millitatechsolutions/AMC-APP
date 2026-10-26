@echo off
cd /d "%~dp0"
echo Stop the running AMC app with Ctrl+C first.
echo This sets admin@gmail.com / pak1234 for each portal and preserves existing default account IDs.
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
node --env-file-if-exists=.env scripts\reset-demo-users.mjs --confirm-reset --defaults
set "AMC_RESET_EXIT=%ERRORLEVEL%"
if not "%AMC_RESET_EXIT%"=="0" (
  echo Reset failed. Keep the error above for troubleshooting.
)
pause
exit /b %AMC_RESET_EXIT%
