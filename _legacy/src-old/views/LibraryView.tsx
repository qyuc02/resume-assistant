import { useState } from 'react';
import { useData } from '../store';
import { Entry } from '../types';
import { uid, dateRange } from '../util';
import EntryEditor from '../components/EntryEditor';
import UploadModal from '../components/UploadModal';

export default function LibraryView() {
  const { data, update } = useData();
  const categories = [...data.categories].sort((a, b) => a.order - b.order);
  const [selectedId, setSelectedId] = useState<string>(categories[0]?.id ?? '');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const selected = categories.find((c) => c.id === selectedId) ?? categories[0];

  const entries = data.entries
    .filter((e) => e.categoryId === selected?.id)
    .sort((a, b) => a.order - b.order);

  function addCategory() {
    const c = { id: uid(), name: '新大模块', order: categories.length };
    update((d) => ({ ...d, categories: [...d.categories, c] }));
    setSelectedId(c.id);
  }

  function renameCategory(id: string, name: string) {
    update((d) => ({
      ...d,
      categories: d.categories.map((c) => (c.id === id ? { ...c, name: name.trim() || c.name } : c)),
    }));
  }

  function deleteCategory(id: string) {
    if (!confirm('删除这个大模块？其下所有条目也会一并删除。')) return;
    update((d) => ({
      ...d,
      categories: d.categories.filter((c) => c.id !== id),
      entries: d.entries.filter((e) => e.categoryId !== id),
      resumes: d.resumes.map((r) => ({
        ...r,
        sections: r.sections.filter((s) => s.categoryId !== id),
      })),
    }));
    if (selectedId === id) setSelectedId('');
  }

  function moveCategory(id: string, dir: -1 | 1) {
    update((d) => {
      const list = [...d.categories].sort((a, b) => a.order - b.order);
      const i = list.findIndex((c) => c.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return d;
      [list[i], list[j]] = [list[j], list[i]];
      const orderById = new Map(list.map((c, idx) => [c.id, idx]));
      return { ...d, categories: d.categories.map((c) => ({ ...c, order: orderById.get(c.id)! })) };
    });
  }

  function deleteEntry(id: string) {
    update((d) => ({
      ...d,
      entries: d.entries.filter((e) => e.id !== id),
      resumes: d.resumes.map((r) => ({
        ...r,
        sections: r.sections.map((s) => ({ ...s, entryIds: s.entryIds.filter((x) => x !== id) })),
      })),
    }));
  }

  function moveEntry(dragId: string, targetId: string) {
    if (!selected) return;
    const catId = selected.id;
    update((d) => {
      const list = d.entries.filter((e) => e.categoryId === catId).sort((a, b) => a.order - b.order);
      const from = list.findIndex((e) => e.id === dragId);
      const to = list.findIndex((e) => e.id === targetId);
      if (from < 0 || to < 0 || from === to) return d;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      const orderById = new Map(list.map((e, i) => [e.id, i]));
      return {
        ...d,
        entries: d.entries.map((e) =>
          e.categoryId === catId && orderById.has(e.id) ? { ...e, order: orderById.get(e.id)! } : e
        ),
      };
    });
  }

  return (
    <div className="split">
      <aside className="sidebar">
        <button className="btn primary upload-btn" onClick={() => setUploadOpen(true)}>
          📤 上传简历自动分类
        </button>
        <div className="sidebar-head">
          <span>大模块</span>
          <button className="btn small primary" onClick={addCategory}>
            + 新建
          </button>
        </div>
        <ul className="cat-list">
          {categories.map((c, i) => (
            <li
              key={c.id}
              className={c.id === selected?.id ? 'cat-item active' : 'cat-item'}
              onClick={() => setSelectedId(c.id)}
            >
              {renamingId === c.id ? (
                <input
                  autoFocus
                  value={renameVal}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setRenameVal(e.target.value)}
                  onBlur={() => {
                    renameCategory(c.id, renameVal);
                    setRenamingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      renameCategory(c.id, renameVal);
                      setRenamingId(null);
                    }
                  }}
                />
              ) : (
                <span className="cat-name">{c.name}</span>
              )}
              <span className="cat-count">{data.entries.filter((e) => e.categoryId === c.id).length}</span>
              <span className="cat-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="icon-btn"
                  title="重命名"
                  onClick={() => {
                    setRenamingId(c.id);
                    setRenameVal(c.name);
                  }}
                >
                  ✎
                </button>
                <button className="icon-btn" title="上移" onClick={() => moveCategory(c.id, -1)}>
                  ↑
                </button>
                <button className="icon-btn" title="下移" onClick={() => moveCategory(c.id, 1)}>
                  ↓
                </button>
                <button className="icon-btn danger" title="删除" onClick={() => deleteCategory(c.id)}>
                  🗑
                </button>
              </span>
            </li>
          ))}
        </ul>
        {categories.length === 0 && (
          <div className="empty">还没有大模块，点右上角「+ 新建」开始</div>
        )}
      </aside>

      <section className="main">
        {selected ? (
          <>
            <div className="main-head">
              <h2>{selected.name}</h2>
              <button className="btn primary" onClick={() => setCreating(true)}>
                + 新建条目
              </button>
            </div>
            {entries.length === 0 ? (
              <div className="empty big">这个模块下还没有内容，点「+ 新建条目」填写一条经历</div>
            ) : (
              <div className="entry-list">
                {entries.map((e) => (
                  <div
                    key={e.id}
                    className={dragId === e.id ? 'entry-card dragging' : 'entry-card'}
                    draggable
                    onDragStart={() => setDragId(e.id)}
                    onDragOver={(ev) => ev.preventDefault()}
                    onDrop={() => moveEntry(dragId!, e.id)}
                    onDragEnd={() => setDragId(null)}
                  >
                    <span className="drag-handle" title="拖动排序">⠿</span>
                    <div className="entry-main">
                      <div className="entry-title">
                        <strong>{e.title || '(未命名)'}</strong>
                        {e.role && <span className="entry-role">{e.role}</span>}
                        <span className="entry-date">{dateRange(e)}</span>
                      </div>
                      {e.bullets.length > 0 && (
                        <div className="entry-preview">{e.bullets[0]}</div>
                      )}
                      {e.tags.length > 0 && (
                        <div className="tag-row">
                          {e.tags.map((t, i) => (
                            <span className="tag" key={i}>
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="entry-actions">
                      <button className="btn small" onClick={() => setEditing(e)}>
                        编辑
                      </button>
                      <button className="icon-btn danger" title="删除" onClick={() => deleteEntry(e.id)}>
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="empty big">先在左侧新建一个大模块</div>
        )}
      </section>

      {(creating || editing) && (
        <EntryEditor
          entry={editing}
          defaultCategoryId={selected?.id ?? categories[0]?.id ?? ''}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} />}
    </div>
  );
}
