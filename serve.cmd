@echo off
rem Web Unreal Speccy: local web server (Python). Port: serve.cmd 8000
setlocal
set PORT=%~1
if "%PORT%"=="" set PORT=8000
cd /d "%~dp0"
set PY=
rem py: the launcher of python.org; python: else (the Microsoft Store alias of Windows does not count)
py -3 --version >nul 2>&1 && set PY=py -3
if not defined PY python --version >nul 2>&1 && set PY=python
if not defined PY (
  echo Python not found. Install it from https://www.python.org/downloads/
  pause
  exit /b 1
)
echo Web Unreal Speccy: http://localhost:%PORT%/  (close this window to stop)
start "" cmd /c "timeout /t 1 >nul & start http://localhost:%PORT%/index.html"
%PY% -m http.server %PORT% --bind 127.0.0.1
if errorlevel 1 pause
