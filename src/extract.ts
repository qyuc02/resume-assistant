import mammoth from 'mammoth';

/** 从简历文件里取出纯文本。第一版支持 .docx / .txt / .md，PDF 建议先另存为 docx 或直接粘贴。 */
export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) {
    const buf = await file.arrayBuffer();
    const res = await mammoth.extractRawText({ arrayBuffer: buf });
    return (res.value || '').trim();
  }
  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return (await file.text()).trim();
  }
  throw new Error(
    name.endsWith('.pdf')
      ? '暂不支持 PDF 直接解析。请在 Word 里打开 PDF 另存为 .docx，或直接粘贴简历文字。'
      : '暂不支持该文件类型，请用 .docx / .txt / .md，或直接粘贴文本'
  );
}
