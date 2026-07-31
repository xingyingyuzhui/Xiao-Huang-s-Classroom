/**
 * Shelf exit / return keyframed Y motion + spring target helpers.
 */

export const EASE = {
  hold: () => 1,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

/** how far the book floats up before letting go */
export const LIFT = 0.38;
/** far enough below its slot to be out of frame */
export const CLEAR = 4.2;

/**
 * @param {object} b book instance
 * @param {{ p: number[], r: number[], s: number }} slot
 */
export function setTargets(b, slot) {
  const s = b.springs;
  s.px.t = slot.p[0];
  s.py.t = slot.p[1];
  s.pz.t = slot.p[2];
  s.rx.t = slot.r[0];
  s.ry.t = slot.r[1];
  s.rz.t = slot.r[2];
  b.slotScale = slot.s;
}

/**
 * @param {object} b
 * @param {Array<{ d: number, from: number, to: number, ease: (t: number) => number, end?: () => void }>} segs
 */
export function playY(b, segs) {
  b.exit = { segs, i: 0, t: 0 };
}

/**
 * @param {object} b
 * @param {number} dt
 */
export function stepY(b, dt) {
  const ex = b.exit;
  const s = b.springs;
  ex.t += dt;
  let seg = ex.segs[ex.i];
  while (seg && ex.t >= seg.d) {
    ex.t -= seg.d;
    s.py.v = seg.to;
    if (seg.end) seg.end();
    seg = ex.segs[++ex.i];
  }
  if (seg) s.py.v = seg.from + (seg.to - seg.from) * seg.ease(ex.t / seg.d);
  else b.exit = null;
  s.py.t = s.py.v;
  s.py.vel = 0;
}

/**
 * @param {object} b
 */
export function pinInPlace(b) {
  const s = b.springs;
  s.px.t = s.px.v;
  s.pz.t = s.pz.v;
  s.rx.t = s.rx.v;
  s.ry.t = s.ry.v;
  s.rz.t = s.rz.v;
}

/**
 * @param {object} b
 * @param {number} i
 * @param {number} delay
 * @param {{ hero: Array<{ p: number[] }> }} slots
 */
export function sendOut(b, i, delay, slots) {
  const y0 = slots.hero[i].p[1];
  const here = b.springs.py.v;
  const apex = y0 + LIFT;
  b.root.visible = true;
  pinInPlace(b);
  playY(b, [
    { d: delay, from: here, to: here, ease: EASE.hold },
    { d: 0.28, from: here, to: apex, ease: EASE.outQuad },
    {
      d: 0.9,
      from: apex,
      to: y0 - CLEAR,
      ease: EASE.inOutSine,
      end: () => {
        b.root.visible = false;
      },
    },
  ]);
}

/**
 * @param {object} b
 * @param {number} i
 * @param {number} delay
 * @param {{ hero: Array<{ p: number[] }> }} slots
 */
export function bringBack(b, i, delay, slots) {
  const here = b.springs.py.v;
  b.root.visible = true;
  pinInPlace(b);
  playY(b, [
    { d: delay, from: here, to: here, ease: EASE.hold },
    { d: 1.0, from: here, to: slots.hero[i].p[1], ease: EASE.outQuint },
  ]);
}
