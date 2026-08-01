/**
 * 函数变换模型：现有预设可明确解释的参数映射 → 结构化说明。
 *
 * 只实现现有预设能可靠解释的变换；无法解释时返回普通「参数变化」，
 * 禁止从公式字符串反解析、禁止编造数学语义。
 */

/**
 * @param {string} preset
 * @param {{ a: number, b: number, c: number }} before
 * @param {{ a: number, b: number, c: number }} after
 * @returns {Array<{ kind: string, from: number, to: number, text: string }>}
 */
export function describePresetTransform(preset, before, after) {
  if (!preset || !before || !after) return [];
  const b = normalizeCoeffs(before);
  const a = normalizeCoeffs(after);
  const changes = [];
  const EPS = 1e-9;

  const push = (kind, from, to, text) => {
    if (Math.abs(from - to) > EPS) changes.push({ kind, from, to, text });
  };

  switch (preset) {
    case 'linear':
      push('verticalScale', b.a, a.a, scaleText('纵向伸缩', b.a, a.a));
      push('verticalShift', b.b, a.b, shiftText('上下平移', a.b - b.b));
      break;
    case 'quadratic':
    case 'abs':
      push('verticalScale', b.a, a.a, scaleText('纵向伸缩', b.a, a.a));
      push('horizontalShift', b.b, a.b, shiftText('左右平移', a.b - b.b));
      push('verticalShift', b.c, a.c, shiftText('上下平移', a.c - b.c));
      break;
    case 'exp':
    case 'log':
      push('verticalScale', b.a, a.a, scaleText('纵向伸缩', b.a, a.a));
      push('horizontalScale', b.b, a.b, scaleText('水平伸缩', b.b, a.b));
      push('verticalShift', b.c, a.c, shiftText('上下平移', a.c - b.c));
      break;
    case 'power': {
      push('verticalScale', b.a, a.a, scaleText('纵向伸缩', b.a, a.a));
      if (Math.abs(b.b - a.b) > EPS) {
        // 指数：整数离散 step；只描述整数值变化，禁止插值出非法中间语义
        changes.push({
          kind: 'powerIndex',
          from: b.b,
          to: a.b,
          text: `指数变化（${formatNum(b.b)} → ${formatNum(a.b)}）`,
        });
      }
      break;
    }
    case 'inverse':
      push('verticalScale', b.a, a.a, scaleText('纵向伸缩', b.a, a.a));
      break;
    case 'sine':
    case 'cosine': {
      push('amplitude', b.a, a.a, scaleText('振幅', b.a, a.a));
      push('angularFrequency', b.b, a.b, scaleText('角频率', b.b, a.b));
      push('phase', b.c, a.c, shiftText('相位', a.c - b.c));
      break;
    }
    default:
      break;
  }

  if (!changes.length) {
    changes.push({
      kind: 'params',
      from: b.a,
      to: a.a,
      text: '参数变化',
    });
  }
  return changes;
}

/** @param {{ a?: number, b?: number, c?: number }} coeffs */
function normalizeCoeffs(coeffs) {
  return {
    a: Number.isFinite(Number(coeffs.a)) ? Number(coeffs.a) : 0,
    b: Number.isFinite(Number(coeffs.b)) ? Number(coeffs.b) : 0,
    c: Number.isFinite(Number(coeffs.c)) ? Number(coeffs.c) : 0,
  };
}

/** @param {string} name @param {number} from @param {number} to */
function scaleText(name, from, to) {
  if (Math.abs(from) < 1e-9) return `${name}（${formatNum(from)} → ${formatNum(to)}）`;
  if (to < 0 && from > 0) return `${name}并翻折（${formatNum(from)} → ${formatNum(to)}）`;
  if (Math.abs(to / from - 1) < 1e-9) return `${name}（不变）`;
  return `${name}为 ${formatNum(Math.abs(to / from))} 倍`;
}

/** @param {string} name @param {number} delta */
function shiftText(name, delta) {
  if (Math.abs(delta) < 1e-9) return `${name}（不变）`;
  if (name === '左右平移') return `${name} ${delta > 0 ? '右移' : '左移'} ${formatNum(Math.abs(delta))}`;
  return `${name} ${delta > 0 ? '上移' : '下移'} ${formatNum(Math.abs(delta))}`;
}

/** @param {number} value */
function formatNum(value) {
  const f = Number(value.toFixed(2));
  return Object.is(f, -0) ? '0' : String(f);
}

/**
 * 参数插值规则：普通系数线性插值；幂函数指数等整数参数离散 step。
 * @param {string} preset
 * @param {{ a: number, b: number, c: number }} from
 * @param {{ a: number, b: number, c: number }} to
 * @param {number} t
 */
export function interpolateCoeffs(preset, from, to, t) {
  const clamped = Math.min(1, Math.max(0, t));
  const out = {};
  for (const key of ['a', 'b', 'c']) {
    const f = Number(from[key]) || 0;
    const g = Number(to[key]) || 0;
    if (preset === 'power' && key === 'b') {
      // 指数离散 step：只在整数间移动
      const steps = Math.round((g - f) * clamped);
      out[key] = f + steps;
    } else {
      out[key] = f + (g - f) * clamped;
    }
  }
  return out;
}
