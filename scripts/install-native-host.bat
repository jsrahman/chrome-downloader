@echo off
setlocal

set "PROJECT_DIR=%~dp0\.."
cd /d "%PROJECT_DIR%"
set "HOST_NAME=com.okja.saver"
set "EXT_ID=enfcgiajdbdmggdicbjndajnmlmolflo"
set "BAT_PATH=%PROJECT_DIR%\scripts\native-host.bat"
set "JSON_PATH=%PROJECT_DIR%\com.okja.saver.json"

set "ESCAPED_PATH=%BAT_PATH:\=\\%"

(
echo {
echo   "name": "%HOST_NAME%",
echo   "description": "Okja YouTube Saver On-Demand Launcher",
echo   "path": "%ESCAPED_PATH%",
echo   "type": "stdio",
echo   "allowed_origins": [
echo     "chrome-extension://%EXT_ID%/"
echo   ]
echo }
) > "%JSON_PATH%"

reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%JSON_PATH%" /f >nul 2>nul
reg add "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%JSON_PATH%" /f >nul 2>nul
reg add "HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%JSON_PATH%" /f >nul 2>nul

echo Native Messaging Host registered in Windows Registry for Chrome, Edge, and Brave.
