/** 作图量测文字的纯计算。 */

import { formatSmartNumber } from '../../shared/board-label.js';

/** @param {any} p1 @param {any} p2 */
export function segmentLengthText(p1, p2) {
  try {
    const length = Math.hypot(Number(p1.X()) - Number(p2.X()), Number(p1.Y()) - Number(p2.Y()));
    return `长 ${formatSmartNumber(length)}`;
  } catch {
    return '长 —';
  }
}

/**
 * 线段/直线量测标签：短名 + 量测（改名后读 host._mathBaseName）
 * @param {any} hostEl 线段/直线 JSXGraph 元素
 * @param {string} measurePart 长度/斜率等量测文案
 */
export function formatLineMeasureLabel(hostEl, measurePart) {
  const name = String(hostEl?._mathBaseName || hostEl?.name || '').trim();
  const measure = String(measurePart ?? '').trim();
  if (name && measure) return `${name} · ${measure}`;
  if (name) return name;
  return measure || '·';
}

/** @param {any} p1 @param {any} p2 */
export function lineSlopeText(p1, p2) {
  try {
    const dx = Number(p2.X()) - Number(p1.X());
    const dy = Number(p2.Y()) - Number(p1.Y());
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return '直线';
    if (Math.abs(dx) < 1e-9) return '直线 · 竖直线';
    return `直线 · k=${formatSmartNumber(dy / dx)}`;
  } catch {
    return '直线';
  }
}
