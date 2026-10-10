@echo off
setlocal EnableDelayedExpansion
title ClipForge
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo  First run - installing ClipForge...
  call Install.bat
  if not exist ".venv\Scripts\python.exe" exit /b 1
)
set "PATH=%CD%\bin;%LOCALAPPDATA%\Programs\Ollama;%APPDATA%\npm;%PATH%"

set "PORT=8765"
set "OPEN=1"
:parse
if "%~1"=="" goto parsed
if /i "%~1"=="--no-browser" (
  set "OPEN="
  shift
  goto parse
)
if /i "%~1"=="--open-browser" (
  set "OPEN=1"
  shift
  goto parse
)
if /i "%~1"=="--port" (
  set "PORT=%~2"
  shift
  shift
  goto parse
)
shift
goto parse
:parsed

set "URL=http://127.0.0.1:%PORT%"

REM an older copy still running would keep serving old code: stop it.
REM Unfinished videos pick up where they stopped when the new one starts.
if not "%PORT%"=="0" (
  for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do (
    echo  Restarting ClipForge...
    taskkill /f /pid %%P >nul 2>&1
    timeout /t 2 /nobreak >nul
  )
)

REM the AI: OmniRoute (router) and Ollama (local models), if installed
where ollama >nul 2>&1
if not errorlevel 1 (
  tasklist /fi "imagename eq ollama.exe" | find /i "ollama.exe" >nul || start "Ollama" /min ollama serve
)
where omniroute >nul 2>&1
if not errorlevel 1 (
  netstat -ano | findstr /r /c:":20128 .*LISTENING" >nul || start "OmniRoute" /min cmd /c omniroute --no-open
)

REM The server does not open a browser unless --open-browser is passed.
REM App Hub embeds the page and must not launch Firefox.
if defined OPEN (
  start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 4; Start-Process '%URL%'"
)

".venv\Scripts\python.exe" -m clipforge --port %PORT%
echo.
echo  ClipForge stopped. Press a key to close.
pause >nul
exit /b 0
