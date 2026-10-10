@echo off
REM Builds App Hub and ClipForge, each as an installer (-Setup-) and a one-file portable .exe, into dist\
cd /d %~dp0
if not exist node_modules\.bin\electron-builder.cmd call npm install --no-audit --no-fund
call npm test || (echo Tests failed & pause & exit /b 1)
call node_modules\.bin\electron-builder --win nsis portable --publish never
call node_modules\.bin\electron-builder --config clipforge.builder.js --win nsis portable --publish never
echo.
echo  Done. The .exe files are in the dist folder.
pause
