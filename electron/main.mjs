// Electron 主进程：启动本地 http 服务（复用 server/index.mjs），再用窗口加载它。
// 数据目录通过 DATA_DIR 环境变量改到系统用户目录，避免安装目录（Program Files）无写权限。
// 关键：必须先设好 DATA_DIR 再动态 import 服务端，服务端模块顶层的路径常量才会读到正确值。
import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);

let mainWindow = null;

async function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    autoHideMenuBar: true,
    title: '简历助手',
    backgroundColor: '#f5f6fa',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}`);

  // 外部链接（岗位链接等）交给系统浏览器打开，不在应用内跳转
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // 数据落到用户目录：Windows 下即 %APPDATA%/简历助手/data
  process.env.DATA_DIR = path.join(app.getPath('userData'), 'data');
  const { startServer } = await import(pathToFileURL(path.join(__dirname, '..', 'server', 'index.mjs')).href);
  const port = await startServer(PORT);
  await createWindow(port);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
  });
});

app.on('window-all-closed', () => {
  // macOS 惯例：关窗后应用留在 Dock，点击图标（activate）再开窗；其他平台直接退出。
  if (process.platform !== 'darwin') app.quit();
});
