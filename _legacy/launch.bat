@echo off
chcp 65001 >nul
cd /d "%~dp0"

if exist "release\求职助手-0.1.0-便携版.exe" (
  start "" "release\求职助手-0.1.0-便携版.exe"
  exit /b 0
)

set "NODE=node"
set "NPM=npm"
where node >nul 2>nul
if errorlevel 1 set "NODE=C:\Program Files\nodejs\node.exe"
where npm >nul 2>nul
if errorlevel 1 set "NPM=C:\Program Files\nodejs\npm.cmd"

if not exist node_modules (
  echo [1/3] Installing dependencies...
  call "%NPM%" install
)

echo [2/3] Building...
call "%NPM%" run build
if errorlevel 1 (
  echo [ERROR] Build failed.
  pause
  exit /b 1
)

"%NODE%" launcher.mjs
