import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  readLocalSettings,
  writeLocalSettings,
  LOCAL_ONLY_HINT,
} from '../../apps/web/src/shared/persistence/local-settings.js';

function installMemoryStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(String(key), String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
  vi.stubGlobal('localStorage', storage);
  return storage;
}

describe('local-settings device prefs', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips theme and subjectSettings without lab API', () => {
    const empty = readLocalSettings();
    expect(empty.theme.id).toBe('default');
    expect(empty.subjectSettings).toEqual({});

    const written = writeLocalSettings({
      theme: { id: 'blackboard' },
      subjectSettings: { chemistry: { defaultPage: 'periodic' } },
    });
    expect(written.theme.id).toBe('blackboard');
    expect(localStorage.getItem('xh-theme-id')).toBe('blackboard');

    const merged = writeLocalSettings({
      subjectSettings: { chemistry: { brand: { title: '本机化学' } } },
    });
    expect(merged.theme.id).toBe('blackboard');
    expect(merged.subjectSettings.chemistry.defaultPage).toBe('periodic');
    expect(merged.subjectSettings.chemistry.brand.title).toBe('本机化学');
    expect(LOCAL_ONLY_HINT).toBe('此数据当前仅保存在本机');
  });
});

describe('settingsApi public-cloud fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('does not fetch /api/settings when accountCloudProgram is on', async () => {
    installMemoryStorage();
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('runtime-config')) {
        return {
          ok: true,
          json: async () => ({
            cloudBaseUrl: '/api/cloud/v1',
            features: { accountCloudProgram: true, publicGuestAi: false },
            releaseChannel: 'stable',
          }),
        };
      }
      throw new Error(`unexpected fetch: ${String(url)}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();

    const runtime = await import('../../apps/web/src/shared/runtime-config.js');
    await runtime.loadRuntimeConfig();
    expect(runtime.isFeatureEnabled('accountCloudProgram')).toBe(true);

    const { settingsApi } = await import('../../apps/web/src/shared/api/client.js');
    const got = await settingsApi.get();
    expect(got.theme.id).toBe('default');

    const saved = await settingsApi.update({ theme: { id: 'pixel' } });
    expect(saved.theme.id).toBe('pixel');
    expect(localStorage.getItem('xh-theme-id')).toBe('pixel');
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/settings')),
    ).toBe(false);
  });

  it('still calls lab /api/settings when accountCloudProgram is off', async () => {
    installMemoryStorage();
    const fetchMock = vi.fn(async (url: string) => {
      const href = String(url);
      if (href.includes('runtime-config')) {
        return {
          ok: true,
          json: async () => ({
            cloudBaseUrl: '',
            features: { accountCloudProgram: false, publicGuestAi: false },
            releaseChannel: 'stable',
          }),
        };
      }
      expect(href).toContain('/api/settings');
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            success: true,
            data: { theme: { id: 'reagent' }, subjectSettings: {} },
          }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.resetModules();

    const runtime = await import('../../apps/web/src/shared/runtime-config.js');
    await runtime.loadRuntimeConfig();
    const { settingsApi } = await import('../../apps/web/src/shared/api/client.js');
    const got = await settingsApi.get();
    expect(got.theme.id).toBe('reagent');
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/settings')),
    ).toBe(true);
  });
});
