import { useState } from 'react';
import { useData } from '../App';
import type { Experience, Profile } from '../types';
import { uid, dateRange } from '../util';
import Modal from '../components/Modal';
import Icon from '../components/Icon';
import ConfirmModal from '../components/ConfirmModal';
import ImportModal, { type ImportResult } from '../components/ImportModal';

const CAT_TONES = ['blue', 'violet', 'teal', 'amber', 'green', 'pink', 'slate', 'red'];

interface FormState {
  id: string;
  categoryId: string;
  title: string;
  role: string;
  startDate: string;
  endDate: string;
  location: string;
  bulletsText: string;
  tagsText: string;
}

function toForm(e: Experience | null, categoryId: string): FormState {
  return {
    id: e?.id ?? '',
    categoryId: e?.categoryId ?? categoryId,
    title: e?.title ?? '',
    role: e?.role ?? '',
    startDate: e?.startDate ?? '',
    endDate: e?.endDate ?? '',
    location: e?.location ?? '',
    bulletsText: (e?.bullets ?? []).join('\n'),
    tagsText: (e?.tags ?? []).join('，'),
  };
}

export default function ArchiveView() {
  const { data, update } = useData();
  const cats = [...data.categories].sort((a, b) => a.order - b.order);
  const [activeCat, setActiveCat] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [confirming, setConfirming] = useState<null | { title: string; message: string; action: () => void }>(null);
  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const current = cats.find((c) => c.id === activeCat) ?? cats[0];
  const list = data.experiences
    .filter((e) => e.categoryId === current?.id)
    .sort((a, b) => a.order - b.order);

  function openNew() {
    if (!current) return;
    setForm(toForm(null, current.id));
    setIsNew(true);
  }

  function openEdit(e: Experience) {
    setForm(toForm(e, e.categoryId));
    setIsNew(false);
  }

  function save() {
    if (!form) return;
    const bullets = form.bulletsText.split('\n').map((b) => b.trim()).filter(Boolean);
    const tags = form.tagsText.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
    if (!form.title.trim() && !form.role.trim() && !bullets.length) {
      setForm(null);
      return;
    }
    update((d) => {
      if (isNew) {
        const maxOrder = d.experiences.filter((e) => e.categoryId === form.categoryId).reduce((m, e) => Math.max(m, e.order), -1);
        const exp: Experience = {
          id: uid(),
          categoryId: form.categoryId,
          title: form.title.trim(),
          role: form.role.trim(),
          startDate: form.startDate.trim(),
          endDate: form.endDate.trim(),
          location: form.location.trim(),
          bullets,
          tags,
          order: maxOrder + 1,
        };
        return { ...d, experiences: [...d.experiences, exp] };
      }
      return {
        ...d,
        experiences: d.experiences.map((e) =>
          e.id === form.id
            ? { ...e, title: form.title.trim(), role: form.role.trim(), startDate: form.startDate.trim(), endDate: form.endDate.trim(), location: form.location.trim(), bullets, tags }
            : e
        ),
      };
    });
    setForm(null);
  }

  function remove(id: string) {
    setConfirming({
      title: '删除经历',
      message: '删除这条经历？已引用它的简历也会移除该条目。',
      action: () => {
        update((d) => ({
          ...d,
          experiences: d.experiences.filter((e) => e.id !== id),
          resumes: d.resumes.map((r) => ({ ...r, items: r.items.filter((i) => i.experienceId !== id) })),
        }));
      },
    });
  }

  function move(id: string, dir: -1 | 1) {
    update((d) => {
      const inCat = d.experiences.filter((e) => e.categoryId === current?.id).sort((a, b) => a.order - b.order);
      const i = inCat.findIndex((e) => e.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= inCat.length) return d;
      const swapped = [...inCat];
      [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
      const orderById = new Map(swapped.map((e, idx) => [e.id, idx]));
      return { ...d, experiences: d.experiences.map((e) => (orderById.has(e.id) ? { ...e, order: orderById.get(e.id)! } : e)) };
    });
  }

  function commitAddCategory() {
    if (newCatName.trim()) {
      update((d) => ({
        ...d,
        categories: [...d.categories, { id: uid(), name: newCatName.trim(), order: d.categories.length }],
      }));
    }
    setNewCatName('');
    setAddingCat(false);
  }

  function deleteCategory() {
    if (!current) return;
    const count = data.experiences.filter((e) => e.categoryId === current.id).length;
    setConfirming({
      title: '删除分类',
      message: count ? `删除「${current.name}」？其下 ${count} 条经历也会一并删除。` : `删除「${current.name}」？`,
      action: () => {
        update((d) => ({
          ...d,
          categories: d.categories.filter((c) => c.id !== current.id),
          experiences: d.experiences.filter((e) => e.categoryId !== current.id),
        }));
        setActiveCat('');
      },
    });
  }

  function commitRename() {
    if (!renaming || !renameVal.trim()) {
      setRenaming(null);
      return;
    }
    update((d) => ({ ...d, categories: d.categories.map((c) => (c.id === renaming ? { ...c, name: renameVal.trim() } : c)) }));
    setRenaming(null);
  }

  function handleImport(result: ImportResult) {
    update((d) => {
      let categories = [...d.categories];
      let experiences = [...d.experiences];
      let profile: Profile = { ...d.profile };

      if (result.profile) {
        for (const [k, v] of Object.entries(result.profile)) {
          if (typeof v === 'string' && v.trim() && k in profile) {
            profile = { ...profile, [k]: v.trim() };
          }
        }
      }

      for (const sec of result.sections) {
        let cat = categories.find((c) => c.name === sec.name);
        if (!cat) {
          cat = { id: uid(), name: sec.name || '导入', order: categories.length };
          categories = [...categories, cat];
        }
        sec.experiences.forEach((e, idx) => {
          experiences = [
            ...experiences,
            {
              id: uid(),
              categoryId: cat!.id,
              title: e.title || '未命名',
              role: e.role || '',
              startDate: e.startDate || '',
              endDate: e.endDate || '',
              location: e.location || '',
              bullets: (e.bullets || []).filter((b) => typeof b === 'string' && b.trim()),
              tags: (e.tags || []).filter((t) => typeof t === 'string' && t.trim()),
              order: experiences.filter((x) => x.categoryId === cat!.id).length + idx,
            },
          ];
        });
      }
      return { ...d, categories, experiences, profile };
    });
    setImportOpen(false);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>经历档案</h1>
          <div className="toolbar" style={{ marginTop: 10 }}>
            <span className="badge violet">共 {data.experiences.length} 条经历</span>
            <span className="badge amber">{cats.length} 个分类</span>
          </div>
        </div>
        <div className="toolbar">
          <button className="btn" onClick={() => setImportOpen(true)}>
            <Icon name="upload" size={15} /> 导入简历
          </button>
          <button className="btn primary" onClick={openNew} disabled={!current}>
            <Icon name="plus" size={15} /> 新建经历
          </button>
        </div>
      </div>

      <div className="stage-bar">
        {cats.map((c, i) => {
          if (renaming === c.id) {
            return (
              <input
                key={c.id}
                autoFocus
                style={{ width: 120, alignSelf: 'center' }}
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => e.key === 'Enter' && commitRename()}
              />
            );
          }
          const count = data.experiences.filter((e) => e.categoryId === c.id).length;
          return (
            <button
              key={c.id}
              className={`stage-chip tone-${CAT_TONES[i % CAT_TONES.length]}${c.id === current?.id ? ' on' : ''}`}
              onClick={() => setActiveCat(c.id)}
              title={`查看「${c.name}」`}
            >
              <div className="sc-label">{c.name}</div>
              <div className="sc-num">{count}</div>
            </button>
          );
        })}
      </div>

      <div className="toolbar" style={{ marginTop: 10 }}>
        {addingCat ? (
          <>
            <input
              autoFocus
              style={{ width: 140 }}
              value={newCatName}
              placeholder="分类名"
              onChange={(e) => setNewCatName(e.target.value)}
              onBlur={commitAddCategory}
              onKeyDown={(e) => e.key === 'Enter' && commitAddCategory()}
            />
            <button className="btn small" onClick={commitAddCategory}>
              确定
            </button>
          </>
        ) : (
          <button className="btn small" onClick={() => setAddingCat(true)}>
            + 分类
          </button>
        )}
        {current && (
          <>
            <button className="btn small ghost" onClick={() => { setRenaming(current.id); setRenameVal(current.name); }}>
              重命名
            </button>
            <button className="btn small danger" onClick={deleteCategory}>
              删除分类
            </button>
          </>
        )}
      </div>

      {!list.length ? (
        <div className="empty">
          <h3>这个分类下还没有经历</h3>
          <p>点「新建经历」把一段真实经历记下来，之后做简历时直接挑。</p>
          <button className="btn primary" onClick={openNew}>
            新建经历
          </button>
        </div>
      ) : (
        <div className="list">
          {list.map((e, i) => (
            <div className="card" key={e.id}>
              <div className="card-head">
                <div>
                  <div className="card-title">
                    <strong>{e.title || '未命名'}</strong>
                    {e.role && <span className="role">{e.role}</span>}
                    <span className="date">{dateRange(e)}</span>
                  </div>
                  {e.location && <div className="muted">{e.location}</div>}
                </div>
                <div className="card-actions">
                  <button className="icon-btn" title="上移" disabled={i === 0} onClick={() => move(e.id, -1)}>
                    ↑
                  </button>
                  <button className="icon-btn" title="下移" disabled={i === list.length - 1} onClick={() => move(e.id, 1)}>
                    ↓
                  </button>
                  <button className="icon-btn" title="编辑" onClick={() => openEdit(e)}>
                    <Icon name="edit" size={15} />
                  </button>
                  <button className="icon-btn danger" title="删除" onClick={() => remove(e.id)}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>
              {e.bullets.length > 0 && (
                <ul className="card-bullets">
                  {e.bullets.map((b, idx) => (
                    <li key={idx}>{b}</li>
                  ))}
                </ul>
              )}
              {e.tags.length > 0 && (
                <div className="tag-row" style={{ marginTop: 8 }}>
                  {e.tags.map((t, idx) => (
                    <span className="tag" key={idx}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {form && (
        <Modal
          title={isNew ? '新建经历' : '编辑经历'}
          onClose={() => setForm(null)}
          footer={
            <>
              <button className="btn" onClick={() => setForm(null)}>
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
              <span>公司 / 项目 / 学校</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="如：某某科技有限公司" />
            </label>
            <label className="field">
              <span>职位 / 角色</span>
              <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="如：后端开发实习生" />
            </label>
            <label className="field">
              <span>开始时间</span>
              <input value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} placeholder="2024.06" />
            </label>
            <label className="field">
              <span>结束时间</span>
              <input value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} placeholder="2024.09 或 至今" />
            </label>
            <label className="field span-2">
              <span>地点</span>
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="北京" />
            </label>
            <label className="field span-2">
              <span>做了什么（一行一个要点）</span>
              <textarea rows={6} value={form.bulletsText} onChange={(e) => setForm({ ...form, bulletsText: e.target.value })} placeholder={'负责订单服务接口开发，日均调用 50 万+\n重构缓存层，命中率从 70% 提升到 95%'} />
            </label>
            <label className="field span-2">
              <span>关键词 / 技术栈（逗号分隔）</span>
              <input value={form.tagsText} onChange={(e) => setForm({ ...form, tagsText: e.target.value })} placeholder="Go，MySQL，Redis" />
            </label>
          </div>
        </Modal>
      )}

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onImport={handleImport} />}

      {confirming && (
        <ConfirmModal
          title={confirming.title}
          message={confirming.message}
          onConfirm={confirming.action}
          onClose={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
