#!/usr/bin/env bash
# 简历助手 · Mac / Linux 一键启动（对应 Windows 的 启动.bat）
# 用法：双击 或 终端执行  bash 启动.sh
set -e
cd "$(dirname "$0")"

PORT=4173

# ---- 0. 已在运行则直接开浏览器 ----
if command -v lsof >/dev/null 2>&1 && lsof -i :"$PORT" >/dev/null 2>&1; then
  echo "服务已在运行，正在打开浏览器..."
  open "http://localhost:$PORT" 2>/dev/null || xdg-open "http://localhost:$PORT" 2>/dev/null || true
  exit 0
fi

echo "=========================================="
echo "   简历助手"
echo "=========================================="
echo

# ---- 1. 找 Node.js ----
if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 没有找到 Node.js，请先安装：https://nodejs.org"
  echo
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "[错误] 没有找到 npm，请重新安装 Node.js：https://nodejs.org"
  echo
  exit 1
fi

# ---- 2. 依赖 ----
if [ ! -d "node_modules/vite" ]; then
  echo "[1/3] 首次运行，正在安装依赖（需联网）..."
  npm install
else
  echo "[1/3] 依赖已就绪"
fi

# ---- 3. 构建 ----
echo "[2/3] 正在构建前端..."
npm run build

# ---- 4. 启动（服务端会自动打开浏览器）----
echo
echo "[3/3] 正在启动，浏览器将自动打开 http://localhost:$PORT"
echo "       关闭本终端窗口即停止服务"
echo

node server/index.mjs
