export interface PersonalInfo {
  name: string;
  phone: string;
  email: string;
  city: string;
  website: string;
  github: string;
  summary: string;
}

export interface Category {
  id: string;
  name: string;
  order: number;
}

export interface Direction {
  id: string;
  name: string;
  order: number;
}

export interface EntryVariant {
  id: string;
  directionId: string;
  title: string;
  role: string;
  bullets: string[];
  tags: string[];
}

export interface EntryOverride {
  title?: string;
  role?: string;
  bullets?: string[];
  tags?: string[];
}

export interface Entry {
  id: string;
  categoryId: string;
  title: string; // 公司 / 项目 / 学校名
  role: string; // 职位 / 角色
  startDate: string;
  endDate: string;
  location: string;
  bullets: string[]; // 描述要点
  tags: string[]; // 技术栈 / 关键词
  variants?: EntryVariant[]; // 不同求职方向的侧重版本
  order: number;
}

export interface ResumeSection {
  categoryId: string;
  entryIds: string[]; // 有序
}

export interface Resume {
  id: string;
  name: string;
  personalInfo: PersonalInfo;
  sections: ResumeSection[];
  directionId?: string; // 目标求职方向（空 = 用默认版本）
  overrides?: Record<string, EntryOverride>; // 按 JD 定向改写的内容（entryId -> 覆盖）
  summaryOverride?: string; // 按 JD 定制的个人简介
  updatedAt: number;
  targetJd?: string;
  evidence?: Record<string, string>;
  revisions?: { id: string; date: number; label: string; overrides: Record<string, EntryOverride>; summary: string }[];
}

export interface AppData {
  personalInfo: PersonalInfo;
  categories: Category[];
  entries: Entry[];
  resumes: Resume[];
  directions: Direction[];
  applications: Application[];
}

export type ApplicationStage = '待投递' | '已投递' | '笔试' | '一面' | '二面' | 'HR面' | 'Offer' | '已结束';
export interface Application {
  id: string;
  company: string;
  position: string;
  city: string;
  salary: string;
  source: string;
  url: string;
  jd: string;
  stage: ApplicationStage;
  priority: '重点' | '普通' | '备选';
  appliedDate: string;
  scheduleAt: string;
  scheduleNote: string;
  nextAction: string;
  notes: string;
  resumeId: string;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
  history: { date: number; text: string }[];
  snapshot?: { date: number; resume: Resume; entries: Entry[]; categories: Category[] };
}

export interface EntrySummary {
  id: string;
  title: string;
  role: string;
  tags: string[];
  summary: string;
}
