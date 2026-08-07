/**
 * subject-settings 合同测试（R2.2）：核心 API + 双产物一致性。
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import {
  createDefaultSubjectSettings,
  normalizeSubjectSettings,
  readSubjectAiFromMap,
  getDefaultTabId,
  getSubjectTabMeta,
  SUBJECT_TAB_CATALOG,
} from '../src/index.js';

const require = createRequire(import.meta.url);

describe('subject-settings 核心 API', () => {
  it('默认设置覆盖全部 READY 学科', () => {
    const defaults = createDefaultSubjectSettings();
    expect(Object.keys(defaults)).toContain('chemistry');
    expect(Object.keys(defaults)).toContain('math');
    expect(defaults.chemistry.ai.model).toBe('deepseek-v4-flash');
  });

  it('normalizeSubjectSettings 规范化并拒绝非法模型', () => {
    const out = normalizeSubjectSettings({
      chemistry: { ai: { model: 'not-a-model' } },
    });
    expect(out.chemistry.ai.model).toBe('deepseek-v4-flash');
    const valid = normalizeSubjectSettings({
      chemistry: { ai: { model: 'deepseek-v4-pro' } },
    });
    expect(valid.chemistry.ai.model).toBe('deepseek-v4-pro');
  });

  it('readSubjectAiFromMap 读取指定学科 AI 配置', () => {
    const ai = readSubjectAiFromMap({ chemistry: { ai: { apiKey: 'sk-x' } } }, 'chemistry');
    expect(ai.apiKey).toBe('sk-x');
  });

  it('tab 元数据：数学默认 graph、化学默认 table', () => {
    expect(getDefaultTabId('math')).toBe('graph');
    expect(getDefaultTabId('chemistry')).toBe('table');
    expect(getSubjectTabMeta('math')?.tabs.map((t) => t.id)).toContain('graph');
    expect(SUBJECT_TAB_CATALOG.physics).toBeTruthy();
  });
});

describe('双产物一致性', () => {
  it('CJS require 与 ESM 行为一致', () => {
    const cjs = require('../dist/index.cjs');
    const a = cjs.createDefaultSubjectSettings();
    const b = createDefaultSubjectSettings();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(cjs.getDefaultTabId('chemistry')).toBe('table');
  });
});
