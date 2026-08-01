/** 连续函数差值的局部数值求根；支持穿越根和偶重相切根。 */

/** @param {(x: number) => number | null} evaluate @param {number} x */
function finiteValue(evaluate, x) {
  try {
    const value = evaluate(x);
    return Number.isFinite(value) ? Number(value) : null;
  } catch {
    return null;
  }
}

/**
 * @param {(x: number) => number | null} evaluate
 * @param {number} low
 * @param {number} high
 * @param {number} tolerance
 */
function bisectCrossing(evaluate, low, high, tolerance) {
  let lowValue = finiteValue(evaluate, low);
  let highValue = finiteValue(evaluate, high);
  if (lowValue == null || highValue == null || lowValue * highValue > 0) return null;
  if (Math.abs(lowValue) <= tolerance) return low;
  if (Math.abs(highValue) <= tolerance) return high;

  for (let iteration = 0; iteration < 60; iteration += 1) {
    const middle = (low + high) / 2;
    const middleValue = finiteValue(evaluate, middle);
    if (middleValue == null) return null;
    if (Math.abs(middleValue) <= tolerance) return middle;
    if (lowValue * middleValue <= 0) {
      high = middle;
      highValue = middleValue;
    } else {
      low = middle;
      lowValue = middleValue;
    }
  }

  const candidate = Math.abs(lowValue) <= Math.abs(highValue) ? low : high;
  const residual = finiteValue(evaluate, candidate);
  return residual != null && Math.abs(residual) <= tolerance ? candidate : null;
}

/**
 * 在一个局部极小区间内最小化 |f(x)|，用于发现不发生符号翻转的相切根。
 * @param {(x: number) => number | null} evaluate
 * @param {number} low
 * @param {number} high
 */
function minimizeAbsoluteValue(evaluate, low, high) {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let left = high - (high - low) * ratio;
  let right = low + (high - low) * ratio;
  let leftValue = Math.abs(finiteValue(evaluate, left) ?? Infinity);
  let rightValue = Math.abs(finiteValue(evaluate, right) ?? Infinity);

  for (let iteration = 0; iteration < 52; iteration += 1) {
    if (leftValue <= rightValue) {
      high = right;
      right = left;
      rightValue = leftValue;
      left = high - (high - low) * ratio;
      leftValue = Math.abs(finiteValue(evaluate, left) ?? Infinity);
    } else {
      low = left;
      left = right;
      leftValue = rightValue;
      right = low + (high - low) * ratio;
      rightValue = Math.abs(finiteValue(evaluate, right) ?? Infinity);
    }
  }
  return leftValue <= rightValue ? left : right;
}

/**
 * 在 center 附近寻找最近的根。符号翻转区间用二分；绝对值局部极小
 * 再做黄金分割，以覆盖 f(x)=(x-a)^2 这类相切交点。
 *
 * @param {(x: number) => number | null} evaluateDifference
 * @param {number} center
 * @param {number} radius
 * @param {{ samples?: number, tolerance?: number }} [options]
 * @returns {number | null}
 */
export function findRootNear(evaluateDifference, center, radius, options = {}) {
  if (typeof evaluateDifference !== 'function') return null;
  if (!Number.isFinite(center) || !Number.isFinite(radius) || radius <= 0) return null;
  const samples = Math.max(12, Math.floor(options.samples || 96));
  const tolerance = Math.max(Number.EPSILON, options.tolerance || 1e-7);
  const low = center - radius;
  const step = (radius * 2) / samples;
  const points = [];
  const candidates = [];

  for (let index = 0; index <= samples; index += 1) {
    const x = low + step * index;
    const value = finiteValue(evaluateDifference, x);
    points.push({ x, value });
    if (value != null && Math.abs(value) <= tolerance) candidates.push(x);
  }

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (
      previous.value != null &&
      current.value != null &&
      previous.value * current.value < 0
    ) {
      const root = bisectCrossing(
        evaluateDifference,
        previous.x,
        current.x,
        tolerance,
      );
      if (root != null) candidates.push(root);
    }
  }

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    if (previous.value == null || current.value == null || next.value == null) continue;
    const magnitude = Math.abs(current.value);
    if (magnitude > Math.abs(previous.value) || magnitude > Math.abs(next.value)) continue;
    const root = minimizeAbsoluteValue(evaluateDifference, previous.x, next.x);
    const residual = finiteValue(evaluateDifference, root);
    if (residual != null && Math.abs(residual) <= tolerance) candidates.push(root);
  }

  if (!candidates.length) return null;
  return candidates.reduce((nearest, candidate) =>
    Math.abs(candidate - center) < Math.abs(nearest - center) ? candidate : nearest,
  );
}

