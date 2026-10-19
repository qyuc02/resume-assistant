function Swatch({ color, name }: { color: string; name: string }) {
  return (
    <div className="swatch" style={{ background: color }}>
      <span className="hex">{color}</span>
      <span className="name">{name}</span>
    </div>
  );
}

export default function StyleGuideView() {
  return (
    <section className="main sg">
      <div className="main-head">
        <div>
          <h2>设计规范</h2>
          <div className="muted">Style Guide · 新拟态 Neumorphism · 莫兰迪低饱和</div>
        </div>
      </div>

      <div className="sg-section">
        <h3>色彩 Color</h3>
        <div className="swatch-grid">
          <Swatch color="#7d94c2" name="主色 · 淡蓝" />
          <Swatch color="#74a9b5" name="辅助 · 淡青" />
          <Swatch color="#9a8fc2" name="辅助 · 淡紫" />
          <Swatch color="#c98a8a" name="危险 · 淡红" />
          <Swatch color="#46526b" name="文字 · 深灰蓝" />
          <Swatch color="#8f99ab" name="次要文字" />
          <Swatch color="#e6ebf3" name="背景 · 浅灰白" />
        </div>
      </div>

      <div className="sg-section">
        <h3>文字 Typography</h3>
        <div className="typo-demo">
          <div className="t1">标题一 · 24 / 800</div>
          <div className="t2">标题二 · 18 / 700</div>
          <div className="t3">正文 · 14 / 400 —— 这是正文文字示例，用于条目标题与描述。</div>
          <div className="t4">辅助 · 12 / 400 —— 次要说明文字、时间、占位提示。</div>
        </div>
      </div>

      <div className="sg-section">
        <h3>阴影 Shadow</h3>
        <div className="shadow-demo">
          <div className="shadow-box raised">凸起 raised</div>
          <div className="shadow-box inset">凹陷 inset</div>
        </div>
      </div>

      <div className="sg-section">
        <h3>按钮 Button</h3>
        <div className="toolbar">
          <button className="btn primary">主要按钮</button>
          <button className="btn">普通按钮</button>
          <button className="btn ghost">幽灵按钮</button>
          <button className="btn danger">危险按钮</button>
          <button className="btn small">小按钮</button>
          <button className="btn" disabled>
            禁用
          </button>
        </div>
      </div>

      <div className="sg-section">
        <h3>输入 Input</h3>
        <div className="sg-inputs">
          <input placeholder="输入框 Input" />
          <textarea rows={2} placeholder="文本域 Textarea" />
        </div>
      </div>

      <div className="sg-section">
        <h3>卡片 Card 与标签 Tag</h3>
        <div className="entry-list">
          <div className="entry-card">
            <span className="drag-handle">⠿</span>
            <div className="entry-main">
              <div className="entry-title">
                <strong>示例条目标题</strong>
                <span className="entry-role">前端开发工程师</span>
                <span className="entry-date">2024.06 - 至今</span>
              </div>
              <div className="entry-preview">负责某后台管理系统的前端架构与组件库建设…</div>
              <div className="tag-row">
                <span className="tag">React</span>
                <span className="tag">TypeScript</span>
                <span className="tag">Node.js</span>
              </div>
            </div>
            <div className="entry-actions">
              <button className="btn small">编辑</button>
            </div>
          </div>
        </div>
      </div>

      <div className="sg-section">
        <h3>圆角 Radius</h3>
        <div className="muted">大圆角：卡片 18px · 弹窗 24px · 按钮 / 输入框 12px，柔和无硬边界。</div>
      </div>
    </section>
  );
}
