import { useMemo, useState } from 'react';
import { useData } from '../App';
import type { Experience, Resume, ReviewSuggestion } from '../types';
import { bulletsFor, dateRange, isCustomized, uid, formatTime } from '../util';
import { callAi } from '../api';
import { exportResumeDocx } from '../docx';
import Modal from '../components/Modal';
import Icon from '../components/Icon';
import ResumePaper from '../components/ResumePaper';
import ConfirmModal from '../components/ConfirmModal';
import ResumeSwitcher from '../components/ResumeSwitcher';

export default function ResumeView({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  const { data, update } = useData();
  const resume = data.resumes.find((r) => r.id === selectedId) ?? data.resumes[0];

  const [mode, setMode] = useState<'preview' | 'coach'>('preview');
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<ReviewSuggestion[]>([]);
  const [editingExpId, setEditingExpId] = useState('');
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState('');
  const [confirming, setConfirming] = useState<null | { title: string; message: string; confirmText?: string; action: () => void }>(null);

  const expById = useMemo(() => new Map(data.experiences.map((e) => [e.id, e])), [data.experiences]);
  const sortedCats = useMemo(() => [...data.categories].sort((a, b) => a.order - b.order), [data.categories]);

  if (!resume) {
    return (
      <div>
        <div className="page-head">
          <div>
            <h1>简历</h1>
            <div className="sub">一份简历就是一套讲法：挑哪些经历、按什么顺序、每句话怎么讲。</div>
          </div>
        </div>
        <div className="empty">
          <h3>还没有简历</h3>
          <p>先去「经历档案」记下真实经历，再回来挑几段生成第一份简历。</p>
          <button className="btn primary" onClick={createResume}>
            新建一份简历
          </button>
        </div>
      </div>
    );
  }

  function createResume() {
    const r: Resume = {
      id: uid(),
      name: '未命名简历',
      summaryOverride: null,
      targetJd: '',
      items: [],
      revisions: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    update((d) => ({ ...d, resumes: [...d.resumes, r] }));
    onSelect(r.id);
  }

  function change(fn: (r: Resume) => Resume) {
    update((d) => ({
      ...d,
      resumes: d.resumes.map((r) => (r.id === resume.id ? { ...fn(r), updatedAt: Date.now() } : r)),
    }));
  }

  function duplicate() {
    const copy: Resume = {
      ...resume,
      id: uid(),
      name: `${resume.name} 副本`,
      revisions: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    update((d) => ({ ...d, resumes: [...d.resumes, copy] }));
    onSelect(copy.id);
  }

  function remove() {
    setConfirming({
      title: '删除简历',
      message: `确定删除「${resume.name}」？此操作不可撤销。`,
      action: () => {
        update((d) => ({ ...d, resumes: d.resumes.filter((r) => r.id !== resume.id) }));
        onSelect('');
      },
    });
  }

  const ordered = [...resume.items].sort((a, b) => a.order - b.order);

  function addExperience(expId: string) {
    if (resume.items.some((i) => i.experienceId === expId)) return;
    change((r) => ({
      ...r,
      items: [...r.items, { experienceId: expId, order: r.items.length, bulletsOverride: null }],
    }));
    setAddOpen(false);
  }

  function addAll() {
    const missing = data.experiences.filter((e) => !resume.items.some((i) => i.experienceId === e.id));
    if (!missing.length) {
      setAddOpen(false);
      return;
    }
    change((r) => ({
      ...r,
      items: [...r.items, ...missing.map((e, i) => ({ experienceId: e.id, order: r.items.length + i, bulletsOverride: null }))],
    }));
    setAddOpen(false);
  }

  function removeItem(expId: string) {
    change((r) => ({ ...r, items: r.items.filter((i) => i.experienceId !== expId) }));
  }

  function moveItem(expId: string, dir: -1 | 1) {
    const exp = expById.get(expId);
    if (!exp) return;
    change((r) => {
      const inCat = r.items
        .filter((i) => expById.get(i.experienceId)?.categoryId === exp.categoryId)
        .sort((a, b) => a.order - b.order);
      const i = inCat.findIndex((x) => x.experienceId === expId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= inCat.length) return r;
      [inCat[i], inCat[j]] = [inCat[j], inCat[i]];
      const orderById = new Map(inCat.map((x, idx) => [x.experienceId, idx]));
      return { ...r, items: r.items.map((x) => (orderById.has(x.experienceId) ? { ...x, order: orderById.get(x.experienceId)! } : x)) };
    });
  }

  function setBullets(expId: string, bullets: string[]) {
    change((r) => ({
      ...r,
      items: r.items.map((i) => (i.experienceId === expId ? { ...i, bulletsOverride: bullets } : i)),
    }));
  }

  function revert(expId: string) {
    change((r) => ({ ...r, items: r.items.map((i) => (i.experienceId === expId ? { ...i, bulletsOverride: null } : i)) }));
    setSuggestions((s) => s.filter((x) => x.experienceId !== expId));
  }

  function setEditRevised(expId: string, editIdx: number, text: string) {
    setSuggestions((list) =>
      list.map((s) =>
        s.experienceId === expId
          ? { ...s, edits: s.edits.map((e, i) => (i === editIdx ? { ...e, revised: text } : e)) }
          : s
      )
    );
  }

  function applyEdit(expId: string, edit: { original: string; revised: string }) {
    const item = resume.items.find((i) => i.experienceId === expId);
    const exp = expById.get(expId);
    if (!item || !exp) return;
    const current = bulletsFor(exp, item);
    const o = edit.original.trim();
    let next: string[];
    if (!o) {
      next = [...current, edit.revised.trim()];
    } else if (!edit.revised.trim()) {
      next = current.filter((b) => b.trim() !== o);
    } else {
      const idx = current.findIndex((b) => b.trim() === o);
      next = idx >= 0 ? current.map((b, i) => (i === idx ? edit.revised.trim() : b)) : [...current, edit.revised.trim()];
    }
    setBullets(expId, next.filter((b) => b.trim()));
  }

  function removeEdit(expId: string, editIdx: number) {
    setSuggestions((list) =>
      list
        .map((s) => (s.experienceId === expId ? { ...s, edits: s.edits.filter((_, i) => i !== editIdx) } : s))
        .filter((s) => s.edits.length > 0)
    );
  }

  function snapshot(label: string) {
    change((r) => ({
      ...r,
      revisions: [...r.revisions, { id: uid(), date: Date.now(), label, resume: JSON.parse(JSON.stringify(r)) }].slice(-30),
    }));
  }

  function restore(revId: string) {
    const rev = resume.revisions.find((v) => v.id === revId);
    if (!rev) return;
    setConfirming({
      title: '恢复版本',
      message: '恢复这个版本？当前内容会先存为一份快照。',
      confirmText: '恢复',
      action: () => {
        const old = JSON.parse(JSON.stringify(rev.resume)) as Resume;
        change((r) => ({
          ...r,
          revisions: [...r.revisions, { id: uid(), date: Date.now(), label: '恢复前的版本', resume: JSON.parse(JSON.stringify(r)) }].slice(-30),
          items: old.items,
          summaryOverride: old.summaryOverride,
        }));
        setSuggestions([]);
      },
    });
  }

  async function diagnose() {
    if (!ordered.length) {
      setError('这份简历还没有经历，先从档案添加几段。');
      return;
    }
    setBusy(true);
    setError('');
    setSuggestions([]);
    try {
      const entries = ordered
        .map((i) => ({ item: i, exp: expById.get(i.experienceId) }))
        .filter((x): x is { item: typeof x.item; exp: Experience } => !!x.exp)
        .map(({ item, exp }) => ({ id: exp.id, title: exp.title, role: exp.role, bullets: bulletsFor(exp, item) }));
      const res = await callAi<{ suggestions: ReviewSuggestion[] }>('review', { jd: resume.targetJd, entries });
      setSuggestions(res.suggestions || []);
      setMode('coach');
      if (!res.suggestions?.length) setError('这次没发现明显要改的地方。也可以换个角度：补充量化结果，或对照 JD 检查关键词。');
    } catch (e) {
      setError((e as Error).message);
      setMode('coach');
    } finally {
      setBusy(false);
    }
  }

  const available = data.experiences.filter((e) => !resume.items.some((i) => i.experienceId === e.id));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>简历</h1>
          <div className="toolbar" style={{ marginTop: 10 }}>
            <span className="badge violet">{ordered.length} 段经历</span>
            {ordered.some((i) => isCustomized(i)) && <span className="badge pink">含本简历改写</span>}
            {resume.revisions.length > 0 && <span className="badge teal">{resume.revisions.length} 个快照</span>}
          </div>
        </div>
        <div className="toolbar">
          <ResumeSwitcher
            resumes={data.resumes}
            current={resume}
            onSelect={(id) => {
              onSelect(id);
              setSuggestions([]);
              setError('');
            }}
          />
          <button className="btn small" onClick={openRename}>
            重命名
          </button>
          <button className="btn small" onClick={duplicate}>
            复制
          </button>
          <button className="btn small danger" onClick={remove}>
            删除
          </button>
          <button className="btn small" onClick={createResume}>
            + 新建
          </button>
        </div>
      </div>

      <div className="split-editor">
        <aside className="sticky">
          <div className="panel">
            <div className="panel-head">
              <h3>个人简介</h3>
              {resume.summaryOverride !== null && (
                <button className="btn small ghost" onClick={() => change((r) => ({ ...r, summaryOverride: null }))}>
                  还原为档案
                </button>
              )}
            </div>
            <textarea
              rows={4}
              value={resume.summaryOverride ?? data.profile.summary}
              onChange={(e) => change((r) => ({ ...r, summaryOverride: e.target.value }))}
              placeholder="两三句话说明你的优势和求职方向"
            />
            {resume.summaryOverride !== null && (
              <p className="muted" style={{ marginTop: 6 }}>
                这份简历用了专属简介，档案里的原文不受影响。
              </p>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>经历（{ordered.length}）</h3>
              <div className="toolbar">
                <button className="btn small" onClick={() => setAddOpen(true)} disabled={!available.length}>
                  添加
                </button>
                {available.length > 0 && (
                  <button className="btn small ghost" onClick={addAll}>
                    全部加入
                  </button>
                )}
              </div>
            </div>

            {!ordered.length ? (
              <p className="muted">还没有加入经历。点「添加」从档案里挑。</p>
            ) : (
              <div className="list">
                {sortedCats.map((cat) => {
                  const catItems = ordered.filter((item) => expById.get(item.experienceId)?.categoryId === cat.id);
                  if (!catItems.length) return null;
                  return (
                    <div key={cat.id}>
                      <div className="cat-group-label">
                        {cat.name} <span className="muted">({catItems.length})</span>
                      </div>
                      {catItems.map((item, idx) => {
                        const exp = expById.get(item.experienceId);
                        if (!exp) return null;
                        const custom = isCustomized(item);
                        return (
                          <div className="card" key={item.experienceId}>
                            <div className="card-head">
                              <div>
                                <div className="card-title">
                                  <strong>{exp.title || '未命名'}</strong>
                                  <span className="date">{dateRange(exp)}</span>
                                  {custom && <span className="badge accent">本简历改写</span>}
                                </div>
                              </div>
                              <div className="card-actions">
                                <button className="icon-btn" title="上移" disabled={idx === 0} onClick={() => moveItem(item.experienceId, -1)}>
                                  ↑
                                </button>
                                <button className="icon-btn" title="下移" disabled={idx === catItems.length - 1} onClick={() => moveItem(item.experienceId, 1)}>
                                  ↓
                                </button>
                                <button className="icon-btn" title="编辑" onClick={() => setEditingExpId(editingExpId === item.experienceId ? '' : item.experienceId)}>
                                  <Icon name="edit" size={14} />
                                </button>
                                <button className="icon-btn danger" title="移除" onClick={() => removeItem(item.experienceId)}>
                                  <Icon name="close" size={14} />
                                </button>
                              </div>
                            </div>
                            {editingExpId === item.experienceId ? (
                              <>
                                <textarea
                                  rows={Math.max(3, bulletsFor(exp, item).length)}
                                  style={{ marginTop: 8 }}
                                  value={bulletsFor(exp, item).join('\n')}
                                  onChange={(e) => setBullets(item.experienceId, e.target.value.split('\n'))}
                                  placeholder="一行一个要点"
                                />
                                <button className="btn small" style={{ marginTop: 6 }} onClick={() => setEditingExpId('')}>
                                  完成
                                </button>
                              </>
                            ) : (
                              <ul className="card-bullets">
                                {bulletsFor(exp, item).map((b, i) => (
                                  <li key={i}>{b}</li>
                                ))}
                              </ul>
                            )}
                            {custom && (
                              <button className="btn small ghost" style={{ marginTop: 6 }} onClick={() => revert(item.experienceId)}>
                                还原为档案原文
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3 style={{ cursor: 'pointer' }} onClick={() => setShowSnapshots(!showSnapshots)}>
                版本快照 {resume.revisions.length > 0 && `(${resume.revisions.length})`} {showSnapshots ? '▾' : '▸'}
              </h3>
              <button className="btn small" onClick={() => snapshot('手动快照')}>
                保存当前
              </button>
            </div>
            {showSnapshots &&
              (!resume.revisions.length ? (
                <p className="muted">改之前存一份，随时能退回来。</p>
              ) : (
                <div className="list">
                  {[...resume.revisions].reverse().map((v) => (
                    <div className="card" key={v.id} style={{ padding: '10px 12px' }}>
                      <div className="card-head">
                        <div>
                          <strong style={{ fontSize: 13 }}>{v.label}</strong>
                          <div className="muted" style={{ fontSize: 11 }}>
                            {formatTime(v.date)}
                          </div>
                        </div>
                        <button className="btn small" onClick={() => restore(v.id)}>
                          恢复
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        </aside>

        <section>
          <div className="toolbar no-print" style={{ marginBottom: 14 }}>
            <button className={mode === 'preview' ? 'btn primary' : 'btn'} onClick={() => setMode('preview')}>
              预览
            </button>
            <button className={mode === 'coach' ? 'btn primary' : 'btn'} onClick={() => setMode('coach')}>
              AI 教练
            </button>
            <span style={{ flex: 1 }} />
            <button className="btn" onClick={() => exportResumeDocx(resume, data.categories, data.experiences, data.profile).catch((e) => setError(e.message))}>
              <Icon name="download" size={15} /> 导出 Word
            </button>
            <button className="btn" onClick={() => window.print()}>
              打印 / 存 PDF
            </button>
          </div>

          {error && (
            <div className="panel" style={{ borderColor: '#fecaca', background: '#fef2f2' }}>
              <span className="error-text">{error}</span>
            </div>
          )}

          {mode === 'coach' && (
            <div className="panel no-print">
              <div className="panel-head">
                <h3>对照岗位诊断</h3>
              </div>
              <label className="field">
                <span>目标岗位 / JD（可留空，留空就是纯表达优化）</span>
                <textarea rows={5} value={resume.targetJd} onChange={(e) => change((r) => ({ ...r, targetJd: e.target.value }))} placeholder="粘贴岗位要求，建议会更贴合" />
              </label>
              <button className="btn primary" style={{ marginTop: 10 }} disabled={busy} onClick={diagnose}>
                {busy ? '正在分析…' : '诊断并给出建议'}
              </button>
              <p className="muted" style={{ marginTop: 8 }}>
                调用 AI 时，简历内容会发送给 DeepSeek。不填 Key 也能正常使用其他全部功能。
              </p>

              {suggestions.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  {suggestions.map((s) => {
                    const exp = expById.get(s.experienceId);
                    return (
                      <div className="card" key={s.experienceId} style={{ marginBottom: 10 }}>
                        <div className="card-head">
                          <strong>{exp?.title || '经历'}</strong>
                          <button className="btn small" onClick={() => setSuggestions((list) => list.filter((x) => x.experienceId !== s.experienceId))}>
                            忽略全部
                          </button>
                        </div>
                        <p style={{ marginTop: 6 }}>{s.issue}</p>
                        <p className="muted">{s.reason}</p>
                        {s.questions?.length > 0 && (
                          <div className="muted">
                            可以补充：
                            {s.questions.map((q, i) => (
                              <div key={i}>
                                {i + 1}. {q}
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ marginTop: 10 }}>
                          {s.edits.map((edit, ei) => (
                            <div className="edit-row" key={ei}>
                              <div className="edit-original">{edit.original.trim() || '（新增要点）'}</div>
                              <div className="edit-arrow">→</div>
                              <textarea
                                rows={2}
                                value={edit.revised}
                                onChange={(e) => setEditRevised(s.experienceId, ei, e.target.value)}
                              />
                              <button
                                className="btn small primary"
                                disabled={!edit.revised.trim()}
                                onClick={() => {
                                  applyEdit(s.experienceId, edit);
                                  removeEdit(s.experienceId, ei);
                                }}
                              >
                                采纳
                              </button>
                            </div>
                          ))}
                        </div>
                        {s.edits.length > 0 && (
                          <button
                            className="btn small"
                            style={{ marginTop: 8 }}
                            onClick={() => {
                              s.edits.forEach((edit) => applyEdit(s.experienceId, edit));
                              setSuggestions((list) => list.filter((x) => x.experienceId !== s.experienceId));
                            }}
                          >
                            全部采纳
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="paper-wrap">
            <ResumePaper resume={resume} categories={data.categories} experiences={data.experiences} profile={data.profile} />
          </div>
        </section>
      </div>

      {addOpen && (
        <Modal title="从档案添加经历" onClose={() => setAddOpen(false)} width={620}>
          <p className="muted" style={{ marginBottom: 10 }}>
            档案里的经历可以反复用在不同简历中。加入后还能针对这份简历改写讲法。
          </p>
          {data.categories
            .sort((a, b) => a.order - b.order)
            .map((cat) => {
              const items = data.experiences.filter((e) => e.categoryId === cat.id && available.some((a) => a.id === e.id)).sort((a, b) => a.order - b.order);
              if (!items.length) return null;
              return (
                <div key={cat.id} style={{ marginBottom: 14 }}>
                  <h4 style={{ marginBottom: 6 }}>{cat.name}</h4>
                  {items.map((e) => (
                    <div className="card" key={e.id} style={{ marginBottom: 6, cursor: 'pointer' }} onClick={() => addExperience(e.id)}>
                      <div className="card-title">
                        <strong>{e.title || '未命名'}</strong>
                        {e.role && <span className="role">{e.role}</span>}
                        <span className="date">{dateRange(e)}</span>
                      </div>
                      {e.bullets[0] && <div className="muted">{e.bullets[0]}</div>}
                    </div>
                  ))}
                </div>
              );
            })}
        </Modal>
      )}

      {renaming && (
        <Modal
          title="重命名简历"
          onClose={() => setRenaming(false)}
          footer={
            <>
              <button className="btn" onClick={() => setRenaming(false)}>
                取消
              </button>
              <button className="btn primary" onClick={commitRename}>
                保存
              </button>
            </>
          }
        >
          <label className="field">
            <span>简历名称</span>
            <input
              autoFocus
              value={renameVal}
              onChange={(e) => setRenameVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && commitRename()}
            />
          </label>
        </Modal>
      )}

      {confirming && (
        <ConfirmModal
          title={confirming.title}
          message={confirming.message}
          confirmText={confirming.confirmText}
          onConfirm={confirming.action}
          onClose={() => setConfirming(null)}
        />
      )}
    </div>
  );

  function openRename() {
    setRenaming(true);
    setRenameVal(resume.name);
  }

  function commitRename() {
    if (renameVal.trim()) change((x) => ({ ...x, name: renameVal.trim() }));
    setRenaming(false);
  }
}
