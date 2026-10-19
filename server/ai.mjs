// DeepSeek AI 代理。Key 可选：没配就不调用，本地功能完全不受影响。
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

const STAR_RULE =
  '改写要点严格遵循 STAR 原则：Situation(情境)交代背景、Task(任务)说明目标、Action(行动)写出具体做了什么、Result(结果)给出可量化成果与影响。' +
  '每个要点尽量包含「行动 + 量化结果」，突出「做了什么、带来什么价值」，避免只罗列职责。' +
  '严格保持职位、公司、技能、数字等事实，不编造指标；缺少数据时用已知事实表述，不用占位符。';

async function callDeepSeek(apiKey, messages, temperature = 0.2) {
  const resp = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: DEEPSEEK_MODEL, messages, temperature, stream: false, max_tokens: 4000 }),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await resp.text();
  if (!resp.ok) {
    let detail = text.slice(0, 300);
    try {
      detail = JSON.parse(text)?.error?.message || detail;
    } catch {}
    throw new Error(`DeepSeek ${resp.status}: ${detail}`);
  }
  const data = JSON.parse(text);
  return data.choices?.[0]?.message?.content ?? '';
}

function parseJson(text) {
  const cleaned = String(text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  return JSON.parse(cleaned);
}

function buildMessages(task, payload) {
  if (task === 'review') {
    return [
      {
        role: 'system',
        content:
          '你是帮助求职者挖掘真实经历的简历教练。逐条诊断经历，并结合目标岗位（可能为空）指出最具体的一个问题、修改依据、' +
          '最多 3 个待补充问题，再逐条给出改写建议。' +
          STAR_RULE +
          '不要强行让每条都符合完整 STAR；不需要改动的条目可省略。每段经历最多一个建议。' +
          '建议必须以「原句 → 建议句」逐条给出：original 必须与传入原文的对应要点逐字一致（不要改动、不要概括），' +
          'revised 是该句改写后的完整句子；要新增的要点 original 给空字符串，要删除某句时 revised 给空字符串。' +
          '只输出 JSON：{"suggestions":[{"experienceId":"原id","issue":"具体问题","reason":"为什么改及依据","questions":["问题"],"edits":[{"original":"原文原句","revised":"建议句"}]}]}',
      },
      {
        role: 'user',
        content: JSON.stringify({ jd: payload.jd || '', entries: payload.entries || [] }),
      },
    ];
  }
  if (task === 'polish') {
    return [
      {
        role: 'system',
        content: '你是资深简历文案润色专家。把描述改写得更有力、更量化、更专业。' + STAR_RULE + '保持原文语言，不要凭空捏造数据。只输出 JSON：{"polished":"改写后的内容"}',
      },
      { role: 'user', content: `原文：\n${payload.text || ''}` },
    ];
  }
  if (task === 'parse') {
    return [
      {
        role: 'system',
        content:
          '你是简历解析专家。把简历原文解析成结构化数据。要求：' +
          '1. 个人信息：name、phone、email、city、website、github、summary。' +
          '2. 经历归类到中文模块，如：教育经历、实习与工作、项目经历、技能与证书。' +
          '3. 每条经历字段：title(公司/项目/学校名)、role(职位)、startDate、endDate、location、bullets(要点数组)、tags(关键词数组)。' +
          '4. 忠实原文，不编造；缺失字段留空字符串。技能/证书类可合并成一条（内容放 bullets）。' +
          '只输出 JSON：{"profile":{"name":"","phone":"","email":"","city":"","website":"","github":"","summary":""},"sections":[{"name":"模块名","experiences":[{"title":"","role":"","startDate":"","endDate":"","location":"","bullets":[""],"tags":[""]}]}]}',
      },
      { role: 'user', content: `简历原文：\n${String(payload.text || '').slice(0, 12000)}` },
    ];
  }
  if (task === 'learn') {
    return [
      {
        role: 'system',
        content:
          '你是求职学习规划专家。根据岗位 JD 提炼该岗位需要掌握的知识点/技能，并为每个知识点给出具体的学习内容。' +
          '要求：1) 每个知识点给出 name（知识点名，简洁）、category（分类，如 编程语言/框架/数据库/中间件/系统设计/算法/软技能/工具）、' +
          'priority（必学/加分/了解：JD 明确要求=必学，加分项=加分，背景了解=了解）、reason（一句话说明为什么这个岗位需要）、' +
          'topics（该知识点下需要掌握的具体内容要点，3-8 条，字符串数组，覆盖核心概念/常见用法/高频考点）。' +
          '2) 按优先级排序，必学在前。3) 只基于 JD 原文提炼，不编造。' +
          '只输出 JSON：{"points":[{"name":"","category":"","priority":"","reason":"","topics":[""]}]}',
      },
      { role: 'user', content: `岗位：${payload.position || ''}\nJD：\n${String(payload.jd || '').slice(0, 8000)}` },
    ];
  }
  if (task === 'interview') {
    return [
      {
        role: 'system',
        content:
          '你是资深面试教练。根据岗位 JD 和候选人的简历，生成面试中可能被问到的问题清单。' +
          '要求：1) 每个问题给出 question（问题）、type（技术/项目/行为/其他）、reason（为什么可能问，一句话）、points（答题要点，2-5 条）。' +
          '2) 项目深挖类问题要基于简历里的具体经历；技术类问题围绕 JD 要求的技术栈。3) 覆盖全面但不冗余，按重要性排序。' +
          '只输出 JSON：{"questions":[{"question":"","type":"","reason":"","points":[""]}]}',
      },
      {
        role: 'user',
        content: `岗位：${payload.position || ''}\nJD：\n${String(payload.jd || '').slice(0, 6000)}\n\n候选人简历：\n${String(payload.resumeText || '').slice(0, 6000)}`,
      },
    ];
  }
  return null;
}

export async function runAi(task, payload, apiKey) {
  const messages = buildMessages(task, payload);
  if (!messages) throw new Error('未知任务类型');
  const content = await callDeepSeek(apiKey, messages);
  return parseJson(content);
}
