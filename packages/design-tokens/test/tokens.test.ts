import { describe, expect, it } from 'vitest';
import { THEME_IDS, themeTokens, allSemanticNames } from '../src/index.js';
import type { SemanticTokenName } from '../src/index.js';

describe('design-tokens 语义令牌', () => {
  it('五主题覆盖', () => {
    expect([...THEME_IDS].sort()).toEqual([
      'blackboard',
      'default',
      'pixel',
      'reagent',
      'stationery',
    ]);
  });

  it('每个语义名在所有主题都有值', () => {
    for (const name of allSemanticNames() as SemanticTokenName[]) {
      for (const theme of THEME_IDS) {
        const v = themeTokens(theme)[name];
        expect(v !== undefined && v !== null && v !== '', `${name}@${theme} 必须有值`).toBe(true);
      }
    }
  });

  it('语义名唯一（无重复定义）', () => {
    const names = allSemanticNames();
    expect(new Set(names).size).toBe(names.length);
  });

  it('math canvas 色板覆盖八色', () => {
    for (const theme of THEME_IDS) {
      const t = themeTokens(theme);
      expect(t['canvas.math.1']).toBeTruthy();
      expect(t['canvas.math.8']).toBeTruthy();
    }
  });

  it('与 tokens.css 一致（防漂移）：default 主题 math-fn-1 与 accent', () => {
    const t = themeTokens('default');
    expect(t['canvas.math.1']).toBe('#b45309');
    expect(t['color.brand.default']).toBe('#3b82f6');
  });
});
