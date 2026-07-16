@echo off
setlocal
cd /d "%~dp0app"
if not exist node_modules (
  echo Dependencies missing. Run Install.bat first.
  pause
  exit /b 1
)
set PORT=3000
start "" "http://localhost:%PORT%"
call npm run start -- -p %PORT%
endlocal
