// 数据落盘：项目目录 data/app-data.json。
// 原子写（先写临时文件再替换），每次保存前留一份带时间戳的备份，避免写坏或误删。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyData, migrate } from './schema.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const FILE = path.join(DATA_DIR, 'app-data.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const MAX_BACKUPS = 20;

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  // 上次写盘被强杀留下的半成品，清掉，免得越堆越多
  const stale = `${FILE}.tmp`;
  if (fs.existsSync(stale)) {
    try {
      fs.unlinkSync(stale);
    } catch {}
  }
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function pruneBackups() {
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('app-data-') && f.endsWith('.json'))
      .sort();
    while (files.length > MAX_BACKUPS) {
      fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
    }
  } catch {}
}

export function readData() {
  ensureDirs();
  if (!fs.existsSync(FILE)) {
    const fresh = emptyData();
    writeData(fresh);
    return fresh;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return migrate(raw);
  } catch (e) {
    // 文件损坏：先隔离，再给一份干净的，不让应用打不开
    try {
      fs.copyFileSync(FILE, path.join(BACKUP_DIR, `corrupt-${stamp()}.json`));
    } catch {}
    console.error('数据文件损坏，已隔离并重置：', e.message);
    const fresh = emptyData();
    writeData(fresh);
    return fresh;
  }
}

export function writeData(data) {
  ensureDirs();
  const clean = migrate(data);
  if (fs.existsSync(FILE)) {
    try {
      fs.copyFileSync(FILE, path.join(BACKUP_DIR, `app-data-${stamp()}.json`));
      pruneBackups();
    } catch {}
  }
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(clean, null, 2), 'utf8');
  if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
  fs.renameSync(tmp, FILE);
  return clean;
}

export const DATA_DIR_PATH = DATA_DIR;
export const DATA_FILE_PATH = FILE;
