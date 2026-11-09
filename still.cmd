@echo off
rem Double-click to start still. Keeps this window open while the engine runs.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies, this happens once...
  call npm install || goto :error
)
call npm start
goto :eof
:error
echo.
echo still could not start. See the messages above.
pause
