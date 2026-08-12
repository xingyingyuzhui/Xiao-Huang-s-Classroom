import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/public/**',
      '**/coverage/**',
      '**/.electron-stage/**',
      'dist-electron/**',
      'dist-exe/**',
      'apps/server/data/**',
      'apps/server/src/data/**',
      'package-lock.json',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // 迁移期不新增 any；存量问题进 baseline，逐阶段清零
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['test/**/*.{ts,tsx}', '**/*.vitest.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // Server/Desktop 是 CJS 运行时：require() 是正当语法（ESM 规则不适用）
    files: ['apps/server/**/*.{js,cjs,mjs}', 'apps/desktop/**/*.{js,cjs,mjs}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Web 源码是浏览器环境：window/document/requestAnimationFrame 等全局合法。
    // 全局数据源为标准 globals.browser 表（Node 20 起 fetch/AbortController/performance
    // 均为标准成员）；globalThis 属于语言级全局，无需表项。
    files: ['apps/web/**/*.{js,ts}'],
    languageOptions: {
      globals: globals.browser,
    },
  },
);
