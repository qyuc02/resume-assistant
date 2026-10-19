import { useState } from 'react';
import { useData, getApiKey, setApiKey, migrate } from '../store';
import { AppData } from '../types';
import { emptyPersonalInfo, uid } from '../util';

export default function SettingsView() {
  const { data, update } = useData();
  const [key, setKey] = useState(getApiKey());
  const [msg, setMsg] = useState('');
  const [newDirName, setNewDirName] = useState('');
  const [renamingDir, setRenamingDir] = useState<string | null>(null);
  const [renameDirVal, setRenameDirVal] = useState('');

  function flash(m: string) {
    setMsg(m);
    setTimeout(() => setMsg(''), 3000);
  }

  function saveKey() {
    setApiKey(key.trim());
    flash('API Key 已保存在本机，调用 AI 时用于服务认证');
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `简历助手备份-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as AppData;
        if (
          !parsed ||
          !Array.isArray(parsed.categories) ||
          !Array.isArray(parsed.entries) ||
          !Array.isArray(parsed.resumes)
        ) {
          flash('文件格式不对，导入失败');
          return;
        }
        if (!confirm('导入会覆盖当前所有数据，确定吗？')) return;
        update(() => migrate(parsed));
        flash('导入成功');
      } catch (e) {
        flash('导入失败：' + (e as Error).message);
      }
    };
    reader.readAsText(file);
  }

  function clearAll() {
    if (!confirm('清空所有素材、简历与投递记录？此操作不可恢复，建议先导出备份。')) return;
    update(() => ({ personalInfo: emptyPersonalInfo(), categories: [], entries: [], resumes: [], directions: [], applications: [] }));
    flash('已清空');
  }

  const directions = [...data.directions].sort((a, b) => a.order - b.order);

  function addDirection() {
    const name = newDirName.trim();
    if (!name) return;
    update((d) => ({
      ...d,
      directions: [...d.directions, { id: uid(), name, order: d.directions.length }],
    }));
    setNewDirName('');
    flash('已添加求职方向');
  }

  function renameDirection(id: string, name: string) {
    update((d) => ({
      ...d,
      directions: d.directions.map((x) => (x.id === id ? { ...x, name: name.trim() || x.name } : x)),
    }));
  }

  function moveDirection(id: string, dir: -1 | 1) {
    update((d) => {
      const list = [...d.directions].sort((a, b) => a.order - b.order);
      const i = list.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return d;
      [list[i], list[j]] = [list[j], list[i]];
      const orderById = new Map(list.map((x, idx) => [x.id, idx]));
      return { ...d, directions: d.directions.map((x) => ({ ...x, order: orderById.get(x.id)! })) };
    });
  }

  function deleteDirection(id: string) {
    if (!confirm('删除这个方向？使用它的侧重版本会被一并删除，相关简历会退回默认版本。')) return;
    update((d) => ({
      ...d,
      directions: d.directions.filter((x) => x.id !== id),
      entries: d.entries.map((e) => ({
        ...e,
        variants: (e.variants || []).filter((v) => v.directionId !== id),
      })),
      resumes: d.resumes.map((r) => (r.directionId === id ? { ...r, directionId: '' } : r)),
    }));
  }

  return (
    <section className="main settings">
      <h2>设置</h2>

      <div className="panel">
        <div className="panel-head">
          <span>AI（DeepSeek）</span>
        </div>
        <div className="panel-body">
          <label className="field">
            <span>DeepSeek API Key</span>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-..."
            />
          </label>
          <p className="muted">
            用于简历诊断、改写和解析。Key 保存在本机，调用 AI 时用于认证，相关简历内容会发送给 DeepSeek；也可以不填这里，改填项目目录下的
            config.json。可在 platform.deepseek.com 申请。
          </p>
          <button className="btn primary" onClick={saveKey}>
            保存
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span>求职方向</span>
        </div>
        <div className="panel-body">
          <p className="muted">
            给经历条目定制「侧重版本」时使用——同一段经历可为每个方向各存一套侧重要点。
          </p>
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <input
              style={{ width: 220 }}
              value={newDirName}
              onChange={(e) => setNewDirName(e.target.value)}
              placeholder="如：前端开发 / 数据挖掘"
              onKeyDown={(e) => {
                if (e.key === 'Enter') addDirection();
              }}
            />
            <button className="btn primary" onClick={addDirection}>
              + 新增方向
            </button>
          </div>
          {directions.length === 0 ? (
            <div className="empty">还没有求职方向</div>
          ) : (
            <ul className="cat-list">
              {directions.map((d) => (
                <li key={d.id} className="cat-item">
                  {renamingDir === d.id ? (
                    <input
                      autoFocus
                      value={renameDirVal}
                      onChange={(e) => setRenameDirVal(e.target.value)}
                      onBlur={() => {
                        renameDirection(d.id, renameDirVal);
                        setRenamingDir(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          renameDirection(d.id, renameDirVal);
                          setRenamingDir(null);
                        }
                      }}
                    />
                  ) : (
                    <span className="cat-name">{d.name}</span>
                  )}
                  <span className="cat-actions" style={{ display: 'flex' }}>
                    <button
                      className="icon-btn"
                      title="重命名"
                      onClick={() => {
                        setRenamingDir(d.id);
                        setRenameDirVal(d.name);
                      }}
                    >
                      ✎
                    </button>
                    <button className="icon-btn" title="上移" onClick={() => moveDirection(d.id, -1)}>
                      ↑
                    </button>
                    <button className="icon-btn" title="下移" onClick={() => moveDirection(d.id, 1)}>
                      ↓
                    </button>
                    <button className="icon-btn danger" title="删除" onClick={() => deleteDirection(d.id)}>
                      🗑
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span>数据</span>
        </div>
        <div className="panel-body">
          <p className="muted">
            素材、简历与投递记录保存在本机浏览器，备份包含投递快照。调用 AI 时会发送相关内容。建议定期导出备份。
          </p>
          <div className="toolbar">
            <button className="btn" onClick={exportData}>
              ⬇ 导出备份 (JSON)
            </button>
            <label className="btn ghost">
              ⬆ 导入备份
              <input
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importData(f);
                  e.target.value = '';
                }}
              />
            </label>
            <button className="btn danger" onClick={clearAll}>
              清空所有数据
            </button>
          </div>
        </div>
      </div>

      {msg && <div className="toast">{msg}</div>}
    </section>
  );
}
