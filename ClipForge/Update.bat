@echo off
setlocal
title ClipForge - update
cd /d "%~dp0"
REM Installs a ClipForge-update.zip that Claude left for you. It looks next to
REM this folder, in "vc ai cliper", and in Downloads. Your clips, settings and
REM installed tools are kept - only the app's own files are replaced.
set "ZIP="
for %%Z in ("%~dp0ClipForge-update.zip" "%~dp0..\ClipForge-update.zip" "%~dp0..\vc ai cliper\ClipForge-update.zip" "%USERPROFILE%\Downloads\ClipForge-update.zip" "%USERPROFILE%\Downloads\vc ai cliper\ClipForge-update.zip") do (
  if not defined ZIP if exist "%%~Z" set "ZIP=%%~Z"
)
if not defined ZIP (
  echo.
  echo  No ClipForge-update.zip found - you are up to date.
  echo.
  pause
  exit /b 0
)
echo  Updating from: %ZIP%
powershell -NoProfile -Command "Expand-Archive -Force -LiteralPath '%ZIP%' -DestinationPath '%~dp0.'"
if errorlevel 1 (
  echo  [!] Could not unpack the update. Close ClipForge and try again.
  pause
  exit /b 1
)
move /y "%ZIP%" "%ZIP%.installed" >nul 2>&1
echo.
echo  Done. Close ClipForge if it is open, then run Start.bat.
echo.
pause
