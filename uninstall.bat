@echo off
chcp 65001 >nul
title Antigravity Context Meter - Uninstaller

echo =========================================================
echo   Antigravity Context Meter - Uninstalling...
echo =========================================================
echo.

where node >nul 2>nul
if %errorlevel% equ 0 (
    node "%~dp0uninstall.js"
    goto :end
)

echo [INFO] Node command not in PATH, launching PowerShell uninstaller...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"

:end
echo.
pause


