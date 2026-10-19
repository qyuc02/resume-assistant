import { useRef, useState } from 'react';
import Modal from './Modal';
import { useData } from '../store';
import { uid } from '../util';
import { aiParse, ParsedResume } from '../api';
import { extractTextFromFile, ACCEPT } from '../extract';

export default function UploadModal({ onClose }: { onClose: () => void }) {
  const { update } = useData();
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState('');
  const [stage, setStage] = useState<'input' | 'working' | 'preview'>('input');
  const [workingLabel, setWorkingLabel] = useState('');
  const [result, setResult] = useState<ParsedResume | null>(null);
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function start() {
    setErr('');
    if (!file && !pasted.trim()) {
      setErr('请先选择文件，或粘贴简历文字');
      return;
    }
    try {
      setStage('working');
      setWorkingLabel('正在提取文字…');
      const text = file ? await extractTextFromFile(file) : pasted;
      if (!text.trim()) {
        setErr('没有提取到文字，请换一个文件或直接粘贴');
        setStage('input');
        return;
      }
      setWorkingLabel('AI 正在解析分类…');
      const r = await aiParse(text);
      setResult(r);
      setStage('preview');
    } catch (e) {
      setErr((e as Error).message || '解析失败');
      setStage('input');
    }
  }

  function doImport() {
    if (!result) return;
    update((d) => {
      const categories = [...d.categories];
      const entries = [...d.entries];
      const catByName = new Map(categories.map((c) => [c.name.trim(), c.id]));

      for (const sec of result.sections || []) {
        const name = (sec.name || '').trim();
        if (!name) continue;
        let catId = catByName.get(name);
        if (!catId) {
          catId = uid();
          categories.push({ id: catId, name, order: categories.length });
          catByName.set(name, catId);
        }
        for (const en of sec.entries || []) {
          const bullets = (en.bullets || []).map((b) => String(b).trim()).filter(Boolean);
          const tags = (en.tags || []).map((t) => String(t).trim()).filter(Boolean);
          const title = (en.title || '').trim();
          const role = (en.role || '').trim();
          if (!title && !role && bullets.length === 0) continue;
          entries.push({
            id: uid(),
            categoryId: catId,
            title,
            role,
            startDate: (en.startDate || '').trim(),
            endDate: (en.endDate || '').trim(),
            location: (en.location || '').trim(),
            bullets,
            tags,
            order: entries.filter((e) => e.categoryId === catId).length,
          });
        }
      }

      const pi = { ...d.personalInfo };
      for (const k of ['name', 'phone', 'email', 'city', 'website', 'github', 'summary'] as const) {
        const v = (result.personalInfo?.[k] || '').trim();
        if (v && !pi[k]) pi[k] = v;
      }

      return { ...d, categories, entries, personalInfo: pi };
    });
    onClose();
  }

  const totalEntries = (result?.sections || []).reduce((n, s) => n + (s.entries?.length || 0), 0);

  return (
    <Modal title="上传简历 · 自动分类" onClose={onClose} width={680}>
      {stage === 'input' && (
        <>
          <div
            className="dropzone"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) setFile(f);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              style={{ display: 'none' }}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {file ? (
              <div className="dropzone-file">
                <strong>{file.name}</strong>
                <span className="muted">{(file.size / 1024).toFixed(0)} KB · 点击可更换</span>
              </div>
            ) : (
              <div>
                <div className="dropzone-icon">📄</div>
                <div>点击选择或拖入文件</div>
                <div className="muted">支持 .docx / .pdf / .txt / .md</div>
              </div>
            )}
          </div>

          <div className="or-divider">或直接粘贴简历文字</div>
          <textarea
            rows={6}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="把简历全文粘贴到这里…"
            disabled={!!file}
          />

          {err && <div className="error">{err}</div>}

          <div className="modal-foot">
            <button className="btn ghost" onClick={onClose}>
              取消
            </button>
            <button className="btn primary" onClick={start}>
              开始解析
            </button>
          </div>
        </>
      )}

      {stage === 'working' && (
        <div className="working">
          <div className="spinner" />
          <div>{workingLabel}</div>
          <div className="muted">AI 分析可能需要几秒到十几秒</div>
        </div>
      )}

      {stage === 'preview' && result && (
        <>
          <div className="jd-result">
            <div className="jd-result-count">
              解析出 {totalEntries} 条经历，{result.sections?.length || 0} 个模块
            </div>
            {result.personalInfo && (
              <div className="pi-preview muted">
                {['name', 'phone', 'email', 'city'].map((k) => result.personalInfo?.[k]).filter(Boolean).join('  ·  ')}
              </div>
            )}
          </div>

          <div className="preview-list">
            {(result.sections || []).map((sec, i) => (
              <div className="preview-section" key={i}>
                <div className="preview-section-name">
                  {sec.name} <span className="muted">({sec.entries?.length || 0})</span>
                </div>
                {(sec.entries || []).map((en, j) => (
                  <div className="preview-entry" key={j}>
                    <strong>{en.title || '(未命名)'}</strong>
                    {en.role && <span className="entry-role"> {en.role}</span>}
                    {en.bullets && en.bullets.length > 0 && (
                      <div className="entry-preview">{en.bullets[0]}</div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {err && <div className="error">{err}</div>}

          <div className="modal-foot">
            <button
              className="btn ghost"
              onClick={() => {
                setStage('input');
                setResult(null);
              }}
            >
              重新解析
            </button>
            <button className="btn primary" onClick={doImport}>
              导入素材库
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
