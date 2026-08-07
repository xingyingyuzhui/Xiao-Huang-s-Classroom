/**
 * 功能模块按需加载器（Program 4 Task 4.3：与 @xiaohuang/subject-kit
 * FeatureLoader 协议对齐的 web adapter）。
 *
 * - 缓存：同一功能只加载一次；并发请求只触发一次 import。
 * - 失败清缓存：允许下次重试。
 * - status：idle/loading/ready/error（对齐 subject-kit FeatureLoaderStatus）。
 * - disposeAll：清空缓存与状态（测试/卸载）。
 *
 * 过期保护（快速切 Tab）由 main.js 的 switchSeq 负责，
 * 不要用「全局 load 序号」判断过期——否则 A→B→A 再进会误判 stale。
 */
export function createFeatureLoader() {
  /** @type {Map<string, Promise<{ mod: any }>>} */
  const cache = new Map();
  /** @type {Map<string, 'idle' | 'loading' | 'ready' | 'error'>} */
  const statuses = new Map();

  return {
    /**
     * @param {string} name
     * @param {() => Promise<any>} factory
     * @returns {Promise<{ mod: any }>}
     */
    load(name, factory) {
      if (cache.has(name)) {
        return /** @type {Promise<{ mod: any }>} */ (cache.get(name));
      }
      statuses.set(name, 'loading');
      const p = factory()
        .then((mod) => {
          statuses.set(name, 'ready');
          return { mod };
        })
        .catch((err) => {
          cache.delete(name);
          statuses.set(name, 'error');
          throw err;
        });
      cache.set(name, p);
      return p;
    },

    /** 是否已有进行中或已完成的加载（含失败重试前的缓存） */
    has(name) {
      return cache.has(name);
    },

    /** 加载状态（对齐 subject-kit FeatureLoaderStatus） */
    getStatus(name) {
      return statuses.get(name) ?? 'idle';
    },

    /** 测试 / 调试：强制清缓存 */
    clear(name) {
      if (name == null) {
        cache.clear();
        statuses.clear();
      } else {
        cache.delete(name);
        statuses.delete(name);
      }
    },

    /** 清空全部缓存与状态（卸载/测试） */
    disposeAll() {
      cache.clear();
      statuses.clear();
    },
  };
}
