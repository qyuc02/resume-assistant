import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AppData, Application, Category, Entry, PersonalInfo, Resume } from './types';
import { uid, emptyPersonalInfo } from './util';

const DATA_KEY = 'resume-assistant-data-v1';
const API_KEY_KEY = 'resume-assistant-apikey';

export function getApiKey(): string {
  try {
    return localStorage.getItem(API_KEY_KEY) || '';
  } catch {
    return '';
  }
}

export function setApiKey(key: string) {
  try {
    localStorage.setItem(API_KEY_KEY, key);
  } catch {}
}

function defaultCategories(): Category[] {
  const names = ['教育经历', '实习经历', '项目经历', '技能与证书', '自我评价'];
  return names.map((name, i) => ({ id: uid(), name, order: i }));
}

function sampleEntry(categoryId: string): Entry {
  return {
    id: uid(),
    categoryId,
    title: '示例：某某科技公司',
    role: '后端开发实习生',
    startDate: '2024.06',
    endDate: '2024.09',
    location: '北京',
    bullets: [
      '负责订单服务接口开发，日均调用量 50 万+，接口响应时间降低 30%',
      '重构数据缓存层，命中率从 70% 提升到 95%',
    ],
    tags: ['Go', 'MySQL', 'Redis'],
    order: 0,
  };
}

function defaultData(): AppData {
  const cats = defaultCategories();
  const projectCat = cats.find((c) => c.name === '实习经历')!;
  const sample = sampleEntry(projectCat.id);
  return {
    personalInfo: {
      name: '',
      phone: '',
      email: '',
      city: '',
      website: '',
      github: '',
      summary: '',
    },
    categories: cats,
    entries: [sample],
    resumes: [],
    directions: [],
    applications: [],
  };
}

function loadData(): AppData {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (raw) {
      const d = JSON.parse(raw) as AppData;
      if (d && Array.isArray(d.categories) && Array.isArray(d.entries) && Array.isArray(d.resumes)) {
        return migrate(d);
      }
    }
  } catch {}
  return defaultData();
}

function saveData(data: AppData) {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('保存失败', e);
  }
}

// 兼容旧版本数据：补齐 directions / variants / directionId / applications 等新增字段
export function migrate(d: AppData): AppData {
  return {
    ...d,
    personalInfo: { ...emptyPersonalInfo(), ...(d.personalInfo || {}) },
    directions: Array.isArray(d.directions) ? d.directions : [],
    applications: (Array.isArray(d.applications) ? d.applications : []).map((a) => migrateApplication(a)),
    entries: (d.entries || []).map((e) => ({
      ...e,
      title: e.title || '',
      role: e.role || '',
      startDate: e.startDate || '',
      endDate: e.endDate || '',
      location: e.location || '',
      bullets: Array.isArray(e.bullets) ? e.bullets : [],
      tags: Array.isArray(e.tags) ? e.tags : [],
      categoryId: e.categoryId || '',
      order: typeof e.order === 'number' ? e.order : 0,
      variants: Array.isArray(e.variants) ? e.variants : [],
    })),
    resumes: (d.resumes || []).map((r) => ({
      ...r,
      name: r.name || '未命名简历',
      personalInfo: { ...emptyPersonalInfo(), ...(r.personalInfo || {}) },
      sections: (Array.isArray(r.sections) ? r.sections : []).map((s) => ({
        categoryId: s.categoryId || '',
        entryIds: Array.isArray(s.entryIds) ? s.entryIds : [],
      })),
      directionId: r.directionId || '',
      overrides: r.overrides && typeof r.overrides === 'object' ? r.overrides : {},
      summaryOverride: r.summaryOverride === '' && !('targetJd' in r) ? undefined : r.summaryOverride,
      revisions: Array.isArray(r.revisions) ? r.revisions : [],
    })),
  };
}

// 归一化单条投递记录：补齐旧版本缺失的字段，避免读取 undefined 时崩溃
function migrateApplication(a: Partial<Application> | null | undefined): Application {
  const src = a || {};
  const stage = src.stage || '待投递';
  const priority = src.priority || '普通';
  const now = Date.now();
  return {
    id: src.id || uid(),
    company: src.company || '',
    position: src.position || '',
    city: src.city || '',
    salary: src.salary || '',
    source: src.source || '',
    url: src.url || '',
    jd: src.jd || '',
    stage,
    priority,
    appliedDate: src.appliedDate || '',
    scheduleAt: src.scheduleAt || '',
    scheduleNote: src.scheduleNote || '',
    nextAction: src.nextAction || '',
    notes: src.notes || '',
    resumeId: src.resumeId || '',
    createdAt: typeof src.createdAt === 'number' ? src.createdAt : now,
    updatedAt: typeof src.updatedAt === 'number' ? src.updatedAt : now,
    archived: !!src.archived,
    history: Array.isArray(src.history) ? src.history : [],
    snapshot: src.snapshot,
  };
}

export function newResume(seed: PersonalInfo): Resume {
  return {
    id: uid(),
    name: '未命名简历',
    personalInfo: { ...seed },
    sections: [],
    directionId: '',
    targetJd: '',
    updatedAt: Date.now(),
  };
}

interface Ctx {
  data: AppData;
  update: (fn: (d: AppData) => AppData) => void;
}

const DataContext = createContext<Ctx | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData());

  useEffect(() => {
    saveData(data);
  }, [data]);

  const update = (fn: (d: AppData) => AppData) => setData((d) => fn(d));

  return <DataContext.Provider value={{ data, update }}>{children}</DataContext.Provider>;
}

export function useData(): Ctx {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}

export { emptyPersonalInfo };
