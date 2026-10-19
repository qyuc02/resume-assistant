import { Document, Packer, Paragraph, TextRun, AlignmentType, TabStopType } from 'docx';
import type { Resume, Experience, Category, Profile } from './types';
import { bulletsFor, dateRange } from './util';

const FONT = 'Microsoft YaHei';
const GRAY = '666666';

function contactLine(p: Profile): string {
  return [p.phone, p.email, p.city, p.website, p.github].filter((x) => x.trim()).join('  |  ');
}

function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    border: { bottom: { style: 'single', size: 6, color: '333333' } },
    children: [new TextRun({ text, bold: true, size: 22, font: FONT })],
  });
}

function entryHead(exp: Experience): Paragraph {
  const left = [exp.title, exp.role].filter((x) => x.trim()).join('  ·  ');
  const right = dateRange(exp);
  const runs = [new TextRun({ text: left, bold: true, size: 21, font: FONT })];
  if (right) {
    runs.push(
      new TextRun({ text: '\t', size: 20, font: FONT }),
      new TextRun({ text: right, size: 19, color: GRAY, font: FONT })
    );
  }
  return new Paragraph({
    spacing: { before: 120, after: 20 },
    tabStops: [{ type: TabStopType.RIGHT, position: 9026 }],
    children: runs,
  });
}

function metaLine(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 20 },
    children: [new TextRun({ text, size: 18, color: GRAY, font: FONT })],
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 40 },
    children: [new TextRun({ text, size: 20, font: FONT })],
  });
}

/** 按分类分组导出：分类标题 → 该分类下的经历条目。 */
export async function exportResumeDocx(
  resume: Resume,
  categories: Category[],
  experiences: Experience[],
  profile: Profile
): Promise<void> {
  const children: Paragraph[] = [];
  const name = profile.name.trim();

  if (name) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new TextRun({ text: name, bold: true, size: 34, font: FONT })],
      })
    );
  }
  const contact = contactLine(profile);
  if (contact) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: contact, size: 18, color: GRAY, font: FONT })],
      })
    );
  }

  const summary = (resume.summaryOverride ?? profile.summary).trim();
  if (summary) {
    children.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: summary, size: 20, font: FONT })] }));
  }

  const expById = new Map(experiences.map((e) => [e.id, e]));
  const sortedCats = [...categories].sort((a, b) => a.order - b.order);

  for (const cat of sortedCats) {
    const list = resume.items
      .map((item) => ({ item, exp: expById.get(item.experienceId) }))
      .filter((x): x is { item: typeof x.item; exp: Experience } => !!x.exp && x.exp.categoryId === cat.id)
      .sort((a, b) => a.item.order - b.item.order);
    if (!list.length) continue;

    children.push(sectionTitle(cat.name));
    for (const { item, exp } of list) {
      const lines = bulletsFor(exp, item);
      children.push(entryHead(exp));
      if (exp.location.trim()) children.push(metaLine(exp.location));
      if (exp.tags.length) children.push(metaLine(exp.tags.join(' · ')));
      for (const b of lines) if (b.trim()) children.push(bullet(b.trim()));
    }
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(name || resume.name || '简历').trim()}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
