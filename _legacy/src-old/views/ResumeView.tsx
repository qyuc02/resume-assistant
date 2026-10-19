import { useState } from 'react';
import { useData, newResume } from '../store';
import { Category, Entry, EntryOverride, Resume } from '../types';
import { dateRange, resolveEntry, uid } from '../util';
import { exportResumeDocx } from '../docx';
import { aiMatch, aiRewriteJd, ResumeEntryContent } from '../api';
import Modal from '../components/Modal';
import ResumePreview from '../components/ResumePreview';

export default function ResumeView() {
  const { data, update } = useData();
  const categories = [...data.categories].sort((a, b) => a.order - b.order);
  const [selectedId, setSelectedId] = useState<string>(data.resumes[0]?.id ?? '');
  const [pickerCat, setPickerCat] = useState<string | null>(null);
  const [jdOpen, setJdOpen] = useState(false);
  const [piOpen, setPiOpen] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  const resume = data.resumes.find((r) => r.id === selectedId) ?? data.resumes[0];

  function updateResume(id: string, fn: (r: Resume) => Resume) {
    update((d) => ({
      ...d,
      resumes: d.resumes.map((r) => (r.id === id ? { ...fn(r), updatedAt: Date.now() } : r)),
    }));
  }

  function addResume() {
    const r = newResume(data.personalInfo);
    update((d) => ({ ...d, resumes: [...d.resumes, r] }));
    setSelectedId(r.id);
  }

  function deleteResume(id: string) {
    if (!confirm('删除这份简历方案？素材库里的条目不受影响。')) return;
    update((d) => ({ ...d, resumes: d.resumes.filter((r) => r.id !== id) }));
    if (selectedId === id) setSelectedId('');
  }

  function duplicateResume(id: string) {
    const src = data.resumes.find((r) => r.id === id);
    if (!src) return;
    const copy: Resume = {
      ...JSON.parse(JSON.stringify(src)),
      id: uid(),
      name: src.name + ' 副本',
      updatedAt: Date.now(),
    };
    update((d) => ({ ...d, resumes: [...d.resumes, copy] }));
    setSelectedId(copy.id);
  }

  function sectionEntryIds(categoryId: string): string[] {
    return resume?.sections.find((s) => s.categoryId === categoryId)?.entryIds ?? [];
  }

  function addEntry(categoryId: string, entryId: string) {
    if (!resume) return;
    updateResume(resume.id, (r) => {
      const existing = r.sections.find((s) => s.categoryId === categoryId);
      const sections = existing
        ? r.sections.map((s) =>
            s.categoryId === categoryId ? { ...s, entryIds: [...s.entryIds, entryId] } : s
          )
        : [...r.sections, { categoryId, entryIds: [entryId] }];
      return { ...r, sections };
    });
  }

  function removeEntry(categoryId: string, entryId: string) {
    if (!resume) return;
    updateResume(resume.id, (r) => ({
      ...r,
      sections: r.sections
        .map((s) =>
          s.categoryId === categoryId
            ? { ...s, entryIds: s.entryIds.filter((x) => x !== entryId) }
            : s
        )
        .filter((s) => s.entryIds.length > 0),
    }));
  }

  function moveEntry(categoryId: string, entryId: string, dir: -1 | 1) {
    if (!resume) return;
    updateResume(resume.id, (r) => ({
      ...r,
      sections: r.sections.map((s) => {
        if (s.categoryId !== categoryId) return s;
        const i = s.entryIds.indexOf(entryId);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= s.entryIds.length) return s;
        const arr = [...s.entryIds];
        [arr[i], arr[j]] = [arr[j], arr[i]];
        return { ...s, entryIds: arr };
      }),
    }));
  }

  function applyMatch(ids: string[]) {
    if (!resume) return;
    updateResume(resume.id, (r) => {
      const byCat = new Map<string, string[]>();
      for (const eid of ids) {
        const entry = data.entries.find((e) => e.id === eid);
        if (!entry) continue;
        if (!byCat.has(entry.categoryId)) byCat.set(entry.categoryId, []);
        byCat.get(entry.categoryId)!.push(eid);
      }
      const sections = [...byCat.entries()].map(([categoryId, entryIds]) => ({
        categoryId,
        entryIds,
      }));
      return { ...r, sections };
    });
  }

  async function rewriteForJd(ids: string[], jd: string) {
    if (!resume) return;
    const dirName = resume.directionId
      ? data.directions.find((d) => d.id === resume.directionId)?.name || ''
      : '';
    const content: ResumeEntryContent[] = [];
    for (const id of ids) {
      const e = data.entries.find((x) => x.id === id);
      if (!e) continue;
      const variant = resume.directionId
        ? (e.variants || []).find((v) => v.directionId === resume.directionId)
        : undefined;
      const c = variant
        ? { title: variant.title, role: variant.role, bullets: variant.bullets, tags: variant.tags }
        : { title: e.title, role: e.role, bullets: e.bullets, tags: e.tags };
      content.push({ id, ...c });
    }
    if (content.length === 0) throw new Error('没有可改写的条目');

    const r = await aiRewriteJd(jd, dirName, resume.personalInfo.summary, content);
    const byId = new Map((r.entries || []).map((x) => [x.id, x]));

    updateResume(resume.id, (res) => {
      const byCat = new Map<string, string[]>();
      for (const eid of ids) {
        const e = data.entries.find((x) => x.id === eid);
        if (!e) continue;
        if (!byCat.has(e.categoryId)) byCat.set(e.categoryId, []);
        byCat.get(e.categoryId)!.push(eid);
      }
      const sections = [...byCat.entries()].map(([categoryId, entryIds]) => ({ categoryId, entryIds }));
      const overrides: Record<string, EntryOverride> = { ...(res.overrides || {}) };
      for (const id of ids) {
        const o = byId.get(id);
        if (o) overrides[id] = { title: o.title, role: o.role, bullets: o.bullets, tags: o.tags };
      }
      return { ...res, sections, overrides, summaryOverride: r.summary || '' };
    });
    setPreviewOpen(true);
  }

  function renderResumeList() {
    return (
      <aside className="sidebar">
        <div className="sidebar-head">
          <span>简历方案</span>
          <button className="btn small primary" onClick={addResume}>
            + 新建
          </button>
        </div>
        <ul className="cat-list">
          {data.resumes.map((r) => (
            <li
              key={r.id}
              className={r.id === resume?.id ? 'cat-item active' : 'cat-item'}
              onClick={() => setSelectedId(r.id)}
            >
              {renamingId === r.id ? (
                <input
                  autoFocus
                  value={renameVal}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setRenameVal(e.target.value)}
                  onBlur={() => {
                    updateResume(r.id, (x) => ({ ...x, name: renameVal.trim() || x.name }));
                    setRenamingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      updateResume(r.id, (x) => ({ ...x, name: renameVal.trim() || x.name }));
                      setRenamingId(null);
                    }
                  }}
                />
              ) : (
                <span className="cat-name">{r.name}</span>
              )}
              <span className="cat-count">
                {r.sections.reduce((n, s) => n + s.entryIds.length, 0)}
              </span>
              <span className="cat-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="icon-btn"
                  title="重命名"
                  onClick={() => {
                    setRenamingId(r.id);
                    setRenameVal(r.name);
                  }}
                >
                  ✎
                </button>
                <button className="icon-btn" title="复制" onClick={() => duplicateResume(r.id)}>
                  ⧉
                </button>
                <button className="icon-btn danger" title="删除" onClick={() => deleteResume(r.id)}>
                  🗑
                </button>
              </span>
            </li>
          ))}
        </ul>
        {data.resumes.length === 0 && <div className="empty">点「+ 新建」创建第一份简历</div>}
      </aside>
    );
  }

  function renderEditor() {
    if (!resume) {
      return (
        <section className="main">
          <div className="empty big">先新建一份简历方案</div>
        </section>
      );
    }

    return (
      <section className="main">
        <div className="main-head">
          <div>
            <h2>{resume.name}</h2>
            <div className="muted">
              已选 {resume.sections.reduce((n, s) => n + s.entryIds.length, 0)} 条 ·{' '}
              {categories.length} 个模块
            </div>
          </div>
          <div className="toolbar">
            <label className="dir-picker">
              <span>目标方向</span>
              <select
                value={resume.directionId || ''}
                onChange={(e) => updateResume(resume.id, (r) => ({ ...r, directionId: e.target.value }))}
              >
                <option value="">（默认版本）</option>
                {data.directions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            {Object.keys(resume.overrides || {}).length > 0 || resume.summaryOverride ? (
              <button
                className="btn ghost"
                title="清除按 JD 定制的改写内容"
                onClick={() =>
                  updateResume(resume.id, (r) => ({ ...r, overrides: {}, summaryOverride: '' }))
                }
              >
                🧹 清除 JD 定制
              </button>
            ) : null}
            <button className="btn ghost" onClick={() => setJdOpen(true)}>
              🎯 贴 JD 智能推荐
            </button>
            <button className="btn" onClick={() => setPreviewOpen(true)}>
              👁 预览
            </button>
            <button
              className="btn primary"
              onClick={() => exportResumeDocx(resume, categories, data.entries)}
            >
              ⬇ 导出 Word
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head" onClick={() => setPiOpen(!piOpen)}>
            <span>个人信息</span>
            <span>{piOpen ? '▾' : '▸'}</span>
          </div>
          {piOpen && (
            <div className="pi-grid">
              {[
                ['name', '姓名'],
                ['phone', '电话'],
                ['email', '邮箱'],
                ['city', '城市'],
                ['website', '个人网站'],
                ['github', 'GitHub'],
              ].map(([k, label]) => (
                <label className="field" key={k}>
                  <span>{label}</span>
                  <input
                    value={resume.personalInfo[k as keyof typeof resume.personalInfo]}
                    onChange={(e) =>
                      updateResume(resume.id, (r) => ({
                        ...r,
                        personalInfo: { ...r.personalInfo, [k]: e.target.value },
                      }))
                    }
                  />
                </label>
              ))}
              <label className="field span-2">
                <span>个人简介</span>
                <textarea
                  rows={2}
                  value={resume.personalInfo.summary}
                  onChange={(e) =>
                    updateResume(resume.id, (r) => ({
                      ...r,
                      personalInfo: { ...r.personalInfo, summary: e.target.value },
                    }))
                  }
                />
              </label>
            </div>
          )}
        </div>

        <div className="section-list">
          {categories.map((cat) => {
            const ids = sectionEntryIds(cat.id);
            return (
              <div className="section-block" key={cat.id}>
                <div className="section-head">
                  <span className="section-name">{cat.name}</span>
                  <button className="btn small ghost" onClick={() => setPickerCat(cat.id)}>
                    ＋ 添加
                  </button>
                </div>
                {ids.length === 0 ? (
                  <div className="section-empty">从素材库添加条目</div>
                ) : (
                  <div className="entry-list compact">
                    {ids.map((eid, idx) => {
                      const e = data.entries.find((x) => x.id === eid);
                      if (!e) return null;
                      const c = resolveEntry(e, resume.directionId, resume.overrides?.[eid]);
                      const usedVariant = resume.directionId
                        ? (e.variants || []).find((v) => v.directionId === resume.directionId)
                        : undefined;
                      const usedDir = usedVariant
                        ? data.directions.find((d) => d.id === usedVariant.directionId)
                        : undefined;
                      return (
                        <div className="entry-card" key={eid}>
                          <div className="entry-main">
                            <div className="entry-title">
                              <strong>{c.title || '(未命名)'}</strong>
                              {c.role && <span className="entry-role">{c.role}</span>}
                              <span className="entry-date">{dateRange(e)}</span>
                              {usedDir && <span className="tag">{usedDir.name}</span>}
                              {resume.overrides?.[eid] && <span className="tag">JD 定制</span>}
                            </div>
                            {c.bullets.length > 0 && <div className="entry-preview">{c.bullets[0]}</div>}
                          </div>
                          <div className="entry-actions">
                            <button
                              className="icon-btn"
                              title="上移"
                              disabled={idx === 0}
                              onClick={() => moveEntry(cat.id, eid, -1)}
                            >
                              ↑
                            </button>
                            <button
                              className="icon-btn"
                              title="下移"
                              disabled={idx === ids.length - 1}
                              onClick={() => moveEntry(cat.id, eid, 1)}
                            >
                              ↓
                            </button>
                            <button
                              className="icon-btn danger"
                              title="移除"
                              onClick={() => removeEntry(cat.id, eid)}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {pickerCat && (
          <Picker
            category={categories.find((c) => c.id === pickerCat)!}
            entries={data.entries}
            included={new Set(sectionEntryIds(pickerCat))}
            onPick={(eid) => addEntry(pickerCat, eid)}
            onClose={() => setPickerCat(null)}
          />
        )}

        {jdOpen && (
          <JdModal
            entries={data.entries}
            onApply={(ids) => {
              applyMatch(ids);
              setJdOpen(false);
            }}
            onRewrite={rewriteForJd}
            onClose={() => setJdOpen(false)}
          />
        )}
        {previewOpen && resume && (
          <ResumePreview resume={resume} onClose={() => setPreviewOpen(false)} />
        )}
      </section>
    );
  }

  return (
    <div className="split">
      {renderResumeList()}
      {renderEditor()}
    </div>
  );
}

function Picker({
  category,
  entries,
  included,
  onPick,
  onClose,
}: {
  category: Category;
  entries: Entry[];
  included: Set<string>;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const available = entries.filter((e) => e.categoryId === category.id && !included.has(e.id));
  return (
    <Modal title={`添加到「${category.name}」`} onClose={onClose}>
      {available.length === 0 ? (
        <div className="empty">这个模块下没有可添加的条目了，先去素材库新建</div>
      ) : (
        <div className="entry-list compact">
          {available.map((e) => (
            <div className="entry-card" key={e.id}>
              <div className="entry-main">
                <div className="entry-title">
                  <strong>{e.title || '(未命名)'}</strong>
                  {e.role && <span className="entry-role">{e.role}</span>}
                  <span className="entry-date">{dateRange(e)}</span>
                </div>
                {e.bullets.length > 0 && <div className="entry-preview">{e.bullets[0]}</div>}
              </div>
              <div className="entry-actions">
                <button className="btn small primary" onClick={() => onPick(e.id)}>
                  添加
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function JdModal({
  entries,
  onApply,
  onRewrite,
  onClose,
}: {
  entries: Entry[];
  onApply: (ids: string[]) => void;
  onRewrite: (ids: string[], jd: string) => Promise<void>;
  onClose: () => void;
}) {
  const [jd, setJd] = useState('');
  const [busy, setBusy] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<{ selectedEntryIds: string[]; reasoning: string } | null>(
    null
  );

  async function run() {
    if (!jd.trim()) return;
    setBusy(true);
    setErr('');
    setResult(null);
    try {
      const summaries = entries.map((e) => ({
        id: e.id,
        title: e.title,
        role: e.role,
        tags: e.tags,
        summary: e.bullets.slice(0, 3).join(' '),
      }));
      const r = await aiMatch(jd, summaries);
      setResult(r);
    } catch (e) {
      setErr((e as Error).message || '匹配失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="贴 JD 智能推荐" onClose={onClose} width={680}>
      <label className="field">
        <span>职位描述（JD）</span>
        <textarea
          rows={7}
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          placeholder="把目标岗位的职位描述整段粘贴到这里，AI 会挑出最相关的经历并排序"
        />
      </label>

      {err && <div className="error">{err}</div>}

      {result && (
        <div className="jd-result">
          <div className="jd-result-count">
            推荐了 {result.selectedEntryIds.length} 条相关经历
          </div>
          <div className="jd-reasoning">{result.reasoning}</div>
          <div className="tag-row">
            {result.selectedEntryIds.map((id) => {
              const e = entries.find((x) => x.id === id);
              return e ? (
                <span className="tag" key={id}>
                  {e.title}
                </span>
              ) : null;
            })}
          </div>
        </div>
      )}

      <div className="modal-foot">
        {result ? (
          <>
            <button className="btn ghost" onClick={onClose}>
              取消
            </button>
            <button className="btn" onClick={() => onApply(result.selectedEntryIds)}>
              仅应用组合
            </button>
            <button
              className="btn primary"
              disabled={rewriting}
              onClick={async () => {
                setRewriting(true);
                setErr('');
                try {
                  await onRewrite(result.selectedEntryIds, jd);
                  onClose();
                } catch (e) {
                  setErr((e as Error).message || '改写失败');
                } finally {
                  setRewriting(false);
                }
              }}
            >
              {rewriting ? '改写中…' : '应用并按 JD 改写'}
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost" onClick={onClose}>
              取消
            </button>
            <button className="btn primary" onClick={run} disabled={busy || !jd.trim()}>
              {busy ? '匹配中…' : '开始匹配'}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
