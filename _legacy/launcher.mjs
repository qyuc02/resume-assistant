import { spawn, exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = 'http://localhost:4173';

const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

function openAppWindow(url) {
  for (const p of [...EDGE_PATHS, ...CHROME_PATHS]) {
    if (existsSync(p)) {
      exec(`"${p}" --app="${url}"`, { shell: 'cmd.exe' });
      return;
    }
  }
  exec(`start "" "${url}"`, { shell: 'cmd.exe' });
}

async function isUp(url, timeoutMs = 800) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitFor(url, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isUp(url)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function main() {
  if (await isUp(APP_URL)) {
    openAppWindow(APP_URL);
    return;
  }
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.mjs')], {
    cwd: ROOT,
    detached: true,
    windowsHide: true,
    env: { ...process.env, NO_OPEN: '1' },
    stdio: 'ignore',
  });
  child.unref();
  if (await waitFor(APP_URL)) {
    openAppWindow(APP_URL);
  } else {
    console.error('启动失败：服务未能启动');
    process.exit(1);
  }
}

main();
