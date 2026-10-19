import { getApiKey } from './store';
import { EntrySummary } from './types';

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': getApiKey(),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { error: text || `请求失败 (${res.status})` };
  }
  if (!res.ok) {
    throw new Error(json.error || `请求失败 (${res.status})`);
  }
  return json;
}

export async function aiMatch(jd: string, entries: EntrySummary[]) {
  return post('/api/ai', { task: 'match', jd, entries });
}

export async function aiPolish(text: string, target?: string) {
  return post('/api/ai', { task: 'polish', text, target });
}

export interface VariantContent {
  title: string;
  role: string;
  bullets: string[];
  tags: string[];
}

export async function aiVariant(direction: string, entry: VariantContent): Promise<VariantContent> {
  return post('/api/ai', { task: 'variant', direction, entry });
}

export interface ResumeEntryContent {
  id: string;
  title: string;
  role: string;
  bullets: string[];
  tags: string[];
}

export async function aiPolishResume(
  direction: string,
  entries: ResumeEntryContent[]
): Promise<{ entries: ResumeEntryContent[] }> {
  return post('/api/ai', { task: 'polish_resume', direction, entries });
}

export interface JdRewriteResult {
  summary: string;
  entries: { id: string; title: string; role: string; bullets: string[]; tags: string[] }[];
}

export async function aiRewriteJd(
  jd: string,
  direction: string,
  currentSummary: string,
  entries: ResumeEntryContent[]
): Promise<JdRewriteResult> {
  return post('/api/ai', { task: 'rewrite_jd', jd, direction, currentSummary, entries });
}

export interface ParsedResume {
  personalInfo: Record<string, string>;
  sections: { name: string; entries: ParsedEntry[] }[];
}

export interface ParsedEntry {
  title?: string;
  role?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  bullets?: string[];
  tags?: string[];
}

export async function aiParse(text: string): Promise<ParsedResume> {
  return post('/api/ai', { task: 'parse', text });
}

export interface ReviewSuggestion {
  entryId: string;
  issue: string;
  reason: string;
  questions: string[];
  bullets: string[];
}
export async function aiReview(jd: string, entries: ResumeEntryContent[], evidence: Record<string, string>): Promise<{ suggestions: ReviewSuggestion[] }> {
  const result = await post('/api/ai', { task: 'review', jd, entries, evidence });
  if (!Array.isArray(result.suggestions)) throw new Error('AI 返回的诊断格式不正确，请重试');
  const ids = new Set(entries.map(e => e.id));
  return { suggestions: result.suggestions.filter((s: ReviewSuggestion) => ids.has(s.entryId) && typeof s.issue === 'string' && typeof s.reason === 'string' && Array.isArray(s.questions) && s.questions.every(q => typeof q === 'string') && Array.isArray(s.bullets) && s.bullets.every(b => typeof b === 'string')) };
}
