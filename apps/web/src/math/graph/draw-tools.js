/**
 * 图形作图工具的兼容入口。
 *
 * 各职责实现位于 construction/；图形实验仍可从本模块稳定导入。
 */

export {
  clearAllConstructions,
  detachConstr,
  isCurveEl,
  isDrawableConstrEl,
  isExtendStyleTarget,
  isLineLike,
  lineLikeElOf,
  snapshotConstructions,
} from './construction/records.js';
export { restoreConstructions } from './construction/restore.js';
export {
  createSegmentOrLine,
  createTangent,
} from './construction/render-lines.js';
export {
  createNormalAtFn,
  createPerpToAxis,
  createPerpToFn,
  createPerpToLine,
} from './construction/render-perpendiculars.js';
export {
  autoIntersectNewLine,
  createFnIntersection,
  createLineIntersection,
  setConstructionExtend,
} from './construction/intersections.js';
export {
  deleteConstruction,
  resolveTangentAnchor,
} from './construction/operations.js';
export {
  deleteConstructionsDependingOnPoint,
} from './construction/point-dependencies.js';
