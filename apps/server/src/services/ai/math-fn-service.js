/**
 * 数学函数画布：AI 生成可上屏的函数描述
 */

const { callDeepSeekChat } = require('./chat-service');
const { parseModelJson } = require('./response-parser');
const { validateMathExprSyntax } = require('@xiaohuang/math-expr');

const PRESET_IDS = [
  'linear',
  'quadratic',
  'power',
  'exp',
  'log',
  'abs',
  'inverse',
  'sine',
  'cosine',
];

function serviceError(message, status = 502) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** @param {string} raw */
function validateExprSyntax(raw) {
  const r = validateMathExprSyntax(raw);
  if (!r.ok) return { ok: false, error: r.error || '表达式无效' };
  return { ok: true, expr: r.expr };
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * @param {unknown} raw
 */
function normalizeFnPayload(raw) {
  if (!raw || typeof raw !== 'object') {
    throw serviceError('模型返回无效', 502);
  }
  const kind = String(/** @type {any} */ (raw).kind || '').trim();
  const label = String(/** @type {any} */ (raw).label || raw.tip || '').trim().slice(0, 80);

  if (kind === 'preset') {
    const preset = String(/** @type {any} */ (raw).preset || '').trim();
    if (!PRESET_IDS.includes(preset)) {
      throw serviceError(`不支持的预设类型：${preset || '空'}`, 502);
    }
    const c = /** @type {any} */ (raw).coeffs || {};
    return {
      kind: 'preset',
      preset,
      coeffs: {
        a: num(c.a, 1),
        b: num(c.b, 0),
        c: num(c.c, 0),
      },
      label: label || preset,
      expr: '',
    };
  }

  if (kind === 'custom') {
    const exprRaw =
      /** @type {any} */ (raw).expr ||
      /** @type {any} */ (raw).expression ||
      /** @type {any} */ (raw).formula ||
      '';
    const checked = validateExprSyntax(exprRaw);
    if (!checked.ok) {
      throw serviceError(checked.error || '自定义表达式无效', 502);
    }
    return {
      kind: 'custom',
      preset: null,
      coeffs: { a: 0, b: 0, c: 0 },
      expr: checked.expr,
      label: label || `y = ${checked.expr}`,
    };
  }

  // 容错：只有 expr 时当 custom；只有 preset 时当 preset
  if (/** @type {any} */ (raw).expr || /** @type {any} */ (raw).expression) {
    return normalizeFnPayload({ .../** @type {object} */ (raw), kind: 'custom' });
  }
  if (/** @type {any} */ (raw).preset) {
    return normalizeFnPayload({ .../** @type {object} */ (raw), kind: 'preset' });
  }
  throw serviceError('模型未返回可用的函数描述', 502);
}

/**
 * @param {string} prompt
 * @param {string} [subjectId]
 */
async function generateMathFunction(prompt, subjectId = 'math') {
  const text = String(prompt || '').trim();
  if (!text) throw serviceError('请描述要添加的函数', 400);

  const system = `你是高中数学教学助手，根据老师/学生的中文描述，生成可画在函数画布上的函数参数。
只输出一个 JSON 对象，不要 Markdown 代码块，不要其它说明。

JSON 格式二选一：

A) 预设类型（优先，参数可调）
{
  "kind": "preset",
  "preset": "linear|quadratic|power|exp|log|abs|inverse|sine|cosine 之一",
  "coeffs": { "a": 数字, "b": 数字, "c": 数字 },
  "label": "简短中文说明"
}

预设含义：
- linear: y = a x + b（c 可 0）
- quadratic: y = a x² + b x + c
- power: y = a · x^b（c 可 0）
- exp: y = a · e^(b x) + c
- log: y = a ln(x − b) + c
- abs: y = a |x − b| + c
- inverse: y = a / x（b,c 可 0）
- sine: y = a sin(b x + c)
- cosine: y = a cos(b x + c)

B) 自定义表达式（预设套不上时）
{
  "kind": "custom",
  "expr": "仅含 x、数字、+ - * / ^、括号、sin cos tan ln log abs sqrt exp、pi e 的表达式，不要写 y=",
  "label": "简短中文说明"
}

规则：
1. 优先用 preset + 合理系数（a 不要为 0，二次开口别太平）
2. 系数用常见教学量级，大致 |a,b,c| ≤ 5
3. 三角函数 b 建议 0.5～2
4. 自定义 expr 禁止任意代码、禁止其它变量
5. 只输出 JSON`;

  let content;
  try {
    const chat = await callDeepSeekChat({
      system,
      user: `请根据描述生成函数 JSON：\n${text}`,
      temperature: 0.35,
      max_tokens: 400,
      kind: 'math-fn-generate',
      subjectId: subjectId || 'math',
    });
    content = chat.content;
  } catch (e) {
    if (e?.status) throw e;
    throw serviceError(e?.message || 'DeepSeek 请求失败', 502);
  }

  let parsed;
  try {
    parsed = parseModelJson(content);
  } catch {
    throw serviceError('模型返回不是合法 JSON', 502);
  }

  return normalizeFnPayload(parsed);
}

module.exports = {
  generateMathFunction,
  normalizeFnPayload,
  validateExprSyntax,
  PRESET_IDS,
};
