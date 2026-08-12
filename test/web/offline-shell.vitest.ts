import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OfflineCapabilityRegistry,
  registerDefaultCapabilities,
} from '../../apps/web/src/offline/offline-capability-registry.js';
import { NetworkMonitor } from '../../apps/web/src/offline/network-monitor.js';

describe('runtime-config', () => {
  beforeEach(() => {
    // Reset cached config between tests by re-importing would be complex,
    // so we test in order: failure first, then success
    vi.restoreAllMocks();
  });

  it('loadRuntimeConfig returns defaults when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'));
    // Need to clear cache — dynamic import trick
    const mod = await import('../../apps/web/src/shared/runtime-config.js');
    // Since cached may be set from prior test, we test getRuntimeConfig fallback
    const config = await mod.loadRuntimeConfig();
    expect(config.cloudBaseUrl).toBe('');
    expect(config.features.accountCloudProgram).toBe(false);
    expect(config.releaseChannel).toBe('stable');
  });

  it('loadRuntimeConfig parses valid config', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          cloudBaseUrl: 'https://cloud.example.com',
          features: { accountCloudProgram: true, publicGuestAi: false },
          releaseChannel: 'beta',
        }),
    });
    // Force fresh module to clear cache
    vi.resetModules();
    const mod = await import('../../apps/web/src/shared/runtime-config.js');
    const config = await mod.loadRuntimeConfig();
    expect(config.cloudBaseUrl).toBe('https://cloud.example.com');
    expect(config.features.accountCloudProgram).toBe(true);
    expect(config.features.publicGuestAi).toBe(false);
    expect(config.releaseChannel).toBe('beta');
  });

  it('isFeatureEnabled returns correct value', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          cloudBaseUrl: '',
          features: { accountCloudProgram: true, publicGuestAi: false },
          releaseChannel: 'stable',
        }),
    });
    vi.resetModules();
    const mod = await import('../../apps/web/src/shared/runtime-config.js');
    await mod.loadRuntimeConfig();
    expect(mod.isFeatureEnabled('accountCloudProgram')).toBe(true);
    expect(mod.isFeatureEnabled('publicGuestAi')).toBe(false);
  });
});

describe('OfflineCapabilityRegistry', () => {
  let registry: OfflineCapabilityRegistry;

  beforeEach(() => {
    registry = new OfflineCapabilityRegistry();
  });

  it('register and query by subject', () => {
    registry.register({
      featureId: 'chem.periodic-table',
      label: '元素周期表',
      subjectId: 'chemistry',
      dataSource: 'local-only',
      offlineAvailable: true,
    });
    const chems = registry.listBySubject('chemistry');
    expect(chems).toHaveLength(1);
    expect(chems[0].featureId).toBe('chem.periodic-table');
    expect(registry.isOfflineAvailable('chem.periodic-table')).toBe(true);
  });

  it('listCloudOnly returns non-offline features', () => {
    registry.register({
      featureId: 'cloud.sync',
      label: '云同步',
      subjectId: null,
      dataSource: 'cloud-only',
      offlineAvailable: false,
    });
    registry.register({
      featureId: 'chem.molecule',
      label: '分子模型',
      subjectId: 'chemistry',
      dataSource: 'local-only',
      offlineAvailable: true,
    });
    const cloudOnly = registry.listCloudOnly();
    expect(cloudOnly).toHaveLength(1);
    expect(cloudOnly[0].featureId).toBe('cloud.sync');
  });

  it('registerDefaultCapabilities registers all expected features', () => {
    registerDefaultCapabilities(registry);
    const all = registry.listAll();
    expect(all.length).toBe(11);
    expect(registry.listBySubject('chemistry')).toHaveLength(4);
    expect(registry.listBySubject('math')).toHaveLength(5);
    expect(registry.listCloudOnly()).toHaveLength(2);
  });
});

describe('NetworkMonitor', () => {
  it('starts with online state', () => {
    const monitor = new NetworkMonitor();
    expect(monitor.isOnline()).toBe(true);
    monitor.dispose();
  });
});
