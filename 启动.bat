@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo   简历助手
echo ==========================================
echo.

rem ---- 1. 找 Node.js ----
set "NODE="
if exist "C:\Program Files\nodejs\node.exe" set "NODE=C:\Program Files\nodejs\node.exe"
if not defined NODE (
  for /f "delims=" %%i in ('where node 2^>nul') do (
    if not defined NODE set "NODE=%%i"
  )
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
  for /f "delims=" %%i in ('"%NODE%" -p "require.resolve('npm/bin/npm-cli.js')" 2^>nul') do (
    if not defined NPMCLI set "NPMCLI=%%i"
  )
)
if not defined NPMCLI (
  echo [错误] 没有找到 npm，请重新安装 Node.js：https://nodejs.org
  echo.
  pause
  exit /b 1
)

rem ---- 3. 依赖 ----
if not exist "node_modules\vite" (
  echo [1/3] 首次运行，正在安装依赖，可能需要几分钟...
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
  echo [错误] 构建失败，请把上面的报错截图发给我。
  pause
  exit /b 1
)

rem ---- 5. 启动 ----
echo.
echo [3/3] 启动服务，浏览器会自动打开 http://localhost:4173
echo       保持这个窗口开着；关闭它即停止服务。
echo.

"%NODE%" server/index.mjs

echo.
echo 服务已退出。
echo 若提示端口 4173 被占用，说明已有一个实例在运行，
echo 直接打开 http://localhost:4173 即可。
echo.
pause
