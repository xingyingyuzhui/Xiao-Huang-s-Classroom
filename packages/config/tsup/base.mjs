/**
 * 共享 tsup 基座（Program 2 Task 2.1）。
 * 用法：import base from '@xiaohuang/config/tsup'; export default { ...base, entry: [...] };
 * 产物：ESM + CJS + d.ts；target ES2022（Node 18 兼容子集，pkg 退役前保持）。
 */
export default {
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  splitting: false,
};
