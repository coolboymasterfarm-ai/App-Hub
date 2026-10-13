@echo off
title App Hub - update
cd /d "%~dp0"
echo.
echo  Updating App Hub: new code, a fresh installer, then install.
echo  Your apps, videos, models and settings are kept.
echo.

where git >nul 2>&1 || (echo  [!] Git is missing. Install it from https://git-scm.com, then run this again. & pause & exit /b 1)
where npm >nul 2>&1 || (echo  [!] Node.js is missing. Install the LTS version from https://nodejs.org, then run this again. & pause & exit /b 1)

echo  [1/4] Getting the latest code...
REM Run on its own (not inside a clone)? Keep a clone in its own folder next to this file and use that.
REM Its own name, so it never collides with (or touches) a folder you already have.
if not exist ".git" (
  if not exist "App-Hub-update\.git" (
    git clone https://github.com/coolboymasterfarm-ai/App-Hub.git App-Hub-update || (echo  [!] Could not download the code - see the message above. & pause & exit /b 1)
  )
  cd App-Hub-update
)
git pull || (echo  [!] Could not get the latest code - see the message above. & pause & exit /b 1)

echo  [2/4] Building the installer ^(a few minutes the first time^)...
cd app-hub
call npm install --no-audit --no-fund --loglevel=error || (echo  [!] npm install failed - see above. & pause & exit /b 1)
call npm run build:apps || (echo  [!] Building Grammar / Agent Dashboard failed - see above. & pause & exit /b 1)
if exist dist rmdir /s /q dist
call node_modules\.bin\electron-builder --win nsis --publish never || (echo  [!] The build failed - see above. & pause & exit /b 1)

echo  [3/4] Closing App Hub if it is open...
taskkill /f /im "App Hub.exe" >nul 2>&1
timeout /t 2 /nobreak >nul

echo  [4/4] Installing...
for %%F in (dist\App-Hub-Setup-*.exe) do start "" /wait "%%F" /S
echo.
echo  Done. Open App Hub from the Start menu or your desktop.
echo  The first start after an update also updates ClipForge's downloader.
pause
