import { useMemo, useState } from 'react';
import { useData } from '../App';
import type { KnowledgePriority, KnowledgeStatus } from '../types';

const PRIORITY_ORDER: Record<KnowledgePriority, number> = { 必学: 3, 加分: 2, 了解: 1 };
const PRIORITY_BADGE: Record<KnowledgePriority, string> = { 必学: 'red', 加分: 'amber', 了解: 'slate' };
const STATUSES: KnowledgeStatus[] = ['待学习', '学习中', '已掌握'];

interface AggPoint {
  name: string;
  category: string;
  priority: KnowledgePriority;
  reason: string;
  topics: string[];
  sources: string[];
}

export default function LearnView() {
  const { data, update } = useData();
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const apps = data.applications.filter((a) => !a.archived);
  const appsById = useMemo(() => new Map(data.applications.map((a) => [a.id, a])), [data.applications]);

  const generatedCount = apps.filter((a) => a.learning.length > 0).length;

  // 聚合选中岗位的知识点：按 name 去重，优先级取最高，记录来源岗位
  const points = useMemo(() => {
    const map = new Map<string, AggPoint>();
    for (const id of selected) {
      const app = appsById.get(id);
      if (!app) continue;
      for (const p of app.learning) {
        const key = p.name.trim();
        if (!key) continue;
        const existing = map.get(key);
        if (existing) {
          if (PRIORITY_ORDER[p.priority] > PRIORITY_ORDER[existing.priority]) {
            existing.priority = p.priority;
            existing.reason = p.reason;
            existing.category = p.category;
          }
          for (const t of p.topics) {
            if (!existing.topics.includes(t)) existing.topics.push(t);
          }
          if (!existing.sources.includes(app.company)) existing.sources.push(app.company);
        } else {
          map.set(key, {
            name: key,
            category: p.category,
            priority: p.priority,
            reason: p.reason,
            topics: [...p.topics],
            sources: [app.company],
          });
        }
      }
    }
    return [...map.values()].sort((a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]);
  }, [selected, appsById]);

  function toggleApp(id: string) {
    setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  function setStatus(name: string, status: KnowledgeStatus) {
    update((d) => ({ ...d, knowledgeStatus: { ...d.knowledgeStatus, [name]: status } }));
  }

  function toggleExpand(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const pendingCount = points.filter((p) => (data.knowledgeStatus[p.name] || '待学习') !== '已掌握').length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>学习中心</h1>
          <div className="toolbar" style={{ marginTop: 10 }}>
            <span className="badge violet">{generatedCount} 个岗位已生成计划</span>
            <span className="badge amber">{pendingCount} 个知识点待学</span>
          </div>
        </div>
      </div>

      <div className="learn-layout">
        <aside className="learn-select">
          <div className="panel-head">
            <h3>选择岗位（{selected.length}）</h3>
          </div>
          {!apps.length ? (
            <p className="muted">还没有岗位。先去「投递记录」添加岗位并生成学习计划。</p>
          ) : (
            <div className="learn-app-list">
              {apps.map((a) => (
                <label key={a.id} className="learn-app-item">
                  <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggleApp(a.id)} />
                  <span className="learn-app-name">
                    <strong>{a.company}</strong>
                    <span className="muted">{a.position}</span>
                  </span>
                  <span className="learn-app-count">
                    {a.learning.length > 0 ? `${a.learning.length} 点` : '未生成'}
                  </span>
                </label>
              ))}
            </div>
          )}
        </aside>

        <section className="learn-points">
          {!selected.length ? (
            <div className="empty">
              <h3>先勾选几个岗位</h3>
              <p>从左侧选择岗位，这里会把这些岗位的知识点合并展示，相同知识点只出现一次。</p>
            </div>
          ) : !points.length ? (
            <div className="empty">
              <h3>这些岗位还没有学习计划</h3>
              <p>去「投递记录」里给岗位填好 JD，点「生成学习计划」。</p>
            </div>
          ) : (
            <div className="list">
              {points.map((p) => {
                const status = data.knowledgeStatus[p.name] || '待学习';
                const open = expanded.has(p.name);
                return (
                  <div className="card learn-point" key={p.name}>
                    <div className="card-head" style={{ cursor: 'pointer' }} onClick={() => toggleExpand(p.name)}>
                      <div>
                        <strong>{p.name}</strong>
                        <span className={`badge ${PRIORITY_BADGE[p.priority]}`} style={{ marginLeft: 8 }}>
                          {p.priority}
                        </span>
                        <span className="badge slate" style={{ marginLeft: 6 }}>
                          {p.category}
                        </span>
                      </div>
                      <div className="toolbar" style={{ gap: 6 }}>
                        <div className="status-seg" onClick={(e) => e.stopPropagation()}>
                          {STATUSES.map((s) => (
                            <button
                              key={s}
                              className={status === s ? 'status-btn active' : 'status-btn'}
                              onClick={() => setStatus(p.name, s)}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                        {p.topics.length > 0 && <span className="expand-caret">{open ? '▾' : '▸'}</span>}
                      </div>
                    </div>
                    <p className="muted" style={{ marginTop: 6 }}>
                      {p.reason}
                    </p>
                    {open && p.topics.length > 0 && (
                      <ul className="card-bullets" style={{ marginTop: 8 }}>
                        {p.topics.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    )}
                    {!open && p.topics.length > 0 && (
                      <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                        {p.topics.length} 项内容 · 点击展开
                      </div>
                    )}
                    {p.sources.length > 1 && (
                      <div className="muted source-apps">需求于：{p.sources.join('、')}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
