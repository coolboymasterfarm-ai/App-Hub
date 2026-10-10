@echo off
REM Builds dist\App-Hub-Setup-<version>.exe (installer) and dist\App-Hub-Portable-<version>.exe
cd /d %~dp0
if not exist node_modules\.bin\electron-builder.cmd call npm install --no-audit --no-fund
call npm test || (echo Tests failed & pause & exit /b 1)
call node_modules\.bin\electron-builder --win nsis portable --publish never
echo.
echo  Done. The .exe files are in the dist folder.
pause
