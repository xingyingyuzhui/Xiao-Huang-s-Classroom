/**
 * ConstructionLayer：文档构造记录 → runtime 构造元素的投影。
 *
 * 复用 construction/ 的渲染工厂（createConstructionFromDocument）与 detach 语义；
 * 不在文档中保存 element。
 */

import { detachConstr } from './construction/records.js';
import { createConstructionFromDocument } from './construction/restore.js';

/**
 * @param {{
 *   makeHost: () => any,
 *   getConstructions: () => any[],
 * }} context
 */
export function createConstructionLayer(context) {
  return {
    /**
     * 从文档记录创建 runtime 构造；已存在（工具已创建）时幂等跳过。
     * @param {any} record
     */
    add(record) {
      if (!record || typeof record.id !== 'string') return null;
      if (context.getConstructions().some((rec) => rec.id === record.id)) return null;
      return createConstructionFromDocument(context.makeHost(), record);
    },

    /**
     * 文档构造更新（extend 等）。
     * @param {any} record
     */
    update(record) {
      const existing = context.getConstructions().find((rec) => rec.id === record?.id);
      if (!existing) return false;
      if (record.extend !== undefined && existing.extend !== record.extend) {
        existing.extend = record.extend;
        const ray = existing.els?.find((el) => el?._mathExtendRay);
        try {
          ray?.setAttribute?.({ visible: Boolean(record.extend) });
        } catch {
          /* partially disposed ray */
        }
      }
      return true;
    },

    /**
     * 删除 runtime 构造（含依赖）。
     * @param {string} id
     */
    remove(id) {
      const host = context.makeHost();
      const record = host.findConstr(id);
      if (!record) return false;
      detachConstr(record, host.getBoard());
      host.setConstructions(context.getConstructions().filter((rec) => rec.id !== id));
      return true;
    },
  };
}
