const { app, BrowserWindow, protocol, net, shell, dialog, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { Readable } = require('node:stream');

protocol.registerSchemesAsPrivileged([{ scheme: 'career', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
const APP_URL = 'career://assistant';
let window;
const smoke = process.argv.includes('--smoke-test');
if (smoke) app.setPath('userData', path.join(app.getPath('temp'), 'resume-assistant-smoke'));
const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(async () => {
    process.env.RESUME_DESKTOP = '1';
    const { handleAi } = await import(pathToFileURL(path.join(app.getAppPath(), 'server/index.mjs')).href);
    const dist = path.join(app.getAppPath(), 'dist');
    await protocol.handle('career', async request => {
      const url = new URL(request.url);
      if (url.host !== 'assistant') return new Response('Forbidden', { status: 403 });
      if (url.pathname === '/api/ai' && request.method === 'POST') {
        const req = Readable.from([await request.text()]);
        req.headers = { 'x-api-key': request.headers.get('X-Api-Key') || '' };
        return new Promise(resolve => {
          let status = 200; let headers = {};
          const res = { writeHead(code, h) { status = code; headers = h; }, end(body) { resolve(new Response(body, { status, headers })); } };
          handleAi(req, res).catch(() => resolve(new Response(JSON.stringify({ error: 'AI 请求失败，请重试' }), { status: 500, headers: { 'Content-Type': 'application/json' } })));
        });
      }
      if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { return new Response('Bad Request', { status: 400 }); }
      const file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(dist + path.sep)) return new Response('Forbidden', { status: 403 });
      if (!fs.existsSync(file)) return new Response('Not Found', { status: 404 });
      const response = await net.fetch(pathToFileURL(file).href);
      const headers = new Headers(response.headers);
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };
      if (mime[path.extname(file)]) headers.set('Content-Type', mime[path.extname(file)]);
      headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'");
      return new Response(response.body, { status: response.status, headers });
    });
    window = new BrowserWindow({ title: '求职助手', width: 1450, height: 960, minWidth: 900, minHeight: 640, show: !smoke, backgroundColor: '#fafbfe', autoHideMenuBar: true, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: '文件', submenu: [{ label: '打印 / 保存 PDF', accelerator: 'CmdOrCtrl+P', click: () => window.webContents.print({ printBackground: true }) }, { type: 'separator' }, { role: 'quit', label: '退出' }] },
      { label: '编辑', submenu: [{ role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' }, { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }] },
      { label: '视图', submenu: [{ role: 'resetZoom', label: '实际大小' }, { role: 'zoomIn', label: '放大' }, { role: 'zoomOut', label: '缩小' }, { role: 'togglefullscreen', label: '全屏' }] },
    ]));
    const external = url => { try { const u = new URL(url); if (['https:', 'http:'].includes(u.protocol)) shell.openExternal(u.href); } catch {} };
    window.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
    window.webContents.on('will-navigate', (event, url) => { const u = new URL(url); if (u.protocol !== 'career:' || u.host !== 'assistant') { event.preventDefault(); external(url); } });
    window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    window.webContents.session.on('will-download', (_event, item) => { item.setSaveDialogOptions({ title: '保存导出文件', defaultPath: path.join(app.getPath('downloads'), item.getFilename()) }); });
    window.on('closed', () => { window = null; });
    await window.loadURL(APP_URL + '/');
    if (smoke) {
      const report = await window.webContents.executeJavaScript(`(async () => {
        const storageKey = 'resume-assistant-smoke'; localStorage.setItem(storageKey, 'ok');
        const storage = localStorage.getItem(storageKey) === 'ok'; localStorage.removeItem(storageKey);
        const res = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'smoke-test-only' }, body: JSON.stringify({task:'review',entries:[]}) });
        return { title: document.title, rendered: document.querySelectorAll('.career-nav-item').length === 7, storage, api: res.status === 400 && (await res.json()).error === '请先加入经历' };
      })()`);
      console.log('DESKTOP_SMOKE', JSON.stringify(report));
      app.exit(report.rendered && report.storage && report.api ? 0 : 1);
    }
  }).catch(error => { if (smoke) console.error(error); else dialog.showErrorBox('求职助手启动失败', error.message); app.exit(1); });
  app.on('window-all-closed', () => app.quit());
}
