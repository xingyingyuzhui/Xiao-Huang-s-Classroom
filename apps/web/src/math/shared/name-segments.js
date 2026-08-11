/**
 * 对象短名：固定顺序「样式 + 字母 + 数字（可选）」
 * 点 / 线各有一套样式词表。
 */

/** @typedef {{ style: string, letter: string, number: string }} NameSegments */

/** 点用样式 */
export const POINT_NAME_STYLES = [
  '点',
  '顶点',
  '零点',
  '焦点',
  '交点',
  '垂足',
  '截距',
  '动点',
  '定点',
  '中心',
  '极点',
];

/** 线用样式 */
export const LINE_NAME_STYLES = [
  '线段',
  '直线',
  '切线',
  '垂线',
  '法线',
  '割线',
  '渐近线',
  '辅助线',
  '射线',
];

const ALL_STYLES = [...new Set([...POINT_NAME_STYLES, ...LINE_NAME_STYLES])].sort(
  (a, b) => b.length - a.length,
);

/**
 * @param {'point' | 'line'} kind
 * @returns {string[]}
 */
export function nameStylesForKind(kind) {
  return kind === 'line' ? LINE_NAME_STYLES : POINT_NAME_STYLES;
}

/**
 * @param {NameSegments} segments
 */
export function formatStructuredName(segments) {
  const style = String(segments?.style || '');
  const letter = String(segments?.letter || '');
  const number = String(segments?.number || '');
  return `${style}${letter}${number}`;
}

/**
 * 解析已有短名（兼容「交点」「H」「顶点A4」等 legacy 文案）
 * @param {string} raw
 * @param {'point' | 'line'} [kind='point']
 * @returns {NameSegments}
 */
export function parseStructuredName(raw, kind = 'point') {
  const text = String(raw || '').trim();
  if (!text) return { style: '', letter: '', number: '' };

  const preferred = nameStylesForKind(kind);
  const ordered = [...new Set([...preferred, ...ALL_STYLES])].sort((a, b) => b.length - a.length);

  let rest = text;
  let style = '';
  for (const candidate of ordered) {
    if (rest.startsWith(candidate)) {
      style = candidate;
      rest = rest.slice(candidate.length);
      break;
    }
  }

  const tail = rest.match(/^([A-Za-z])(\d*)$/);
  if (tail) {
    return { style, letter: tail[1], number: tail[2] || '' };
  }

  if (!style && /^[A-Za-z]$/.test(text)) {
    return { style: '', letter: text, number: '' };
  }
  if (!style) {
    return { style: text, letter: '', number: '' };
  }
  return { style, letter: '', number: '' };
}

/**
 * @param {'point' | 'line'} kind
 * @returns {NameSegments}
 */
export function defaultNameSegments(kind) {
  return {
    style: kind === 'line' ? '线段' : '点',
    letter: kind === 'line' ? 'L' : 'A',
    number: '',
  };
}

/**
 * @param {NameSegments} segments
 */
export function isEmptyNameSegments(segments) {
  return !segments?.style && !segments?.letter && !segments?.number;
}
