/**
 * PointLayer：文档点记录 → runtime 点元素的投影。
 *
 * Task 7 阶段：包裹 user-points 控制器，提供按文档记录的
 * add / remove / 幂等保护；拖动坐标由 JSXGraph 实时维护，
 * drag end 经 onPointMoved 回写文档（point/update）。
 */

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
     * 文档点更新：拖动坐标已由 JSXGraph 实时维护；
     * 样式等补丁在此应用（Task 8 补样式回写）。
     * @param {any} _record
     */
    update(_record) {
      return null;
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
