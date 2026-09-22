@echo off
setlocal
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
if exist "%ROOT%\..\portable-files\git\cmd\git.exe" set "PATH=%ROOT%\..\portable-files\git\cmd;%PATH%"
if exist "%ROOT%\..\portable-files\node\node.exe" set "PATH=%ROOT%\..\portable-files\node;%PATH%"
powershell -ExecutionPolicy Bypass -File "%ROOT%\scripts\run.ps1" -RootPath "%ROOT%"
