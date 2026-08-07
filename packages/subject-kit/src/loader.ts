import type { FeatureModule, MountableController } from './types.js';

export type FeatureLoaderStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface FeatureLoaderOptions {
  load: (key: string) => Promise<FeatureModule>;
  /** mount 上下文 root 工厂（默认取 document.body；Node 测试注入 fake） */
  root?: () => HTMLElement | null;
}

export interface FeatureLoader {
  load(key: string): Promise<MountableController>;
  getStatus(key: string): FeatureLoaderStatus;
  activeCount(): number;
  disposeAll(): void;
}

/**
 * FeatureLoader（spec §9.2）：
 * - 并发去重：同 key 同时加载共享同一 promise。
 * - mount generation：新 mount 覆盖旧实例并 dispose 旧 controller。
 * - loading/error 状态；错误后可重试。
 * - disposeAll 释放全部实例。
 */
export function createFeatureLoader(options: FeatureLoaderOptions): FeatureLoader {
  const inflight = new Map<string, Promise<MountableController>>();
  const instances = new Map<string, MountableController>();
  const statuses = new Map<string, FeatureLoaderStatus>();

  return {
    async load(key) {
      const existing = inflight.get(key);
      if (existing) return existing;

      const promise = (async () => {
        statuses.set(key, 'loading');
        try {
          const mod = await options.load(key);
          await mod.preload?.();
          const root =
            options.root?.() ??
            (globalThis as { document?: { body?: HTMLElement | null } }).document?.body ??
            null;
          const controller = await mod.mount({ root, subjectId: key, panelId: key });
          const prev = instances.get(key);
          if (prev) {
            try {
              prev.dispose();
            } catch {
              /* 旧实例 dispose 失败不阻断新实例（错误汇总由调用方） */
            }
          }
          instances.set(key, controller);
          statuses.set(key, 'ready');
          return controller;
        } catch (err) {
          statuses.set(key, 'error');
          throw err;
        } finally {
          inflight.delete(key);
        }
      })();

      inflight.set(key, promise);
      return promise;
    },
    getStatus(key) {
      return statuses.get(key) ?? 'idle';
    },
    activeCount() {
      return instances.size;
    },
    disposeAll() {
      for (const [key, instance] of instances) {
        try {
          instance.dispose();
        } catch {
          /* 汇总由调用方 */
        }
        statuses.set(key, 'idle');
      }
      instances.clear();
    },
  };
}
