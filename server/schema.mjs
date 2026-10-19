// 数据结构的唯一权威定义。
// 原则：任何来源的数据（新、旧、残缺、手改坏）进入应用前都必须先过 normalize，
// 保证前端拿到的对象字段完整、类型正确，从根上避免 undefined 引发的渲染崩溃。

export const SCHEMA_VERSION = 1;

export const STAGES = ['待投递', '已投递', '笔试', '一面', '二面', 'HR面', 'Offer', '已结束'];
export const PRIORITIES = ['重点', '普通', '备选'];

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

const str = (v) => (typeof v === 'string' ? v : '');
const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const bool = (v) => v === true;
const strArr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

const PROFILE_KEYS = ['name', 'phone', 'email', 'city', 'website', 'github', 'summary'];

export function normalizeProfile(p) {
  const src = obj(p);
  const out = {};
  for (const k of PROFILE_KEYS) out[k] = str(src[k]);
  return out;
}

export function defaultCategories() {
  return ['教育经历', '实习与工作', '项目经历', '技能与证书'].map((name, i) => ({
    id: `cat-${i + 1}`,
    name,
    order: i,
  }));
}

export function normalizeCategory(c, i) {
  const src = obj(c);
  return {
    id: str(src.id) || uid(),
    name: str(src.name) || '未命名分类',
    order: num(src.order, i),
  };
}

// 经历 = 事实。只记录真实发生过的事，不存任何改写版本。
export function normalizeExperience(e) {
  const src = obj(e);
  return {
    id: str(src.id) || uid(),
    categoryId: str(src.categoryId),
    title: str(src.title),
    role: str(src.role),
    startDate: str(src.startDate),
    endDate: str(src.endDate),
    location: str(src.location),
    bullets: strArr(src.bullets),
    tags: strArr(src.tags),
    order: num(src.order, 0),
  };
}

// 简历条目 = 引用一段经历 + 可选的本简历专用说法。
// bulletsOverride 为 null 表示沿用档案里的原始事实。
export function normalizeResumeItem(it, i) {
  const src = obj(it);
  const override = strArr(src.bulletsOverride);
  return {
    experienceId: str(src.experienceId),
    order: num(src.order, i),
    bulletsOverride: override.length ? override : null,
  };
}

export function normalizeResume(r) {
  const src = obj(r);
  const items = (Array.isArray(src.items) ? src.items : []).map(normalizeResumeItem);
  return {
    id: str(src.id) || uid(),
    name: str(src.name) || '未命名简历',
    summaryOverride: typeof src.summaryOverride === 'string' ? src.summaryOverride : null,
    targetJd: str(src.targetJd),
    items,
    revisions: (Array.isArray(src.revisions) ? src.revisions : [])
      .map((v) => ({
        id: str(obj(v).id) || uid(),
        date: num(obj(v).date, Date.now()),
        label: str(obj(v).label) || '快照',
        resume: obj(obj(v).resume),
      }))
      .slice(-30),
    createdAt: num(src.createdAt, Date.now()),
    updatedAt: num(src.updatedAt, Date.now()),
  };
}

function normalizeKnowledgePoint(p) {
  const src = obj(p);
  return {
    id: str(src.id) || uid(),
    name: str(src.name),
    category: str(src.category) || '其他',
    priority: ['必学', '加分', '了解'].includes(src.priority) ? src.priority : '了解',
    reason: str(src.reason),
    topics: strArr(src.topics),
  };
}

function normalizeInterviewQuestion(p) {
  const src = obj(p);
  return {
    id: str(src.id) || uid(),
    question: str(src.question),
    type: ['技术', '项目', '行为', '其他'].includes(src.type) ? src.type : '其他',
    reason: str(src.reason),
    points: strArr(src.points),
  };
}

function normalizeInterviewRecord(r) {
  const src = obj(r);
  return {
    id: str(src.id) || uid(),
    date: str(src.date),
    stage: str(src.stage),
    asked: str(src.asked),
    performance: str(src.performance),
    note: str(src.note),
  };
}

export function normalizeApplication(a) {
  const src = obj(a);
  const stage = STAGES.includes(src.stage) ? src.stage : '待投递';
  const priority = PRIORITIES.includes(src.priority) ? src.priority : '普通';
  const snapshot = obj(src.snapshot);
  return {
    id: str(src.id) || uid(),
    company: str(src.company),
    position: str(src.position),
    city: str(src.city),
    salary: str(src.salary),
    source: str(src.source),
    url: str(src.url),
    logo: str(src.logo),
    jd: str(src.jd),
    stage,
    priority,
    appliedDate: str(src.appliedDate),
    scheduleAt: str(src.scheduleAt),
    scheduleNote: str(src.scheduleNote),
    nextAction: str(src.nextAction),
    notes: str(src.notes),
    resumeId: str(src.resumeId),
    learning: (Array.isArray(src.learning) ? src.learning : []).map(normalizeKnowledgePoint),
    learningGeneratedAt: num(src.learningGeneratedAt, 0),
    interviewPrep: (Array.isArray(src.interviewPrep) ? src.interviewPrep : []).map(normalizeInterviewQuestion),
    interviewPrepAt: num(src.interviewPrepAt, 0),
    interviews: (Array.isArray(src.interviews) ? src.interviews : []).map(normalizeInterviewRecord),
    createdAt: num(src.createdAt, Date.now()),
    updatedAt: num(src.updatedAt, Date.now()),
    archived: bool(src.archived),
    history: (Array.isArray(src.history) ? src.history : []).map((h) => ({
      date: num(obj(h).date, Date.now()),
      text: str(obj(h).text),
    })),
    // 投递快照：冻结当时的完整简历副本，之后改档案不影响它
    snapshot: snapshot.resume
      ? {
          date: num(snapshot.date, Date.now()),
          resume: obj(snapshot.resume),
          experiences: Array.isArray(snapshot.experiences) ? snapshot.experiences.map(normalizeExperience) : [],
          categories: (Array.isArray(snapshot.categories) ? snapshot.categories : []).map(normalizeCategory),
          profile: normalizeProfile(snapshot.profile),
        }
      : null,
  };
}

export function normalizeData(raw) {
  const d = obj(raw);
  const categories = (Array.isArray(d.categories) && d.categories.length
    ? d.categories
    : defaultCategories()
  ).map(normalizeCategory);
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: normalizeProfile(d.profile),
    categories,
    experiences: (Array.isArray(d.experiences) ? d.experiences : []).map(normalizeExperience),
    resumes: (Array.isArray(d.resumes) ? d.resumes : []).map(normalizeResume),
    applications: (Array.isArray(d.applications) ? d.applications : []).map(normalizeApplication),
    knowledgeStatus: Object.fromEntries(
      Object.entries(obj(d.knowledgeStatus)).map(([k, v]) => [
        k,
        ['待学习', '学习中', '已掌握'].includes(v) ? v : '待学习',
      ])
    ),
  };
}

// 未来结构升级时，在这里按 schemaVersion 逐级转换，最后统一走 normalizeData。
export function migrate(raw) {
  return normalizeData(raw);
}

export function emptyData() {
  return normalizeData({});
}
