import { AppData, Application, ApplicationStage } from './types';
import { resolveEntry } from './util';

export const STAGES: ApplicationStage[] = ['待投递', '已投递', '笔试', '一面', '二面', 'HR面', 'Offer', '已结束'];
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function captureResume(data: AppData, resumeId: string): Application['snapshot'] {
  const resume = data.resumes.find(r => r.id === resumeId);
  if (!resume) return undefined;
  const ids = new Set(resume.sections.flatMap(s => s.entryIds));
  return JSON.parse(JSON.stringify({ date: Date.now(), resume: { ...resume, directionId: '', overrides: {}, revisions: [], personalInfo: { ...resume.personalInfo, summary: resume.summaryOverride ?? resume.personalInfo.summary } }, entries: data.entries.filter(e => ids.has(e.id)).map(e => ({ ...e, ...resolveEntry(e, resume.directionId, resume.overrides?.[e.id]), variants: [] })), categories: data.categories }));
}
export function changeStage(record: Application, stage: ApplicationStage, data: AppData): Application {
  if (record.stage === stage) return record;
  return { ...record, stage, updatedAt: Date.now(), appliedDate: stage !== '待投递' && stage !== '已结束' && !record.appliedDate ? localDate() : record.appliedDate, snapshot: record.snapshot || (stage !== '待投递' && stage !== '已结束' ? captureResume(data, record.resumeId) : undefined), history: [...(record.history || []), { date: Date.now(), text: `阶段更新：${record.stage} → ${stage}` }] };
}
