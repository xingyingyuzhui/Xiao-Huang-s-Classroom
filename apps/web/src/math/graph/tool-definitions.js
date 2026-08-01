/** 函数画布专属工具；共享工具条只负责展示和指针适配。 */

/** @typedef {{ id: string, label: string, hint?: string }} BoardToolDef */

/** @type {BoardToolDef[]} */
export const GRAPH_BOARD_TOOLS = [
  { id: 'select', label: '选择', hint: '拖动自由点 · 双击改样式' },
  { id: 'probe', label: '探针', hint: '沿曲线读取坐标，并联动对应表' },
  { id: 'point', label: '加点', hint: '点击画板空白处加点' },
  { id: 'segment', label: '线段', hint: '依次点击两个点' },
  { id: 'line', label: '直线', hint: '依次点击两个点' },
  { id: 'tangent', label: '切线', hint: '点跟随函数的点，或点在曲线附近' },
  { id: 'perp-axis', label: '垂线', hint: '先点一点，再点坐标轴 / 直线 / 曲线' },
  { id: 'intersect', label: '交点', hint: '依次点击两条曲线或直线' },
  { id: 'secant', label: '割线', hint: '先点曲线选函数，再依次点两个 x 位置' },
  { id: 'delete', label: '删除', hint: '点击要删除的点或线' },
];
