@echo off
cd /d %~dp0
if not exist node_modules\.bin\electron.cmd call npm install --no-audit --no-fund
node_modules\.bin\electron .
