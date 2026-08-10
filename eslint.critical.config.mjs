import globals from 'globals';

/**
 * 生产 JS 零容忍运行时安全规则（Task 4）。
 *
 * 只承载会导致运行时崩溃的规则，不承载历史 unused/style 债；
 * 与 `eslint.config.mjs` 的规则集相互独立，且不使用 eslint:recommended，
 * 避免把存量风格问题带进门禁。
 *
 * 运行方式（由 package.json#lint:critical 调用）：对 apps/web/src、apps/server/src、
 * apps/desktop 下所有 js/mjs/cjs 生产文件执行 ESLint，并显式 --config 本文件。
 */
export const runtimeSafetyRules = {
  'constructor-super': 'error',
  'getter-return': 'error',
  'no-class-assign': 'error',
  'no-const-assign': 'error',
  'no-dupe-keys': 'error',
  'no-ex-assign': 'error',
  'no-func-assign': 'error',
  'no-import-assign': 'error',
  'no-undef': 'error',
  'no-unreachable': 'error',
  'valid-typeof': 'error',
};

/** 与根工程一致的生成物/用户数据排除（不得扩大到生产源码目录） */
const generatedAndUserDataIgnores = [
  '**/node_modules/**',
  '**/dist/**',
  '**/public/**',
  '**/coverage/**',
  '**/.electron-stage/**',
  'dist-electron/**',
  'dist-exe/**',
  'apps/server/data/**',
  'apps/server/src/data/**',
];

export default [
  { ignores: generatedAndUserDataIgnores },
  {
    files: ['apps/web/src/**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.browser },
    rules: runtimeSafetyRules,
  },
  {
    files: ['apps/server/src/**/*.{js,mjs,cjs}', 'apps/desktop/**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
    rules: runtimeSafetyRules,
  },
];
