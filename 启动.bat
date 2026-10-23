@echo off
setlocal
cd /d "%~dp0"

rem ---- 检查是否已在运行 ----
netstat -ano | findstr "127.0.0.1:4173" | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo 服务已在运行，正在打开浏览器...
  start "" http://localhost:4173
  exit /b 0
)

echo ==========================================
echo   求职助手
echo ==========================================
echo.

rem ---- 1. 找 Node.js ----
set "NODE="
if exist "C:\Program Files\nodejs\node.exe" set "NODE=C:\Program Files\nodejs\node.exe"
if not defined NODE (
  for /f "delims=" %%i in ('where node 2^>nul') do if not defined NODE set "NODE=%%i"
)
if not defined NODE (
  echo [错误] 没有找到 Node.js，请先安装：https://nodejs.org
  echo.
  pause
  exit /b 1
)

rem ---- 2. 找 npm-cli.js ----
set "NPMCLI="
if exist "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" set "NPMCLI=C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js"
if not defined NPMCLI (
  for /f "delims=" %%i in ('"%NODE%" -p "require.resolve('npm/bin/npm-cli.js')" 2^>nul') do if not defined NPMCLI set "NPMCLI=%%i"
)
if not defined NPMCLI (
  echo [错误] 没有找到 npm，请重新安装 Node.js：https://nodejs.org
  echo.
  pause
  exit /b 1
)

rem ---- 3. 依赖 ----
if not exist "node_modules\vite" (
  echo [1/3] 首次运行，正在安装依赖（需要网络）...
  call "%NODE%" "%NPMCLI%" install
  if errorlevel 1 (
    echo.
    echo [错误] 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
) else (
  echo [1/3] 依赖已就绪
)

rem ---- 4. 构建 ----
echo [2/3] 正在构建前端...
call "%NODE%" "%NPMCLI%" run build
if errorlevel 1 (
  echo.
  echo [错误] 构建失败，请看上面的报错信息。
  pause
  exit /b 1
)

rem ---- 5. 启动 ----
echo.
echo [3/3] 正在启动，浏览器会自动打开 http://localhost:4173
echo       保持本窗口打开，关闭本窗口即停止服务。
echo.

"%NODE%" server/index.mjs

echo.
echo 服务已退出。
pause