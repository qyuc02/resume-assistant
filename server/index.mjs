// 本地服务：静态托管前端 + 数据读写 API + 可选的 AI 代理。
// 数据默认落在项目目录 data/ 下；Electron 打包后通过 DATA_DIR 环境变量改到用户目录。
import http from 'node:http';
import { readFile, readFileSync, existsSync, statSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { readData, writeData } from './store.mjs';
import { runAi } from './ai.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 4173);
// 数据根目录：Electron 会先设 DATA_DIR 指向用户目录；纯 Node 模式用项目目录 data/
const DATA_ROOT = process.env.DATA_DIR || path.join(ROOT, 'data');
const LOGOS_DIR = path.join(DATA_ROOT, 'logos');

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

function sniffImageType(buf) {
  if (!buf || buf.length < 4) return '';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) return 'image/x-icon';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 6) {
    const g = buf.toString('ascii', 0, 6);
    if (g === 'GIF87a' || g === 'GIF89a') return 'image/gif';
  }
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === '<svg') return 'image/svg+xml';
  return '';
}

// 抓取顺序：先直连站点 favicon（裸域名 + www 前缀，两者证书覆盖不同），再走三方服务。只发域名，不发任何简历内容。
const FAVICON_SERVICES = [
  (d) => `https://${d}/favicon.ico`,
  (d) => `https://www.${d}/favicon.ico`,
  (d) => `https://favicon.im/${d}`,
  (d) => `https://favicon.yandex.net/favicon/v2/${d}`,
];

// 本地 logo 缓存：命中缓存直接返回；否则抓一次并落盘到 data/logos，之后不再联网。
async function serveLogo(res, url) {
  const domain = String(url.searchParams.get('domain') || '').trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(domain) || domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) {
    res.writeHead(400);
    return res.end('Bad domain');
  }
  const file = path.join(LOGOS_DIR, `${domain}.img`);
  if (existsSync(file)) {
    const buf = readFileSync(file);
    const type = sniffImageType(buf);
    if (type) {
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=604800' });
      return res.end(buf);
    }
    try {
      unlinkSync(file);
    } catch {}
  }
  for (const svc of FAVICON_SERVICES) {
    try {
      const r = await fetch(svc(domain), { signal: AbortSignal.timeout(8000), redirect: 'follow' });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      const type = sniffImageType(buf);
      if (!type || buf.length < 60) continue;
      try {
        mkdirSync(LOGOS_DIR, { recursive: true });
        writeFileSync(file, buf);
      } catch {}
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=604800' });
      return res.end(buf);
    } catch {
      // 该源失败，换下一个
    }
  }
  res.writeHead(404, { 'Cache-Control': 'no-store' });
  res.end('No logo');
}

export function startServer(port = PORT) {
  const server = http.createServer(async (req, res) => {
    const url = req.url || '/';

    if (url === '/api/health') return sendJson(res, 200, { ok: true });

    if (url.startsWith('/api/logo') && req.method === 'GET') {
      return serveLogo(res, new URL(url, `http://localhost:${port}`));
    }

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

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      if (!existsSync(path.join(DIST, 'index.html'))) {
        console.error('提示：未找到 dist 构建产物，页面将无法显示，请先运行 npm run build');
      }
      console.log(`简历助手已启动：http://localhost:${port}`);
      console.log(`数据文件：${DATA_ROOT}`);
      resolve(port);
    });
  });
}

function openAppWindow(url) {
  if (process.platform === 'darwin') {
    exec(`open "${url}"`);
    return;
  }
  if (process.platform === 'linux') {
    exec(`xdg-open "${url}"`);
    return;
  }
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

// 直接以 node 运行时（npm start）才自动启动并开浏览器；被 Electron import 时不执行。
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer(PORT).then((port) => {
    if (!process.env.NO_OPEN) openAppWindow(`http://localhost:${port}`);
  });
}
