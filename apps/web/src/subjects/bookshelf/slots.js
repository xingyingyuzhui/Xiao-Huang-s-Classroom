/**
 * Hero fan + detail pose slots (viewport-dependent).
 */

import { clamp } from './spring.js';

/**
 * Hub composition nudge: lift books toward the brand by ~5% of the
 * visible board height (camera FOV 26° · distance 9.6, matching stage.js).
 */
export const HUB_COMPOSITION_LIFT_Y =
  0.05 * 2 * 9.6 * Math.tan((26 * Math.PI) / 360);

/**
 * @param {object} ctx
 * @param {number} ctx.viewW
 * @param {number} ctx.viewH
 * @param {import('three').Group} ctx.bookRoot
 * @param {number} ctx.bookCount
 * @param {HTMLElement | null} ctx.detailEl
 * @param {{ hero: unknown[], detail: unknown, portrait: boolean, portal?: unknown }} ctx.SLOTS — mutated in place
 */
export function computeSlots(ctx) {
  const { viewW, viewH, bookRoot, bookCount, detailEl, SLOTS } = ctx;
  const a = viewW / Math.max(1, viewH);
  const fit = clamp(a / 1.75, 0.62, 1);
  SLOTS.portrait = a < 0.85;
  bookRoot.scale.setScalar(fit);
  /* 略压低 root：书更像站在教室课桌纵深前 */
  bookRoot.position.y = SLOTS.portrait ? -0.1 : -0.08;

  const nBooksHero = Math.max(1, bookCount);
  const span = SLOTS.portrait ? 3.2 : 5.15;
  SLOTS.hero = [];
  for (let i = 0; i < nBooksHero; i++) {
    const mid = (nBooksHero - 1) / 2;
    const t = nBooksHero === 1 ? 0.5 : i / (nBooksHero - 1);
    const x = -span / 2 + span * t;
    const dist = Math.abs(i - mid);
    const y =
      (SLOTS.portrait ? -0.52 : -0.78) - dist * 0.07 + HUB_COMPOSITION_LIFT_Y;
    const z = 0.22 - dist * 0.11;
    const sc = (SLOTS.portrait ? 1.08 : 1.16) - dist * 0.028;
    const k = mid - i;
    const ry = k * (SLOTS.portrait ? 0.2 : 0.18);
    const rz = k * (SLOTS.portrait ? 0.085 : 0.075);
    SLOTS.hero.push({
      p: [x, y, z],
      r: [-0.09, ry, rz],
      s: sc,
    });
  }

  SLOTS.portal = {
    p: [0, -0.12 + HUB_COMPOSITION_LIFT_Y, 1.2],
    r: [-0.02, -0.35, 0.03],
    s: SLOTS.portrait ? 1.35 : 1.48,
  };

  if (SLOTS.portrait) {
    const el = detailEl;
    const panelH = el && el.offsetHeight > 40 ? el.offsetHeight : viewH * 0.44;
    const gap = viewH * 0.035;
    const navB = viewH * 0.1;
    const freeTop = navB;
    const freeBot = Math.max(viewH - panelH - gap, freeTop + 140);
    const midPx = (freeTop + freeBot) / 2;
    const T13 = 0.23087;
    const camZp = 9.9;
    const zw = 0.8 * fit;
    const rootY = -(1 - fit) * 0.55;
    const yw = 0.1 + (1 - (2 * midPx) / viewH) * T13 * (camZp - zw);
    const availW =
      (((freeBot - freeTop) * 0.92) / viewH) * 2 * T13 * (camZp - zw);
    const s = clamp(availW / fit / 2.3, 0.5, 1.15);
    SLOTS.detail = {
      p: [0, (yw - rootY) / fit, 0.8],
      r: [-0.04, -0.32, 0.05],
      s: s,
    };
  } else {
    SLOTS.detail = {
      p: [-1.95, 0.0, 1.1],
      r: [-0.05, -0.36, 0.06],
      s: 1.26,
    };
  }
}
