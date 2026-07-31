/**
 * 数列模型：等差 / 等比
 */

/**
 * @typedef {'arith' | 'geom'} SeqKind
 */

/**
 * @param {SeqKind} kind
 * @param {number} a1
 * @param {number} step  d 或 q
 * @param {number} n
 */
export function sequenceTerms(kind, a1, step, n) {
  const N = Math.max(1, Math.min(40, Math.floor(n)));
  const terms = [];
  for (let k = 1; k <= N; k += 1) {
    if (kind === 'arith') {
      terms.push(a1 + (k - 1) * step);
    } else {
      terms.push(a1 * step ** (k - 1));
    }
  }
  return terms;
}

/**
 * @param {SeqKind} kind
 * @param {number} a1
 * @param {number} step
 * @param {number} n
 */
export function partialSum(kind, a1, step, n) {
  const N = Math.max(1, Math.floor(n));
  if (kind === 'arith') {
    return (N * (2 * a1 + (N - 1) * step)) / 2;
  }
  if (Math.abs(step - 1) < 1e-12) return a1 * N;
  return (a1 * (1 - step ** N)) / (1 - step);
}

/**
 * @param {SeqKind} kind
 * @param {number} a1
 * @param {number} step
 * @param {number} n
 */
export function formulaTex(kind, a1, step, n) {
  const F = (x) => {
    const r = Math.round(x * 1000) / 1000;
    return String(r);
  };
  if (kind === 'arith') {
    return {
      general: String.raw`a_n=${F(a1)}+(n-1)\cdot(${F(step)})`,
      sum: String.raw`S_n=\dfrac{n}{2}\bigl(2\cdot${F(a1)}+(n-1)\cdot(${F(step)})\bigr)`,
      value: String.raw`a_{${n}}=${F(a1 + (n - 1) * step)},\ S_{${n}}=${F(partialSum('arith', a1, step, n))}`,
    };
  }
  return {
    general: String.raw`a_n=${F(a1)}\cdot(${F(step)})^{n-1}`,
    sum:
      Math.abs(step - 1) < 1e-12
        ? String.raw`S_n=n\cdot${F(a1)}`
        : String.raw`S_n=${F(a1)}\dfrac{1-(${F(step)})^{n}}{1-(${F(step)})}`,
    value: String.raw`a_{${n}}=${F(a1 * step ** (n - 1))},\ S_{${n}}=${F(partialSum('geom', a1, step, n))}`,
  };
}
