import { Entry, EntryOverride } from './types';

export function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function emptyPersonalInfo() {
  return {
    name: '',
    phone: '',
    email: '',
    city: '',
    website: '',
    github: '',
    summary: '',
  };
}

export function dateRange(e: { startDate?: string; endDate?: string }): string {
  const s = (e.startDate || '').trim();
  const t = (e.endDate || '').trim();
  if (s && t) return `${s} - ${t}`;
  return s || t;
}

// 解析某条经历在指定求职方向下应展示的内容（命中侧重版本则用版本，否则用默认）
export function resolveEntry(
  entry: Entry,
  directionId?: string,
  override?: EntryOverride
): { title: string; role: string; bullets: string[]; tags: string[] } {
  let src: { title: string; role: string; bullets: string[]; tags: string[] };
  if (directionId) {
    const v = entry.variants?.find((x) => x.directionId === directionId);
    src = v
      ? { title: v.title, role: v.role, bullets: v.bullets, tags: v.tags }
      : { title: entry.title, role: entry.role, bullets: entry.bullets, tags: entry.tags };
  } else {
    src = { title: entry.title, role: entry.role, bullets: entry.bullets, tags: entry.tags };
  }
  if (override) {
    return {
      title: override.title ?? src.title,
      role: override.role ?? src.role,
      bullets: override.bullets ?? src.bullets,
      tags: override.tags ?? src.tags,
    };
  }
  return src;
}
