@echo off
setlocal
cd /d "%~dp0\.."

echo ==============================================
echo   Okja YouTube Saver - Windows Setup
echo ==============================================

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python was not found in PATH.
    echo Please install Python 3.11+ from https://python.org or run in PowerShell:
    echo   winget install Python.Python.3.12
    echo.
    pause
    exit /b 1
)

echo Creating Python virtual environment (.venv)...
python -m venv .venv
if %errorlevel% neq 0 (
    echo [ERROR] Failed to create virtual environment.
    pause
    exit /b 1
)

echo Upgrading pip and installing yt-dlp and standalone ffmpeg...
call .\.venv\Scripts\python.exe -m pip install --quiet --upgrade pip
call .\.venv\Scripts\python.exe -m pip install --quiet --upgrade "yt-dlp[default]" imageio-ffmpeg

rem Extract and copy standalone ffmpeg.exe to .venv\Scripts\ffmpeg.exe
call .\.venv\Scripts\python.exe -c "import os, sys, shutil, imageio_ffmpeg; src = imageio_ffmpeg.get_ffmpeg_exe(); dst = os.path.join(sys.prefix, 'Scripts', 'ffmpeg.exe'); shutil.copy2(src, dst) if os.path.isfile(src) and not os.path.isfile(dst) else None"

rem Register Native Messaging Host
if exist scripts\install-native-host.bat (
    call scripts\install-native-host.bat
)

echo.
echo ==============================================
echo   Setup Complete!
echo   Okja Saver will start automatically on demand.
echo ==============================================
pause
