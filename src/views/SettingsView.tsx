import { useState } from 'react';
import { useData } from '../App';
import { getApiKey, setApiKey } from '../api';
import type { AppData } from '../types';
import ConfirmModal from '../components/ConfirmModal';

export default function SettingsView() {
  const { data, update } = useData();
  const [key, setKey] = useState(getApiKey());
  const [msg, setMsg] = useState('');
  const [confirming, setConfirming] = useState<null | { title: string; message: string; confirmText: string; action: () => void }>(null);

  function flash(m: string) {
    setMsg(m);
    setTimeout(() => setMsg(''), 3000);
  }

  function saveKey() {
    setApiKey(key.trim());
    flash('已保存在本机。AI 功能不填也能正常使用其他全部功能。');
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `简历助手备份-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    flash('备份已下载');
  }

  function importData(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as AppData;
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.experiences) || !Array.isArray(parsed.resumes)) {
          flash('文件格式不对，导入失败');
          return;
        }
        setConfirming({
          title: '导入备份',
          message: '导入会覆盖当前所有数据，确定吗？',
          confirmText: '确认导入',
          action: () => {
            update(() => parsed);
            flash('导入成功');
          },
        });
      } catch (e) {
        flash('导入失败：' + (e as Error).message);
      }
    };
    reader.readAsText(file);
  }

  function clearAll() {
    setConfirming({
      title: '清空所有数据',
      message: '清空所有经历、简历与投递记录？此操作不可恢复，建议先导出备份。',
      confirmText: '确认清空',
      action: () => {
        update(() => ({
          schemaVersion: data.schemaVersion,
          profile: { name: '', phone: '', email: '', city: '', website: '', github: '', summary: '' },
          categories: [],
          experiences: [],
          resumes: [],
          applications: [],
        }));
        flash('已清空，分类会在下次读取时自动补回默认项');
      },
    });
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>设置与数据</h1>
          <div className="sub">数据只存在本机（应用数据目录），每次保存都会自动留一份备份。</div>
          <div className="toolbar" style={{ marginTop: 10 }}>
            <span className="badge accent">本机存储 · 不上传</span>
            <span className="badge violet">{data.experiences.length} 条经历</span>
            <span className="badge teal">{data.resumes.length} 份简历</span>
            <span className="badge amber">{data.applications.length} 条投递</span>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>基本信息</h3>
        </div>
        <div className="form-grid">
          {(
            [
              ['name', '姓名'],
              ['phone', '电话'],
              ['email', '邮箱'],
              ['city', '城市'],
              ['website', '个人网站'],
              ['github', 'GitHub'],
            ] as const
          ).map(([k, label]) => (
            <label className="field" key={k}>
              <span>{label}</span>
              <input
                value={data.profile[k]}
                onChange={(e) => update((d) => ({ ...d, profile: { ...d.profile, [k]: e.target.value } }))}
              />
            </label>
          ))}
          <label className="field span-2">
            <span>默认个人简介（各份简历可单独改写，不影响这里）</span>
            <textarea rows={3} value={data.profile.summary} onChange={(e) => update((d) => ({ ...d, profile: { ...d.profile, summary: e.target.value } }))} />
          </label>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>AI（DeepSeek）</h3>
        </div>
        <label className="field">
          <span>API Key</span>
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-..." />
        </label>
        <p className="muted" style={{ marginTop: 8 }}>
          用于简历解析、按 JD 诊断、学习规划、面试准备和要点润色。Key 只存在本机。
          只有在你主动点击 AI 功能时，相关简历 / JD 内容才会发送给 DeepSeek，<strong>不会自动上传</strong>；
          <strong>不填 Key 也不影响其他任何功能。</strong>可在 platform.deepseek.com 申请。
        </p>
        <button className="btn primary" style={{ marginTop: 10 }} onClick={saveKey}>
          保存
        </button>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>备份</h3>
        </div>
        <p className="muted">
          数据文件存在本机应用数据目录（<code>app-data.json</code>），每次保存前会自动备份到 <code>backups/</code>（保留最近 20 份）。
        </p>
        <div className="toolbar" style={{ marginTop: 10 }}>
          <button className="btn" onClick={exportData}>
            导出备份 JSON
          </button>
          <label className="btn">
            导入备份
            <input type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => { importData(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <button className="btn danger" onClick={clearAll}>
            清空所有数据
          </button>
        </div>
      </div>

      {msg && (
        <div className="panel" style={{ borderColor: '#a7f3d0', background: '#ecfdf5' }}>
          <span style={{ fontSize: 13, color: '#047857' }}>{msg}</span>
        </div>
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
}
