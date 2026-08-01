/**
 * 切线锚点跟随：靠近顶点时绑特征 follow id。
 */

import { keyFeatures } from './model.js';
import {
  curveFollowTargetId,
  featureFollowTargetId,
} from '../shared/follow-target.js';

/**
 * @param {any} fn
 * @returns {{ x: number, y: number } | null}
 */
export function vertexFeatureOfFn(fn) {
  if (!fn || fn.kind !== 'preset' || !fn.preset) return null;
  try {
    const feats = keyFeatures(fn.preset, fn.coeffs || {});
    const hit = feats.find(
      (f) =>
        f.kind === '顶点' &&
        Number.isFinite(Number(f.x)) &&
        Number.isFinite(Number(f.y)),
    );
    if (!hit) return null;
    return { x: Number(hit.x), y: Number(hit.y) };
  } catch {
    return null;
  }
}

/**
 * 切线工具：靠近顶点则绑特征跟随，否则绑曲线
 * @param {any} fn
 * @param {number} x
 * @param {number} y
 * @param {number} [tol]
 */
export function pickTangentFollowTargetId(fn, x, y, tol = 0.35) {
  if (!fn?.id) return null;
  const curveId = curveFollowTargetId(fn.id);
  const vertex = vertexFeatureOfFn(fn);
  if (
    vertex &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    Math.hypot(x - vertex.x, y - vertex.y) <= tol
  ) {
    return featureFollowTargetId(fn.id, 'vertex');
  }
  return curveId;
}
