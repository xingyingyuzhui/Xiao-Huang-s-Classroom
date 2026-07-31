/**
 * Critical-ish spring + clamp — shared by stage motion, floaters, book springs.
 */

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export class Spring {
  constructor(v, k, d) {
    this.v = v;
    this.t = v;
    this.vel = 0;
    this.k = k || 120;
    this.d = d || 14;
  }
  set(v) {
    this.v = v;
    this.t = v;
    this.vel = 0;
    return this;
  }
  update(dt) {
    const a = this.k * (this.t - this.v) - this.d * this.vel;
    this.vel += a * dt;
    this.v += this.vel * dt;
    return this.v;
  }
}
