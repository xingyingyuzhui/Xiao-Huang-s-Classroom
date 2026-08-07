/**
 * PointLayer：文档点记录 → runtime 点元素的投影。
 *
 * 包裹 user-points 控制器，提供按文档记录的 add / update / remove；
 * 拖动坐标由 JSXGraph 实时维护，drag end 经 onPointMoved 回写文档（point/update）；
 * undo/redo 等文档驱动坐标变更经 update 回写到板面元素。
 */

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
     * 文档点更新：投影坐标（及可选 showCoords）到 runtime 元素。
     * 约束 kind 变化时走删除+重建更安全；此处仅处理坐标/标签显隐。
     * @param {any} record
     */
    update(record) {
      if (!record || typeof record.id !== 'string') return null;
      const existing = findRecord(record.id);
      if (!existing) return null;

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
      return existing;
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
