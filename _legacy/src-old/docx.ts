import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from 'docx';
import { Category, Entry, Resume } from './types';
import { dateRange, resolveEntry } from './util';

const FONT = { ascii: 'Calibri', eastAsia: 'Microsoft YaHei' };
const GRAY = '666666';

function contactLine(p: Resume['personalInfo']): string {
  return [p.phone, p.email, p.city, p.website, p.github].filter(Boolean).join('  |  ');
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    border: {
      bottom: { color: '000000', space: 1, style: BorderStyle.SINGLE, size: 6 },
    },
    children: [new TextRun({ text, bold: true, size: 26, font: FONT })],
  });
}

function entryTitle(title: string, role: string, e: Entry): Paragraph {
  const left = [(title || '').trim(), (role || '').trim()].filter(Boolean).join('  ·  ');
  const right = dateRange(e);
  const runs: TextRun[] = [
    new TextRun({ text: left, bold: true, size: 22, font: FONT }),
  ];
  if (right) {
    runs.push(
      new TextRun({ text: '\t', size: 20, font: FONT }),
      new TextRun({ text: right, size: 20, color: GRAY, font: FONT })
    );
  }
  return new Paragraph({
    spacing: { before: 120, after: 20 },
    tabStops: [{ type: TabStopType.RIGHT, position: 9026 }],
    children: runs,
  });
}

function locationLine(e: Entry): Paragraph | null {
  if (!(e.location || '').trim()) return null;
  return new Paragraph({
    spacing: { after: 20 },
    children: [new TextRun({ text: e.location.trim(), size: 18, color: GRAY, font: FONT })],
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 40 },
    children: [new TextRun({ text, size: 20, font: FONT })],
  });
}

export async function exportResumeDocx(
  resume: Resume,
  categories: Category[],
  entries: Entry[]
): Promise<void> {
  const pi = resume.personalInfo;
  const children: Paragraph[] = [];

  if ((pi.name || '').trim()) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new TextRun({ text: pi.name.trim(), bold: true, size: 32, font: FONT })],
      })
    );
  }
  const contact = contactLine(pi);
  if (contact) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: contact, size: 18, color: GRAY, font: FONT })],
      })
    );
  }
  const summary = (resume.summaryOverride ?? pi.summary ?? '').trim();
  if (summary) {
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: summary, size: 20, font: FONT })],
      })
    );
  }

  const entryMap = new Map(entries.map((e) => [e.id, e]));

  for (const section of resume.sections) {
    const cat = categories.find((c) => c.id === section.categoryId);
    if (!cat) continue;
    const list = section.entryIds
      .map((id) => entryMap.get(id))
      .filter((e): e is Entry => Boolean(e));
    if (list.length === 0) continue;

    children.push(sectionHeading(cat.name));
    for (const e of list) {
      const c = resolveEntry(e, resume.directionId, resume.overrides?.[e.id]);
      children.push(entryTitle(c.title, c.role, e));
      const loc = locationLine(e);
      if (loc) children.push(loc);
      for (const b of c.bullets) {
        const t = b.trim();
        if (t) children.push(bullet(t));
      }
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: 20 } },
      },
    },
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(pi.name || resume.name || '简历').trim()}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
