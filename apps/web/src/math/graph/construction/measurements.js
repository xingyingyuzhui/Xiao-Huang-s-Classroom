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
