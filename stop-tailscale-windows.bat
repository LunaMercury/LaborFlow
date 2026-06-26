@echo off
setlocal EnableExtensions
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-tailscale-windows.ps1" %*
exit /b %ERRORLEVEL%
