import { useState } from 'react';
import Modal from './Modal';
import { useData } from '../store';
import { Resume, EntryOverride } from '../types';
import { dateRange, resolveEntry } from '../util';
import { exportResumeDocx } from '../docx';
import { aiPolishResume } from '../api';

interface Item {
  entryId: string;
  source: 'override' | 'variant' | 'default';
  variantId: string | null;
  title: string;
  role: string;
  bullets: string[];
  tags: string[];
  startDate: string;
  endDate: string;
  location: string;
}

export default function ResumePreview({ resume, onClose }: { resume: Resume; onClose: () => void }) {
  const { data, update } = useData();
  const categories = [...data.categories].sort((a, b) => a.order - b.order);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const items: Item[] = [];
  for (const section of resume.sections) {
    for (const eid of section.entryIds) {
      const e = data.entries.find((x) => x.id === eid);
      if (!e) continue;
      const override = resume.overrides?.[eid];
      const variant = resume.directionId
        ? (e.variants || []).find((v) => v.directionId === resume.directionId)
        : undefined;
      const source: Item['source'] = override ? 'override' : variant ? 'variant' : 'default';
      const c = resolveEntry(e, resume.directionId, override);
      items.push({
        entryId: e.id,
        source,
        variantId: variant?.id ?? null,
        ...c,
        startDate: e.startDate,
        endDate: e.endDate,
        location: e.location,
      });
    }
  }

  async function optimize() {
    if (items.length === 0) return;
    setBusy(true);
    setErr('');
    try {
      const dirName = resume.directionId
        ? data.directions.find((d) => d.id === resume.directionId)?.name || ''
        : '';
      const payload = items.map((it) => ({
        id: it.entryId,
        title: it.title,
        role: it.role,
        bullets: it.bullets,
        tags: it.tags,
      }));
      const r = await aiPolishResume(dirName, payload);
      const byId = new Map((r.entries || []).map((x) => [x.id, x]));
      update((d) => {
        const newOverrides: Record<string, EntryOverride> = { ...(resume.overrides || {}) };
        const entries = d.entries.map((e) => {
          const res = byId.get(e.id);
          const it = items.find((i) => i.entryId === e.id);
          if (!res || !it) return e;
          newOverrides[e.id] = {
            title: res.title ?? it.title,
            role: res.role ?? it.role,
            bullets: res.bullets ?? it.bullets,
            tags: res.tags ?? it.tags,
          };
          return e;
        });
        return {
          ...d,
          entries,
          resumes: d.resumes.map((rr) =>
            rr.id === resume.id ? { ...rr, overrides: newOverrides, updatedAt: Date.now(), revisions: [...(rr.revisions || []), { id: String(Date.now()), date: Date.now(), label: '整份优化前', overrides: JSON.parse(JSON.stringify(rr.overrides || {})), summary: rr.summaryOverride ?? rr.personalInfo.summary }].slice(-30) } : rr
          ),
        };
      });
    } catch (e) {
      setErr((e as Error).message || 'AI 优化失败');
    } finally {
      setBusy(false);
    }
  }

  const pi = resume.personalInfo;
  const summary = (resume.summaryOverride ?? pi.summary).trim();
  const contact = [pi.phone, pi.email, pi.city, pi.website, pi.github].filter(Boolean).join('  |  ');

  return (
    <Modal title="简历预览" onClose={onClose} width={840}>
      <div className="rp-paper">
        {pi.name.trim() && <div className="rp-name">{pi.name.trim()}</div>}
        {contact && <div className="rp-contact">{contact}</div>}
        {summary && <div className="rp-summary">{summary}</div>}

        {resume.sections.map((section) => {
          const cat = categories.find((c) => c.id === section.categoryId);
          if (!cat) return null;
          const list = section.entryIds
            .map((id) => items.find((i) => i.entryId === id))
            .filter((i): i is Item => Boolean(i));
          if (list.length === 0) return null;
          return (
            <div className="rp-section" key={section.categoryId}>
              <div className="rp-heading">{cat.name}</div>
              {list.map((it) => (
                <div className="rp-entry" key={it.entryId}>
                  <div className="rp-entry-title">
                    <span className="rp-left">{[it.title, it.role].filter(Boolean).join(' · ')}</span>
                    {dateRange({ startDate: it.startDate, endDate: it.endDate }) && (
                      <span className="rp-date">
                        {dateRange({ startDate: it.startDate, endDate: it.endDate })}
                      </span>
                    )}
                  </div>
                  {it.location.trim() && <div className="rp-location">{it.location.trim()}</div>}
                  {it.bullets
                    .filter((b) => b.trim())
                    .map((b, i) => (
                      <div className="rp-bullet" key={i}>
                        • {b}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {err && <div className="error">{err}</div>}

      <div className="modal-foot">
        <button className="btn ghost" onClick={onClose}>
          取消
        </button>
        <button className="btn" onClick={optimize} disabled={busy || items.length === 0}>
          {busy ? '优化中…' : '✨ AI 优化要点'}
        </button>
        <button
          className="btn primary"
          onClick={() => exportResumeDocx(resume, categories, data.entries)}
        >
          ⬇ 导出 Word
        </button>
      </div>
    </Modal>
  );
}
