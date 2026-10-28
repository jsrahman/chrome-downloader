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

where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo [WARNING] ffmpeg was not found in PATH.
    echo It is recommended to install FFmpeg for merging video and audio:
    echo   winget install Gyan.FFmpeg
    echo.
)

echo Creating Python virtual environment (.venv)...
python -m venv .venv
if %errorlevel% neq 0 (
    echo [ERROR] Failed to create virtual environment.
    pause
    exit /b 1
)

echo Upgrading pip and installing yt-dlp...
call .\.venv\Scripts\python.exe -m pip install --upgrade pip
call .\.venv\Scripts\python.exe -m pip install --upgrade "yt-dlp[default]"

echo.
echo ==============================================
echo   Setup Complete!
echo   Start the service with: scripts\start-service.bat
echo ==============================================
pause
