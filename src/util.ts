import type { Experience, ResumeItem } from './types';

export function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function emptyProfile() {
  return { name: '', phone: '', email: '', city: '', website: '', github: '', summary: '' };
}

export function dateRange(e: { startDate: string; endDate: string }): string {
  const s = e.startDate.trim();
  const t = e.endDate.trim();
  if (s && t) return `${s} - ${t}`;
  return s || t;
}

/** 这条经历在当前简历里该用哪套说法：有覆盖就用覆盖，否则用档案里的原始事实 */
export function bulletsFor(exp: Experience, item: ResumeItem): string[] {
  return item.bulletsOverride && item.bulletsOverride.length ? item.bulletsOverride : exp.bullets;
}

export function isCustomized(item: ResumeItem): boolean {
  return !!(item.bulletsOverride && item.bulletsOverride.length);
}

export function localDate(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function safeUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
