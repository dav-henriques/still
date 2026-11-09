@echo off
rem Starts still for the whole home network: other computers open the "network" address shown below.
rem There is no login — anyone on this Wi-Fi/network can use it. Use still.cmd for this computer only.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies, this happens once...
  call npm install || goto :error
)
set STILL_LAN=1
call npm start
goto :eof
:error
echo.
echo still could not start. See the messages above.
pause
