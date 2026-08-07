import { describe, expect, it, vi } from 'vitest';
import { createFeatureLoader } from '../src/loader.js';
import type { FeatureModule } from '../src/types.js';

function makeModule(
  name: string,
  opts: { throwMount?: boolean; preload?: boolean } = {},
): FeatureModule {
  void name;
  return {
    async preload() {
      if (opts.preload) throw new Error(`${name} preload exploded`);
    },
    async mount() {
      if (opts.throwMount) throw new Error(`${name} mount exploded`);
      return {
        mount: vi.fn(),
        dispose: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
      };
    },
  };
}

describe('FeatureLoader（spec §9.2）', () => {
  it('并发去重：同 key 同时加载只执行一次 loader', async () => {
    let loads = 0;
    const loader = createFeatureLoader({
      root: () => null,
      load: async () => {
        loads += 1;
        return makeModule('a');
      },
    });
    const [a, b] = await Promise.all([loader.load('graph'), loader.load('graph')]);
    expect(loads).toBe(1);
    expect(a).toBe(b);
    expect(loader.activeCount()).toBe(1);
  });

  it('mount generation：新 mount 覆盖旧实例并 dispose 旧 controller', async () => {
    const disposed: string[] = [];
    const loader = createFeatureLoader({
      root: () => null,
      load: async () => ({
        async mount() {
          return {
            mount: vi.fn(),
            dispose: () => {
              disposed.push('old');
            },
          };
        },
      }),
    });
    const first = await loader.load('graph');
    const second = await loader.load('graph');
    expect(second).not.toBe(first);
    expect(disposed).toEqual(['old']);
    expect(loader.activeCount()).toBe(1);
  });

  it('loading/error/retry：mount 失败进入 error 状态，再次 load 重试', async () => {
    const loader = createFeatureLoader({
      root: () => null,
      load: async () => makeModule('x', { throwMount: true }),
    });
    await expect(loader.load('panel')).rejects.toThrow('mount exploded');
    expect(loader.getStatus('panel')).toBe('error');
    // retry：loader 允许重新加载
    await expect(loader.load('panel')).rejects.toThrow('mount exploded');
  });

  it('dispose 前一实例：重复 load 时旧 controller dispose 被调用', async () => {
    const disposed: string[] = [];
    const loader = createFeatureLoader({
      root: () => null,
      load: async (key) => ({
        async mount() {
          return {
            mount: vi.fn(),
            dispose: () => {
              disposed.push(key);
            },
          };
        },
      }),
    });
    await loader.load('a');
    await loader.load('a');
    expect(disposed).toEqual(['a']);
    loader.disposeAll();
    expect(disposed).toEqual(['a', 'a']);
  });

  it('取消过时请求：generation 旧结果不发布', async () => {
    const loader = createFeatureLoader({
      root: () => null,
      load: async () => makeModule('slow'),
    });
    const p1 = loader.load('k');
    const p2 = loader.load('k'); // 覆盖 p1
    const r1 = await p1;
    const r2 = await p2;
    expect(r1).toBe(r2);
  });
});
