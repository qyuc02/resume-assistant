import { useState } from 'react';
import LibraryView from './views/LibraryView';
import ResumeView from './views/ResumeView';
import SettingsView from './views/SettingsView';
import StudioView from './views/StudioView';
import TrackerView from './views/TrackerView';
import { useData, newResume } from './store';
import { Application } from './types';
import { uid } from './util';
import './tracker.css';
import Icon from './components/Icon';

type Tab = 'overview' | 'records' | 'upcoming' | 'studio' | 'library' | 'resumes' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: '总览' },
  { id: 'records', label: '投递记录' },
  { id: 'upcoming', label: '未来安排' },
  { id: 'studio', label: '简历工作室' },
  { id: 'library', label: '素材库' },
  { id: 'resumes', label: '简历组合' },
  { id: 'settings', label: '设置与备份' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('overview');
  const [resumeId, setResumeId] = useState('');
  const { data, update } = useData();
  function prepare(a: Application) {
    const existing = data.resumes.find(r => r.id === a.resumeId);
    if (existing && existing.targetJd === a.jd) {
      setResumeId(existing.id);
    } else {
      const r = existing ? { ...JSON.parse(JSON.stringify(existing)), id: uid(), revisions: [] } : newResume(data.personalInfo);
      r.name = `${a.company} · ${a.position}`;
      r.targetJd = a.jd;
      r.updatedAt = Date.now();
      if (!existing) r.sections = [...data.categories].sort((x,y) => x.order-y.order).map(c => ({ categoryId: c.id, entryIds: data.entries.filter(e => e.categoryId === c.id).sort((x,y) => x.order-y.order).map(e => e.id) })).filter(s => s.entryIds.length);
      update(d => ({ ...d, resumes: [...d.resumes,r], applications: d.applications.map(x => x.id === a.id ? { ...x, resumeId: r.id, updatedAt: Date.now(), history: [...(x.history || []),{ date: Date.now(),text: '创建岗位定制简历' }] } : x) }));
      setResumeId(r.id);
    }
    setTab('studio');
  }

  return (
    <div className="app career-app">
      <aside className="career-sidebar">
        <div className="career-brand"><div><strong>求职管理助手</strong><small>投递管理与简历准备</small></div></div>
        <nav className="career-nav" aria-label="主导航">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'career-nav-item active' : 'career-nav-item'}
              onClick={() => setTab(t.id)}
            >
              <span className="career-nav-icon"><Icon name={{ overview: 'home', records: 'edit', upcoming: 'calendar', studio: 'file', library: 'folder', resumes: 'layers', settings: 'settings' }[t.id]} /></span>{t.label}
            </button>
          ))}
        </nav>
        <div className="career-sidebar-footer"><strong>你的记录，保存在本机</strong><span>定期备份，把每次进展留好。</span><button onClick={() => setTab('settings')}>管理数据与备份 →</button></div>
      </aside>
      <main className="content">
        {(tab === 'overview' || tab === 'records' || tab === 'upcoming') && <TrackerView section={tab} onPrepare={prepare} />}
        {tab === 'studio' && <StudioView initialResumeId={resumeId} />}
        {tab === 'library' && <LibraryView />}
        {tab === 'resumes' && <ResumeView />}
        {tab === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}
