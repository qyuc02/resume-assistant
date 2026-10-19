// 与 server/schema.mjs 保持一致的契约。
// 服务端已保证字段完整，这里不需要再做防御性兜底。

export interface Profile {
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

/** 经历 = 事实。只记录真实发生过的事。 */
export interface Experience {
  id: string;
  categoryId: string;
  title: string;
  role: string;
  startDate: string;
  endDate: string;
  location: string;
  bullets: string[];
  tags: string[];
  order: number;
}

/** 简历条目 = 引用一段经历 + 可选的本简历专用说法 */
export interface ResumeItem {
  experienceId: string;
  order: number;
  bulletsOverride: string[] | null;
}

export interface Revision {
  id: string;
  date: number;
  label: string;
  resume: unknown;
}

/** 简历 = 说法。决定挑哪些经历、什么顺序、这段话怎么讲。 */
export interface Resume {
  id: string;
  name: string;
  summaryOverride: string | null;
  targetJd: string;
  items: ResumeItem[];
  revisions: Revision[];
  createdAt: number;
  updatedAt: number;
}

export type ApplicationStage = '待投递' | '已投递' | '笔试' | '一面' | '二面' | 'HR面' | 'Offer' | '已结束';
export type ApplicationPriority = '重点' | '普通' | '备选';

export interface Snapshot {
  date: number;
  resume: Resume;
  experiences: Experience[];
  categories: Category[];
  profile: Profile;
}

export type KnowledgePriority = '必学' | '加分' | '了解';
export type KnowledgeStatus = '待学习' | '学习中' | '已掌握';

export interface KnowledgePoint {
  id: string;
  name: string;
  category: string;
  priority: KnowledgePriority;
  reason: string;
  topics: string[];
}

export type InterviewQuestionType = '技术' | '项目' | '行为' | '其他';

export interface InterviewQuestion {
  id: string;
  question: string;
  type: InterviewQuestionType;
  reason: string;
  points: string[];
}

export interface InterviewRecord {
  id: string;
  date: string;
  stage: string;
  asked: string;
  performance: string;
  note: string;
}

export interface Application {
  id: string;
  company: string;
  position: string;
  city: string;
  salary: string;
  source: string;
  url: string;
  logo: string;
  jd: string;
  stage: ApplicationStage;
  priority: ApplicationPriority;
  appliedDate: string;
  scheduleAt: string;
  scheduleNote: string;
  nextAction: string;
  notes: string;
  resumeId: string;
  learning: KnowledgePoint[];
  learningGeneratedAt: number;
  interviewPrep: InterviewQuestion[];
  interviewPrepAt: number;
  interviews: InterviewRecord[];
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  history: { date: number; text: string }[];
  snapshot: Snapshot | null;
}

export interface AppData {
  schemaVersion: number;
  profile: Profile;
  categories: Category[];
  experiences: Experience[];
  resumes: Resume[];
  applications: Application[];
  knowledgeStatus: Record<string, KnowledgeStatus>;
}

export const STAGES: ApplicationStage[] = ['待投递', '已投递', '笔试', '一面', '二面', 'HR面', 'Offer', '已结束'];
export const PRIORITIES: ApplicationPriority[] = ['重点', '普通', '备选'];

export interface ReviewSuggestion {
  experienceId: string;
  issue: string;
  reason: string;
  questions: string[];
  /** 逐条「原句 → 建议句」对照；original 空 = 新增，revised 空 = 删除 */
  edits: { original: string; revised: string }[];
}
