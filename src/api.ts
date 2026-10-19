import type { AppData } from './types';

const API_KEY_STORAGE = 'resume-assistant-apikey';

export function getApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function setApiKey(key: string) {
  try {
    localStorage.setItem(API_KEY_STORAGE, key);
  } catch {}
}

export async function fetchData(): Promise<AppData> {
  const res = await fetch('/api/data');
  if (!res.ok) throw new Error('无法读取数据，请确认服务已启动');
  const body = await res.json();
  return body.data as AppData;
}

export async function saveData(data: AppData): Promise<AppData> {
  const res = await fetch('/api/data', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || '保存失败');
  }
  const out = await res.json();
  return out.data as AppData;
}

export async function callAi<T>(task: string, payload: unknown): Promise<T> {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': getApiKey() },
    body: JSON.stringify({ task, payload }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'AI 请求失败');
  return body.result as T;
}
