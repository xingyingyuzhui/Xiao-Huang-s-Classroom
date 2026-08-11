/**
 * ConstructionLayer：文档构造记录 → runtime 构造元素的投影。
 *
 * 复用 construction/ 的渲染工厂（createConstructionFromDocument）与 detach 语义；
 * 不在文档中保存 element。
 */

import { applyDisplayName } from '../shared/board-label.js';
import { detachConstr, lineLikeElOf } from './construction/records.js';
import { createConstructionFromDocument } from './construction/restore.js';
import { normalizeConstructionStylePatch } from './graph-record-validation.js';

/** 把文档样式补丁投影到构造的全部相关 elements（颜色/线宽/虚线/透明度/标签）。 */
function applyConstructionStyle(record, stylePatch) {
  const style = normalizeConstructionStylePatch(record.style, stylePatch);
  record.style = style;
  for (const el of record.els || []) {
    try {
      const patch = {};
      if (style.strokeColor !== undefined) patch.strokeColor = style.strokeColor;
      if (style.strokeWidth !== undefined) patch.strokeWidth = Number(style.strokeWidth);
      if (style.dash !== undefined) {
        patch.dash = Number(style.dash) > 0 ? Number(style.dash) : 0;
        if (Number(style.dash) > 0 && el.elType === 'line' && typeof el.setAttribute === 'function') {
          el.setAttribute({ dashScale: 1 });
        }
      }
      if (style.opacity !== undefined) patch.strokeOpacity = Number(style.opacity);
      if (typeof el.setAttribute === 'function') el.setAttribute(patch);
    } catch {
      /* partially disposed element */
    }
  }
  return true;
}

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
     * 文档构造更新：extend / 割线锚点 / 样式字段。
     * 割线 x1/x2/showDelta 变更：detach + 按文档记录重建，保证 glider 与量测标签一致。
     * @param {any} record
     * @param {any} [stylePatch]
     */
    update(record, stylePatch) {
      const existing = context.getConstructions().find((rec) => rec.id === record?.id);
      if (!existing) return false;

      if (existing.kind === 'secant' || record?.kind === 'secant') {
        const host = context.makeHost();
        detachConstr(existing, host.getBoard());
        host.setConstructions(context.getConstructions().filter((rec) => rec.id !== existing.id));
        createConstructionFromDocument(host, record);
        return true;
      }

      if (record.extend !== undefined && existing.extend !== record.extend) {
        existing.extend = record.extend;
        const ray = existing.els?.find((el) => el?._mathExtendRay);
        try {
          ray?.setAttribute?.({ visible: Boolean(record.extend) });
        } catch {
          /* partially disposed ray */
        }
      }
      if (typeof record.label === 'string' && record.label !== existing.label) {
        existing.label = record.label;
        const lineEl = lineLikeElOf(existing);
        if (lineEl) applyDisplayName(lineEl, record.label);
      }
      if (stylePatch) {
        applyConstructionStyle(existing, stylePatch);
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
