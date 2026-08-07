/**
 * PointLayer：文档点记录 → runtime 点元素的投影。
 *
 * 包裹 user-points 控制器，提供按文档记录的 add / update / remove；
 * 拖动坐标由 JSXGraph 实时维护，drag end 经 onPointMoved 回写文档（point/update）；
 * undo/redo 等文档驱动坐标变更经 update 回写到板面元素。
 *
 * replace 语义：constraint kind / 跟随目标变化时，必须先拆除依赖该点的
 * 构造，替换点元素，再按文档重建依赖构造；绝不保留引用旧元素的构造。
 */

import { pointUpdateMode } from './graph-record-validation.js';
import { graphDependentsOf } from './graph-dependency-plan.js';

/**
 * @param {any} element
 * @param {number} x
 * @param {number} y
 */
function moveBoardPoint(element, x, y) {
  if (!element) return;
  try {
    if (typeof element.setPositionDirectly === 'function') {
      element.setPositionDirectly(1, [x, y]);
    } else if (typeof element.moveTo === 'function') {
      element.moveTo([x, y], 0);
    } else if (typeof element.setPosition === 'function') {
      element.setPosition(1, [x, y]);
    }
  } catch {
    /* partially disposed point */
  }
}

/**
 * @param {{
 *   controller: any,
 *   getRecords: () => any[],
 *   getDocument: () => any,
 *   constructionLayer: any,
 * }} context
 */
export function createPointLayer(context) {
  const findRecord = (id) => context.getRecords().find((record) => record.id === id) || null;

  return {
    /**
     * 从文档记录创建 runtime 点；已存在（工具已创建）时幂等跳过。
     * @param {any} record
     */
    add(record) {
      if (!record || typeof record.id !== 'string') return null;
      if (findRecord(record.id)) return null;
      return context.controller.createFromDocument(record);
    },

    /**
     * 文档点更新：按 pointUpdateMode 分流。
     * - inPlace：坐标/名称/showCoords/样式原位投影；
     * - replace：约束/跟随目标变化 → 拆除依赖构造 → 替换点 → 重建构造。
     * @param {any} record
     */
    update(record) {
      if (!record || typeof record.id !== 'string') return null;
      const existing = findRecord(record.id);
      if (!existing) return null;
      const previous = { ...existing, constraint: existing.constraint || { kind: 'free' } };

      if (pointUpdateMode(previous, record) === 'replace') {
        return this.replace(previous, record);
      }

      const x = Number(record.x);
      const y = Number(record.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        moveBoardPoint(existing.el, x, y);
        try {
          existing.el?.board?.update?.();
        } catch {
          /* best-effort board refresh */
        }
      }

      if (typeof record.showCoords === 'boolean' && record.showCoords !== existing.showCoords) {
        context.controller.setShowCoords?.(existing.el, record.showCoords);
      }
      if (typeof record.name === 'string' && record.name && record.name !== existing.baseName) {
        existing.baseName = record.name;
        if (existing.el) existing.el._mathBaseName = record.name;
        try {
          existing.el?._mathLiveLabelTick?.();
        } catch {
          /* label refresh is best-effort */
        }
      }
      if (record.style) {
        context.controller.applyStyle?.(existing.el, record.style);
      }
      return existing;
    },

    /**
     * 替换点元素（约束/跟随目标变化）：拆除依赖构造 → 删旧点 → 建新点 → 重建构造。
     * @param {any} previous
     * @param {any} next
     */
    replace(previous, next) {
      const doc = context.getDocument?.();
      const dependents = doc ? graphDependentsOf(doc, [next.id]) : { constructionIds: [] };
      const constrIds = dependents.constructionIds || [];
      // 1) 先拆除依赖构造（下游先删）
      const constructionLayer = context.getConstructionLayer?.() || context.constructionLayer;
      for (const id of [...constrIds].reverse()) {
        constructionLayer?.remove(id);
      }
      // 2) 删除旧点元素（controller.delete 同时清理 board 引用）
      context.controller.delete(previous.el);
      // 3) 按新记录重建点
      const created = context.controller.createFromDocument(next);
      // 4) 按文档重建依赖构造
      if (doc) {
        const constructionLayer = context.getConstructionLayer?.() || context.constructionLayer;
        for (const rec of doc.constructions || []) {
          if (constrIds.includes(rec.id)) constructionLayer?.add(rec);
        }
      }
      return created;
    },

    /**
     * 删除 runtime 点（含其依赖构造）。
     * @param {string} id
     */
    remove(id) {
      const record = findRecord(id);
      if (!record) return false;
      context.controller.delete(record.el);
      return true;
    },

    findRecord,
  };
}
