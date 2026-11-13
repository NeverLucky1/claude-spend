@echo off
title claude-spend
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
if not exist "node_modules\express\package.json" goto install
if not exist "node_modules\@modelcontextprotocol\sdk\package.json" goto install
goto run
:install
echo Installing dependencies ^(first run only^)...
call npm ci --omit=dev
:run
node src/index.js --auto-exit
if errorlevel 1 (
  echo.
  echo claude-spend stopped with an error ^(see above^).
  pause
)
