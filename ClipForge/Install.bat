@echo off
setlocal EnableDelayedExpansion
title ClipForge - install
cd /d "%~dp0"

echo.
echo  ==========================================
echo    ClipForge  -  one-time install
echo  ==========================================
echo    Everything goes inside this folder except Node.js, OmniRoute
echo    and Ollama, which are normal system-wide apps.
echo.

if not exist bin mkdir bin
set "VPY=%CD%\.venv\Scripts\python.exe"

REM ---------------------------------------------------------------- uv
REM uv brings its own Python 3.12 and installs packages without pip.
set "UV="
if exist "bin\uv.exe" set "UV=%CD%\bin\uv.exe"
if not defined UV if exist "..\bin\uv.exe" copy /y "..\bin\uv.exe" "bin\" >nul && set "UV=%CD%\bin\uv.exe"
if not defined UV if exist "%USERPROFILE%\.local\bin\uv.exe" set "UV=%USERPROFILE%\.local\bin\uv.exe"
if not defined UV for /f "delims=" %%U in ('where uv 2^>nul') do if not defined UV set "UV=%%U"
if not defined UV call :fetch_uv
if not defined UV (
  echo  [!] Could not get uv. Check your internet connection and run Install.bat again.
  pause & exit /b 1
)
echo  [1/7] uv ready

REM ---------------------------------------------------------------- python
if exist "%VPY%" "%VPY%" -c "pass" >nul 2>&1 && goto :deps
if exist ".venv" rmdir /s /q ".venv"
echo  [2/7] setting up Python 3.12...
"%UV%" venv --python 3.12 .venv
if errorlevel 1 (
  echo  [!] uv could not set up Python 3.12 - check your internet connection.
  pause & exit /b 1
)
:deps
echo  [2/7] installing Python packages ^(a few minutes the first time^)...
"%UV%" pip install --python "%VPY%" -r requirements.txt
if errorlevel 1 (
  echo  [!] package install failed - scroll up for the reason
  pause & exit /b 1
)

REM ---------------------------------------------------------------- ffmpeg
echo  [3/7] ffmpeg...
if exist "bin\ffmpeg.exe" if exist "bin\ffprobe.exe" goto :ff_ok
if exist "..\bin\ffmpeg.exe" if exist "..\bin\ffprobe.exe" (
  copy /y "..\bin\ffmpeg.exe" "bin\" >nul
  copy /y "..\bin\ffprobe.exe" "bin\" >nul
  goto :ff_ok
)
echo         downloading a static build ^(~90 MB^)
curl -L --fail --progress-bar -o "%TEMP%\cf_ffmpeg.zip" "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
if not exist "%TEMP%\cf_ffmpeg.zip" goto :ff_fail
powershell -NoProfile -Command "Expand-Archive -Force '%TEMP%\cf_ffmpeg.zip' '%TEMP%\cf_ffmpeg'; Get-ChildItem -Path '%TEMP%\cf_ffmpeg' -Recurse -Include ffmpeg.exe,ffprobe.exe | ForEach-Object { Copy-Item $_.FullName -Destination 'bin' -Force }"
del /q "%TEMP%\cf_ffmpeg.zip" >nul 2>&1
rmdir /s /q "%TEMP%\cf_ffmpeg" >nul 2>&1
if exist "bin\ffmpeg.exe" goto :ff_ok
:ff_fail
echo  [!] ffmpeg download failed. Put ffmpeg.exe and ffprobe.exe in the bin folder.
:ff_ok
if exist "bin\ffmpeg.exe" echo         ready

REM ---------------------------------------------------------------- deno
REM YouTube makes yt-dlp solve a JavaScript challenge; deno is the engine
REM yt-dlp uses by default.
echo  [4/7] deno ^(for YouTube downloads^)...
if exist "bin\deno.exe" goto :deno_ok
if exist "..\bin\deno.exe" (
  copy /y "..\bin\deno.exe" "bin\" >nul
  goto :deno_ok
)
curl -L --fail --progress-bar -o "%TEMP%\cf_deno.zip" "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip"
if exist "%TEMP%\cf_deno.zip" powershell -NoProfile -Command "Expand-Archive -Force '%TEMP%\cf_deno.zip' 'bin'" >nul 2>&1
del /q "%TEMP%\cf_deno.zip" >nul 2>&1
:deno_ok
if exist "bin\deno.exe" (echo         ready) else (echo         [!] not installed - YouTube downloads will use Node instead if you have it)

REM ---------------------------------------------------------------- node
echo  [5/7] Node.js ^(for HyperFrames and OmniRoute^)...
where node >nul 2>&1
if errorlevel 1 (
  echo         not found - installing Node.js LTS with winget
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
  set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;!PATH!"
)
where node >nul 2>&1
if errorlevel 1 (
  echo  [!] Node.js is missing. Install it from https://nodejs.org ^(LTS^), then run Install.bat again.
  echo      Without it ClipForge still works, with basic captions and no OmniRoute.
  goto :node_done
)
for /f "tokens=*" %%V in ('node --version') do echo         node %%V

echo         HyperFrames ^(the caption/title animation engine^)...
if not exist "node_modules\.bin\hyperframes.cmd" call npm install --no-audit --no-fund --loglevel=error
if exist "node_modules\.bin\hyperframes.cmd" (
  call "node_modules\.bin\hyperframes.cmd" browser ensure >nul 2>&1
  if errorlevel 1 (echo         [!] could not fetch its Chrome - it will try your installed Chrome) else (echo         ready)
) else (
  echo         [!] HyperFrames did not install - captions fall back to the basic renderer
)

echo         OmniRoute ^(AI router^)...
where omniroute >nul 2>&1
if errorlevel 1 call npm install -g omniroute --no-audit --no-fund --loglevel=error
where omniroute >nul 2>&1
if errorlevel 1 (echo         [!] OmniRoute did not install - ClipForge will use Ollama directly) else (echo         ready)
:node_done

REM ---------------------------------------------------------------- ollama
echo  [6/7] Ollama ^(local AI^)...
where ollama >nul 2>&1
if errorlevel 1 if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" set "PATH=%LOCALAPPDATA%\Programs\Ollama;!PATH!"
where ollama >nul 2>&1
if errorlevel 1 (
  echo         not found - installing with winget
  winget install -e --id Ollama.Ollama --accept-source-agreements --accept-package-agreements --silent
  set "PATH=%LOCALAPPDATA%\Programs\Ollama;!PATH!"
)
where ollama >nul 2>&1
if errorlevel 1 (
  echo         [!] Ollama is not installed - get it from https://ollama.com if you want local AI
  goto :ollama_done
)
tasklist /fi "imagename eq ollama.exe" | find /i "ollama.exe" >nul || start "" /min ollama serve
timeout /t 3 /nobreak >nul
REM App Hub sets CF_SKIP_MODEL: the user picks a model that fits their PC in its AI Models tab.
if defined CF_SKIP_MODEL (
  echo         pick a chat model in App Hub ^> AI Models
  goto :ollama_done
)
ollama list 2>nul | findstr /r /i "qwen llama gemma mistral phi" >nul
if errorlevel 1 (
  echo         downloading a chat model: qwen3:8b ^(~5 GB, one time^)
  ollama pull qwen3:8b
) else (
  echo         you already have a chat model - ClipForge will use it
)
:ollama_done

REM ---------------------------------------------------------------- check
echo  [7/7] checking everything...
echo.
"%VPY%" -c "from clipforge import config,transcribe,overlay,media,ai;config.prepare_path();d=transcribe.device();print('        Speech   Whisper',transcribe.model_name(d),'on the',d.upper());print('        ffmpeg  ',config.tool('ffmpeg') or 'MISSING');print('        Encoder ','NVIDIA NVENC' if media.nvenc_works() else 'x264 (CPU)');print('        Captions','HyperFrames' if overlay.hyperframes_ready() else 'basic (HyperFrames missing)');s=ai.status(True);print('        AI      ',s['provider'],s['model'] or '(starts with Start.bat)')"

echo.
echo  ==========================================
echo    Done.  Double-click Start.bat to open ClipForge.
echo  ==========================================
echo.
pause
exit /b 0

:fetch_uv
echo  [1/7] fetching uv ^(~15 MB^)...
curl -L --fail --progress-bar -o "%TEMP%\cf_uv.zip" "https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip"
if not exist "%TEMP%\cf_uv.zip" exit /b 0
powershell -NoProfile -Command "Expand-Archive -Force '%TEMP%\cf_uv.zip' 'bin'" >nul 2>&1
del /q "%TEMP%\cf_uv.zip" >nul 2>&1
if exist "bin\uv.exe" set "UV=%CD%\bin\uv.exe"
exit /b 0
