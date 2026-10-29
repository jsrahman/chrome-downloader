@echo off
setlocal
set "PROJECT_DIR=%~dp0\.."
cd /d "%PROJECT_DIR%"
set "PYTHONUNBUFFERED=1"

if exist "%PROJECT_DIR%\.venv\Scripts\python.exe" (
    "%PROJECT_DIR%\.venv\Scripts\python.exe" "%PROJECT_DIR%\service\native_host.py"
) else (
    python "%PROJECT_DIR%\service\native_host.py"
)
