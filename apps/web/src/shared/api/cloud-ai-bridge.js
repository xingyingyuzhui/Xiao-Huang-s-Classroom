/**
 * Public-web AI path: authenticated CloudClient.chatAi only.
 * Lab /api/ai stays for Electron. Prompts mirror apps/server AI services.
 */

/** @typedef {{ role: 'system' | 'user' | 'assistant', content: string }} ChatMessage */

/** @type {((input: { messages: ChatMessage[], temperature?: number, maxTokens?: number }) => Promise<{ text: string, model?: string }>) | null} */
let cloudChat = null;

/** @param {typeof cloudChat} fn */
export function setCloudAiChat(fn) {
  cloudChat = fn;
}

export function hasCloudAiChat() {
  return typeof cloudChat === 'function';
}

function assertOnline() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('离线时云端 AI 不可用');
  }
}

/**
 * @param {{ system: string, user: string, temperature?: number, maxTokens?: number }} opts
 */
async function chat(opts) {
  if (!cloudChat) {
    throw new Error('请先登录后再使用云端 AI');
  }
  assertOnline();
  const result = await cloudChat({
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
  });
  return String(result?.text || '').trim();
}

function parseModelJson(content) {
  let text = String(content || '').trim();
  const tryParse = (raw) => JSON.parse(raw);
  try {
    return tryParse(text);
  } catch {
    /* continue */
  }
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return tryParse(text);
  } catch {
    /* continue */
  }
  const objectStart = text.indexOf('{');
  const objectEnd = text.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    return tryParse(text.slice(objectStart, objectEnd + 1).replace(/,\s*([\]}])/g, '$1'));
  }
  const arrayStart = text.indexOf('[');
  const arrayEnd = text.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return tryParse(text.slice(arrayStart, arrayEnd + 1));
  }
  throw new Error('模型返回不是合法 JSON');
}

function subjectQuizDomain(sid) {
  if (sid === 'math') return { name: '数学', teacher: '高中数学命题老师' };
  if (sid === 'physics') return { name: '物理', teacher: '高中物理命题老师' };
  if (sid === 'biology') return { name: '生物', teacher: '高中生物命题老师' };
  return { name: '化学', teacher: '高中化学命题老师' };
}

function formatOptions(options) {
  return Array.isArray(options)
    ? options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')
    : '';
}

function normalizeQuizQuestions(raw, expectCount) {
  let list = raw;
  if (raw && Array.isArray(raw.questions)) list = raw.questions;
  if (!Array.isArray(list)) throw new Error('题目列表无效');
  const out = [];
  for (let index = 0; index < list.length; index += 1) {
    const question = list[index] || {};
    const stem = String(question.stem || question.question || '').trim();
    let options = question.options;
    if (!Array.isArray(options)) {
      options = [question.A, question.B, question.C, question.D].filter((item) => item != null);
    }
    options = options.map((item) => String(item ?? '').trim()).filter(Boolean);
    if (options.length > 4) options = options.slice(0, 4);
    while (options.length < 4) options.push(`选项${options.length + 1}`);
    let answer = question.answer;
    if (typeof answer === 'string') {
      const match = answer.trim().toUpperCase().match(/^[A-D]/);
      answer = match ? match[0].charCodeAt(0) - 65 : Number(answer);
    }
    answer = Number(answer);
    if (!Number.isInteger(answer) || answer < 0 || answer > 3 || !stem) continue;
    out.push({
      id: String(question.id || `q${index + 1}`),
      stem,
      options,
      answer,
      knowledge: String(question.knowledge || question.topic || '').trim(),
      hint: String(question.hint || '').trim(),
      explain: String(question.explain || question.explanation || '').trim(),
    });
  }
  if (!out.length) throw new Error('未生成有效题目');
  return expectCount > 0 && out.length > expectCount ? out.slice(0, expectCount) : out;
}

const HANDLERS = {
  async generate(payload) {
    const text = await chat({
      system: `你是高中化学教学助手，生成可用于 3D 球棍模型的小分子。只输出 JSON：
{"name":"中文名","formula":"化学式","desc":"一两句说明","atoms":[{"el":"C","x":0,"y":0,"z":0}],"bonds":[[0,1]],"physics":{"state":"","density":"","meltingPoint":"","boilingPoint":""},"chemistry":{"acidity":"","solubility":"","reactivity":""}}
原子 2～18 个；只输出 JSON。`,
      user: String(payload.prompt || ''),
      temperature: 0.4,
      maxTokens: 1800,
    });
    return parseModelJson(text);
  },

  async reaction(payload) {
    return parseModelJson(
      await chat({
        system: `你是高中化学教学助手。只输出 JSON：{"name":"","equation":"","desc":"","reactants":[],"products":[]}。只输出 JSON。`,
        user: JSON.stringify(payload),
        temperature: 0.4,
        maxTokens: 800,
      }),
    );
  },

  async labGenerate(payload) {
    return parseModelJson(
      await chat({
        system: `你是高中化学实验教学助手。只输出可编辑实验草稿 JSON，不要 Markdown。`,
        user: String(payload.prompt || ''),
        temperature: 0.45,
        maxTokens: 1600,
      }),
    );
  },

  async stoich(payload) {
    return parseModelJson(
      await chat({
        system: `你是高中化学老师。只输出 JSON：{"steps":["分步"],"answer":"结果"}。`,
        user: String(payload.prompt || JSON.stringify(payload)),
        temperature: 0.3,
        maxTokens: 800,
      }),
    );
  },

  async balance(payload) {
    const equation = payload.equation || payload.prompt || '';
    return parseModelJson(
      await chat({
        system: `你是高中化学老师。将方程式配平。只输出 JSON：{"equation":"配平后用 → 连接","steps":["步骤"]} 或 {"tip":"提示"}。`,
        user: String(equation),
        temperature: 0.2,
        maxTokens: 600,
      }),
    );
  },

  async tip(payload) {
    const sid = payload.subjectId || 'chemistry';
    const text = await chat({
      system:
        sid === 'math'
          ? '只输出 1～2 句高中数学小知识，不超过 60 字。'
          : '只输出 1～2 句高中化学小知识，不超过 60 字。',
      user: '请分享一条。',
      temperature: 0.8,
      maxTokens: 120,
    });
    return { text };
  },

  async quizGenerate(payload) {
    const sid = payload.subjectId || 'chemistry';
    const domain = subjectQuizDomain(sid);
    const n = Math.min(10, Math.max(1, parseInt(String(payload.count), 10) || 5));
    const text = await chat({
      system: `你是${domain.teacher}。只输出 JSON：{"questions":[{"id":"q1","stem":"","options":["A","B","C","D"],"answer":0,"knowledge":"","hint":"","explain":""}]}
必须 ${n} 道${domain.name}单选；options 恰好 4 项；answer 为 0～3。不要 Markdown。`,
      user: `年级：${(payload.grades || []).join('、') || '高中'}
难度：${payload.difficulty || 'medium'}
主题：${(payload.topics || []).join('、') || '常见章节'}
${payload.labContext ? `实验台：${payload.labContext}` : ''}`,
      temperature: 0.55,
      maxTokens: 4096,
    });
    const questions = normalizeQuizQuestions(parseModelJson(text), n);
    return { questions, paperId: null, meta: { count: questions.length } };
  },

  async quizHint(payload) {
    const domain = subjectQuizDomain(payload.subjectId || 'chemistry');
    const text = await chat({
      system: `你是${domain.teacher.replace('命题', '')}。只给提示、不给最终答案。1～3 句中文。`,
      user: `题干：${payload.stem}\n选项：\n${formatOptions(payload.options)}\n知识点：${payload.knowledge || '未标注'}`,
      temperature: 0.5,
      maxTokens: 300,
    });
    return { text: text || '先标出题干已知量与所求，再联系相关概念。' };
  },

  async quizExplain(payload) {
    const ans =
      typeof payload.answer === 'number' && payload.answer >= 0
        ? String.fromCharCode(65 + payload.answer)
        : '?';
    const domain = subjectQuizDomain(payload.subjectId || 'chemistry');
    const text = await chat({
      system: `你是${domain.teacher.replace('命题', '')}。先给出正确选项，再分步说明，最后点出错项误区。120～220 字。`,
      user: `题干：${payload.stem}\n选项：\n${formatOptions(payload.options)}\n正确答案：${ans}\n知识点：${payload.knowledge || ''}\n参考解析：${payload.explain || '无'}`,
      temperature: 0.35,
      maxTokens: 500,
    });
    return { text: text || `正确答案是 ${ans}。` };
  },

  async quizSummary(payload) {
    const text = await chat({
      system: '你是高中老师。根据本场练习写简短中文分析报告，不要标题。',
      user: JSON.stringify(payload.results || payload),
      temperature: 0.4,
      maxTokens: 700,
    });
    return { text };
  },

  async quizScore() {
    return {
      score: 0,
      comment: '云端模式下练习记录尚未同步，完成几套题并同步后再看评分。',
      cached: false,
    };
  },

  async lessonExplain(payload) {
    const sid = payload.subjectId || 'chemistry';
    const role =
      sid === 'math' ? '高中数学老师' : sid === 'physics' ? '高中物理老师' : '高中化学老师';
    const text = await chat({
      system: `你是一位亲切、严谨的${role}，正在「小黄的教室」讲解。中文，不要开场白。数学可用 $LaTeX$。`,
      user: `主题：${payload.topic || '高中核心概念'}
${payload.focus ? `学生想搞清：${payload.focus}` : ''}
${payload.labHint ? `可关联实验台：${payload.labHint}` : ''}`,
      temperature: 0.45,
      maxTokens: 1600,
    });
    return {
      text,
      topic: payload.topic || '',
      focus: payload.focus || '',
      subjectId: sid,
      suggestLab: Boolean(payload.labHint) || sid === 'math',
    };
  },

  async mathFnGenerate(payload) {
    return parseModelJson(
      await chat({
        system: `你是高中数学教学助手。只输出 JSON。优先 {"kind":"preset","preset":"linear|quadratic|power|exp|log|abs|inverse|sine|cosine","coeffs":{"a":1,"b":0,"c":0},"label":""}，否则 {"kind":"custom","expr":"仅含 x 的表达式","label":""}。`,
        user: `请根据描述生成函数 JSON：\n${payload.prompt || ''}`,
        temperature: 0.35,
        maxTokens: 400,
      }),
    );
  },
};

/**
 * @param {keyof typeof HANDLERS} kind
 * @param {Record<string, unknown>} payload
 */
export async function runCloudAi(kind, payload = {}) {
  const handler = HANDLERS[kind];
  if (!handler) {
    throw new Error('云端暂不支持该 AI 能力');
  }
  return handler(payload);
}
