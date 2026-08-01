/** 函数记录的纯求值、展示和值域内交点分析。 */

import { evalPreset, formulaText } from './model.js';
import { formatExprLabel } from '../shared/expr-safe.js';
import { findRootNear } from './construction/function-roots.js';

/** @param {any} fn @param {number} x */
export function evaluateGraphFunction(fn, x) {
  if (!fn?.visible) return null;
  if (fn.kind === 'custom' && typeof fn.evalFn === 'function') return fn.evalFn(x);
  if (fn.kind === 'preset' && fn.preset) {
    return evalPreset(fn.preset, fn.coeffs, x);
  }
  return null;
}

/** @param {any} fn */
export function graphFunctionDisplayLabel(fn) {
  if (!fn) return '函数';
  if (fn.kind === 'custom') return formatExprLabel(fn.expr);
  return formulaText(fn.preset, fn.coeffs) || fn.preset || '函数';
}

/**
 * @param {string} preset
 * @param {{ a: number, b: number, c: number }} coeffs
 * @param {number[]} [xs]
 */
export function presetValueTable(preset, coeffs, xs = [-2, -1, 0, 1, 2, 3]) {
  return xs.map((x) => {
    const y = evalPreset(preset, coeffs, x);
    return { x, y: y == null || !Number.isFinite(y) ? null : y };
  });
}

/** @param {any} first @param {any} second */
function differenceOf(first, second) {
  return (x) => {
    const firstY = evaluateGraphFunction(first, x);
    const secondY = evaluateGraphFunction(second, x);
    return firstY == null || secondY == null ? null : firstY - secondY;
  };
}

/**
 * @param {any[]} functions
 * @param {number} pointerX
 * @param {number} pointerY
 * @param {number} tolerance
 */
export function findFunctionIntersectionNear(
  functions,
  pointerX,
  pointerY,
  tolerance,
) {
  const visible = (functions || []).filter((fn) => fn.visible);
  if (
    visible.length < 2 ||
    !Number.isFinite(pointerX) ||
    !Number.isFinite(pointerY)
  ) {
    return null;
  }
  const safeTolerance = Number.isFinite(tolerance) ? tolerance : 0.1;
  const searchRadius = Math.max(1.2, safeTolerance * 6);
  const hitTolerance = Math.max(safeTolerance * 2.8, 0.55);
  let best = null;
  let bestDistance = Infinity;

  for (let firstIndex = 0; firstIndex < visible.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < visible.length; secondIndex += 1) {
      const fnA = visible[firstIndex];
      const fnB = visible[secondIndex];
      const root = findRootNear(
        differenceOf(fnA, fnB),
        pointerX,
        searchRadius,
      );
      if (root == null) continue;
      const firstY = evaluateGraphFunction(fnA, root);
      const secondY = evaluateGraphFunction(fnB, root);
      if (firstY == null || secondY == null || Math.abs(firstY - secondY) > 1e-3) {
        continue;
      }
      const y = (firstY + secondY) / 2;
      const distance = Math.hypot(root - pointerX, y - pointerY);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { fnA, fnB, x: root, y };
      }
    }
  }
  return best && bestDistance <= hitTolerance ? best : null;
}

/**
 * @param {any[]} functions
 * @param {string} firstId
 * @param {string} secondId
 * @param {number} nearX
 * @param {number} tolerance
 */
export function recomputeFunctionIntersection(
  functions,
  firstId,
  secondId,
  nearX,
  tolerance,
) {
  const first = (functions || []).find((fn) => fn.id === firstId);
  const second = (functions || []).find((fn) => fn.id === secondId);
  if (!first?.visible || !second?.visible) return null;
  const safeTolerance = Number.isFinite(tolerance) ? tolerance : 0.1;
  const root = findRootNear(
    differenceOf(first, second),
    nearX,
    Math.max(2.5, safeTolerance * 10),
  );
  if (root == null) return null;
  const firstY = evaluateGraphFunction(first, root);
  const secondY = evaluateGraphFunction(second, root);
  if (firstY == null || secondY == null || Math.abs(firstY - secondY) > 0.05) {
    return null;
  }
  return { x: root, y: (firstY + secondY) / 2 };
}

