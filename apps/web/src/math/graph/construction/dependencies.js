/**
 * 作图对象挂在端点上的派生更新回调。
 *
 * JSXGraph 的点生命周期比作图记录长；记录删除或重建时必须显式解绑，
 * 否则同一端点会不断保留已删除交点的回调。
 */

/**
 * @param {any} construction
 * @param {any} endpoint
 * @param {() => void} tick
 */
export function bindConstructionDependency(construction, endpoint, tick) {
  if (!construction || !endpoint || typeof tick !== 'function') return;
  if (!endpoint._mathDepIntersectTicks) endpoint._mathDepIntersectTicks = new Set();
  endpoint._mathDepIntersectTicks.add(tick);
  if (!construction._mathDependencyBindings) construction._mathDependencyBindings = [];
  construction._mathDependencyBindings.push({ endpoint, tick });
}

/**
 * @param {any} construction
 */
export function clearConstructionDependencies(construction) {
  const bindings = construction?._mathDependencyBindings;
  if (!Array.isArray(bindings)) return;
  for (const { endpoint, tick } of bindings) {
    try {
      endpoint?._mathDepIntersectTicks?.delete?.(tick);
    } catch {
      /* best-effort teardown */
    }
  }
  delete construction._mathDependencyBindings;
}
