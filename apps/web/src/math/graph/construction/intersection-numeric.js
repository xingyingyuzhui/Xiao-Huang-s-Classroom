/** 线与函数的数值求交；不创建 JSXGraph 对象。 */

import { findRootNear } from './function-roots.js';

/**
 * 在当前视口内求直线或线段与函数的第一个交点。
 * @param {any} host
 * @param {any} lineEl
 * @param {any} fn
 * @param {{ allowBeyond?: boolean, forceFinite?: boolean }} [opts]
 * @returns {{ x: number, y: number } | null}
 */
export function findLineFnHitNumeric(host, lineEl, fn, opts = {}) {
  let xMin = -10;
  let xMax = 10;
  try {
    const boundingBox = host.getBoard()?.getBoundingBox?.();
    if (boundingBox?.length >= 4) {
      xMin = Math.min(Number(boundingBox[0]), Number(boundingBox[2]));
      xMax = Math.max(Number(boundingBox[0]), Number(boundingBox[2]));
    }
  } catch {
    /* use the default viewport */
  }
  if (!(xMax > xMin)) return null;

  let x1;
  let y1;
  let x2;
  let y2;
  try {
    x1 = Number(lineEl.point1.X());
    y1 = Number(lineEl.point1.Y());
    x2 = Number(lineEl.point2.X());
    y2 = Number(lineEl.point2.Y());
  } catch {
    return null;
  }
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const finite =
    !opts.allowBeyond &&
    (Boolean(opts.forceFinite) || lineEl.elType === 'segment');

  if (Math.abs(dx) < 1e-12) {
    const y = host.evalFnY(fn, x1);
    if (y == null || !Number.isFinite(y)) return null;
    if (finite) {
      const t = Math.abs(dy) < 1e-12 ? 0 : (y - y1) / dy;
      if (t < -0.02 || t > 1.02) return null;
    }
    return { x: x1, y };
  }

  const lineY = (x) => y1 + ((x - x1) / dx) * dy;
  const searchMin = finite ? Math.max(xMin, Math.min(x1, x2)) : xMin;
  const searchMax = finite ? Math.min(xMax, Math.max(x1, x2)) : xMax;
  if (!(searchMax > searchMin)) return null;
  const center = (searchMin + searchMax) / 2;
  const root = findRootNear((x) => {
    const functionY = host.evalFnY(fn, x);
    return functionY == null ? null : functionY - lineY(x);
  }, center, (searchMax - searchMin) / 2, { samples: 64 });
  if (root == null) return null;
  if (finite) {
    const t = (root - x1) / dx;
    if (t < -0.02 || t > 1.02) return null;
  }
  return { x: root, y: lineY(root) };
}
