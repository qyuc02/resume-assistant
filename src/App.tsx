import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { AppData } from './types';
import { fetchData, saveData } from './api';
import ArchiveView from './views/ArchiveView';
import ResumeView from './views/ResumeView';
import TrackerView from './views/TrackerView';
import SettingsView from './views/SettingsView';
import LearnView from './views/LearnView';
import Icon from './components/Icon';
import Onboarding from './components/Onboarding';
import './styles.css';

type Tab = 'archive' | 'resume' | 'tracker' | 'learn' | 'settings';

const TABS: { id: Tab; label: string; icon: string; hint: string }[] = [
  { id: 'archive', label: '经历档案', icon: 'folder', hint: '只记事实，长期复用' },
  { id: 'resume', label: '简历', icon: 'file', hint: '挑经历、定讲法、导出' },
  { id: 'tracker', label: '投递记录', icon: 'send', hint: '跟踪进度与快照' },
  { id: 'learn', label: '学习中心', icon: 'book', hint: '按岗位学知识' },
  { id: 'settings', label: '设置', icon: 'settings', hint: '备份与 AI' },
];

const TAB_TONE: Record<Tab, string> = {
  archive: 'linear-gradient(135deg,#2b6cf6,#5b8cff)',
  resume: 'linear-gradient(135deg,#7c5cf0,#a78bfa)',
  tracker: 'linear-gradient(135deg,#f59e0b,#fbbf24)',
  learn: 'linear-gradient(135deg,#ec4899,#f472b6)',
  settings: 'linear-gradient(135deg,#0ea5a4,#2dd4bf)',
};

type SaveState = 'saved' | 'saving' | 'error';

interface Ctx {
  data: AppData;
  update: (fn: (d: AppData) => AppData) => void;
  goResume: (id: string) => void;
  goLearn: () => void;
}

const DataCtx = createContext<Ctx | null>(null);

export function useData(): Ctx {
  const c = useContext(DataCtx);
  if (!c) throw new Error('useData 必须在 App 内部使用');
  return c;
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [tab, setTab] = useState<Tab>('archive');
  const [selectedResume, setSelectedResume] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [fatal, setFatal] = useState('');
  const [showOnboard, setShowOnboard] = useState(() => {
    try {
      return !localStorage.getItem('resume-assistant-onboarded');
    } catch {
      return true;
    }
  });

  // rev：本地改动的版本号。只有本地真正改了东西才 +1，
  // 服务端回写（setData(saved)）不算改动，否则会陷入「保存 → 数据变了 → 再保存」的死循环。
  const rev = useRef(0);
  const savedRev = useRef(0);
  const latest = useRef<AppData | null>(null);
  latest.current = data;

  useEffect(() => {
    fetchData()
      .then((d) => setData(d))
      .catch((e) => setFatal(e.message));
  }, []);

  // 改动后自动保存到服务端文件（防抖，避免每敲一个字就写盘）
  useEffect(() => {
    if (!data) return;
    if (rev.current === savedRev.current) return; // 没有待保存的改动
    const myRev = rev.current;
    setSaveState('saving');
    const t = setTimeout(() => {
      saveData(data)
        .then((saved) => {
          // 这 700ms 里又改了东西：本次结果已过期，丢弃，等下一轮再存
          if (myRev !== rev.current) return;
          savedRev.current = myRev;
          setData(saved);
          setSaveState('saved');
        })
        .catch((e) => {
          if (myRev !== rev.current) return;
          setSaveState('error');
          setFatal(e.message);
        });
    }, 700);
    return () => clearTimeout(t);
  }, [data]);

  // 关页面/刷新前，把还没落盘的改动补发一次，避免最后 700ms 的编辑丢失
  useEffect(() => {
    const flush = () => {
      if (rev.current === savedRev.current) return;
      const d = latest.current;
      if (!d) return;
      try {
        navigator.sendBeacon?.('/api/data', new Blob([JSON.stringify({ data: d })], { type: 'application/json' }));
      } catch {}
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, []);

  const update = (fn: (d: AppData) => AppData) => {
    rev.current += 1;
    setData((d) => (d ? fn(d) : d));
  };
  const goResume = (id: string) => {
    setSelectedResume(id);
    setTab('resume');
  };
  const goLearn = () => {
    setTab('learn');
  };

  if (fatal) {
    return (
      <div className="boot">
        <div className="boot-card">
          <h1>出了点问题</h1>
          <p className="error-text">{fatal}</p>
          <p className="muted">数据文件在项目目录 data/app-data.json，每次保存都会自动留备份，不会丢。</p>
          <button className="btn primary" onClick={() => location.reload()}>
            重新加载
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="boot">
        <div className="boot-card">
          <h1>简历助手</h1>
          <p className="muted">正在读取本机数据…</p>
        </div>
      </div>
    );
  }

  const ctx: Ctx = { data, update, goResume, goLearn };

  return (
    <DataCtx.Provider value={ctx}>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark" style={{ background: TAB_TONE[tab] }}>
              简
            </div>
            <div className="brand-text">
              <strong>Hi，{data.profile.name.trim() || '朋友'}</strong>
            </div>
          </div>
          <nav className="nav">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={tab === t.id ? 'nav-item active' : 'nav-item'}
                onClick={() => setTab(t.id)}
              >
                <Icon name={t.icon} />
                <span className="nav-text">
                  <strong>{t.label}</strong>
                  <small>{t.hint}</small>
                </span>
              </button>
            ))}
          </nav>
          <div className="sidebar-foot">
            <span className={saveState === 'error' ? 'save-dot error' : saveState === 'saving' ? 'save-dot saving' : 'save-dot'} />
            <span className="save-label">
              {saveState === 'saving' ? '保存中…' : saveState === 'error' ? '保存失败' : '已保存到本机'}
            </span>
          </div>
        </aside>

        <main className="content">
          {tab === 'archive' && <ArchiveView />}
          {tab === 'resume' && <ResumeView selectedId={selectedResume} onSelect={setSelectedResume} />}
          {tab === 'tracker' && <TrackerView />}
          {tab === 'learn' && <LearnView />}
          {tab === 'settings' && <SettingsView />}
        </main>
      </div>

      {showOnboard && data.experiences.length === 0 && data.resumes.length === 0 && (
        <Onboarding
          onClose={() => {
            setShowOnboard(false);
            try {
              localStorage.setItem('resume-assistant-onboarded', '1');
            } catch {}
          }}
          goArchive={() => setTab('archive')}
          goResume={() => setTab('resume')}
          goTracker={() => setTab('tracker')}
        />
      )}
    </DataCtx.Provider>
  );
}
