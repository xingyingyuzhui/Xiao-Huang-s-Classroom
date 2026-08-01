/**
 * 进 / 退教室：伴奏层 + 全视口不透明帷幕
 *
 * 粒子与溶解同步思路（参考 Codrops emissive-dissolve + 游戏向 dissolve VFX）：
 * - 粒子主要从「溶解前线」连续喷出，而不是开场一次性炸开
 * - 软圆点 + 少量碎片；生命期内缩小、减速、淡出
 * - 返回时从屏幕凝聚回封面，ease 到靶点
 * - 帷幕保证壳层切换时 viewport 始终有遮罩
 *
 * @see https://tympanus.net/codrops/2025/02/17/implementing-a-dissolve-effect-with-shaders-and-particles-in-three-js/
 * @see https://github.com/JatinChopra/emissive-dissolve-effect
 *
 * 生命周期回调（均带 transitionId）：
 *   onOpaque  — 帷幕已不透明，可安全切换壳层
 *   onCleared — 帷幕开始离开前景
 *   onSettled — 动画资源清理完毕
 */

import { transitionPaletteFor } from './covers.js';

const MAX_FLAKES = 260;
const MAX_MOTIFS = 10;
const SAMPLE_W = 64;
const SAMPLE_H = 90;

/** 帷幕达到此不透明度即 report opaque */
const OPAQUE_THRESHOLD = 0.92;
/** 淡出低于此值视为 cleared */
const CLEARED_THRESHOLD = 0.18;

const MOTIFS = {
  chemistry: ['H₂O', 'Na⁺', 'Cl⁻', 'Δ', '⇌', 'pH', 'C', 'O₂', '↑', '↓'],
  physics: ['E=mc²', 'λ', 'ν', 'F=ma', 'ℏ', '∇', 'Ω', 'c', 'Δx', 'q'],
  biology: ['DNA', 'ATP', 'mito', 'cell', 'ΔG', 'RNA', '♀', '♂', 'N₂', 'CO₂'],
  mathematics: ['∑', '∫', 'π', '∞', '√', 'Δ', 'θ', '≈', '∂', '∀'],
  math: ['∑', '∫', 'π', '∞', '√', 'Δ', 'θ', '≈', '∂', '∀'],
  default: ['·', '✦', '◇', '○', '△', '□'],
};

/**
 * @param {object} opts
 * @param {HTMLElement} opts.root
 * @param {() => void} [opts.onRevealLab]
 * @param {() => void} [opts.onRevealHub]
 * @param {() => void} [opts.onDone]
 */
export function createEnterPageFx({ root, onRevealLab, onRevealHub, onDone }) {
  let playing = false;
  /** @type {number} */
  let activeId = 0;
  /** @type {number[]} */
  let timers = [];
  /** @type {number} */
  let raf = 0;
  /** @type {HTMLCanvasElement | null} */
  let canvas = null;
  /** @type {CanvasRenderingContext2D | null} */
  let ctx = null;
  /** @type {any[]} */
  let flakes = [];
  /** @type {any[]} */
  let motifs = [];
  /** @type {HTMLImageElement | null} */
  let coverImg = null;
  /** @type {Uint8ClampedArray | null} */
  let sampleData = null;
  /** 封面图按 URL 缓存：返回时复用进入时已加载的封面，避免二次解码拖慢帷幕升起 */
  let coverCacheUrl = null;
  /** @type {HTMLImageElement | null} */
  let coverCacheImg = null;
  let phase = 'idle';
  let t0 = 0;
  let lastNow = 0;
  let direction = 'enter';
  let ox = 0.5;
  let oy = 0.55;
  let bw = 0.18;
  let bh = 0.28;
  let ink = 0;
  let veil = 0;
  let flash = 0;
  let subjectId = 'chemistry';
  let themeId = 'default';
  /** 溶解进度 0..1，驱动书材质与边缘喷发 */
  let dissolveT = 0;
  let lastDissolveT = 0;
  /** 边缘喷发累计预算 */
  let emitCarry = 0;
  let motifSpawned = false;
  /** @type {((t: number) => void) | null} */
  let onProgress = null;
  /** @type {((id: number) => void) | null} */
  let onOpaque = null;
  /** @type {((id: number) => void) | null} */
  let onCleared = null;
  /** @type {((id: number) => void) | null} */
  let onSettled = null;
  let lastProgress = -1;
  let opaqueReported = false;
  let clearedReported = false;
  let revealLegacyFired = false;
  const RM =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  function clearTimers() {
    timers.forEach((id) => clearTimeout(id));
    timers = [];
  }

  function later(fn, ms) {
    const id = setTimeout(fn, ms);
    timers.push(id);
  }

  function ensure() {
    if (root.dataset.ready === '1' && canvas) return;
    root.innerHTML = '';
    canvas = document.createElement('canvas');
    canvas.className = 'bookshelf-dissolve-canvas';
    root.appendChild(canvas);
    ctx = canvas.getContext('2d', { alpha: true });
    root.dataset.ready = '1';
    resize();
  }

  function resize() {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function stopRaf() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  /**
   * @param {number} [matchId]
   */
  function cancel(matchId) {
    if (matchId != null && matchId !== activeId) return;
    clearTimers();
    stopRaf();
    playing = false;
    phase = 'idle';
    flakes = [];
    motifs = [];
    ink = 0;
    veil = 0;
    flash = 0;
    dissolveT = 0;
    lastDissolveT = 0;
    emitCarry = 0;
    motifSpawned = false;
    sampleData = null;
    onProgress = null;
    onOpaque = null;
    onCleared = null;
    onSettled = null;
    lastProgress = -1;
    opaqueReported = false;
    clearedReported = false;
    revealLegacyFired = false;
    root.classList.remove(
      'is-on',
      'is-enter',
      'is-exit',
      'is-reveal',
      'is-out',
      'is-opaque',
    );
    root.setAttribute('aria-hidden', 'true');
  }

  /**
   * @param {string} [url]
   * @returns {Promise<HTMLImageElement | null>}
   */
  function loadCover(url) {
    return new Promise((resolve) => {
      if (!url) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  function paletteFor(id) {
    return transitionPaletteFor(id, themeId);
  }

  function motifsFor(id) {
    return MOTIFS[id] || MOTIFS.default;
  }

  function bakeSample() {
    sampleData = null;
    if (!coverImg) return;
    const sc = document.createElement('canvas');
    sc.width = SAMPLE_W;
    sc.height = SAMPLE_H;
    const sctx = sc.getContext('2d');
    if (!sctx) return;
    sctx.drawImage(coverImg, 0, 0, SAMPLE_W, SAMPLE_H);
    sampleData = sctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
  }

  /**
   * 加载（或命中缓存）封面并烘焙采样；返回 false 表示播放已被取代/取消。
   * @param {string | null} url
   * @param {number} myId
   */
  async function prepareCover(url, myId) {
    if (url && coverCacheUrl === url && coverCacheImg) {
      coverImg = coverCacheImg;
      bakeSample();
      return true;
    }
    coverImg = await loadCover(url || null);
    if (!playing || activeId !== myId) return false;
    if (url && coverImg) {
      coverCacheUrl = url;
      coverCacheImg = coverImg;
    }
    bakeSample();
    return true;
  }

  /**
   * @param {number} u 0..1
   * @param {number} v 0..1
   * @param {string[]} colors
   */
  function sampleColor(u, v, colors) {
    if (!sampleData) return colors[Math.floor(Math.random() * colors.length)];
    const sx = Math.max(0, Math.min(SAMPLE_W - 1, Math.floor(u * (SAMPLE_W - 1))));
    const sy = Math.max(0, Math.min(SAMPLE_H - 1, Math.floor(v * (SAMPLE_H - 1))));
    const i = (sy * SAMPLE_W + sx) * 4;
    if (sampleData[i + 3] < 28) return colors[Math.floor(Math.random() * colors.length)];
    /* 略提亮，避免暗封面粒子发闷 */
    const r = Math.min(255, sampleData[i] + 18);
    const g = Math.min(255, sampleData[i + 1] + 18);
    const b = Math.min(255, sampleData[i + 2] + 18);
    return `rgb(${r},${g},${b})`;
  }

  /**
   * @param {{ cx: number, cy: number, w: number, h: number } | null | undefined} rect
   * @param {{ x: number, y: number } | null | undefined} origin
   */
  function applyBookRect(rect, origin) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (rect && rect.w > 8 && rect.h > 8) {
      ox = rect.cx / w;
      oy = rect.cy / h;
      bw = rect.w / w;
      bh = rect.h / h;
      root.style.setProperty('--ox', `${rect.cx}px`);
      root.style.setProperty('--oy', `${rect.cy}px`);
      return;
    }
    if (origin) {
      ox = origin.x / w;
      oy = origin.y / h;
      root.style.setProperty('--ox', `${origin.x}px`);
      root.style.setProperty('--oy', `${origin.y}px`);
    } else {
      ox = 0.42;
      oy = 0.52;
      root.style.setProperty('--ox', '42%');
      root.style.setProperty('--oy', '52%');
    }
    bw = Math.min(0.22, 210 / w);
    bh = (bw * w * 1.42) / h;
  }

  function bookGeom() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return {
      w,
      h,
      cx: ox * w,
      cy: oy * h,
      pw: bw * w,
      ph: bh * h,
    };
  }

  /**
   * 在溶解前线上采样一点（书矩形内 + 与 progress 相关的环带）。
   * Codrops 思路的 2D 近似：粒子只从“正在消失的边”出来。
   * @param {number} progress 0..1
   * @param {'edge' | 'surface' | 'field'} bias
   */
  function sampleFrontUV(progress, bias = 'edge') {
    const p = Math.max(0.02, Math.min(1, progress));
    if (bias === 'field') {
      return { u: Math.random(), v: Math.random() };
    }
    if (bias === 'surface') {
      /* 偏中心的表面采样 */
      const ju = (Math.random() + Math.random()) * 0.5;
      const jv = (Math.random() + Math.random()) * 0.5;
      return { u: ju, v: jv };
    }
    /* 环带：半径 ≈ progress，厚度 ±0.12 + 噪声 */
    const ang = Math.random() * Math.PI * 2;
    const ring = p * 0.52 + (Math.random() - 0.5) * 0.1;
    const jitter = (Math.random() - 0.5) * 0.08;
    const r = Math.max(0, Math.min(0.55, ring + jitter));
    let u = 0.5 + Math.cos(ang) * r;
    let v = 0.5 + Math.sin(ang) * r * 1.05;
    /* 轻推到书页边缘，前线更贴轮廓 */
    if (Math.random() > 0.55) {
      const edge = Math.floor(Math.random() * 4);
      if (edge === 0) u = Math.random() * 0.12 + p * 0.05;
      if (edge === 1) u = 0.88 - Math.random() * 0.12 - p * 0.05;
      if (edge === 2) v = Math.random() * 0.12 + p * 0.05;
      if (edge === 3) v = 0.88 - Math.random() * 0.12 - p * 0.05;
    }
    return {
      u: Math.max(0, Math.min(1, u)),
      v: Math.max(0, Math.min(1, v)),
    };
  }

  /**
   * @param {number} count
   * @param {number} progress
   * @param {'burst' | 'edge'} mode
   */
  function spawnFlakes(count, progress, mode = 'edge') {
    if (count <= 0) return;
    const { cx, cy, pw, ph, w, h } = bookGeom();
    const colors = paletteFor(subjectId);
    const room = MAX_FLAKES - flakes.length;
    const n = Math.min(count, room);
    if (n <= 0) return;

    for (let i = 0; i < n; i++) {
      const { u, v } = sampleFrontUV(progress, mode === 'burst' ? 'surface' : 'edge');
      const px = cx + (u - 0.5) * pw;
      const py = cy + (v - 0.5) * ph;
      const color = sampleColor(u, v, colors);
      const ang = Math.atan2(py - cy, px - cx) + (Math.random() - 0.5) * 0.7;
      const kind = Math.random();
      /* 软点为主，少量碎片 */
      const shape = kind > 0.82 ? 'shard' : kind > 0.55 ? 'soft' : 'dot';
      const baseR = shape === 'shard' ? 2.2 + Math.random() * 3.8 : 1.4 + Math.random() * 3.2;
      const speed = mode === 'burst' ? 140 + Math.random() * 320 : 70 + Math.random() * 220;
      const outBias = 0.55 + Math.random() * 0.9;

      flakes.push({
        x: px,
        y: py,
        vx: Math.cos(ang) * speed * outBias,
        vy: Math.sin(ang) * speed * outBias - 20 - Math.random() * 40,
        /* 小波浪扰动相位（Codrops wave offset 的 2D 版） */
        wave: Math.random() * Math.PI * 2,
        waveAmp: 18 + Math.random() * 36,
        r: baseR,
        r0: baseR,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 4.5,
        color,
        life: 1,
        age: 0,
        maxAge: 0.55 + Math.random() * 0.75,
        shape,
        glow: shape !== 'shard' && Math.random() > 0.35,
        u,
        v,
        /* converge 用 */
        tx: px,
        ty: py,
        homeX: px,
        homeY: py,
      });
    }

    /* 防止数组无限涨 */
    if (flakes.length > MAX_FLAKES) {
      flakes.splice(0, flakes.length - MAX_FLAKES);
    }
  }

  /**
   * 返回：粒子从场外飞向封面上的靶点
   * @param {number} count
   */
  function spawnConverge(count) {
    const { cx, cy, pw, ph, w, h } = bookGeom();
    const colors = paletteFor(subjectId);
    const room = MAX_FLAKES - flakes.length;
    const n = Math.min(count, room);
    if (n <= 0) return;

    for (let i = 0; i < n; i++) {
      const { u, v } = sampleFrontUV(0.35 + Math.random() * 0.55, Math.random() > 0.4 ? 'edge' : 'surface');
      const tx = cx + (u - 0.5) * pw;
      const ty = cy + (v - 0.5) * ph;
      /* 从屏幕外缘/四周汇入 */
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.min(w, h) * (0.35 + Math.random() * 0.55);
      const x = cx + Math.cos(ang) * dist;
      const y = cy + Math.sin(ang) * dist * 0.85;
      const color = sampleColor(u, v, colors);
      const kind = Math.random();
      const shape = kind > 0.85 ? 'shard' : kind > 0.5 ? 'soft' : 'dot';
      const baseR = shape === 'shard' ? 2 + Math.random() * 3.5 : 1.3 + Math.random() * 3;

      flakes.push({
        x,
        y,
        tx,
        ty,
        homeX: tx,
        homeY: ty,
        vx: (tx - x) * 0.35,
        vy: (ty - y) * 0.35,
        wave: Math.random() * Math.PI * 2,
        waveAmp: 10 + Math.random() * 22,
        r: baseR,
        r0: baseR,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 3,
        color,
        life: 1,
        age: 0,
        maxAge: 0.85 + Math.random() * 0.55,
        shape,
        glow: Math.random() > 0.4,
        u,
        v,
        converge: true,
      });
    }
  }

  function spawnMotifsBurst() {
    if (motifSpawned) return;
    motifSpawned = true;
    const { cx, cy, pw, ph } = bookGeom();
    const glyphs = motifsFor(subjectId);
    const colors = paletteFor(subjectId);
    const n = Math.min(MAX_MOTIFS, glyphs.length);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.35;
      const dist = Math.min(pw, ph) * (0.28 + Math.random() * 0.32);
      const px = cx + Math.cos(ang) * dist;
      const py = cy + Math.sin(ang) * dist * 0.9;
      motifs.push({
        x: px,
        y: py,
        vx: Math.cos(ang) * (40 + Math.random() * 90),
        vy: Math.sin(ang) * (40 + Math.random() * 90) - 20,
        tx: px,
        ty: py,
        text: glyphs[i % glyphs.length],
        size: 11 + Math.random() * 12,
        color: colors[i % colors.length],
        life: 1,
        age: 0,
        maxAge: 0.7 + Math.random() * 0.5,
        rot: (Math.random() - 0.5) * 0.5,
        vr: (Math.random() - 0.5) * 0.9,
        delay: 0.04 + Math.random() * 0.18,
      });
    }
  }

  function spawnMotifsConverge() {
    if (motifSpawned) return;
    motifSpawned = true;
    const { cx, cy, pw, ph, w, h } = bookGeom();
    const glyphs = motifsFor(subjectId);
    const colors = paletteFor(subjectId);
    const n = Math.min(MAX_MOTIFS, glyphs.length);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const dist = Math.min(pw, ph) * (0.3 + Math.random() * 0.25);
      const tx = cx + Math.cos(ang) * dist;
      const ty = cy + Math.sin(ang) * dist * 0.9;
      motifs.push({
        x: cx + (Math.random() - 0.5) * w * 0.8,
        y: cy + (Math.random() - 0.5) * h * 0.8,
        tx,
        ty,
        vx: 0,
        vy: 0,
        text: glyphs[i % glyphs.length],
        size: 11 + Math.random() * 12,
        color: colors[i % colors.length],
        life: 1,
        age: 0,
        maxAge: 0.9 + Math.random() * 0.4,
        rot: (Math.random() - 0.5) * 0.5,
        vr: (Math.random() - 0.5) * 0.7,
        delay: Math.random() * 0.15,
        converge: true,
      });
    }
  }

  function emitProgress(t) {
    const v = Math.max(0, Math.min(1, t));
    if (Math.abs(v - lastProgress) < 0.003) return;
    lastProgress = v;
    onProgress?.(v);
  }

  function fireOpaque() {
    if (opaqueReported) return;
    opaqueReported = true;
    root.classList.add('is-opaque');
    onOpaque?.(activeId);
    if (!revealLegacyFired) {
      revealLegacyFired = true;
      root.classList.add('is-reveal');
      if (direction === 'enter') onRevealLab?.();
      else if (direction === 'exit') onRevealHub?.();
    }
  }

  function fireCleared() {
    if (clearedReported) return;
    clearedReported = true;
    root.classList.remove('is-opaque');
    onCleared?.(activeId);
  }

  /**
   * @param {number} amount 0..1
   */
  function drawVeil(amount) {
    if (!ctx || amount <= 0.01) return;
    const { w, h, cx, cy } = bookGeom();
    const pal = paletteFor(subjectId);
    const base = pal[4] || '#0f172a';
    const a = Math.min(1, amount);

    ctx.save();
    ctx.globalAlpha = a;

    /* 更细腻：先局部出现（像书页展开/前页掀起），然后铺满 */
    if (a < 0.58) {
      const radius = Math.min(w, h) * 0.42;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      g.addColorStop(0, hexAlpha(base, 0.18 * a));
      g.addColorStop(0.55, hexAlpha(base, 0.12 * a));
      g.addColorStop(1, hexAlpha(base, 0));
      ctx.fillStyle = g;
      ctx.fillRect(cx - radius * 0.55, cy - radius * 0.55, radius * 1.1, radius * 1.1);
    } else {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
    }

    /* 径向高光/学科色晕 */
    const radius = Math.hypot(w, h) * 0.68;
    const g = ctx.createRadialGradient(cx, cy, radius * 0.04, cx, cy, radius);
    g.addColorStop(0, hexAlpha(pal[0], 0.32 * a));
    g.addColorStop(0.45, hexAlpha(pal[1], 0.18 * a));
    g.addColorStop(1, hexAlpha(base, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawInk(amount) {
    if (!ctx || amount <= 0.01) return;
    const { w, h, cx, cy } = bookGeom();
    const pal = paletteFor(subjectId);
    const radius = Math.hypot(w, h) * 0.72 * easeOut(amount);

    ctx.save();
    const g = ctx.createRadialGradient(cx, cy, radius * 0.04, cx, cy, radius);
    g.addColorStop(0, hexAlpha(pal[4] || '#0f172a', 0.48 * Math.min(1, amount * 1.1)));
    g.addColorStop(0.4, hexAlpha(pal[0], 0.36 * amount));
    g.addColorStop(0.75, hexAlpha(pal[1], 0.16 * amount));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    /* 少量墨斑，更轻，避免脏 */
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + amount * 1.2;
      const dist = radius * (0.16 + (i % 3) * 0.08);
      const bx = cx + Math.cos(a) * dist;
      const by = cy + Math.sin(a) * dist * 0.82;
      const br = radius * (0.08 + (i % 4) * 0.022);
      const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      bg.addColorStop(0, hexAlpha(pal[i % pal.length], 0.22 * amount));
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFlash(amount) {
    if (!ctx || amount <= 0.01) return;
    const { w, h, cx, cy } = bookGeom();
    const pal = paletteFor(subjectId);
    ctx.save();
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.38);
    g.addColorStop(0, hexAlpha('#ffffff', 0.38 * amount));
    g.addColorStop(0.4, hexAlpha(pal[0], 0.16 * amount));
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /**
   * 软粒子：径向渐变圆（additive 感）
   * @param {number} x
   * @param {number} y
   * @param {number} r
   * @param {string} color
   * @param {number} alpha
   * @param {boolean} glow
   */
  function drawSoftDot(x, y, r, color, alpha, glow) {
    if (!ctx || alpha <= 0.01 || r <= 0.2) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (glow) {
      ctx.globalCompositeOperation = 'lighter';
    }
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
    g.addColorStop(0, hexAlpha(color, 0.95));
    g.addColorStop(0.35, hexAlpha(color, 0.45));
    g.addColorStop(1, hexAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
    ctx.fill();
    if (glow) {
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  /**
   * @param {number} dt
   * @param {number} elapsed
   */
  function stepFlakes(dt, elapsed) {
    if (!ctx) return;
    const next = [];
    for (const p of flakes) {
      p.age += dt;
      const lifeT = p.age / p.maxAge;
      if (lifeT >= 1) continue;

      if (p.converge || direction === 'exit') {
        /* 弹簧式归位：越近越慢（直觉：碎片“吸”回封面） */
        const ax = (p.tx - p.x) * 5.2;
        const ay = (p.ty - p.y) * 5.2;
        p.vx = p.vx * 0.86 + ax * dt;
        p.vy = p.vy * 0.86 + ay * dt;
        /* 轻微波浪，归途不僵硬 */
        p.wave += dt * 3.2;
        p.x += p.vx * dt + Math.sin(p.wave) * p.waveAmp * dt * 0.15;
        p.y += p.vy * dt + Math.cos(p.wave * 0.9) * p.waveAmp * dt * 0.12;
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 4 && lifeT > 0.45) {
          p.life *= 0.85;
        }
        p.life = 1 - easeIn(lifeT);
        if (phase === 'fade') p.life *= 0.92;
      } else {
        /* 出射：阻力 + 微重力 + 波浪横摆 */
        p.wave += dt * 4.5;
        const drag = Math.exp(-0.55 * dt);
        p.vx *= drag;
        p.vy *= drag;
        p.vy += 28 * dt;
        p.vx += Math.sin(p.wave) * p.waveAmp * dt * 0.35;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life = 1 - easeIn(lifeT);
      }

      p.rot += p.vr * dt;
      /* 随距离/年龄缩小 */
      p.r = p.r0 * (0.35 + 0.65 * p.life);

      if (p.life <= 0.02) continue;

      const a = Math.max(0, Math.min(1, p.life)) * (phase === 'fade' ? 0.75 : 1);
      if (p.shape === 'soft' || p.shape === 'dot') {
        drawSoftDot(p.x, p.y, p.r * (p.shape === 'soft' ? 1.35 : 1), p.color, a * 0.92, p.glow);
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = a * 0.9;
        if (p.glow) {
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8;
        }
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(0, -p.r * 1.5);
        ctx.lineTo(p.r * 0.9, p.r * 0.7);
        ctx.lineTo(-p.r * 0.85, p.r * 0.85);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      next.push(p);
    }
    flakes = next;
  }

  /**
   * @param {number} dt
   * @param {number} elapsed
   */
  function stepMotifs(dt, elapsed) {
    if (!ctx) return;
    const next = [];
    for (const m of motifs) {
      if (elapsed < m.delay) {
        next.push(m);
        continue;
      }
      m.age += dt;
      const lifeT = m.age / m.maxAge;
      if (lifeT >= 1) continue;

      if (m.converge || direction === 'exit') {
        const ax = (m.tx - m.x) * 4.2;
        const ay = (m.ty - m.y) * 4.2;
        m.vx = m.vx * 0.88 + ax * dt;
        m.vy = m.vy * 0.88 + ay * dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.life = 1 - easeIn(lifeT);
      } else {
        m.vx *= Math.exp(-0.42 * dt);
        m.vy *= Math.exp(-0.42 * dt);
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.life = 1 - easeIn(lifeT);
      }
      m.rot += m.vr * dt;
      if (m.life <= 0.02) continue;

      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.rot);
      ctx.globalAlpha = Math.max(0, Math.min(1, m.life)) * 0.78;
      ctx.fillStyle = m.color;
      ctx.font = `600 ${m.size}px "IBM Plex Mono", "Noto Sans SC", ui-monospace, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 5;
      ctx.fillText(m.text, 0, 0);
      ctx.restore();
      next.push(m);
    }
    motifs = next;
  }

  function drawGrain(amount) {
    if (!ctx || amount <= 0.02) return;
    const { w, h } = bookGeom();
    ctx.save();
    ctx.globalAlpha = 0.03 * amount;
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 48; i++) {
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.1, 1.1);
    }
    ctx.restore();
  }

  /**
   * 根据溶解进度增量，在前线上喷粒子（核心“细腻”手感）
   * @param {number} progress
   * @param {number} dt
   */
  function emitAlongFront(progress, dt) {
    const delta = Math.max(0, progress - lastDissolveT);
    lastDissolveT = progress;
    if (progress < 0.02 || progress > 0.98) return;

    /* 每推进 1% 约喷 4–7 粒；前线最活跃 */
    const edgeBoost = 1 + Math.sin(progress * Math.PI) * 0.85;
    emitCarry += delta * 520 * edgeBoost * (RM ? 0.35 : 1);
    const n = Math.floor(emitCarry);
    if (n >= 1) {
      emitCarry -= n;
      spawnFlakes(n, progress, 'edge');
    }
    /* 稳态少量“余烬” */
    emitCarry += dt * 12 * edgeBoost;
    const drip = Math.floor(emitCarry);
    if (drip >= 1) {
      emitCarry -= drip;
      spawnFlakes(Math.min(drip, 3), progress, 'edge');
    }
  }

  function frame(now) {
    if (!playing || !ctx || !canvas) return;
    const myId = activeId;
    const { w, h } = bookGeom();
    const elapsed = (now - t0) / 1000;
    const dt = Math.min(0.04, lastNow ? (now - lastNow) / 1000 : 1 / 60);
    lastNow = now;

    ctx.clearRect(0, 0, w, h);

    if (direction === 'enter') {
      /*
       * 时间线（更贴“先蚀刻 → 前线喷粒子 → 帷幕接管 → 淡出”）：
       * 0–0.10 hold
       * 0.10–0.72 dissolve + edge emit（帷幕后半跟上）
       * 0.72–1.05 hold opaque
       * 1.05–1.65 fade
       */
      if (RM) {
        phase = 'burst';
        dissolveT = Math.min(1, elapsed / 0.14);
        veil = Math.min(1, elapsed / 0.1);
        ink = veil;
        flash = 0;
      } else if (elapsed < 0.1) {
        phase = 'hold';
        dissolveT = 0;
        veil = easeOut(elapsed / 0.1) * 0.12;
        ink = veil * 0.5;
        flash = 0;
      } else if (elapsed < 0.72) {
        phase = 'burst';
        const u = (elapsed - 0.1) / 0.62;
        /* smoothstep：溶解前端推进更稳 */
        dissolveT = smoothstep(0, 1, Math.min(1, u * 1.05));
        /* 帷幕略滞后于溶解，先看见书蚀刻再被盖住 */
        veil = smoothstep(0.22, 0.78, u);
        ink = Math.min(1, easeOut((elapsed - 0.12) / 0.4));
        flash =
          elapsed < 0.28
            ? easeOut((elapsed - 0.1) / 0.08) * (1 - (elapsed - 0.1) / 0.18)
            : 0;
        if (elapsed > 0.16 && !motifSpawned) spawnMotifsBurst();
      } else if (elapsed < 1.05) {
        phase = 'burst';
        dissolveT = 1;
        veil = 1;
        ink = 1;
        flash = 0;
      } else {
        phase = 'fade';
        dissolveT = 1;
        veil = Math.max(0, 1 - easeIn((elapsed - 1.05) / 0.55));
        ink = veil;
        flash = 0;
      }

      emitProgress(dissolveT);
      if (phase === 'burst' && dissolveT < 0.98) {
        emitAlongFront(dissolveT, dt);
      }

      drawVeil(veil);
      drawInk(ink * 0.5);
      drawFlash(flash);
      stepFlakes(dt, elapsed);
      stepMotifs(dt, elapsed);
      drawGrain(ink);

      if (veil >= OPAQUE_THRESHOLD) fireOpaque();
      if (phase === 'fade' && veil <= CLEARED_THRESHOLD) fireCleared();
    } else if (direction === 'exit') {
      /*
       * 返回：帷幕先起遮住教室 → 粒子凝聚 → 幕布边收边露出书复原的高潮
       * 0–0.2    cover：帷幕升起
       * 0.15–1.2 coalesce：复原主线（单条 smoothstep 连续推进，无跳变）
       * 0.6–1.35 fade：帷幕提前缓出让位，最后一段复原在薄幕下可见
       */
      let coalesceT = smoothstep(0, 1, (elapsed - 0.15) / 1.05);
      if (RM) {
        phase = 'converge';
        coalesceT = Math.min(1, elapsed / 0.14);
        dissolveT = 1 - coalesceT;
        veil = Math.min(1, elapsed / 0.08);
        ink = veil;
        flash = 0;
      } else if (elapsed < 0.2) {
        phase = 'converge';
        dissolveT = 1 - coalesceT;
        veil = Math.min(1, easeOut(elapsed / 0.16));
        ink = veil;
        flash = 0;
        /* 前半段大量汇入 */
        emitCarry += dt * 180;
        const n = Math.floor(emitCarry);
        if (n >= 1) {
          emitCarry -= n;
          spawnConverge(Math.min(n, 8));
        }
        if (elapsed > 0.06 && !motifSpawned) spawnMotifsConverge();
      } else if (elapsed < 1.35) {
        phase = 'converge';
        const u = (elapsed - 0.2) / 1.0;
        dissolveT = Math.max(0, 1 - coalesceT);
        /* 0.6s 起帷幕缓出：复原高潮透过薄幕可见 */
        veil =
          elapsed < 0.6 ? 1 : Math.max(0, 1 - easeOut((elapsed - 0.6) / 0.75));
        ink = veil;
        /* 让位瞬间一点闪光，标记“翻开/凝聚”的高潮 */
        flash =
          elapsed > 0.62 && elapsed < 0.8
            ? ((elapsed - 0.62) / 0.08) * (1 - (elapsed - 0.62) / 0.18)
            : 0;
        /* 凝聚流贯穿整个可见高潮，随进度自然减弱 */
        emitCarry += dt * (30 + 50 * (1 - u));
        const n = Math.floor(emitCarry);
        if (n >= 1) {
          emitCarry -= n;
          spawnConverge(Math.min(n, 3));
        }
      } else {
        phase = 'fade';
        coalesceT = 1;
        dissolveT = 0;
        veil = 0;
        ink = 0;
        flash = 0;
      }

      emitProgress(coalesceT);
      drawVeil(veil);
      drawInk(ink * 0.48);
      drawFlash(flash * 0.65);
      stepFlakes(dt, elapsed);
      stepMotifs(dt, elapsed);
      drawGrain(ink);

      if (veil >= OPAQUE_THRESHOLD) fireOpaque();
      /* 帷幕收起即 cleared（此时仍是 converge 尾段，比 fade 阶段更早） */
      if (elapsed >= 0.6 && veil <= CLEARED_THRESHOLD) fireCleared();
    } else {
      /* neutral hold */
      if (elapsed < 0.14) {
        veil = Math.min(1, easeOut(elapsed / 0.12));
      } else {
        veil = 1;
      }
      ink = veil;
      drawVeil(veil);
      drawInk(ink * 0.35);
      if (veil >= OPAQUE_THRESHOLD) fireOpaque();
    }

    if (myId === activeId && playing) {
      raf = requestAnimationFrame(frame);
    }
  }

  /**
   * @param {object} [opts]
   */
  async function playEnter(opts = {}) {
    cancel();
    activeId = opts.id != null ? opts.id : activeId + 1;
    const myId = activeId;
    ensure();
    resize();
    playing = true;
    direction = 'enter';
    subjectId = opts.subjectId || 'chemistry';
    themeId =
      opts.themeId ||
      document.documentElement.getAttribute('data-theme') ||
      'default';
    onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    onOpaque = typeof opts.onOpaque === 'function' ? opts.onOpaque : null;
    onCleared = typeof opts.onCleared === 'function' ? opts.onCleared : null;
    onSettled = typeof opts.onSettled === 'function' ? opts.onSettled : null;
    opaqueReported = false;
    clearedReported = false;
    revealLegacyFired = false;
    dissolveT = 0;
    lastDissolveT = 0;
    emitCarry = 0;
    motifSpawned = false;
    flakes = [];
    motifs = [];
    applyBookRect(opts.bookRect, opts.origin);

    if (!(await prepareCover(opts.coverURL || null, myId))) return;

    /* 开场只撒很少表面粒子，主体靠前线连续喷 */
    spawnFlakes(RM ? 12 : 28, 0.08, 'burst');

    root.setAttribute('aria-hidden', 'false');
    root.classList.add('is-on', 'is-enter');
    t0 = performance.now();
    lastNow = 0;
    lastProgress = -1;
    emitProgress(0);
    raf = requestAnimationFrame(frame);

    const holdMs = RM ? 220 : 1480;
    const endMs = RM ? 400 : 1880;

    later(() => {
      if (!playing || activeId !== myId) return;
      root.classList.add('is-out');
      if (!clearedReported && opaqueReported) fireCleared();
    }, holdMs);

    later(() => {
      if (!playing || activeId !== myId) return;
      const settled = onSettled;
      const done = onDone;
      cancel(myId);
      settled?.(myId);
      done?.();
    }, endMs);
  }

  /**
   * @param {object} [opts]
   */
  async function playExit(opts = {}) {
    cancel();
    activeId = opts.id != null ? opts.id : activeId + 1;
    const myId = activeId;
    ensure();
    resize();
    playing = true;
    direction = 'exit';
    subjectId = opts.subjectId || 'chemistry';
    themeId =
      opts.themeId ||
      document.documentElement.getAttribute('data-theme') ||
      'default';
    onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    onOpaque = typeof opts.onOpaque === 'function' ? opts.onOpaque : null;
    onCleared = typeof opts.onCleared === 'function' ? opts.onCleared : null;
    onSettled = typeof opts.onSettled === 'function' ? opts.onSettled : null;
    opaqueReported = false;
    clearedReported = false;
    revealLegacyFired = false;
    dissolveT = 1;
    lastDissolveT = 1;
    emitCarry = 0;
    motifSpawned = false;
    flakes = [];
    motifs = [];
    applyBookRect(
      opts.bookRect,
      opts.origin || { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 },
    );
    const done = typeof opts.onDone === 'function' ? opts.onDone : onDone;

    if (!(await prepareCover(opts.coverURL || null, myId))) return;

    spawnConverge(RM ? 20 : 48);

    root.setAttribute('aria-hidden', 'false');
    root.classList.add('is-on', 'is-exit');
    t0 = performance.now();
    lastNow = 0;
    lastProgress = -1;
    emitProgress(0);
    raf = requestAnimationFrame(frame);

    /* fade 于 ~1.03s 越过 cleared 阈值；holdMs 仅作帧停顿时的兜底 */
    const holdMs = RM ? 180 : 1100;
    const endMs = RM ? 320 : 1500;

    later(() => {
      if (!playing || activeId !== myId) return;
      root.classList.add('is-out');
      if (!clearedReported && opaqueReported) fireCleared();
    }, holdMs);

    later(() => {
      if (!playing || activeId !== myId) return;
      const settled = onSettled;
      cancel(myId);
      settled?.(myId);
      done?.();
    }, endMs);
  }

  /**
   * @param {object} [opts]
   */
  async function holdNeutral(opts = {}) {
    cancel();
    activeId = opts.id != null ? opts.id : activeId + 1;
    const myId = activeId;
    ensure();
    resize();
    playing = true;
    direction = 'neutral';
    subjectId = opts.subjectId || 'chemistry';
    themeId =
      opts.themeId ||
      document.documentElement.getAttribute('data-theme') ||
      'default';
    onOpaque = typeof opts.onOpaque === 'function' ? opts.onOpaque : null;
    onCleared = null;
    onSettled = null;
    onProgress = null;
    opaqueReported = false;
    clearedReported = false;
    revealLegacyFired = true;
    applyBookRect(null, {
      x: window.innerWidth * 0.5,
      y: window.innerHeight * 0.5,
    });

    flakes = [];
    motifs = [];
    root.setAttribute('aria-hidden', 'false');
    root.classList.add('is-on', 'is-enter');
    t0 = performance.now();
    lastNow = 0;
    raf = requestAnimationFrame(frame);

    if (RM) {
      later(() => {
        if (!playing || activeId !== myId) return;
        veil = 1;
        fireOpaque();
      }, 0);
    }
  }

  window.addEventListener('resize', () => {
    if (playing) resize();
  });

  return {
    playEnter,
    playExit,
    holdNeutral,
    play: playEnter,
    cancel,
    /** @returns {number} */
    activeId: () => activeId,
  };
}

function easeOut(t) {
  const x = Math.max(0, Math.min(1, t));
  return 1 - (1 - x) * (1 - x);
}

function easeIn(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x;
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / Math.max(1e-6, b - a)));
  return t * t * (3 - 2 * t);
}

function hexAlpha(hex, a) {
  if (typeof hex !== 'string') return `rgba(15,23,42,${a})`;
  if (hex.startsWith('rgb')) {
    const m = hex.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
    if (m) return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
    return hex.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  }
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(15,23,42,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
