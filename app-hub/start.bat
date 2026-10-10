@echo off
cd /d %~dp0
if not exist node_modules\electron\dist\electron.exe call npm install --no-audit --no-fund
REM start, so this console closes and App Hub runs on its own (no CMD window left open)
start "" node_modules\electron\dist\electron.exe .
