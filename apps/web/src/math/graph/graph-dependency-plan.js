/**
 * GraphDependencyPlan：GraphDocument 的引用图、跨类型拓扑排序与传递依赖闭包。
 *
 * 纯逻辑层：不 import 画板库、不触碰浏览器全局、不从 JSXGraph element 或
 * runtime flags 猜测依赖。依赖来源只有 GraphDocument refs/constraints。
 *
 * 引用方向约定（下游依赖上游）：
 * - point.followFunction/followFeature → function
 * - point.intersection.targetIds → function | construction
 * - construction.pointIds → point
 * - construction.fnId/fnIds → function
 * - construction.targetConstrId/lineIds → construction（perpTarget 是类型标记非 id）
 */

/**
 * 收集一条 construction 引用的全部对象 id。
 * @param {any} construction
 * @returns {{ functions: string[], points: string[], constructions: string[] }}
 */
export function constructionRefs(construction) {
  const functions = [];
  const points = [];
  const constructions = [];
  if (!construction || typeof construction !== 'object') {
    return { functions, points, constructions };
  }
  if (typeof construction.fnId === 'string') functions.push(construction.fnId);
  for (const id of Array.isArray(construction.fnIds) ? construction.fnIds : []) {
    if (typeof id === 'string') functions.push(id);
  }
  for (const id of Array.isArray(construction.pointIds) ? construction.pointIds : []) {
    if (typeof id === 'string') points.push(id);
  }
  if (typeof construction.targetConstrId === 'string') {
    constructions.push(construction.targetConstrId);
  }
  for (const id of Array.isArray(construction.lineIds) ? construction.lineIds : []) {
    if (typeof id === 'string') constructions.push(id);
  }
  return { functions, points, constructions };
}

/**
 * 收集一个 point 约束引用的对象 id。
 * @param {any} constraint
 * @returns {{ functions: string[], constructions: string[] }}
 */
export function pointConstraintRefs(constraint) {
  const functions = [];
  const constructions = [];
  if (!constraint || typeof constraint !== 'object') {
    return { functions, constructions };
  }
  if (constraint.kind === 'followFunction' || constraint.kind === 'followFeature') {
    if (typeof constraint.functionId === 'string') functions.push(constraint.functionId);
  } else if (constraint.kind === 'intersection') {
    for (const id of Array.isArray(constraint.targetIds) ? constraint.targetIds : []) {
      if (typeof id !== 'string') continue;
      // 目标可能是函数曲线或构造（如直线），由调用方按存在性区分
      functions.push(id);
      constructions.push(id);
    }
  }
  return { functions, constructions };
}

/**
 * 建立文档引用索引：id → 依赖的 functions/points/constructions id 集合。
 * @param {any} document
 * @returns {{
 *   nodeById: Map<string, { type: 'function' | 'point' | 'construction', deps: Set<string> }>,
 *   functionIds: string[],
 *   pointIds: string[],
 *   constructionIds: string[],
 * }}
 */
export function buildGraphDependencyIndex(document) {
  const nodeById = new Map();
  const functionIds = [];
  const pointIds = [];
  const constructionIds = [];
  const register = (id, type, deps) => {
    nodeById.set(id, { type, deps });
  };
  for (const fn of document?.functions || []) {
    if (typeof fn?.id !== 'string') continue;
    functionIds.push(fn.id);
    register(fn.id, 'function', new Set());
  }
  for (const pt of document?.points || []) {
    if (typeof pt?.id !== 'string') continue;
    pointIds.push(pt.id);
    const refs = pointConstraintRefs(pt.constraint);
    const deps = new Set();
    for (const id of [...refs.functions, ...refs.constructions]) {
      if (typeof id === 'string') deps.add(id);
    }
    register(pt.id, 'point', deps);
  }
  for (const cr of document?.constructions || []) {
    if (typeof cr?.id !== 'string') continue;
    constructionIds.push(cr.id);
    const refs = constructionRefs(cr);
    const deps = new Set();
    for (const id of [...refs.functions, ...refs.points, ...refs.constructions]) {
      if (typeof id === 'string') deps.add(id);
    }
    register(cr.id, 'construction', deps);
  }
  return { nodeById, functionIds, pointIds, constructionIds };
}

/**
 * 环检测：返回第一条环路径（含重复起点），无环返回 null。
 * 只考虑文档内实际存在的引用；悬空引用视为非法（由 validator 拒绝）。
 * @param {any} document
 * @returns {string[] | null}
 */
export function findGraphDependencyCycle(document) {
  const { nodeById } = buildGraphDependencyIndex(document);
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  /** @type {Map<string, number>} */
  const color = new Map();
  /** @type {string[]} */
  const stack = [];
  const visit = (id) => {
    color.set(id, GRAY);
    stack.push(id);
    const node = nodeById.get(id);
    for (const dep of node?.deps || []) {
      if (!nodeById.has(dep)) continue; // 悬空引用由 validator 处理
      const state = color.get(dep) ?? WHITE;
      if (state === GRAY) {
        const start = stack.indexOf(dep);
        return stack.slice(start).concat(dep);
      }
      if (state === WHITE) {
        const cycle = visit(dep);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    color.set(id, BLACK);
    return null;
  };
  for (const id of nodeById.keys()) {
    if ((color.get(id) ?? WHITE) === WHITE) {
      const cycle = visit(id);
      if (cycle) return cycle;
    }
  }
  return null;
}

/**
 * 跨类型稳定拓扑序（依赖在前）：用于全量渲染的 add 顺序。
 * 普通 point 先于引用它的 construction；line-line 交点 point 位于它依赖的
 * constructions 之后，下游 construction 又位于该交点之后。
 * @param {any} document
 * @returns {Array<{ type: 'function' | 'point' | 'construction', id: string }>}
 */
export function graphTopologicalOrder(document) {
  const { nodeById, functionIds, pointIds, constructionIds } = buildGraphDependencyIndex(document);
  const allIds = [...functionIds, ...pointIds, ...constructionIds];
  const order = [];
  const visited = new Set();
  const visiting = new Set();
  const visit = (id) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) return; // 环由 findGraphDependencyCycle 负责拒绝
    visiting.add(id);
    const node = nodeById.get(id);
    for (const dep of node?.deps || []) {
      if (nodeById.has(dep)) visit(dep);
    }
    visiting.delete(id);
    visited.add(id);
    order.push({ type: node.type, id });
  };
  // 先按文档声明顺序访问；依赖会先入列
  for (const id of allIds) visit(id);
  return order;
}

/**
 * 传递依赖闭包：给定根 id，返回所有直接/间接下游（不含根自身）的类型分桶，
 * 以及覆盖闭包全集（根 + 下游）的跨类型 add/remove 顺序。
 *
 * 顺序固定（add/remove 均跨 point/construction 混排，不按类型分桶）：
 * - addOrder：functions 根节点先创建，其余 point/construction 按跨类型拓扑序列混排
 *   （上游先），例如 point → line construction → intersection point → perpendicular。
 * - removeOrder：addOrder 严格反转，先最下游 point/construction，最后 function。
 *
 * 依赖来源只有 GraphDocument refs/constraints（constructionRefs/pointConstraintRefs），
 * 不从 JSXGraph element 或 runtime flags 猜测。
 * @param {any} document
 * @param {string[]} rootIds
 * @returns {{
 *   pointIds: string[],
 *   constructionIds: string[],
 *   functionIds: string[],
 *   removeOrder: Array<{ type: 'function' | 'point' | 'construction', id: string }>,
 *   addOrder: Array<{ type: 'function' | 'point' | 'construction', id: string }>,
 * }}
 */
export function graphDependentsOf(document, rootIds) {
  const { nodeById } = buildGraphDependencyIndex(document);
  const dependents = new Map();
  for (const id of nodeById.keys()) dependents.set(id, []);
  for (const [id, node] of nodeById) {
    for (const dep of node.deps) {
      dependents.get(dep)?.push(id);
    }
  }
  const roots = new Set(rootIds.filter((id) => typeof id === 'string'));
  const out = { pointIds: [], constructionIds: [], functionIds: [] };
  // closure = 根 + 全部直接/间接下游；visited 防止环/重复入队
  const closure = new Set(roots);
  const visited = new Set(roots);
  const queue = [...roots];
  while (queue.length) {
    const id = queue.shift();
    for (const dep of dependents.get(id) || []) {
      if (visited.has(dep)) continue;
      visited.add(dep);
      closure.add(dep);
      const node = nodeById.get(dep);
      if (!node) continue;
      if (node.type === 'point') out.pointIds.push(dep);
      else if (node.type === 'construction') out.constructionIds.push(dep);
      else out.functionIds.push(dep);
      queue.push(dep);
    }
  }
  // addOrder：复用确定性跨类型拓扑序，截取闭包子图；removeOrder 严格反转。
  const addOrder = graphTopologicalOrder(document).filter((entry) => closure.has(entry.id));
  const removeOrder = addOrder.slice().reverse();
  return { ...out, removeOrder, addOrder };
}

/**
 * 依赖卸载顺序（add 严格逆序）：最下游 point/construction 先删，function 最后。
 * @param {any} document
 * @returns {Array<{ type: 'function' | 'point' | 'construction', id: string }>}
 */
export function graphRemoveOrder(document) {
  return graphTopologicalOrder(document).reverse();
}
