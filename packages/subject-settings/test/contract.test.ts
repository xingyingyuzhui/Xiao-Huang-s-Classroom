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
  extractLeftoverApiKey,
  extractLeftoverApiKeys,
  stripApiKeysFromSubjectSettings,
  sanitizeTeacherSettingsPayload,
  inferProviderFromApiBase,
  isPlaintextApiKey,
} from '../src/index.js';

const require = createRequire(import.meta.url);

describe('subject-settings 核心 API', () => {
  it('默认设置覆盖全部 READY 学科且不含 apiKey', () => {
    const defaults = createDefaultSubjectSettings();
    expect(Object.keys(defaults)).toContain('chemistry');
    expect(Object.keys(defaults)).toContain('math');
    expect(defaults.chemistry.ai.model).toBe('deepseek-v4-flash');
    expect(defaults.chemistry.ai.apiKey).toBeUndefined();
    expect(JSON.stringify(defaults)).not.toContain('apiKey');
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

  it('readSubjectAiFromMap 不回传明文 apiKey', () => {
    const ai = readSubjectAiFromMap({ chemistry: { ai: { apiKey: 'sk-x-secret-key' } } }, 'chemistry');
    expect(ai.apiKey).toBeUndefined();
    expect(ai.model).toBe('deepseek-v4-flash');
  });

  it('tab 元数据：数学默认 graph、化学默认 table', () => {
    expect(getDefaultTabId('math')).toBe('graph');
    expect(getDefaultTabId('chemistry')).toBe('table');
    expect(getSubjectTabMeta('math')?.tabs.map((t) => t.id)).toContain('graph');
    expect(SUBJECT_TAB_CATALOG.physics).toBeTruthy();
  });
});

describe('apiKey 剥离与历史残留', () => {
  it('isPlaintextApiKey 拒绝掩码与过短值', () => {
    expect(isPlaintextApiKey('sk-secret-1234')).toBe(true);
    expect(isPlaintextApiKey('sk-s***ue')).toBe(false);
    expect(isPlaintextApiKey('short')).toBe(false);
    expect(isPlaintextApiKey('')).toBe(false);
  });

  it('extractLeftoverApiKeys 从原始 blob 取出明文并忽略掩码', () => {
    const leftovers = extractLeftoverApiKeys({
      chemistry: { ai: { apiKey: 'sk-chem-secret-key', apiBase: 'https://api.deepseek.com', model: 'deepseek-v4-pro' } },
      physics: { ai: { apiKey: 'sk-p***ys' } },
      math: { ai: { model: 'deepseek-v4-flash' } },
    });
    expect(leftovers).toHaveLength(1);
    expect(leftovers[0]?.subjectId).toBe('chemistry');
    expect(leftovers[0]?.apiKey).toBe('sk-chem-secret-key');
    expect(leftovers[0]?.model).toBe('deepseek-v4-pro');
    expect(extractLeftoverApiKey({ chemistry: { ai: { apiKey: 'sk-chem-secret-key' } } }, 'chemistry')).toBe(
      'sk-chem-secret-key',
    );
  });

  it('stripApiKeysFromSubjectSettings 幂等去掉 apiKey', () => {
    const stripped = stripApiKeysFromSubjectSettings({
      chemistry: { ai: { apiKey: 'sk-chem-secret-key', model: 'deepseek-v4-pro' } },
    });
    expect(stripped.chemistry.ai.apiKey).toBeUndefined();
    expect(stripped.chemistry.ai.model).toBe('deepseek-v4-pro');
    expect(JSON.stringify(stripped)).not.toContain('sk-chem');
    expect(JSON.stringify(stripApiKeysFromSubjectSettings(stripped))).not.toContain('apiKey');
  });

  it('sanitizeTeacherSettingsPayload 清理 IndexedDB teacher.settings', () => {
    const cleaned = sanitizeTeacherSettingsPayload({
      theme: { id: 'default' },
      subjectSettings: { chemistry: { ai: { apiKey: 'sk-idb-secret-key' } } },
    }) as { subjectSettings: { chemistry: { ai: { apiKey?: string } } } };
    expect(cleaned.subjectSettings.chemistry.ai.apiKey).toBeUndefined();
    expect(inferProviderFromApiBase('https://api.openai.com/v1')).toBe('openai');
    expect(inferProviderFromApiBase('https://api.deepseek.com')).toBe('deepseek');
  });
});

describe('双产物一致性', () => {
  it('CJS require 与 ESM 行为一致', () => {
    const cjs = require('../dist/index.cjs');
    const a = cjs.createDefaultSubjectSettings();
    const b = createDefaultSubjectSettings();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(cjs.getDefaultTabId('chemistry')).toBe('table');
    expect(cjs.extractLeftoverApiKey({ chemistry: { ai: { apiKey: 'sk-leftover-key' } } }, 'chemistry')).toBe(
      'sk-leftover-key',
    );
  });
});
