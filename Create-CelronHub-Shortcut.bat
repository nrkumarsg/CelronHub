@echo off
title CelronHub Desktop Launcher Installer
cls
echo ========================================================
echo     Installing CelronHub Desktop Launchpad Shortcut
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create-desktop-shortcut.ps1"

echo.
echo Done! You can now launch CelronHub from your Desktop icon.
echo.
pause
