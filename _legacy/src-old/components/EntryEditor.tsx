import { useState } from 'react';
import Modal from './Modal';
import { Entry, EntryVariant } from '../types';
import { useData } from '../store';
import { uid } from '../util';
import { aiPolish, aiVariant } from '../api';

interface Props {
  entry: Entry | null;
  defaultCategoryId: string;
  onClose: () => void;
}

interface Form {
  categoryId: string;
  title: string;
  role: string;
  startDate: string;
  endDate: string;
  location: string;
  bullets: string[];
  tags: string;
}

interface VariantDraft {
  id: string;
  directionId: string;
  title: string;
  role: string;
  bullets: string[];
  tagsText: string;
}

function toDrafts(variants: EntryVariant[] | undefined): VariantDraft[] {
  return (variants || []).map((v) => ({
    id: v.id,
    directionId: v.directionId,
    title: v.title,
    role: v.role,
    bullets: v.bullets?.length ? [...v.bullets] : [''],
    tagsText: (v.tags || []).join(', '),
  }));
}

export default function EntryEditor({ entry, defaultCategoryId, onClose }: Props) {
  const { data, update } = useData();
  const [form, setForm] = useState<Form>(() => ({
    categoryId: entry?.categoryId ?? defaultCategoryId,
    title: entry?.title ?? '',
    role: entry?.role ?? '',
    startDate: entry?.startDate ?? '',
    endDate: entry?.endDate ?? '',
    location: entry?.location ?? '',
    bullets: entry?.bullets?.length ? [...entry.bullets] : [''],
    tags: entry?.tags?.join(', ') ?? '',
  }));
  const [variants, setVariants] = useState<VariantDraft[]>(() => toDrafts(entry?.variants));
  const [newDir, setNewDir] = useState('');
  const [polishing, setPolishing] = useState<number | null>(null);
  const [genId, setGenId] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const directions = data.directions;

  function patch(p: Partial<Form>) {
    setForm((f) => ({ ...f, ...p }));
  }

  function patchBullet(i: number, v: string) {
    setForm((f) => ({ ...f, bullets: f.bullets.map((b, j) => (j === i ? v : b)) }));
  }

  function patchVariant(id: string, p: Partial<VariantDraft>) {
    setVariants((vs) => vs.map((v) => (v.id === id ? { ...v, ...p } : v)));
  }

  function patchVariantBullet(id: string, i: number, val: string) {
    setVariants((vs) =>
      vs.map((v) => (v.id === id ? { ...v, bullets: v.bullets.map((b, j) => (j === i ? val : b)) } : v))
    );
  }

  function addVariantBullet(id: string) {
    setVariants((vs) => vs.map((v) => (v.id === id ? { ...v, bullets: [...v.bullets, ''] } : v)));
  }

  function removeVariantBullet(id: string, i: number) {
    setVariants((vs) =>
      vs.map((v) => (v.id === id ? { ...v, bullets: v.bullets.filter((_, j) => j !== i) } : v))
    );
  }

  function deleteVariant(id: string) {
    setVariants((vs) => vs.filter((v) => v.id !== id));
  }

  function addVariant(directionId: string) {
    const v: VariantDraft = {
      id: uid(),
      directionId,
      title: form.title,
      role: form.role,
      bullets: form.bullets.filter((b) => b.trim()).length ? [...form.bullets] : [''],
      tagsText: form.tags,
    };
    setVariants((vs) => [...vs, v]);
  }

  function save() {
    const bullets = form.bullets.map((b) => b.trim()).filter(Boolean);
    const tags = form.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
    if (!form.title.trim() && !form.role.trim() && bullets.length === 0) {
      setErr('至少填写标题 / 角色，或一条描述');
      return;
    }
    const cleanVariants: EntryVariant[] = variants.map((v) => ({
      id: v.id,
      directionId: v.directionId,
      title: v.title.trim(),
      role: v.role.trim(),
      bullets: v.bullets.map((b) => b.trim()).filter(Boolean),
      tags: v.tagsText.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
    }));
    if (entry) {
      update((d) => ({
        ...d,
        entries: d.entries.map((e) =>
          e.id === entry.id
            ? {
                ...e,
                categoryId: form.categoryId,
                title: form.title.trim(),
                role: form.role.trim(),
                startDate: form.startDate.trim(),
                endDate: form.endDate.trim(),
                location: form.location.trim(),
                bullets,
                tags,
                variants: cleanVariants,
              }
            : e
        ),
      }));
    } else {
      update((d) => ({
        ...d,
        entries: [
          ...d.entries,
          {
            id: uid(),
            categoryId: form.categoryId,
            title: form.title.trim(),
            role: form.role.trim(),
            startDate: form.startDate.trim(),
            endDate: form.endDate.trim(),
            location: form.location.trim(),
            bullets,
            tags,
            variants: cleanVariants,
            order: d.entries.filter((e) => e.categoryId === form.categoryId).length,
          },
        ],
      }));
    }
    onClose();
  }

  async function polish(i: number) {
    const text = form.bullets[i];
    if (!text.trim()) return;
    setPolishing(i);
    setErr('');
    try {
      const r = await aiPolish(text);
      if (r.polished) patchBullet(i, r.polished);
    } catch (e) {
      setErr((e as Error).message || '润色失败');
    } finally {
      setPolishing(null);
    }
  }

  async function genVariant(id: string) {
    const v = variants.find((x) => x.id === id);
    const dir = directions.find((d) => d.id === v?.directionId);
    if (!v || !dir) return;
    setGenId(id);
    setErr('');
    try {
      const r = await aiVariant(dir.name, {
        title: form.title,
        role: form.role,
        bullets: form.bullets.map((b) => b.trim()).filter(Boolean),
        tags: form.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
      });
      patchVariant(id, {
        title: r.title || v.title,
        role: r.role || v.role,
        bullets: Array.isArray(r.bullets) && r.bullets.length ? r.bullets : v.bullets,
        tagsText: Array.isArray(r.tags) ? r.tags.join(', ') : v.tagsText,
      });
    } catch (e) {
      setErr((e as Error).message || '生成失败');
    } finally {
      setGenId(null);
    }
  }

  const cats = data.categories;
  const availableDirs = directions.filter((d) => !variants.some((v) => v.directionId === d.id));

  return (
    <Modal title={entry ? '编辑条目' : '新建条目'} onClose={onClose} width={720}>
      <div className="form-grid">
        <label className="field span-2">
          <span>所属大模块</span>
          <select value={form.categoryId} onChange={(e) => patch({ categoryId: e.target.value })}>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>标题（公司 / 项目 / 学校名）</span>
          <input value={form.title} onChange={(e) => patch({ title: e.target.value })} placeholder="如：某某科技有限公司" />
        </label>
        <label className="field">
          <span>角色 / 职位</span>
          <input value={form.role} onChange={(e) => patch({ role: e.target.value })} placeholder="如：后端开发实习生" />
        </label>

        <label className="field">
          <span>开始时间</span>
          <input value={form.startDate} onChange={(e) => patch({ startDate: e.target.value })} placeholder="2024.06" />
        </label>
        <label className="field">
          <span>结束时间</span>
          <input value={form.endDate} onChange={(e) => patch({ endDate: e.target.value })} placeholder="至今 / 2024.09" />
        </label>

        <label className="field span-2">
          <span>地点（可选）</span>
          <input value={form.location} onChange={(e) => patch({ location: e.target.value })} placeholder="北京" />
        </label>

        <div className="field span-2">
          <span>描述要点</span>
          {form.bullets.map((b, i) => (
            <div className="bullet-row" key={i}>
              <textarea
                rows={2}
                value={b}
                onChange={(e) => patchBullet(i, e.target.value)}
                placeholder="做了什么，成果如何（尽量量化）"
              />
              <div className="bullet-actions">
                <button className="btn small" onClick={() => polish(i)} disabled={polishing === i}>
                  {polishing === i ? '润色中…' : '✨ 润色'}
                </button>
                <button
                  className="icon-btn"
                  title="删除这条"
                  onClick={() => setForm((f) => ({ ...f, bullets: f.bullets.filter((_, j) => j !== i) }))}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          <button className="btn ghost" onClick={() => setForm((f) => ({ ...f, bullets: [...f.bullets, ''] }))}>
            + 加一条描述
          </button>
        </div>

        <label className="field span-2">
          <span>标签（技术栈 / 关键词，逗号分隔）</span>
          <input value={form.tags} onChange={(e) => patch({ tags: e.target.value })} placeholder="Go, MySQL, Redis" />
        </label>
      </div>

      <div className="field" style={{ marginTop: 6 }}>
        <span>侧重版本（同一段经历，按不同求职方向定制）</span>
        {variants.map((v) => {
          const dir = directions.find((d) => d.id === v.directionId);
          return (
            <div className="variant-block" key={v.id}>
              <div className="variant-head">
                <span className="variant-name">{dir?.name || '（方向已删除）'}</span>
                <div className="entry-actions">
                  <button className="btn small" onClick={() => genVariant(v.id)} disabled={genId === v.id}>
                    {genId === v.id ? '生成中…' : '✨ AI 生成侧重'}
                  </button>
                  <button className="icon-btn danger" title="删除此版本" onClick={() => deleteVariant(v.id)}>
                    ✕
                  </button>
                </div>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>标题（可微调）</span>
                  <input value={v.title} onChange={(e) => patchVariant(v.id, { title: e.target.value })} />
                </label>
                <label className="field">
                  <span>角色（可微调）</span>
                  <input value={v.role} onChange={(e) => patchVariant(v.id, { role: e.target.value })} />
                </label>
              </div>
              <div className="field">
                <span>描述要点</span>
                {v.bullets.map((b, i) => (
                  <div className="bullet-row" key={i}>
                    <textarea
                      rows={2}
                      value={b}
                      onChange={(e) => patchVariantBullet(v.id, i, e.target.value)}
                      placeholder="针对该方向的侧重要点"
                    />
                    <div className="bullet-actions">
                      <button className="icon-btn" title="删除这条" onClick={() => removeVariantBullet(v.id, i)}>
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                <button className="btn ghost" onClick={() => addVariantBullet(v.id)}>
                  + 加一条描述
                </button>
              </div>
              <label className="field">
                <span>标签（技术栈 / 关键词，逗号分隔）</span>
                <input value={v.tagsText} onChange={(e) => patchVariant(v.id, { tagsText: e.target.value })} />
              </label>
            </div>
          );
        })}

        <div className="variant-add">
          <select value={newDir} onChange={(e) => setNewDir(e.target.value)}>
            <option value="">选择求职方向…</option>
            {availableDirs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button
            className="btn"
            disabled={!newDir}
            onClick={() => {
              addVariant(newDir);
              setNewDir('');
            }}
          >
            + 新增侧重版本
          </button>
        </div>
        {directions.length === 0 && (
          <div className="muted">
            还没有「求职方向」。请先在「设置」页添加（如：前端开发 / 后端开发 / 数据挖掘），再回来为条目定制侧重版本。
          </div>
        )}
      </div>

      {err && <div className="error">{err}</div>}

      <div className="modal-foot">
        <button className="btn ghost" onClick={onClose}>
          取消
        </button>
        <button className="btn primary" onClick={save}>
          保存
        </button>
      </div>
    </Modal>
  );
}
