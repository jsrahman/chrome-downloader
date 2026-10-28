@echo off
setlocal
cd /d "%~dp0\.."

set "PYTHONUNBUFFERED=1"

if exist ".\.venv\Scripts\python.exe" (
    set "PYTHON_RUNNER=.\.venv\Scripts\python.exe"
) else (
    where python >nul 2>nul
    if %errorlevel% equ 0 (
        set "PYTHON_RUNNER=python"
    ) else (
        echo [ERROR] Python was not found. Please run scripts\setup.bat first.
        pause
        exit /b 1
    )
)

echo ==============================================
echo   Starting Okja YouTube Saver Service...
echo   Port: 43117
echo   Keep this window open while downloading.
echo ==============================================

"%PYTHON_RUNNER%" -m service.app %*
if %errorlevel% neq 0 (
    echo.
    echo Service stopped with an error.
    pause
)
