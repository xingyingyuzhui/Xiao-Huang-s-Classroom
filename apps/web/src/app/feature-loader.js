/**
 * Web feature loader（R4.2）：@xiaohuang/subject-kit FeatureLoader 的薄适配。
 *
 * 唯一核心是 subject-kit（并发去重 / mount generation / 旧实例 dispose /
 * retry / loading-error 状态 / disposeAll）；本模块只做两件事：
 * 1. factory → FeatureModule 适配（web 语义：factory 返回模块命名空间）。
 * 2. mod 缓存：首次 factory 成功后的模块对象复用（r1.mod === r2.mod）。
 *
 * 过期保护（快速切 Tab）由 main.js 的 switchSeq 负责，
 * 不要用「全局 load 序号」判断过期——否则 A→B→A 再进会误判 stale。
 */
import { createFeatureLoader as createKitLoader } from '@xiaohuang/subject-kit';

export function createFeatureLoader() {
  /** factory 注册表（load(name, factory) 语义） */
  const factories = new Map();
  /** 模块缓存：factory 成功后的命名空间对象（适配层，非 loader 核心） */
  const modCache = new Map();

  const kit = createKitLoader({
    root: () => null,
    load: async (name) => {
      const factory = factories.get(name);
      if (!factory) {
        throw new Error(`未注册 factory: ${name}`);
      }
      return {
        async mount() {
          if (!modCache.has(name)) {
            modCache.set(name, await factory());
          }
          return { mod: modCache.get(name), mount() {}, dispose() {} };
        },
      };
    },
  });

  return {
    /**
     * @param {string} name
     * @param {() => Promise<any>} factory
     * @returns {Promise<{ mod: any }>}
     */
    async load(name, factory) {
      factories.set(name, factory);
      const controller = await kit.load(name);
      return { mod: /** @type {any} */ (controller).mod };
    },

    /** 是否已有进行中或已完成的加载（含失败重试前的缓存） */
    has(name) {
      return factories.has(name) || kit.getStatus(name) !== 'idle';
    },

    /** 加载状态（subject-kit FeatureLoaderStatus） */
    getStatus(name) {
      return kit.getStatus(name);
    },

    /** 测试 / 调试：强制清缓存 */
    clear(name) {
      if (name == null) {
        factories.clear();
        modCache.clear();
      } else {
        factories.delete(name);
        modCache.delete(name);
      }
    },

    /** 释放全部实例（subject-kit disposeAll + 适配层缓存清理） */
    disposeAll() {
      kit.disposeAll();
      factories.clear();
      modCache.clear();
    },
  };
}
