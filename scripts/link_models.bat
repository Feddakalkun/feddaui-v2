@echo off
REM No arguments. Double-click, answer one question.
setlocal
set "HERE=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%link_models.ps1"
