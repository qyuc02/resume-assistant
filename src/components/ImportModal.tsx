import { useState } from 'react';
import Modal from './Modal';
import { callAi, getApiKey } from '../api';
import { extractText } from '../extract';
import type { Profile } from '../types';

export interface ImportedExperience {
  title: string;
  role: string;
  startDate: string;
  endDate: string;
  location: string;
  bullets: string[];
  tags: string[];
}
export interface ImportedSection {
  name: string;
  experiences: ImportedExperience[];
}
export interface ImportResult {
  profile?: Partial<Profile>;
  sections: ImportedSection[];
}

export default function ImportModal({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (result: ImportResult) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [parsed, setParsed] = useState<ImportResult | null>(null);
  const hasKey = !!getApiKey();

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setError('');
    try {
      const t = await extractText(file);
      setText(t);
      setParsed(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function runParse() {
    if (!text.trim()) {
      setError('请先粘贴简历文字或选择文件');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await callAi<ImportResult>('parse', { text });
      setParsed(result);
      if (!result.sections?.length) setError('没能识别出经历条目，可以改用「整段存入」再手动拆分。');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function importRaw() {
    if (!text.trim()) {
      setError('请先粘贴简历文字或选择文件');
      return;
    }
    onImport({ sections: [{ name: '导入的简历', experiences: [{ title: '待拆分的简历原文', role: '', startDate: '', endDate: '', location: '', bullets: text.split('\n').filter((l) => l.trim()), tags: [] }] }] });
  }

  return (
    <Modal
      title="导入简历"
      onClose={onClose}
      width={680}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          {parsed && parsed.sections.length > 0 ? (
            <button className="btn primary" onClick={() => onImport(parsed)}>
              确认导入 {parsed.sections.reduce((n, s) => n + s.experiences.length, 0)} 条经历
            </button>
          ) : (
            <button className="btn primary" disabled={busy || !hasKey} onClick={runParse}>
              {busy ? '正在识别…' : 'AI 智能拆分'}
            </button>
          )}
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label className="field">
          <span>选择文件（.docx / .txt / .md）</span>
          <input
            type="file"
            accept=".docx,.txt,.md"
            onChange={(e) => {
              pickFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>

        <label className="field">
          <span>或直接粘贴简历文字</span>
          <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="把简历全文粘贴到这里" />
        </label>

        {error && <div className="error-text">{error}</div>}

        {!hasKey && (
          <p className="muted">
            AI 智能拆分需要在「设置」里填写 DeepSeek API Key。没填也可以点下面的「整段存入」，之后手动拆成条目。
            <button className="btn small" style={{ marginLeft: 8 }} onClick={importRaw}>
              整段存入
            </button>
          </p>
        )}

        {parsed && parsed.sections.length > 0 && (
          <div>
            <h4 style={{ marginBottom: 8 }}>识别结果预览</h4>
            {parsed.sections.map((s, i) => (
              <div className="card" key={i} style={{ marginBottom: 8 }}>
                <strong>{s.name}</strong>
                <span className="muted" style={{ marginLeft: 8 }}>
                  {s.experiences.length} 条
                </span>
                {s.experiences.slice(0, 3).map((e, j) => (
                  <div key={j} className="muted" style={{ marginTop: 4 }}>
                    {e.title}
                    {e.role && ` · ${e.role}`} — {e.bullets.length} 个要点
                  </div>
                ))}
              </div>
            ))}
            {parsed.profile?.name && <p className="muted">同时识别到姓名：{parsed.profile.name}，导入后会更新你的基本信息。</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}
