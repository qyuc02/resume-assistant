import type { Resume, Experience, Category, Profile } from '../types';
import { bulletsFor, dateRange } from '../util';

/** A4 预览。所见即所得，按分类分组：每个分类一个大项标题，下面放该分类的经历。 */
export default function ResumePaper({
  resume,
  categories,
  experiences,
  profile,
}: {
  resume: Resume;
  categories: Category[];
  experiences: Experience[];
  profile: Profile;
}) {
  const expById = new Map(experiences.map((e) => [e.id, e]));
  const sortedCats = [...categories].sort((a, b) => a.order - b.order);
  const contact = [profile.phone, profile.email, profile.city, profile.website, profile.github].filter((x) => x.trim());

  return (
    <div className="paper">
      <div className="paper-name">{profile.name.trim() || '你的姓名'}</div>
      {contact.length > 0 && <div className="paper-contact">{contact.join('  |  ')}</div>}

      {(resume.summaryOverride ?? profile.summary).trim() && (
        <div className="paper-summary">{(resume.summaryOverride ?? profile.summary).trim()}</div>
      )}

      {sortedCats.map((cat) => {
        const list = resume.items
          .map((item) => ({ item, exp: expById.get(item.experienceId) }))
          .filter((x): x is { item: typeof x.item; exp: Experience } => !!x.exp && x.exp.categoryId === cat.id)
          .sort((a, b) => a.item.order - b.item.order);
        if (!list.length) return null;
        return (
          <div key={cat.id}>
            <h3 className="paper-sec">{cat.name}</h3>
            {list.map(({ item, exp }) => (
              <div className="paper-entry" key={item.experienceId}>
                <div className="paper-entry-head">
                  <span>
                    {exp.title}
                    {exp.role && ` · ${exp.role}`}
                  </span>
                  <span>{dateRange(exp)}</span>
                </div>
                {(exp.location.trim() || exp.tags.length > 0) && (
                  <div className="paper-entry-meta">
                    {exp.location.trim()}
                    {exp.location.trim() && exp.tags.length > 0 && ' · '}
                    {exp.tags.join(' · ')}
                  </div>
                )}
                <ul>
                  {bulletsFor(exp, item).map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        );
      })}

      {resume.items.length === 0 && (
        <p className="muted" style={{ textAlign: 'center', marginTop: 40 }}>
          这份简历还没有内容，从左侧「添加经历」开始。
        </p>
      )}
    </div>
  );
}
