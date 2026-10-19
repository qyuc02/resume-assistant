// 本地服务：静态托管前端 + 数据读写 API + 可选的 AI 代理。
// 数据全部落在项目目录 data/ 下，不依赖浏览器 localStorage。
import http from 'node:http';
import { readFile, readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { readData, writeData } from './store.mjs';
import { runAi } from './ai.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function configApiKey() {
  try {
    return JSON.parse(readFileSync(path.join(ROOT, 'config.json'), 'utf8')).apiKey || '';
  } catch {
    return '';
  }
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 20 * 1024 * 1024) {
        req.destroy();
        reject(new Error('内容过大'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function serveStatic(req, res, urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p === '/') p = '/index.html';
  const filePath = path.normalize(path.join(DIST, p));
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    const idx = path.join(DIST, 'index.html');
    if (existsSync(idx)) {
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
      return res.end(readFileSync(idx));
    }
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
    return res.end('未找到构建产物，请先运行 npm run build');
  }
  const ext = path.extname(filePath).toLowerCase();
  // no-cache：改完代码刷新就能看到，不会被浏览器缓存住旧版本
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      return res.end('Read error');
    }
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';

  if (url === '/api/health') return sendJson(res, 200, { ok: true });

  if (url === '/api/data' && req.method === 'GET') {
    return sendJson(res, 200, { data: readData() });
  }

  // PUT 是正常保存；POST 是关闭页面时 sendBeacon 的补发，两者等价
  if (url === '/api/data' && (req.method === 'PUT' || req.method === 'POST')) {
    try {
      const body = JSON.parse(await readBody(req));
      const saved = writeData(body.data);
      return sendJson(res, 200, { ok: true, data: saved });
    } catch (e) {
      return sendJson(res, 400, { error: `保存失败：${e.message}` });
    }
  }

  if (url === '/api/ai' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const apiKey = String(req.headers['x-api-key'] || '').trim() || configApiKey();
      if (!apiKey) {
        return sendJson(res, 400, { error: '未配置 DeepSeek API Key。可在「设置」中填写——不填也能正常使用其他全部功能。' });
      }
      const result = await runAi(body.task, body.payload || {}, apiKey);
      return sendJson(res, 200, { result });
    } catch (e) {
      return sendJson(res, 502, { error: e.message || 'AI 请求失败' });
    }
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    return serveStatic(req, res, url);
  }

  sendJson(res, 405, { error: 'Method Not Allowed' });
});

function openAppWindow(url) {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      exec(`"${p}" --app="${url}"`, { shell: 'cmd.exe' });
      return;
    }
  }
  exec(`start "" "${url}"`, { shell: 'cmd.exe' });
}

if (!existsSync(path.join(DIST, 'index.html'))) {
  console.error('提示：未找到 dist 构建产物，页面将无法显示，请先运行 npm run build');
}

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`简历助手已启动：${url}`);
  console.log(`数据文件：${path.join(ROOT, 'data', 'app-data.json')}`);
  if (process.platform === 'win32' && !process.env.NO_OPEN) openAppWindow(url);
});
