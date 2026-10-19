import { useState } from 'react';
import type { Resume } from '../types';
import { formatTime } from '../util';
import Icon from './Icon';

export default function ResumeSwitcher({
  resumes,
  current,
  onSelect,
}: {
  resumes: Resume[];
  current: Resume;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const list = resumes
    .filter((r) => !q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="switcher">
      <button
        className="switcher-btn"
        onClick={() => {
          setOpen(!open);
          setQ('');
        }}
      >
        <Icon name="file" size={15} />
        <span className="switcher-name">{current.name}</span>
        <span className="switcher-count">{current.items.length} 段</span>
        <span className="switcher-caret">▾</span>
      </button>

      {open && (
        <>
          <div className="switcher-backdrop" onClick={() => setOpen(false)} />
          <div className="switcher-pop">
            <input autoFocus placeholder="搜索简历…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="switcher-list">
              {list.map((r) => (
                <button
                  key={r.id}
                  className={r.id === current.id ? 'switcher-item active' : 'switcher-item'}
                  onClick={() => {
                    onSelect(r.id);
                    setOpen(false);
                  }}
                >
                  <span className="switcher-item-name">{r.name}</span>
                  <span className="switcher-item-meta">
                    {r.items.length} 段 · {formatTime(r.updatedAt)}
                  </span>
                </button>
              ))}
              {!list.length && (
                <div className="muted" style={{ padding: 10 }}>
                  没有匹配的简历
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
