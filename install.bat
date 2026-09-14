@echo off
chcp 65001 >nul
title Antigravity Context Meter - Installer

echo =========================================================
echo   Antigravity Context Meter - Installing...
echo =========================================================
echo.

where node >nul 2>nul
if %errorlevel% equ 0 (
    node "%~dp0install.js"
    goto :end
)

echo [INFO] Node command not in PATH, launching PowerShell installer...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"

:end
echo.
pause


