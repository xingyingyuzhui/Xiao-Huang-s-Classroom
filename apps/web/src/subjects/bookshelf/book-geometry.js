/**
 * Book board dimensions + extruded cover / micro-arc spine geometry.
 */

import { clamp } from './spring.js';

export const W = 1.36;
export const H = 2.05;
export const T = 0.32;
export const CT = 0.032;
export const OV = 0.045;
/** 封面圆角半径（世界单位） */
export const COVER_R = 0.048;
export const PAGE_N = 10;
export const PW = W - 0.02;
export const PH = H - 0.02;
export const BLOCK_D = 0.235;
export const BLOCK_Z = -0.012;
export const PIVOT_Z = T / 2 + CT / 2;
export const BPIVOT_Z = -(T / 2 + CT / 2);
export const EDGE_SHEET_N = 3;

/**
 * @param {typeof import('three')} THREE
 * @param {number} w
 * @param {number} h
 * @param {number} r
 */
export function roundedRectShape(THREE, w, h, r) {
  const shape = new THREE.Shape();
  const hw = w * 0.5;
  const hh = h * 0.5;
  const rr = Math.min(r, hw * 0.92, hh * 0.92);
  shape.moveTo(-hw + rr, -hh);
  shape.lineTo(hw - rr, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + rr);
  shape.lineTo(hw, hh - rr);
  shape.quadraticCurveTo(hw, hh, hw - rr, hh);
  shape.lineTo(-hw + rr, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - rr);
  shape.lineTo(-hw, -hh + rr);
  shape.quadraticCurveTo(-hw, -hh, -hw + rr, -hh);
  return shape;
}

/**
 * @param {import('three').BufferGeometry} geo
 * @param {number} w
 * @param {number} h
 */
export function normalizeExtrudeCapUVs(geo, w, h) {
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  if (!uv || !pos) return;
  let maxAbsZ = 0;
  for (let i = 0; i < pos.count; i++) {
    maxAbsZ = Math.max(maxAbsZ, Math.abs(pos.getZ(i)));
  }
  const thr = maxAbsZ * 0.82;
  const hw = w * 0.5;
  const hh = h * 0.5;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getZ(i)) < thr) continue;
    uv.setXY(i, (pos.getX(i) + hw) / w, (pos.getY(i) + hh) / h);
  }
  uv.needsUpdate = true;
}

/**
 * Three.js ExtrudeGeometry default groups → book slots:
 * 0=+z lid, 1=-z lid, 2=side wall
 * @param {import('three').BufferGeometry} geo
 */
export function reindexCoverMaterialGroups(geo) {
  const prev = geo.groups.slice();
  geo.clearGroups();
  const lid = prev.find((g) => g.materialIndex === 0);
  const side = prev.find((g) => g.materialIndex === 1);
  if (lid && lid.count >= 6 && lid.count % 2 === 0) {
    const half = lid.count / 2;
    geo.addGroup(lid.start + half, half, 0);
    geo.addGroup(lid.start, half, 1);
  } else if (lid) {
    geo.addGroup(lid.start, lid.count, 0);
  }
  if (side) geo.addGroup(side.start, side.count, 2);
}

/**
 * @param {typeof import('three')} THREE
 */
export function makeCoverGeo(THREE) {
  const cw = W + OV;
  const ch = H + OV * 2;
  const shape = roundedRectShape(THREE, cw, ch, COVER_R);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: CT,
    bevelEnabled: true,
    bevelThickness: 0.0055,
    bevelSize: 0.0055,
    bevelOffset: 0,
    bevelSegments: 3,
    curveSegments: 10,
  });
  geo.translate(0, 0, -CT / 2);
  reindexCoverMaterialGroups(geo);
  normalizeExtrudeCapUVs(geo, cw, ch);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 微弧书脊截面：内侧直边贴铰链，外侧轻微外凸
 * @param {typeof import('three')} THREE
 */
export function makeSpineGeo(THREE) {
  const spineD = T + CT * 2 + 0.01;
  const spineW = 0.03;
  const bulge = 0.007;
  const spineH = H + OV * 2 - 0.01;
  const hd = spineD * 0.5;

  const shape = new THREE.Shape();
  shape.moveTo(0, -hd);
  shape.lineTo(0, hd);
  shape.lineTo(-spineW * 0.88, hd);
  shape.quadraticCurveTo(-spineW - bulge, hd * 0.42, -spineW - bulge, 0);
  shape.quadraticCurveTo(-spineW - bulge, -hd * 0.42, -spineW * 0.88, -hd);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: spineH,
    bevelEnabled: false,
    curveSegments: 10,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.translate(-bb.max.x, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);

  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  if (uv && pos) {
    const xSpan = Math.max(1e-4, spineW + bulge);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const u = clamp(z / spineD + 0.5, 0, 1);
      const v = clamp(y / spineH + 0.5, 0, 1);
      uv.setXY(i, u * 0.92 + clamp(-x / xSpan, 0, 1) * 0.08, v);
    }
    uv.needsUpdate = true;
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Shared geometries for all books (create once per stage).
 * @param {typeof import('three')} THREE
 */
export function createBookGeometries(THREE) {
  const coverGeo = makeCoverGeo(THREE);
  const blockGeo = new THREE.BoxGeometry(W - 0.012, H - 0.01, BLOCK_D);
  const pageGeo = new THREE.PlaneGeometry(PW, PH);
  const spineGeo = makeSpineGeo(THREE);
  const edgeSheetGeo = new THREE.PlaneGeometry(BLOCK_D * 0.9, H - 0.045);
  const hitGeo = new THREE.BoxGeometry(W + 0.08, H + 0.08, T + 0.18);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  return { coverGeo, blockGeo, pageGeo, spineGeo, edgeSheetGeo, hitGeo, hitMat };
}
