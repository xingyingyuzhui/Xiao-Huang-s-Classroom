/**
 * 共享 ESLint 片段（Program 2 Task 2.1）。
 * 各包在自己的 eslint.config.mjs 中展开使用。
 */
import tseslint from 'typescript-eslint';

export const tsRules = tseslint.configs.recommended;

export const packageRules = {
  files: ['**/*.ts'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': 'error',
  },
};
