import { useEffect, useMemo, useState } from 'react';
import { useData } from '../App';
import type { AppData, Application, ApplicationStage, InterviewQuestion, InterviewQuestionType, InterviewRecord, KnowledgePoint, KnowledgePriority, Snapshot } from '../types';
import { STAGES } from '../types';
import { bulletsFor, localDate, safeUrl, uid, formatTime } from '../util';
import { callAi } from '../api';
import { exportResumeDocx } from '../docx';
import Modal from '../components/Modal';
import Icon from '../components/Icon';

/** 阶段配色，与 styles.css 的 .tone-* 一一对应 */
const STAGE_TONE: Record<ApplicationStage, string> = {
  待投递: 'slate',
  已投递: 'blue',
  笔试: 'amber',
  一面: 'teal',
  二面: 'violet',
  HR面: 'pink',
  Offer: 'green',
  已结束: 'red',
};

/** 面试问题类型配色 */
const QUESTION_TONE: Record<InterviewQuestionType, string> = {
  技术: 'teal',
  项目: 'violet',
  行为: 'amber',
  其他: 'slate',
};

/** 用公司名生成稳定的头像配色，避免每次渲染都在跳 */
function avatarTone(name: string) {
  let n = 0;
  for (let i = 0; i < name.length; i++) n = (n * 31 + name.charCodeAt(i)) % 997;
  return `t${(n % 8) + 1}`;
}

/** 归一化到主域名，去掉 hr/careers/www 等子域，提高 favicon 命中率 */
function rootDomain(host: string): string {
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  const last2 = parts.slice(-2).join('.');
  const doubleSuffix = ['com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'co.uk', 'com.hk', 'co.jp'];
  if (doubleSuffix.includes(last2) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return last2;
}

/** 公司头像：优先手动上传的 logo；否则走本地 /api/logo（服务端抓取后缓存到 data/logos，只发域名不发简历内容），失败退回首字 */
function CompanyAvatar({ name, url, logo }: { name: string; url: string; logo?: string }) {
  const [failed, setFailed] = useState(false);
  const domain = useMemo(() => {
    try {
      return rootDomain(new URL(url).hostname);
    } catch {
      return '';
    }
  }, [url]);
  useEffect(() => {
    setFailed(false);
  }, [domain]);
  if (logo) {
    return <img className="avatar-logo" src={logo} alt="" />;
  }
  if (domain && !failed) {
    return (
      <img
        className="avatar-logo"
        src={`/api/logo?domain=${encodeURIComponent(domain)}`}
        onError={() => setFailed(true)}
        alt=""
      />
    );
  }
  return <span className={`avatar ${avatarTone(name)}`}>{(name || '?').slice(0, 1)}</span>;
}

function blank(): Application {
  return {
    id: uid(),
    company: '',
    position: '',
    city: '',
    salary: '',
    source: '',
    url: '',
    logo: '',
    jd: '',
    stage: '待投递',
    priority: '普通',
    appliedDate: '',
    scheduleAt: '',
    scheduleNote: '',
    nextAction: '',
    notes: '',
    resumeId: '',
    learning: [],
    learningGeneratedAt: 0,
    interviewPrep: [],
    interviewPrepAt: 0,
    interviews: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    archived: false,
    history: [],
    snapshot: null,
  };
}

export default function TrackerView() {
  const { data, update, goResume, goLearn } = useData();
  const [editing, setEditing] = useState<Application | null>(null);
  const [detailId, setDetailId] = useState('');
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('全部');
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [learningBusy, setLearningBusy] = useState('');
  const [prepBusy, setPrepBusy] = useState('');
  const [reviewForm, setReviewForm] = useState<InterviewRecord | null>(null);
  const [expandedPrep, setExpandedPrep] = useState<Set<string>>(new Set());

  const active = data.applications.filter((a) => !a.archived);
  const detail = data.applications.find((a) => a.id === detailId);

  const filtered = data.applications
    .filter((a) => !!a.archived === showArchived)
    .filter((a) => stageFilter === '全部' || a.stage === stageFilter)
    .filter((a) => `${a.company} ${a.position} ${a.city} ${a.source}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const stats: { label: string; value: number; foot: string; icon: string; tone: string }[] = [
    {
      label: '投递总数',
      value: active.filter((a) => a.appliedDate).length,
      foot: `共 ${active.length} 个岗位`,
      icon: 'inbox',
      tone: 'blue',
    },
    {
      label: '进行中',
      value: active.filter((a) => ['笔试', '一面', '二面', 'HR面'].includes(a.stage)).length,
      foot: '笔试 / 面试环节',
      icon: 'clock',
      tone: 'amber',
    },
    {
      label: 'Offer',
      value: active.filter((a) => a.stage === 'Offer').length,
      foot: '已收获意向',
      icon: 'trophy',
      tone: 'green',
    },
    {
      label: '待办安排',
      value: active.filter((a) => a.scheduleAt && a.stage !== '已结束').length,
      foot: '已排定时间',
      icon: 'bell',
      tone: 'violet',
    },
  ];

  const stageCounts = STAGES.map((s) => ({
    stage: s,
    tone: STAGE_TONE[s],
    count: active.filter((a) => a.stage === s).length,
  }));

  function save() {
    if (!editing) return;
    if (!editing.company.trim() || !editing.position.trim()) {
      setError('请填写公司名称与岗位名称');
      return;
    }
    if (editing.url && !safeUrl(editing.url)) {
      setError('岗位链接需要以 http:// 或 https:// 开头');
      return;
    }
    update((d) => {
      const old = d.applications.find((a) => a.id === editing.id);
      const record: Application = {
        ...editing,
        company: editing.company.trim(),
        position: editing.position.trim(),
        updatedAt: Date.now(),
        history: [...(old?.history || []), { date: Date.now(), text: old ? '编辑岗位信息' : '添加岗位' }],
      };
      return { ...d, applications: old ? d.applications.map((a) => (a.id === record.id ? record : a)) : [...d.applications, record] };
    });
    setEditing(null);
    setError('');
  }

  function changeStage(a: Application, next: ApplicationStage) {
    if (a.stage === next) return;
    const entering = next !== '待投递' && next !== '已结束';
    const willCapture = entering && !a.snapshot && !!a.resumeId;
    update((d) => ({
      ...d,
      applications: d.applications.map((x) =>
        x.id === a.id
          ? {
              ...x,
              stage: next,
              updatedAt: Date.now(),
              appliedDate: entering && !x.appliedDate ? localDate() : x.appliedDate,
              snapshot: x.snapshot || (entering ? captureSnapshot(d, x.resumeId) : null),
              history: [...(x.history || []), { date: Date.now(), text: `阶段更新：${x.stage} → ${next}` }],
            }
          : x
      ),
    }));
    if (willCapture) {
      setToast('已自动保存本次投递的简历快照');
      setTimeout(() => setToast(''), 3000);
    }
  }

  function captureSnapshot(d: AppData, resumeId: string): Snapshot | null {
    const resume = d.resumes.find((r) => r.id === resumeId);
    if (!resume) return null;
    const ids = new Set(resume.items.map((i) => i.experienceId));
    return {
      date: Date.now(),
      resume: JSON.parse(JSON.stringify(resume)),
      experiences: JSON.parse(JSON.stringify(d.experiences.filter((e) => ids.has(e.id)))),
      categories: JSON.parse(JSON.stringify(d.categories)),
      profile: JSON.parse(JSON.stringify(d.profile)),
    };
  }

  function generateLearning(a: Application) {
    if (!a.jd.trim()) {
      setError('请先填写职位描述 JD');
      return;
    }
    setLearningBusy(a.id);
    setError('');
    const valid: KnowledgePriority[] = ['必学', '加分', '了解'];
    callAi<{ points: KnowledgePoint[] }>('learn', { jd: a.jd, position: a.position })
      .then((res) => {
        const points = (res.points || [])
          .map((p) => ({
            id: uid(),
            name: String(p.name || '').trim(),
            category: String(p.category || '其他'),
            priority: (valid.includes(p.priority) ? p.priority : '了解') as KnowledgePriority,
            reason: String(p.reason || ''),
            topics: (Array.isArray(p.topics) ? p.topics : []).map((t) => String(t).trim()).filter(Boolean),
          }))
          .filter((p) => p.name);
        update((d) => ({
          ...d,
          applications: d.applications.map((x) =>
            x.id === a.id ? { ...x, learning: points, learningGeneratedAt: Date.now() } : x
          ),
        }));
        setToast(`已生成 ${points.length} 个知识点`);
        setTimeout(() => setToast(''), 3000);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLearningBusy(''));
  }

  function buildResumeText(a: Application): string {
    const resume = data.resumes.find((r) => r.id === a.resumeId);
    if (!resume) return '';
    const parts: string[] = [];
    const summary = (resume.summaryOverride ?? data.profile.summary).trim();
    if (summary) parts.push(`个人简介：${summary}`);
    for (const item of resume.items) {
      const exp = data.experiences.find((e) => e.id === item.experienceId);
      if (!exp) continue;
      parts.push(`【${exp.title}${exp.role ? ' · ' + exp.role : ''}】${bulletsFor(exp, item).join('；')}`);
    }
    return parts.join('\n');
  }

  function generateInterview(a: Application) {
    if (!a.jd.trim()) {
      setError('请先填写职位描述 JD');
      return;
    }
    setPrepBusy(a.id);
    setError('');
    const valid: InterviewQuestionType[] = ['技术', '项目', '行为', '其他'];
    callAi<{ questions: InterviewQuestion[] }>('interview', { jd: a.jd, position: a.position, resumeText: buildResumeText(a) })
      .then((res) => {
        const questions = (res.questions || [])
          .map((q) => ({
            id: uid(),
            question: String(q.question || '').trim(),
            type: (valid.includes(q.type) ? q.type : '其他') as InterviewQuestionType,
            reason: String(q.reason || ''),
            points: (Array.isArray(q.points) ? q.points : []).map((s) => String(s).trim()).filter(Boolean),
          }))
          .filter((q) => q.question);
        update((d) => ({
          ...d,
          applications: d.applications.map((x) =>
            x.id === a.id ? { ...x, interviewPrep: questions, interviewPrepAt: Date.now() } : x
          ),
        }));
        setToast(`已生成 ${questions.length} 个面试问题`);
        setTimeout(() => setToast(''), 3000);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setPrepBusy(''));
  }

  function togglePrepExpand(id: string) {
    setExpandedPrep((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function saveReview() {
    if (!reviewForm || !detail) return;
    if (!reviewForm.date && !reviewForm.asked.trim()) {
      setError('至少填写面试日期或「被问了什么」');
      return;
    }
    update((d) => ({
      ...d,
      applications: d.applications.map((x) =>
        x.id === detail.id ? { ...x, interviews: [...x.interviews, reviewForm], updatedAt: Date.now() } : x
      ),
    }));
    setReviewForm(null);
    setToast('已保存面试复盘');
    setTimeout(() => setToast(''), 3000);
  }

  function deleteReview(id: string) {
    if (!detail) return;
    update((d) => ({
      ...d,
      applications: d.applications.map((x) =>
        x.id === detail.id ? { ...x, interviews: x.interviews.filter((r) => r.id !== id) } : x
      ),
    }));
  }

  function toggleArchive(a: Application) {
    update((d) => ({
      ...d,
      applications: d.applications.map((x) =>
        x.id === a.id
          ? { ...x, archived: !x.archived, updatedAt: Date.now(), history: [...(x.history || []), { date: Date.now(), text: x.archived ? '恢复记录' : '归档记录' }] }
          : x
      ),
    }));
    setDetailId('');
  }

  /** 带着 JD 去准备/打开一份简历 */
  function prepareResume(a: Application) {
    const linked = data.resumes.find((r) => r.id === a.resumeId);
    if (linked) {
      update((d) => ({
        ...d,
        resumes: d.resumes.map((r) => (r.id === linked.id ? { ...r, targetJd: a.jd || r.targetJd } : r)),
      }));
      goResume(linked.id);
      return;
    }
    const r = {
      id: uid(),
      name: `${a.company} · ${a.position}`,
      summaryOverride: null,
      targetJd: a.jd,
      items: data.experiences.map((e, i) => ({ experienceId: e.id, order: i, bulletsOverride: null as string[] | null })),
      revisions: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    update((d) => ({
      ...d,
      resumes: [...d.resumes, r],
      applications: d.applications.map((x) =>
        x.id === a.id ? { ...x, resumeId: r.id, updatedAt: Date.now(), history: [...(x.history || []), { date: Date.now(), text: '创建岗位定制简历' }] } : x
      ),
    }));
    setDetailId('');
    goResume(r.id);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>投递记录</h1>
          <div className="sub">推进到招聘流程时会自动冻结一份简历快照，之后改简历不影响这次投递的记录。</div>
        </div>
        <button className="btn primary" onClick={() => { setEditing(blank()); setError(''); }}>
          <Icon name="plus" size={15} /> 添加岗位
        </button>
      </div>

      <div className="stat-grid">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <div>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value">{s.value}</div>
              <div className="stat-foot">{s.foot}</div>
            </div>
            <div className={`stat-icon ${s.tone}`}>
              <Icon name={s.icon} size={18} />
            </div>
          </div>
        ))}
      </div>

      {active.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <h3>投递阶段分布</h3>
            <span className="muted">点一下可按阶段筛选</span>
          </div>
          <div className="stage-bar">
            {stageCounts.map((s) => (
              <button
                key={s.stage}
                className={`stage-chip tone-${s.tone}${stageFilter === s.stage ? ' on' : ''}`}
                onClick={() => setStageFilter((cur) => (cur === s.stage ? '全部' : s.stage))}
                title={`只看「${s.stage}」`}
              >
                <div className="sc-label">{s.stage}</div>
                <div className="sc-num">{s.count}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <input style={{ width: 240 }} placeholder="搜索公司、岗位、城市" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select style={{ width: 140 }} value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
            <option>全部</option>
            {STAGES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            查看归档
          </label>
        </div>

        {!filtered.length ? (
          <div className="empty">
            <h3>{data.applications.length ? '没有符合条件的记录' : '从第一个心仪岗位开始'}</h3>
            <p>{data.applications.length ? '换个关键词，或看看归档记录。' : '记下公司和岗位，保存 JD，再为它准备一份简历。'}</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>公司 / 岗位</th>
                <th>阶段</th>
                <th>投递日期</th>
                <th>下次安排</th>
                <th style={{ width: 170 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="company-cell">
                      <CompanyAvatar key={a.id} name={a.company} url={a.url} logo={a.logo} />
                      <div>
                        <button className="btn ghost" style={{ padding: 0 }} onClick={() => setDetailId(a.id)}>
                          <strong>{a.company}</strong>
                        </button>
                        <div className="muted">{a.position}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`stage-badge tone-${STAGE_TONE[a.stage]}`}>{a.stage}</span>
                    <select
                      style={{ width: 104, marginTop: 6 }}
                      value={a.stage}
                      onChange={(e) => changeStage(a, e.target.value as ApplicationStage)}
                    >
                      {STAGES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td>{a.appliedDate || '—'}</td>
                  <td>
                    {(a.scheduleAt || '').replace('T', ' ') || '—'}
                    {a.scheduleNote && <div className="muted">{a.scheduleNote}</div>}
                  </td>
                  <td>
                    <div className="toolbar">
                      {a.learning.length > 0 && (
                        <button className="btn small ghost" title="学习计划" onClick={goLearn}>
                          📚 {a.learning.length}
                        </button>
                      )}
                      <button className="btn small" onClick={() => setDetailId(a.id)}>
                        详情
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <Modal
          title={data.applications.some((a) => a.id === editing.id) ? '编辑岗位' : '添加岗位'}
          onClose={() => setEditing(null)}
          width={760}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>
                取消
              </button>
              <button className="btn primary" onClick={save}>
                保存
              </button>
            </>
          }
        >
          <div className="form-grid">
            <label className="field">
              <span>公司名称 *</span>
              <input value={editing.company} onChange={(e) => setEditing({ ...editing, company: e.target.value })} />
            </label>
            <label className="field">
              <span>岗位名称 *</span>
              <input value={editing.position} onChange={(e) => setEditing({ ...editing, position: e.target.value })} />
            </label>
            <label className="field">
              <span>城市</span>
              <input value={editing.city} onChange={(e) => setEditing({ ...editing, city: e.target.value })} />
            </label>
            <label className="field">
              <span>薪资范围</span>
              <input value={editing.salary} onChange={(e) => setEditing({ ...editing, salary: e.target.value })} placeholder="如 200-300/天" />
            </label>
            <label className="field">
              <span>投递渠道</span>
              <input value={editing.source} onChange={(e) => setEditing({ ...editing, source: e.target.value })} placeholder="官网 / 内推 / BOSS直聘" />
            </label>
            <label className="field">
              <span>岗位链接</span>
              <input value={editing.url} onChange={(e) => setEditing({ ...editing, url: e.target.value })} placeholder="https://" />
            </label>
            <label className="field span-2">
              <span>公司 Logo（可选，覆盖自动抓取的图标）</span>
              <div className="logo-picker">
                {editing.logo ? (
                  <img className="avatar-logo" src={editing.logo} alt="" />
                ) : (
                  <span className="avatar">{(editing.company || '?').slice(0, 1)}</span>
                )}
                <label className="btn small">
                  上传图片
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => setEditing((ed) => (ed ? { ...ed, logo: String(reader.result) } : ed));
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                  />
                </label>
                {editing.logo && (
                  <button className="btn small ghost" onClick={() => setEditing({ ...editing, logo: '' })}>
                    移除
                  </button>
                )}
              </div>
            </label>
            <label className="field">
              <span>投递日期</span>
              <input type="date" value={editing.appliedDate} onChange={(e) => setEditing({ ...editing, appliedDate: e.target.value })} />
            </label>
            <label className="field">
              <span>安排时间</span>
              <input type="datetime-local" value={editing.scheduleAt} onChange={(e) => setEditing({ ...editing, scheduleAt: e.target.value })} />
            </label>
            <label className="field">
              <span>招聘阶段</span>
              <select value={editing.stage} onChange={(e) => setEditing({ ...editing, stage: e.target.value as ApplicationStage })}>
                {STAGES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>优先级</span>
              <select value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: e.target.value as Application['priority'] })}>
                {['重点', '普通', '备选'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="field span-2">
              <span>安排事项</span>
              <input value={editing.scheduleNote} onChange={(e) => setEditing({ ...editing, scheduleNote: e.target.value })} placeholder="如 笔试 / 一面" />
            </label>
            <label className="field span-2">
              <span>下一步行动</span>
              <input value={editing.nextAction} onChange={(e) => setEditing({ ...editing, nextAction: e.target.value })} />
            </label>
            <label className="field span-2">
              <span>关联简历</span>
              <select value={editing.resumeId} onChange={(e) => setEditing({ ...editing, resumeId: e.target.value })}>
                <option value="">暂不关联</option>
                {data.resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field span-2">
              <span>职位描述 JD</span>
              <textarea rows={5} value={editing.jd} onChange={(e) => setEditing({ ...editing, jd: e.target.value })} placeholder="粘贴岗位职责与要求，准备简历时会带过去" />
            </label>
            <label className="field span-2">
              <span>沟通记录 / 备注</span>
              <textarea rows={3} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </label>
          </div>
          {error && <div className="error-text" style={{ marginTop: 10 }}>{error}</div>}
        </Modal>
      )}

      {detail && (
        <div className="modal-overlay" onClick={() => setDetailId('')}>
          <aside className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{detail.company}</h2>
                <div className="muted">
                  {detail.position}
                  {detail.city && ` · ${detail.city}`}
                </div>
              </div>
              <button className="icon-btn" onClick={() => setDetailId('')} aria-label="关闭">
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="toolbar" style={{ marginBottom: 14 }}>
                <span className={`stage-badge tone-${STAGE_TONE[detail.stage]}`}>{detail.stage}</span>
                <span className="badge">{detail.priority}</span>
                <button className="btn small" onClick={() => { setEditing({ ...detail }); setDetailId(''); }}>
                  编辑
                </button>
                <button className="btn small" onClick={() => toggleArchive(detail)}>
                  {detail.archived ? '恢复' : '归档'}
                </button>
              </div>

              <div className="grid-2" style={{ marginBottom: 14 }}>
                <div className="muted">薪资：{detail.salary || '待确认'}</div>
                <div className="muted">渠道：{detail.source || '未填写'}</div>
                <div className="muted">投递：{detail.appliedDate || '尚未投递'}</div>
                <div className="muted">下一步：{detail.nextAction || '未填写'}</div>
              </div>
              {safeUrl(detail.url) && (
                <p>
                  <a href={safeUrl(detail.url)} target="_blank" rel="noreferrer">
                    打开原始岗位 ↗
                  </a>
                </p>
              )}
              {detail.jd && (
                <div className="card" style={{ marginBottom: 14 }}>
                  <strong>职位描述</strong>
                  <p style={{ marginTop: 6, whiteSpace: 'pre-wrap', fontSize: 13 }}>{detail.jd}</p>
                </div>
              )}

              <div className="card" style={{ marginBottom: 14 }}>
                <strong>简历准备</strong>
                <p className="muted" style={{ marginTop: 4 }}>
                  关联：{data.resumes.find((r) => r.id === detail.resumeId)?.name || '尚未关联'}
                </p>
                <div className="toolbar" style={{ marginTop: 8 }}>
                  <button className="btn primary small" onClick={() => prepareResume(detail)}>
                    准备这份简历
                  </button>
                  <button
                    className="btn small"
                    disabled={!data.resumes.some((r) => r.id === detail.resumeId)}
                    onClick={() =>
                      update((d) => ({
                        ...d,
                        applications: d.applications.map((x) =>
                          x.id === detail.id
                            ? { ...x, snapshot: captureSnapshot(d, x.resumeId), updatedAt: Date.now(), history: [...(x.history || []), { date: Date.now(), text: '保存投递快照' }] }
                            : x
                        ),
                      }))
                    }
                  >
                    保存投递快照
                  </button>
                </div>
                {detail.snapshot && (
                  <div style={{ marginTop: 10 }}>
                    <p className="muted">已保存快照 · {formatTime(detail.snapshot.date)}</p>
                    <button
                      className="btn small"
                      onClick={() =>
                        exportResumeDocx(detail.snapshot!.resume, detail.snapshot!.categories, detail.snapshot!.experiences, detail.snapshot!.profile).catch((e) => setError(e.message))
                      }
                    >
                      导出当时的简历
                    </button>
                  </div>
                )}
              </div>

              <div className="card" style={{ marginBottom: 14 }}>
                <strong>学习计划</strong>
                {detail.learning.length > 0 ? (
                  <>
                    <p className="muted" style={{ marginTop: 4 }}>
                      已生成 {detail.learning.length} 个知识点
                    </p>
                    <div className="tag-row" style={{ marginTop: 8 }}>
                      {detail.learning.slice(0, 8).map((p) => (
                        <span className="tag" key={p.id}>
                          {p.name}
                        </span>
                      ))}
                      {detail.learning.length > 8 && <span className="muted">…</span>}
                    </div>
                    <div className="toolbar" style={{ marginTop: 8 }}>
                      <button
                        className="btn small"
                        onClick={() => {
                          setDetailId('');
                          goLearn();
                        }}
                      >
                        去学习中心
                      </button>
                      <button className="btn small" disabled={learningBusy === detail.id} onClick={() => generateLearning(detail)}>
                        {learningBusy === detail.id ? '生成中…' : '重新生成'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="muted" style={{ marginTop: 4 }}>
                      {detail.jd.trim() ? '还没有学习计划，点下方按钮从 JD 生成。' : '先填写职位描述 JD，再生成学习计划。'}
                    </p>
                    <button
                      className="btn primary small"
                      style={{ marginTop: 8 }}
                      disabled={!detail.jd.trim() || learningBusy === detail.id}
                      onClick={() => generateLearning(detail)}
                    >
                      {learningBusy === detail.id ? '生成中…' : '生成学习计划'}
                    </button>
                  </>
                )}
              </div>

              <div className="card" style={{ marginBottom: 14 }}>
                <strong>面试准备</strong>
                {detail.interviewPrep.length > 0 ? (
                  <>
                    <p className="muted" style={{ marginTop: 4 }}>
                      已生成 {detail.interviewPrep.length} 个问题
                    </p>
                    <div style={{ marginTop: 6 }}>
                      {detail.interviewPrep.map((q) => {
                        const open = expandedPrep.has(q.id);
                        return (
                          <div key={q.id} className="prep-q">
                            <div className="prep-q-head" style={{ cursor: 'pointer' }} onClick={() => togglePrepExpand(q.id)}>
                              <span className={`badge ${QUESTION_TONE[q.type]}`}>{q.type}</span>
                              <span className="prep-q-text">{q.question}</span>
                              {q.points.length > 0 && <span className="expand-caret">{open ? '▾' : '▸'}</span>}
                            </div>
                            {q.reason && (
                              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                                {q.reason}
                              </div>
                            )}
                            {open && q.points.length > 0 && (
                              <ul className="card-bullets" style={{ marginTop: 6 }}>
                                {q.points.map((pt, i) => (
                                  <li key={i}>{pt}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <button className="btn small" style={{ marginTop: 8 }} disabled={prepBusy === detail.id} onClick={() => generateInterview(detail)}>
                      {prepBusy === detail.id ? '生成中…' : '重新生成'}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="muted" style={{ marginTop: 4 }}>
                      {detail.jd.trim() ? '进面后点下方按钮，AI 会根据 JD 和简历生成可能被问到的问题。' : '先填写职位描述 JD，再生成面试问题。'}
                    </p>
                    {detail.jd.trim() && !data.resumes.some((r) => r.id === detail.resumeId) && (
                      <p className="muted" style={{ marginTop: 4 }}>
                        提示：关联简历后可生成「项目深挖」类问题。
                      </p>
                    )}
                    <button
                      className="btn primary small"
                      style={{ marginTop: 8 }}
                      disabled={!detail.jd.trim() || prepBusy === detail.id}
                      onClick={() => generateInterview(detail)}
                    >
                      {prepBusy === detail.id ? '生成中…' : '生成面试准备'}
                    </button>
                  </>
                )}
              </div>

              <div className="card" style={{ marginBottom: 14 }}>
                <div className="card-head">
                  <strong>面试复盘</strong>
                  <button className="btn small" onClick={() => setReviewForm({ id: uid(), date: '', stage: '', asked: '', performance: '', note: '' })}>
                    记录一次复盘
                  </button>
                </div>
                {detail.interviews.length === 0 ? (
                  <p className="muted" style={{ marginTop: 4 }}>
                    面试完记几行：问了什么、答得如何、下次注意什么。
                  </p>
                ) : (
                  <div style={{ marginTop: 6 }}>
                    {[...detail.interviews].reverse().map((r) => (
                      <div className="review-item" key={r.id}>
                        <div className="review-head">
                          <span>
                            {r.stage || '面试'} · {r.date || '未填日期'}
                          </span>
                          <button className="icon-btn danger" title="删除" onClick={() => deleteReview(r.id)}>
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                        {r.asked && (
                          <div className="muted" style={{ marginTop: 6 }}>
                            <strong>被问了：</strong>
                            {r.asked}
                          </div>
                        )}
                        {r.performance && (
                          <div className="muted" style={{ marginTop: 4 }}>
                            <strong>表现：</strong>
                            {r.performance}
                          </div>
                        )}
                        {r.note && (
                          <div className="muted" style={{ marginTop: 4 }}>
                            <strong>下次注意：</strong>
                            {r.note}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {detail.notes && (
                <div className="card" style={{ marginBottom: 14 }}>
                  <strong>备注</strong>
                  <p style={{ marginTop: 6, whiteSpace: 'pre-wrap', fontSize: 13 }}>{detail.notes}</p>
                </div>
              )}

              <div>
                <strong style={{ fontSize: 13 }}>进展时间线</strong>
                <div style={{ marginTop: 8 }}>
                  {[...(detail.history || [])].reverse().map((h, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                      <span>{h.text}</span>
                      <span className="muted">{formatTime(h.date)}</span>
                    </div>
                  ))}
                  {!detail.history?.length && <p className="muted">还没有进展记录。</p>}
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {reviewForm && (
        <Modal
          title="记录面试复盘"
          onClose={() => setReviewForm(null)}
          width={620}
          footer={
            <>
              <button className="btn" onClick={() => setReviewForm(null)}>
                取消
              </button>
              <button className="btn primary" onClick={saveReview}>
                保存
              </button>
            </>
          }
        >
          <div className="form-grid">
            <label className="field">
              <span>面试日期</span>
              <input type="date" value={reviewForm.date} onChange={(e) => setReviewForm({ ...reviewForm, date: e.target.value })} />
            </label>
            <label className="field">
              <span>面试轮次</span>
              <input value={reviewForm.stage} onChange={(e) => setReviewForm({ ...reviewForm, stage: e.target.value })} placeholder="如 一面 / 二面 / HR面" />
            </label>
            <label className="field span-2">
              <span>被问了什么</span>
              <textarea rows={4} value={reviewForm.asked} onChange={(e) => setReviewForm({ ...reviewForm, asked: e.target.value })} placeholder="面试官问了哪些问题" />
            </label>
            <label className="field span-2">
              <span>答得怎么样</span>
              <textarea rows={3} value={reviewForm.performance} onChange={(e) => setReviewForm({ ...reviewForm, performance: e.target.value })} placeholder="哪里答得好、哪里卡壳" />
            </label>
            <label className="field span-2">
              <span>下次注意</span>
              <textarea rows={2} value={reviewForm.note} onChange={(e) => setReviewForm({ ...reviewForm, note: e.target.value })} placeholder="下次要补的知识点或改进" />
            </label>
          </div>
        </Modal>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
