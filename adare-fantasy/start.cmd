@echo off
rem Starts Twenty-Eight on Windows (and its local Postgres, if .env.local points at it).
rem   start.cmd            production build, http://localhost:3000
rem   start.cmd --dev      development server with hot reload
rem   start.cmd --e2e      start, run the end-to-end test, stop
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  if exist "%LOCALAPPDATA%\TwentyEight\node\node.exe" (
    set "PATH=%LOCALAPPDATA%\TwentyEight\node;%PATH%"
  ) else (
    echo.
    echo Node is not installed. Run install.ps1 first.
    echo.
    exit /b 1
  )
)

node scripts\start.mjs %*
