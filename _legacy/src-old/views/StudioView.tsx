import { useRef, useState } from 'react';
import { useData, newResume } from '../store';
import { Resume, EntryOverride } from '../types';
import { resolveEntry, dateRange, uid } from '../util';
import { aiReview, ReviewSuggestion } from '../api';
import { exportResumeDocx } from '../docx';
import UploadModal from '../components/UploadModal';

export default function StudioView({ initialResumeId = '' }: { initialResumeId?: string }) {
  const { data, update } = useData();
  const [selected, setSelected] = useState(initialResumeId);
  const [active, setActive] = useState('');
  const [upload, setUpload] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<ReviewSuggestion[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<'coach' | 'history'>('coach');
  const resume = data.resumes.find(r => r.id === selected) || data.resumes[0];
  const included = resume?.sections.flatMap(s => s.entryIds) || [];
  const entries = included.map(id => data.entries.find(e => e.id === id)).filter((e): e is typeof data.entries[number] => !!e);
  const focused = entries.find(e => e.id === active) || entries[0];
  const reviewContext = JSON.stringify({ id: resume?.id, jd: resume?.targetJd, evidence: resume?.evidence, entries: entries.map(e => ({ id: e.id, ...resolveEntry(e, resume?.directionId, resume?.overrides?.[e.id]) })) });
  const latestContext = useRef(reviewContext);
  latestContext.current = reviewContext;
  function change(fn: (r: Resume) => Resume) {
    if (!resume) return;
    update(d => ({ ...d, resumes: d.resumes.map(r => r.id === resume.id ? { ...fn(r), updatedAt: Date.now() } : r) }));
  }
  function create() {
    const r = newResume(data.personalInfo);
    r.name = '我的求职简历';
    r.sections = [...data.categories].sort((a,b) => a.order-b.order).map(c => ({ categoryId: c.id, entryIds: data.entries.filter(e => e.categoryId === c.id).sort((a,b) => a.order-b.order).map(e => e.id) })).filter(s => s.entryIds.length);
    update(d => ({ ...d, resumes: [...d.resumes, r] }));
    setSelected(r.id); setSuggestions([]); setDrafts({});
  }
  function snapshot(r: Resume, label: string) {
    return [...(r.revisions || []), { id: uid(), date: Date.now(), label, overrides: JSON.parse(JSON.stringify(r.overrides || {})), summary: r.summaryOverride ?? r.personalInfo.summary }].slice(-30);
  }
  function editEntry(id: string, override: EntryOverride, label: string) {
    change(r => ({ ...r, revisions: snapshot(r, label), overrides: { ...r.overrides, [id]: { ...r.overrides?.[id], ...override } } }));
    setSuggestions(s => s.filter(x => x.entryId !== id));
  }
  async function diagnose() {
    if (!resume || !entries.length) return;
    const requestedContext = reviewContext;
    setBusy(true); setError(''); setSuggestions([]);
    try {
      const result = await aiReview(resume.targetJd || '', entries.map(e => ({ id: e.id, ...resolveEntry(e, resume.directionId, resume.overrides?.[e.id]) })), resume.evidence || {});
      if (latestContext.current !== requestedContext) { setError('诊断期间简历内容发生了变化，请重新诊断当前版本。'); return; }
      setSuggestions(result.suggestions); setDrafts({});
      if (!result.suggestions.length) setError('本次没有发现需要修改的经历问题。仍建议核对联系方式、岗位要求和导出排版。');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const suggestion = suggestions.find(s => s.entryId === focused?.id);
  return <div className="studio">
    <div className="studio-heading"><div><div className="eyebrow">YOUR NEXT CHAPTER</div><h1>让经历，成为你的优势。</h1><p>从真实经历出发，为下一个机会准备好简历。</p></div><div className="toolbar"><button className="btn" onClick={() => setUpload(true)}>导入简历</button><button className="btn primary" onClick={create}>＋ 新建简历</button></div></div>
    {upload && <UploadModal onClose={() => setUpload(false)} />}
    {!resume ? <div className="studio-welcome"><span className="welcome-mark">↗</span><h2>从你已有的经历开始</h2><p>先导入现有简历，再点击新建。我们会把素材组合成一份可以直接编辑的简历。</p><button className="btn primary" onClick={() => setUpload(true)}>导入我的简历</button><button className="btn" onClick={create}>使用现有素材开始</button><p className="muted">初始素材中的示例经历仅用于演示，请替换为自己的真实经历。</p></div> : <>
      <div className="studio-bar"><select aria-label="选择简历" value={resume.id} disabled={busy} onChange={e => { setSelected(e.target.value); setSuggestions([]); setActive(''); setDrafts({}); }} >{data.resumes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select><span className="save-indicator">● 自动保存到本机</span><button className="btn small" onClick={() => window.print()}>打印 / 保存 PDF</button><button className="btn small primary" onClick={() => exportResumeDocx(resume, data.categories, data.entries).catch(e => setError(e.message))}>导出 Word</button></div>
      <div className="studio-grid">
        <aside className="studio-outline"><div className="eyebrow">简历结构</div><input aria-label="简历名称" value={resume.name} onChange={e => change(r => ({ ...r, name: e.target.value }))} />{resume.sections.map(s => <div key={s.categoryId}><h4>{data.categories.find(c => c.id === s.categoryId)?.name}</h4>{s.entryIds.map(id => { const e = data.entries.find(x => x.id === id); return e && <button key={id} className={`outline-item ${focused?.id === id ? 'selected' : ''}`} onClick={() => setActive(id)}>{e.title}<span>{suggestions.some(x => x.entryId === id) ? '待优化' : e.role}</span></button>; })}</div>)}<p className="muted">在「简历组合」中添加、移除或排序经历。</p></aside>
        <section className="studio-document"><div className="document-caption">实时预览 · 点击内容直接编辑</div><article className="studio-paper">
          <input className="paper-name" aria-label="姓名" placeholder="你的姓名" value={resume.personalInfo.name} onChange={e => change(r => ({ ...r, personalInfo: { ...r.personalInfo, name: e.target.value } }))} />
          <div className="paper-contacts">{(['phone','email','city','website','github'] as const).map((key,i) => <input key={key} aria-label={['电话','邮箱','城市','个人网站','GitHub'][i]} placeholder={['电话','邮箱','城市','个人网站','GitHub'][i]} value={resume.personalInfo[key]} onChange={e => change(r => ({ ...r, personalInfo: { ...r.personalInfo, [key]: e.target.value } }))} />)}</div>
          <textarea aria-label="个人简介" className="paper-summary" placeholder="用两三句话介绍你的优势与求职方向" value={resume.summaryOverride ?? resume.personalInfo.summary} onChange={e => change(r => ({ ...r, summaryOverride: e.target.value }))} />
          <div className="print-summary">{resume.summaryOverride ?? resume.personalInfo.summary}</div>
          {resume.sections.map(s => <section key={s.categoryId}><h3>{data.categories.find(c => c.id === s.categoryId)?.name}</h3>{s.entryIds.map(id => { const e = data.entries.find(x => x.id === id); if (!e) return null; const c = resolveEntry(e, resume.directionId, resume.overrides?.[id]); return <div key={id} className={`paper-entry ${focused?.id === id ? 'focused' : ''}`} onClick={() => setActive(id)}><div className="paper-entry-head"><strong>{c.title} {c.role && `· ${c.role}`}</strong><span>{dateRange(e)}</span></div>{e.location && <div className="muted">{e.location}</div>}<textarea aria-label={`${c.title}的经历要点`} value={c.bullets.join('\n')} rows={Math.max(3,c.bullets.length * 2)} onChange={ev => { const bullets = ev.target.value.split('\n'); change(r => ({ ...r, overrides: { ...r.overrides, [id]: { ...r.overrides?.[id], bullets } } })); setSuggestions(ss => ss.filter(x => x.entryId !== id)); }} /><div className="print-bullets">{c.bullets.map((b,i) => <p key={i}>• {b}</p>)}</div></div>; })}</section>)}
          {!entries.length && <p className="muted">这份简历还没有经历，请到「简历组合」添加素材。</p>}
        </article></section>
        <aside className="studio-coach"><div className="coach-tabs"><button className={mode === 'coach' ? 'selected' : ''} onClick={() => setMode('coach')}>AI 简历教练</button><button className={mode === 'history' ? 'selected' : ''} onClick={() => setMode('history')}>修改记录</button></div>
          {mode === 'history' ? <><p className="muted">记录 AI 采纳与手动快照，保留最近 30 次。恢复前会保存当前内容。</p><button className="btn small" onClick={() => change(r => ({ ...r, revisions: snapshot(r, '手动保存') }))}>保存当前快照</button>{[...(resume.revisions || [])].reverse().map(v => <div className="history-card" key={v.id}><strong>{v.label}</strong><p>{new Date(v.date).toLocaleString('zh-CN')}</p><button className="btn small" onClick={() => { change(r => ({ ...r, revisions: snapshot(r, '恢复前的内容'), overrides: JSON.parse(JSON.stringify(v.overrides)), summaryOverride: v.summary })); setSuggestions([]); }}>恢复此版本</button></div>)}</> : <>
            <label className="field"><span>目标岗位 / JD</span><textarea placeholder="粘贴岗位要求，让建议更有针对性。也可以留空，先改善表达。" rows={5} disabled={busy} value={resume.targetJd || ''} onChange={e => { change(r => ({ ...r, targetJd: e.target.value })); setSuggestions([]); }} /></label><button className="btn primary full" disabled={busy || !entries.length} onClick={diagnose}>{busy ? '正在分析真实经历…' : '诊断简历并生成建议'}</button><p className="coach-note">调用 AI 时，相关简历内容和补充信息将发送给 DeepSeek。请先在设置中配置 API Key。</p>
            {error && <div className="error" role="status">{error}</div>}
            {focused && <div className="evidence-card"><div className="eyebrow">正在关注</div><h3>{focused.title}</h3><label className="field"><span>补充真实细节</span><textarea rows={4} disabled={busy} placeholder="你独立负责了什么？使用什么方法？交付了什么？有什么可以确认的结果？" value={resume.evidence?.[focused.id] || ''} onChange={e => { change(r => ({ ...r, evidence: { ...r.evidence, [focused.id]: e.target.value } })); setSuggestions(ss => ss.filter(x => x.entryId !== focused.id)); }} /></label><p className="muted">补充内容保存在这份简历中。补充后重新诊断，AI 会结合这些事实改写。</p></div>}
            {suggestion ? <div className="suggestion-card"><span className="suggestion-label">建议修改</span><h3>{suggestion.issue}</h3><p>{suggestion.reason}</p>{suggestion.questions.length > 0 && <div className="coach-questions"><strong>可以进一步补充</strong>{suggestion.questions.map((q,i) => <p key={i}>{i+1}. {q}</p>)}</div>}<h4>原文</h4><div className="before-text">{focused && resolveEntry(focused, resume.directionId, resume.overrides?.[focused.id]).bullets.map((b,i) => <p key={i}>{b}</p>)}</div><label className="field"><span>建议稿 · 可以继续编辑</span><textarea rows={8} value={drafts[suggestion.entryId] ?? suggestion.bullets.join('\n')} onChange={e => setDrafts(d => ({ ...d, [suggestion.entryId]: e.target.value }))} /></label><p className="muted">采纳前请核对事实，特别是技能、职责和结果。</p><div className="toolbar"><button className="btn primary" disabled={busy || !(drafts[suggestion.entryId] ?? suggestion.bullets.join('\n')).trim()} onClick={() => editEntry(suggestion.entryId, { bullets: (drafts[suggestion.entryId] ?? suggestion.bullets.join('\n')).split('\n').filter(b => b.trim()) }, `采纳：${suggestion.issue}`)}>采纳这一条</button><button className="btn" onClick={() => setSuggestions(s => s.filter(x => x !== suggestion))}>忽略</button></div></div> : <div className="coach-empty"><h3>把经历讲具体，比换词更重要</h3><p>先诊断，再补充事实，最后逐条比较并采纳。修改只应用到当前简历。</p></div>}
            {suggestions.length > 0 && <div className="issue-list"><h4>其他待处理建议 · {suggestions.length}</h4>{suggestions.map(s => <button key={s.entryId} onClick={() => setActive(s.entryId)}>{s.issue}<span> →</span></button>)}</div>}
          </>}
        </aside>
      </div>
    </>}
  </div>;
}
