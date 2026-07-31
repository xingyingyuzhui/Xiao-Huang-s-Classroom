/**
 * Bookshelf subject stage — adapted from https://books-sigma-ashen.vercel.app/
 */
import * as THREE from 'three';
import {
  paintSubjectCover,
  paintBack,
  paintSpine,
  themeBookBoards,
} from './covers.js';
import { createEnterPageFx } from './enter-fx.js';
import { createDetailFloaters } from './floaters.js';
import {
  attachDissolveAll,
  createDissolveUniforms,
  setDissolveProgress,
} from './dissolve.js';

/**
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {HTMLElement} opts.closeBtn
 * @param {HTMLElement} opts.detail
 * @param {HTMLElement | null} [opts.enterBtn]
 * @param {HTMLElement | null} [opts.peekBtn]
 * @param {HTMLElement | null} [opts.lockNote]
 * @param {HTMLElement | null} [opts.pageFxRoot]
 * @param {Array<object>} opts.subjects
 * @param {(id: string) => void} opts.onEnterSubject
 * @param {() => void} [opts.onRevealHub]
 */
export function createBookshelfStage(opts) {
  const {
    canvas,
    closeBtn,
    detail,
    enterBtn = null,
    peekBtn = null,
    lockNote = null,
    pageFxRoot = null,
    subjects,
    onEnterSubject,
  } = opts;
  /** 返回大厅时露壳回调（勿被 playReturnFromLab 的局部 opts 遮蔽） */
  const onRevealHub = typeof opts.onRevealHub === 'function' ? opts.onRevealHub : null;
  const dpTitle = opts.dpTitle || detail.querySelector('[data-dp-title]');
  const dpEn = opts.dpEn || detail.querySelector('[data-dp-en]');
  const dpDesc = opts.dpDesc || detail.querySelector('[data-dp-desc]');
  const dpStatus = opts.dpStatus || detail.querySelector('[data-dp-status]');
  const dpModules = opts.dpModules || detail.querySelector('[data-dp-modules]');
  const dpTagline = opts.dpTagline || detail.querySelector('[data-dp-tagline]');
  const peek = peekBtn || detail.querySelector('#bookshelfPeek');
  /** @type {number[]} */
  let openTimers = [];
  function clearOpenTimers() {
    openTimers.forEach((id) => clearTimeout(id));
    openTimers = [];
  }
  function later(fn, ms) {
    const id = setTimeout(fn, ms);
    openTimers.push(id);
    return id;
  }

  /** 进出场会话号：过期 timer / FX 回调一律忽略 */
  let transitionSeq = 0;
  /** 渲染循环状态（提前声明，避免 animate 闭包踩 TDZ） */
  let running = true;
  let raf = 0;

  const enterFx = pageFxRoot
    ? createEnterPageFx({
        root: pageFxRoot,
        /* 壳层切换改由 playEnter/playExit 的 onOpaque 驱动，避免未遮罩就切壳 */
      })
    : null;


/* =========================================================================
   0. Small utilities
   ========================================================================= */
const RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

class Spring {
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

function mkCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function drawSpaced(x, text, cx, y, ls) {
  const prev = x.textAlign;
  x.textAlign = "left";
  const chars = [...text];
  let tot = 0;
  const ws = chars.map((ch) => {
    const w = x.measureText(ch).width;
    tot += w;
    return w;
  });
  tot += ls * (chars.length - 1);
  let px = cx - tot / 2;
  chars.forEach((ch, i) => {
    x.fillText(ch, px, y);
    px += ws[i] + ls;
  });
  x.textAlign = prev;
}

function rr(x, px, py, w, h, r) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}

/* =========================================================================
   1. Renderer, scene, camera, lights
   ========================================================================= */
const viewW = () => canvas.clientWidth || window.innerWidth;
const viewH = () => canvas.clientHeight || window.innerHeight;
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    premultipliedAlpha: true,
  });
} catch (e) {
  console.error("WebGL unavailable for subject bookshelf", e);
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewW(), viewH(), false);
/* 透明清屏：让 CSS 主题教室背景从 canvas 下透出 */
renderer.setClearColor(0x000000, 0);
renderer.setClearAlpha(0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
/* 亮教室下仍抬曝光，让封面成为视觉焦点 */
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const ANISO = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  26,
  viewW() / Math.max(1, viewH()),
  0.1,
  100,
);
camera.position.set(0, 0.1, 9.6);

/* —— 教室环境反射（非棚拍深色 void）—— */
function envBlob(x, cx, cy, r, rgb, a) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, "rgba(" + rgb + "," + a + ")");
  g.addColorStop(1, "rgba(" + rgb + ",0)");
  x.fillStyle = g;
  x.beginPath();
  x.arc(cx, cy, r, 0, 6.2832);
  x.fill();
}

/** @type {THREE.Texture | null} */
let envMapRT = null;
const pmremGen = new THREE.PMREMGenerator(renderer);

/**
 * 按主题画 equirect 教室环境 → PMREM
 * 目标：亮天窗 + 墙面漫反射 + 地板暖回弹，去掉粉雾棚拍
 * @param {string} themeId
 */
function buildClassroomEnv(themeId) {
  const c = mkCanvas(512, 256);
  const x = c.getContext("2d");
  const packs = {
    default: {
      sky: ["#d8e4f2", "#a8bdd4", "#6a7f96"],
      key: "255,252,248",
      fill: "210,220,235",
      floor: "180,175,168",
      warm: "255,230,200",
    },
    stationery: {
      sky: ["#f0e4d0", "#d4b896", "#8a6a4a"],
      key: "255,248,235",
      fill: "232,210,175",
      floor: "160,130,95",
      warm: "255,210,160",
    },
    reagent: {
      sky: ["#e8dfd2", "#c4b4a0", "#6e6256"],
      key: "255,250,242",
      fill: "210,195,175",
      floor: "120,108,95",
      warm: "255,200,150",
    },
    blackboard: {
      sky: ["#e8f0e6", "#a8c4b0", "#3d5c4a"],
      key: "248,252,245",
      fill: "190,210,195",
      floor: "90,100,85",
      warm: "240,220,160",
    },
    pixel: {
      sky: ["#c8d8d8", "#7a9a9a", "#3a5050"],
      key: "255,255,255",
      fill: "160,200,195",
      floor: "70,90,95",
      warm: "255,170,180",
    },
  };
  const p = packs[themeId] || packs.default;
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, p.sky[0]);
  g.addColorStop(0.42, p.sky[1]);
  g.addColorStop(0.72, p.sky[2]);
  g.addColorStop(1, p.floor);
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 256);
  /* 主窗光（偏上前） */
  envBlob(x, 160, 70, 110, p.key, 0.72);
  /* 侧墙漫反射 */
  envBlob(x, 400, 100, 70, p.fill, 0.4);
  /* 地板暖回弹 */
  envBlob(x, 256, 210, 90, p.warm, 0.28);
  try {
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const prev = envMapRT;
    const next = pmremGen.fromEquirectangular(tex).texture;
    scene.environment = next;
    envMapRT = next;
    tex.dispose();
    /* 先换再 dispose，避免当前帧引用已销毁 RT */
    if (prev && prev !== next) {
      try {
        prev.dispose();
      } catch (_) {
        /* ignore */
      }
    }
  } catch (err) {
    console.warn("Classroom env map failed, keep previous", err);
  }
}

/* 灯光：前向主光拉高，封面成为焦点；色温由主题覆盖 */
const hemi = new THREE.HemisphereLight(0xd8e6f8, 0xc8c0b4, 0.55);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfffdf8, 1.55);
/* 右上前：模拟侧窗 + 正面照亮封面 */
key.position.set(3.6, 5.8, 6.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -4.5;
key.shadow.camera.right = 4.5;
key.shadow.camera.top = 4.5;
key.shadow.camera.bottom = -4.5;
key.shadow.camera.near = 1;
key.shadow.camera.far = 22;
key.shadow.bias = -0.00035;
key.shadow.normalBias = 0.02;
key.shadow.radius = 2.0;
scene.add(key);
/* 左前墙补：抬高，消掉封面暗侧 */
const fill = new THREE.DirectionalLight(0xe8f0fc, 0.52);
fill.position.set(-4.5, 2.8, 4.5);
scene.add(fill);
/* 背缘：把书从亮背景里“抠”出来 */
const rim = new THREE.DirectionalLight(0xc8dcf0, 0.36);
rim.position.set(-1.5, 2.8, -5.5);
scene.add(rim);
/* 顶漫：教室天光 */
const studio = new THREE.DirectionalLight(0xfff8ee, 0.55);
studio.position.set(-1.0, 7.5, 3.5);
scene.add(studio);
/* 书前柔光：进一步抬封面通透感 */
const glow = new THREE.PointLight(0xfff0e0, 0.28, 12, 2);
glow.position.set(0.2, 0.35, 2.4);
scene.add(glow);

function activeThemeId() {
  return document.documentElement.getAttribute("data-theme") || "default";
}

try {
  buildClassroomEnv(activeThemeId());
} catch (err) {
  console.warn("Initial classroom env failed", err);
}

/**
 * 主题 × 书材质手感 + 教室光（亮背景适配）
 * env 压低：亮教室下高 env 会像蒙尘；靠 key/fill 塑形
 */
const THEME_BOOK_FEEL = {
  /* 亮教室：书要比背景更“跳”——抬 key/fill/曝光，封面 albedo 少压暗 */
  default: {
    front: { roughness: 0.2, metalness: 0.03, clearcoat: 0.72, clearcoatRoughness: 0.16, envMapIntensity: 0.38, bumpScale: 0.005 },
    back: { roughness: 0.3, clearcoat: 0.45, clearcoatRoughness: 0.24, envMapIntensity: 0.28, bumpScale: 0.0045 },
    edge: { roughness: 0.4, metalness: 0.05, clearcoat: 0.32, clearcoatRoughness: 0.36, envMapIntensity: 0.28, bumpScale: 0.006 },
    spine: { roughness: 0.5, metalness: 0.02, clearcoat: 0.22, clearcoatRoughness: 0.5, envMapIntensity: 0.26, bumpScale: 0.012, cloth: true },
    exposure: 1.14,
    light: {
      hemi: 0xd8e6f8, hemiI: 0.55, hemiGround: 0xc8c0b4,
      key: 0xfffdf8, keyI: 1.55,
      fill: 0xe8f0fc, fillI: 0.52,
      rim: 0xc8dcf0, rimI: 0.36,
      studio: 0xfff8ee, studioI: 0.55,
      glow: 0xfff0e0, glowI: 0.22,
    },
  },
  stationery: {
    front: { roughness: 0.48, metalness: 0.02, clearcoat: 0.2, clearcoatRoughness: 0.58, envMapIntensity: 0.3, bumpScale: 0.009 },
    back: { roughness: 0.55, clearcoat: 0.12, clearcoatRoughness: 0.68, envMapIntensity: 0.24, bumpScale: 0.007 },
    edge: { roughness: 0.58, metalness: 0.02, clearcoat: 0.1, clearcoatRoughness: 0.72, envMapIntensity: 0.24, bumpScale: 0.009 },
    spine: { roughness: 0.68, metalness: 0.01, clearcoat: 0.08, clearcoatRoughness: 0.78, envMapIntensity: 0.22, bumpScale: 0.016, cloth: true },
    exposure: 1.12,
    light: {
      hemi: 0xf8ecd8, hemiI: 0.52, hemiGround: 0xd4b898,
      key: 0xfff8ec, keyI: 1.42,
      fill: 0xffecd0, fillI: 0.5,
      rim: 0xe8c8a0, rimI: 0.3,
      studio: 0xfff0dc, studioI: 0.5,
      glow: 0xffe0b8, glowI: 0.2,
    },
  },
  reagent: {
    front: { roughness: 0.18, metalness: 0.04, clearcoat: 0.82, clearcoatRoughness: 0.12, envMapIntensity: 0.36, bumpScale: 0.0045 },
    back: { roughness: 0.28, clearcoat: 0.52, clearcoatRoughness: 0.2, envMapIntensity: 0.28, bumpScale: 0.004 },
    edge: { roughness: 0.35, metalness: 0.06, clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.3, bumpScale: 0.005 },
    spine: { roughness: 0.42, metalness: 0.03, clearcoat: 0.35, clearcoatRoughness: 0.38, envMapIntensity: 0.26, bumpScale: 0.008, cloth: false },
    exposure: 1.12,
    light: {
      hemi: 0xf0e8dc, hemiI: 0.48, hemiGround: 0xb0a090,
      key: 0xfffaf4, keyI: 1.5,
      fill: 0xf0e4d0, fillI: 0.46,
      rim: 0xd8c8b0, rimI: 0.32,
      studio: 0xfff4e4, studioI: 0.48,
      glow: 0xf0d8b8, glowI: 0.18,
    },
  },
  blackboard: {
    front: { roughness: 0.7, metalness: 0.01, clearcoat: 0.08, clearcoatRoughness: 0.85, envMapIntensity: 0.2, bumpScale: 0.012 },
    back: { roughness: 0.76, clearcoat: 0.05, clearcoatRoughness: 0.88, envMapIntensity: 0.16, bumpScale: 0.01 },
    edge: { roughness: 0.78, metalness: 0.01, clearcoat: 0.05, clearcoatRoughness: 0.9, envMapIntensity: 0.18, bumpScale: 0.012 },
    spine: { roughness: 0.82, metalness: 0.01, clearcoat: 0.04, clearcoatRoughness: 0.92, envMapIntensity: 0.16, bumpScale: 0.018, cloth: true },
    exposure: 1.16,
    light: {
      hemi: 0xe0f0e4, hemiI: 0.5, hemiGround: 0x8a9a88,
      key: 0xf8fcf6, keyI: 1.45,
      fill: 0xd8ecd8, fillI: 0.44,
      rim: 0xb8d8c0, rimI: 0.3,
      studio: 0xf0f8ec, studioI: 0.46,
      glow: 0xe0f0c8, glowI: 0.18,
    },
  },
  pixel: {
    front: { roughness: 0.34, metalness: 0.03, clearcoat: 0.38, clearcoatRoughness: 0.3, envMapIntensity: 0.32, bumpScale: 0.0035 },
    back: { roughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.35, envMapIntensity: 0.26, bumpScale: 0.003 },
    edge: { roughness: 0.38, metalness: 0.03, clearcoat: 0.3, clearcoatRoughness: 0.32, envMapIntensity: 0.28, bumpScale: 0.004 },
    spine: { roughness: 0.42, metalness: 0.02, clearcoat: 0.26, clearcoatRoughness: 0.38, envMapIntensity: 0.24, bumpScale: 0.006, cloth: false },
    exposure: 1.14,
    light: {
      hemi: 0xc8e0e0, hemiI: 0.52, hemiGround: 0x708888,
      key: 0xffffff, keyI: 1.55,
      fill: 0xb8e0d8, fillI: 0.44,
      rim: 0x88d0c0, rimI: 0.36,
      studio: 0xf0f8f8, studioI: 0.48,
      glow: 0xffc8d0, glowI: 0.16,
    },
  },
};

function themeBookFeel(themeId) {
  return THEME_BOOK_FEEL[themeId] || THEME_BOOK_FEEL.default;
}

/**
 * @param {object} feel
 * @param {{ mFront: THREE.MeshPhysicalMaterial, mBack: THREE.MeshPhysicalMaterial, mEdge: THREE.MeshPhysicalMaterial, mEdgeDark: THREE.MeshPhysicalMaterial, mSpine: THREE.MeshPhysicalMaterial }} mats
 * @param {string} [edgeHex]
 */
function applyBookFeel(feel, mats, edgeHex) {
  const { mFront, mBack, mEdge, mEdgeDark, mSpine } = mats;
  const f = feel.front;
  mFront.roughness = f.roughness;
  mFront.metalness = f.metalness ?? 0.04;
  mFront.clearcoat = f.clearcoat;
  mFront.clearcoatRoughness = f.clearcoatRoughness;
  mFront.envMapIntensity = f.envMapIntensity;
  if (mFront.bumpScale != null) mFront.bumpScale = f.bumpScale;
  mFront.needsUpdate = true;

  const b = feel.back;
  mBack.roughness = b.roughness;
  mBack.clearcoat = b.clearcoat;
  mBack.clearcoatRoughness = b.clearcoatRoughness;
  mBack.envMapIntensity = b.envMapIntensity;
  if (mBack.bumpScale != null) mBack.bumpScale = b.bumpScale;
  mBack.needsUpdate = true;

  const e = feel.edge;
  mEdge.roughness = e.roughness;
  mEdge.metalness = e.metalness ?? 0.06;
  mEdge.clearcoat = e.clearcoat;
  mEdge.clearcoatRoughness = e.clearcoatRoughness;
  mEdge.envMapIntensity = e.envMapIntensity;
  if (mEdge.bumpScale != null) mEdge.bumpScale = e.bumpScale;
  if (edgeHex) mEdge.color.set(edgeHex);
  mEdge.needsUpdate = true;
  /* 切边更暗：斜侧厚度剪影更利 */
  try {
    mEdgeDark.color.copy(mEdge.color).multiplyScalar(0.52);
  } catch {
    if (edgeHex) mEdgeDark.color.set(edgeHex);
  }
  mEdgeDark.roughness = Math.min(1, e.roughness + 0.1);
  mEdgeDark.clearcoat = e.clearcoat * 0.55;
  mEdgeDark.clearcoatRoughness = Math.min(1, e.clearcoatRoughness + 0.12);
  mEdgeDark.envMapIntensity = e.envMapIntensity * 0.7;
  mEdgeDark.needsUpdate = true;

  const s = feel.spine;
  mSpine.roughness = s.roughness;
  mSpine.metalness = s.metalness ?? 0.02;
  mSpine.clearcoat = s.clearcoat;
  mSpine.clearcoatRoughness = s.clearcoatRoughness;
  mSpine.envMapIntensity = s.envMapIntensity;
  if (mSpine.bumpScale != null) mSpine.bumpScale = s.bumpScale;
  mSpine.bumpMap = s.cloth ? clothBump : laminateBump;
  /* 贴图已带 spineBg；略向边材靠色，避免铰链跳色又不过暗 */
  if (edgeHex) {
    mSpine.color.set(edgeHex).lerp(new THREE.Color(0xffffff), 0.62);
  } else {
    mSpine.color.set(0xffffff);
  }
  mSpine.needsUpdate = true;
}

function applyThemeLights(feel, themeId) {
  const L = feel.light;
  hemi.color.setHex(L.hemi);
  if (L.hemiGround != null) hemi.groundColor.setHex(L.hemiGround);
  hemi.intensity = L.hemiI;
  key.color.setHex(L.key);
  key.intensity = L.keyI;
  fill.color.setHex(L.fill);
  fill.intensity = L.fillI;
  rim.color.setHex(L.rim);
  rim.intensity = L.rimI;
  studio.color.setHex(L.studio);
  studio.intensity = L.studioI;
  glow.color.setHex(L.glow);
  glow.intensity = L.glowI;
  if (feel.exposure != null) {
    renderer.toneMappingExposure = feel.exposure;
  }
  buildClassroomEnv(themeId || activeThemeId());
}

/** 快照主题材质基准，供 hover/detail 微光叠在上面 */
function snapshotFeelBase(mats) {
  return {
    frontCC: mats.mFront.clearcoat,
    frontCCR: mats.mFront.clearcoatRoughness,
    frontEnv: mats.mFront.envMapIntensity,
    frontRough: mats.mFront.roughness,
    edgeEnv: mats.mEdgeDark.envMapIntensity,
    edgeCC: mats.mEdgeDark.clearcoat,
    spineEnv: mats.mSpine.envMapIntensity,
    spineCC: mats.mSpine.clearcoat,
  };
}

/**
 * 封面极淡印刷瑕疵：少量压痕；角部脏迹再减弱，避免封面发闷
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
function paintPrintWear(ctx, w, h) {
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  for (let i = 0; i < 4; i++) {
    const y = Math.random() * h;
    ctx.strokeStyle = "rgba(255,255,255," + (0.02 + Math.random() * 0.03).toFixed(3) + ")";
    ctx.lineWidth = 0.7 + Math.random();
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y + (Math.random() - 0.5) * 22);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "multiply";
  const corners = [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ];
  for (const [cx, cy] of corners) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.16);
    g.addColorStop(0, "rgba(40,32,24,0.035)");
    g.addColorStop(1, "rgba(40,32,24,0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - w * 0.16, cy - h * 0.14, w * 0.32, h * 0.28);
  }
  ctx.restore();
}

/* everything book-related lives under one root so it can be fit-scaled */
const bookRoot = new THREE.Group();
scene.add(bookRoot);

/* =========================================================================
   2. Shared procedural textures
   ========================================================================= */
function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  return t;
}

function noiseTexture(base, amp, scratches) {
  const s = 256,
    c = mkCanvas(s, s),
    x = c.getContext("2d");
  const img = x.createImageData(s, s),
    d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = base + (Math.random() - 0.5) * 2 * amp;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  if (scratches) {
    x.strokeStyle = "rgba(200,200,200,.25)";
    x.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      x.beginPath();
      const y = Math.random() * s;
      x.moveTo(0, y);
      x.lineTo(s, y + (Math.random() - 0.5) * 22);
      x.stroke();
    }
  }
  return new THREE.CanvasTexture(c);
}
const laminateBump = noiseTexture(128, 10, true);
const clothBump = (function () {
  const s = 128,
    c = mkCanvas(s, s),
    x = c.getContext("2d");
  x.fillStyle = "#808080";
  x.fillRect(0, 0, s, s);
  for (let i = 0; i < s; i += 2) {
    x.fillStyle =
      i % 4 === 0 ? "rgba(255,255,255,.22)" : "rgba(0,0,0,.22)";
    x.fillRect(i, 0, 1, s);
    x.fillRect(0, i, s, 1);
  }
  return new THREE.CanvasTexture(c);
})();

/**
 * 书口层理 albedo（暖纸色）
 * @param {boolean} vertical
 */
function striationTexture(vertical) {
  const s = 512,
    c = mkCanvas(s, s),
    x = c.getContext("2d");
  x.fillStyle = "#e4d9c4";
  x.fillRect(0, 0, s, s);
  let p = 0;
  while (p < s) {
    const w = 0.55 + Math.random() * 1.9,
      tone = Math.random();
    x.fillStyle =
      tone < 0.08
        ? "rgba(88,72,48,.78)"
        : tone < 0.2
          ? "rgba(150,130,95,.58)"
          : tone < 0.55
            ? "rgba(255,252,245,.72)"
            : "rgba(198,182,150,.52)";
    if (vertical) x.fillRect(p, 0, w, s);
    else x.fillRect(0, p, s, w);
    p += w + 0.28 + Math.random() * 1.0;
  }
  for (let i = 0; i < 22; i++) {
    const q = Math.random() * s;
    const thick = 1.1 + Math.random() * 2.4;
    x.fillStyle = "rgba(70,55,38," + (0.3 + Math.random() * 0.28).toFixed(3) + ")";
    if (vertical) x.fillRect(q, 0, thick, s);
    else x.fillRect(0, q, s, thick);
  }
  for (let i = 0; i < 3600; i++) {
    x.fillStyle =
      "rgba(110,95,70," + (Math.random() * 0.14).toFixed(3) + ")";
    x.fillRect(Math.random() * s, Math.random() * s, 1.1, 1.1);
  }
  const wash = vertical
    ? x.createLinearGradient(0, 0, s, 0)
    : x.createLinearGradient(0, 0, 0, s);
  wash.addColorStop(0, "rgba(210,175,110,.14)");
  wash.addColorStop(0.45, "rgba(0,0,0,0)");
  wash.addColorStop(1, "rgba(40,30,18,.12)");
  x.fillStyle = wash;
  x.fillRect(0, 0, s, s);
  return tex(c);
}

/**
 * 高对比层理 bump（仅灰度，驱动“千页”凹凸）
 * @param {boolean} vertical
 */
function striationBumpTexture(vertical) {
  const s = 512,
    c = mkCanvas(s, s),
    x = c.getContext("2d");
  x.fillStyle = "#808080";
  x.fillRect(0, 0, s, s);
  let p = 0;
  while (p < s) {
    const w = 0.5 + Math.random() * 1.7;
    const tone = Math.random();
    const g =
      tone < 0.12 ? 48 + Math.random() * 30
        : tone < 0.45 ? 170 + Math.random() * 50
          : 100 + Math.random() * 40;
    x.fillStyle = `rgb(${g|0},${g|0},${g|0})`;
    if (vertical) x.fillRect(p, 0, w, s);
    else x.fillRect(0, p, s, w);
    p += w + 0.22 + Math.random() * 0.85;
  }
  for (let i = 0; i < 28; i++) {
    const q = Math.random() * s;
    const thick = 1.4 + Math.random() * 2.8;
    const g = 28 + Math.random() * 36;
    x.fillStyle = `rgb(${g|0},${g|0},${g|0})`;
    if (vertical) x.fillRect(q, 0, thick, s);
    else x.fillRect(0, q, s, thick);
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = ANISO;
  return t;
}

const striV = striationTexture(true);
const striH = striationTexture(false);
const striBumpV = striationBumpTexture(true);
const striBumpH = striationBumpTexture(false);

const endpaperTex = (function () {
  const s = 512,
    c = mkCanvas(s, s),
    x = c.getContext("2d");
  x.fillStyle = "#f3edde";
  x.fillRect(0, 0, s, s);
  for (let i = 0; i < 1400; i++) {
    x.fillStyle =
      "rgba(120,105,70," + (0.04 + Math.random() * 0.08).toFixed(3) + ")";
    x.fillRect(Math.random() * s, Math.random() * s, 1.4, 1.4);
  }
  const g = x.createLinearGradient(0, 0, s, 0);
  g.addColorStop(0, "rgba(0,0,0,.07)");
  g.addColorStop(0.12, "rgba(0,0,0,0)");
  g.addColorStop(0.88, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,.07)");
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  return tex(c);
})();

const blobTex = (function () {
  const s = 256,
    c = mkCanvas(s, s),
    x = c.getContext("2d");
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(0,0,0,.85)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
})();

/* =========================================================================
   3. Cover painters + book data
   ========================================================================= */


/* 五套封面图 ↔ 五个主题（顺序对齐 THEME_CATALOG） */
const COVER_ASSET_STEM = {
  chemistry: "chemistry",
  physics: "physics",
  biology: "biology",
  math: "mathematics",
};
const THEME_COVER_VERSION = {
  default: 1,
  stationery: 2,
  reagent: 3,
  blackboard: 4,
  pixel: 5,
};

function coverUrlForTheme(themeId, subjectId) {
  const ver = THEME_COVER_VERSION[themeId] || THEME_COVER_VERSION.default;
  const stem = COVER_ASSET_STEM[subjectId];
  if (!stem) return null;
  return `/assets/subject-covers/${stem}-cover-v${ver}.png`;
}

const BOOKS = subjects.map((s) => {
  const themed = themeBookBoards(s.id);
  const book = { ...themed, ...(s.book || {}) };
  const themeId = document.documentElement.getAttribute('data-theme') || 'default';
  return {
    id: s.id,
    title: s.name,
    en: s.en || '',
    author: "小黄的教室",
    year: s.status === "ready" ? "开放" : "即将推出",
    stars: s.status === "ready" ? 5 : 0,
    desc: s.desc,
    blurb: s.blurb || s.desc,
    modules: Array.isArray(s.modules) ? s.modules : [],
    status: s.status,
    front: (ctx, w, h) => paintSubjectCover(ctx, w, h, s),
    edge: book.edge || "#e8e4d9",
    backBg: book.backBg || "#334155",
    backInk: book.backInk || "255,255,255",
    spineBg: book.spineBg || book.backBg || "#334155",
    spineInk: book.spineInk || "#ffffff",
    spineFont: book.spineFont || '700 44px "PingFang SC", sans-serif',
    spineTitle: s.name,
    coverURL: coverUrlForTheme(themeId, s.id),
    subject: s,
  };
});

/* =========================================================================
   4. Book construction
   ========================================================================= */
const W = 1.36,
  H = 2.05,
  T = 0.32,
  CT = 0.032,
  OV = 0.045;
/** 封面圆角半径（世界单位）— 游戏资产级圆角板，告别方盒 */
const COVER_R = 0.048;
const PAGE_N = 10,
  PW = W - 0.02,
  PH = H - 0.02;
const BLOCK_D = 0.235,
  BLOCK_Z = -0.012,
  PIVOT_Z = T / 2 + CT / 2,
  BPIVOT_Z = -(T / 2 + CT / 2);

/**
 * 圆角矩形 Shape（中心原点，XY 平面）
 * @param {number} w
 * @param {number} h
 * @param {number} r
 */
function roundedRectShape(w, h, r) {
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
 * 盖面 UV 归一到 0–1（Three 默认 Extrude UV 在竖向几乎挤成一条）
 * 仅处理 |z| 接近极值的盖面顶点，侧壁/bevel 不动
 * @param {THREE.BufferGeometry} geo
 * @param {number} w
 * @param {number} h
 */
function normalizeExtrudeCapUVs(geo, w, h) {
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
 * Three.js ExtrudeGeometry 默认 groups：
 *   materialIndex 0 = 上下盖（先 bottom 再 top）
 *   materialIndex 1 = 侧壁
 * 拆成书本需要的三槽：0=+z 盖, 1=-z 盖, 2=侧壁
 * @param {THREE.BufferGeometry} geo
 */
function reindexCoverMaterialGroups(geo) {
  const prev = geo.groups.slice();
  geo.clearGroups();
  const lid = prev.find((g) => g.materialIndex === 0);
  const side = prev.find((g) => g.materialIndex === 1);
  if (lid && lid.count >= 6 && lid.count % 2 === 0) {
    const half = lid.count / 2;
    /* buildLidFaces: 先 bottom(-z) 后 top(+z) */
    geo.addGroup(lid.start + half, half, 0); // +z 外/内封面
    geo.addGroup(lid.start, half, 1); // -z
  } else if (lid) {
    geo.addGroup(lid.start, lid.count, 0);
  }
  if (side) geo.addGroup(side.start, side.count, 2);
}

/**
 * 圆角挤出封面：侧壁 + 正反盖；bevel 做出印刷板厚边
 * groups: 0=+z 盖, 1=-z 盖, 2=侧壁(+bevel)
 */
function makeCoverGeo() {
  const cw = W + OV;
  const ch = H + OV * 2;
  const shape = roundedRectShape(cw, ch, COVER_R);
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
 * 微弧书脊截面：内侧贴铰链为直边，外侧轻微外凸（非半圆鼓包）
 * shape 平面：x 朝外为负，y 沿书厚；再挤出书高并旋到世界轴
 */
function makeSpineGeo() {
  const spineD = T + CT * 2 + 0.01; /* 沿书厚 */
  const spineW = 0.03; /* 脊板厚度 */
  const bulge = 0.007; /* 外侧微弧矢高 */
  const spineH = H + OV * 2 - 0.01;
  const hd = spineD * 0.5;

  const shape = new THREE.Shape();
  /* 内侧直边（朝书芯） */
  shape.moveTo(0, -hd);
  shape.lineTo(0, hd);
  shape.lineTo(-spineW * 0.88, hd);
  /* 外侧两段二次曲线 → 很浅的鼓 */
  shape.quadraticCurveTo(-spineW - bulge, hd * 0.42, -spineW - bulge, 0);
  shape.quadraticCurveTo(-spineW - bulge, -hd * 0.42, -spineW * 0.88, -hd);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: spineH,
    bevelEnabled: false,
    curveSegments: 10,
  });
  /* 默认沿 +Z 挤出 → 旋成沿 +Y 的书高 */
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  /* 内侧直边对齐 x=0，整体再由 mesh.position 嵌进铰链 */
  geo.translate(-bb.max.x, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);

  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  if (uv && pos) {
    const x0 = bb.min.x - bb.max.x; /* after translate, outer ~ more negative */
    const xSpan = Math.max(1e-4, spineW + bulge);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      /* 外侧面：用 z 摊 U、y 摊 V */
      const u = clamp(z / spineD + 0.5, 0, 1);
      const v = clamp(y / spineH + 0.5, 0, 1);
      /* 侧缘略用 x 混合，避免纯投影拉伸 */
      uv.setXY(i, u * 0.92 + clamp((-x) / xSpan, 0, 1) * 0.08, v);
    }
    uv.needsUpdate = true;
  }
  geo.computeVertexNormals();
  return geo;
}

const coverGeo = makeCoverGeo();
const blockGeo = new THREE.BoxGeometry(W - 0.012, H - 0.01, BLOCK_D);
const pageGeo = new THREE.PlaneGeometry(PW, PH);
const spineGeo = makeSpineGeo();
/** 书口多层薄片：侧光下叠出“千页”剪影 */
const EDGE_SHEET_N = 3;
const edgeSheetGeo = new THREE.PlaneGeometry(BLOCK_D * 0.9, H - 0.045);
/* hitbox 略大于书面，仍远小于旧版巨盒 */
const hitGeo = new THREE.BoxGeometry(W + 0.08, H + 0.08, T + 0.18);
const blobGeo = new THREE.PlaneGeometry(1, 1);
const hitMat = new THREE.MeshBasicMaterial({ visible: false });

function std(o) {
  return new THREE.MeshStandardMaterial(
    Object.assign({ metalness: 0.02 }, o),
  );
}

function phys(o) {
  return new THREE.MeshPhysicalMaterial(
    Object.assign({ metalness: 0.03 }, o),
  );
}

const paperFlat = std({
  color: 0xefe6d4,
  roughness: 0.97,
  envMapIntensity: 0.16,
});
const striMatV = std({
  map: striV,
  bumpMap: striBumpV,
  bumpScale: 0.011,
  roughness: 0.92,
  envMapIntensity: 0.32,
});
const striMatH = std({
  map: striH,
  bumpMap: striBumpH,
  bumpScale: 0.009,
  roughness: 0.92,
  envMapIntensity: 0.3,
});
const endpaperMat = std({
  map: endpaperTex,
  roughness: 0.9,
  envMapIntensity: 0.25,
});
const pageMats = [0xf4eee0, 0xf1ebdb, 0xf6f0e3].map((c) =>
  std({
    color: c,
    roughness: 0.92,
    envMapIntensity: 0.22,
    side: THREE.DoubleSide,
  }),
);

const books = [];
const hitMeshes = [];

function buildBook(cfg, index) {
  const root = new THREE.Group();
  const float = new THREE.Group();
  root.add(float);
  bookRoot.add(root);

  /* painted textures */
  const fc = mkCanvas(1024, 1536);
  cfg.front(fc.getContext("2d"), 1024, 1536);
  const bc = mkCanvas(1024, 1536);
  paintBack(bc.getContext("2d"), 1024, 1536, cfg);
  const sc = mkCanvas(220, 1536);
  paintSpine(sc.getContext("2d"), 220, 1536, cfg);
  const frontTex = tex(fc),
    backTex = tex(bc),
    spineTex = tex(sc);

  /* printed boards：初值 + 主题手感覆盖 */
  const mEdge = phys({
    color: cfg.edge,
    bumpMap: laminateBump,
    bumpScale: 0.0065,
    roughness: 0.42,
    metalness: 0.08,
    clearcoat: 0.42,
    clearcoatRoughness: 0.32,
    envMapIntensity: 0.62,
  });
  const mEdgeDark = mEdge.clone();
  try {
    mEdgeDark.color = mEdge.color.clone().multiplyScalar(0.72);
  } catch {
    /* ignore */
  }
  const mFront = phys({
    map: frontTex,
    bumpMap: laminateBump,
    bumpScale: 0.0055,
    roughness: 0.22,
    metalness: 0.05,
    clearcoat: 0.92,
    clearcoatRoughness: 0.08,
    envMapIntensity: 0.88,
  });
  const mBack = phys({
    map: backTex,
    bumpMap: laminateBump,
    bumpScale: 0.0048,
    roughness: 0.32,
    clearcoat: 0.58,
    clearcoatRoughness: 0.18,
    envMapIntensity: 0.58,
  });
  const mSpine = phys({
    map: spineTex,
    color: 0xffffff,
    bumpMap: clothBump,
    bumpScale: 0.014,
    roughness: 0.55,
    metalness: 0.02,
    clearcoat: 0.28,
    clearcoatRoughness: 0.48,
    envMapIntensity: 0.45,
  });
  applyBookFeel(
    themeBookFeel(activeThemeId()),
    { mFront, mBack, mEdge, mEdgeDark, mSpine },
    cfg.edge,
  );

  /* 封面烘焙：少压暗、略提亮，封面图保持通透 */
  function paintStudioGrade(ctx, w, h) {
    ctx.save();
    /* 极轻角部压暗，几乎不动主画面亮度 */
    const shade = ctx.createLinearGradient(0, 0, w * 0.95, h);
    shade.addColorStop(0, "rgba(255,255,255,0)");
    shade.addColorStop(0.55, "rgba(255,255,255,0)");
    shade.addColorStop(1, "rgba(10,14,32,0.05)");
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);

    /* 通透提亮带 */
    const lift = ctx.createLinearGradient(0, 0, w, h * 0.85);
    lift.addColorStop(0, "rgba(255,252,248,0.14)");
    lift.addColorStop(0.45, "rgba(255,255,255,0.06)");
    lift.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalCompositeOperation = "soft-light";
    ctx.fillStyle = lift;
    ctx.fillRect(0, 0, w, h);

    const shaft = ctx.createLinearGradient(w * 0.02, 0, w * 0.92, h * 0.98);
    shaft.addColorStop(0, "rgba(255,252,245,0)");
    shaft.addColorStop(0.3, "rgba(255,250,240,0.22)");
    shaft.addColorStop(0.4, "rgba(255,252,248,0.32)");
    shaft.addColorStop(0.55, "rgba(255,248,235,0.12)");
    shaft.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = shaft;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    paintPrintWear(ctx, w, h);
  }

  /* 程序封面也叠一层印刷感 */
  paintPrintWear(fc.getContext("2d"), 1024, 1536);
  frontTex.needsUpdate = true;

  /** 换肤时忽略过期的异步封面加载 */
  let coverLoadGen = 0;
  function applyCoverMap(url, themeHint) {
    const gen = ++coverLoadGen;
    cfg.coverURL = url || null;
    /* 先立刻挂上程序封面（已按主题重绘），避免旧主题贴图卡住 */
    mFront.map = frontTex;
    mFront.needsUpdate = true;
    if (!url) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (gen !== coverLoadGen) return;
      try {
        const c = mkCanvas(1024, 1536);
        const x = c.getContext("2d");
        x.drawImage(img, 0, 0, 1024, 1536);
        paintStudioGrade(x, 1024, 1536);
        const graded = tex(c);
        if (gen !== coverLoadGen) {
          try {
            graded.dispose();
          } catch (_) {
            /* ignore */
          }
          return;
        }
        const prev = mFront.map;
        mFront.map = graded;
        mFront.needsUpdate = true;
        if (prev && prev !== frontTex && prev !== graded) {
          try {
            prev.dispose();
          } catch (_) {
            /* ignore */
          }
        }
      } catch (err) {
        console.warn("Cover grade failed:", cfg.title, err);
      }
    };
    img.onerror = () => {
      if (gen !== coverLoadGen) return;
      console.warn("Cover load failed, procedural kept:", cfg.title, url);
      mFront.map = frontTex;
      mFront.needsUpdate = true;
    };
    /* 带主题后缀，避免浏览器把不同主题图当同一缓存 */
    const tip = themeHint || activeThemeId();
    const bust = `${url}${url.includes("?") ? "&" : "?"}theme=${encodeURIComponent(tip)}`;
    img.src = bust;
  }
  if (cfg.coverURL) applyCoverMap(cfg.coverURL, activeThemeId());

  /* 每本书独立溶解 uniforms（不共享材质程序状态） */
  const dissolveU = createDissolveUniforms(THREE, cfg.edge || 0x6ee7b7);
  attachDissolveAll([mFront, mBack, mEdge, mEdgeDark, mSpine], dissolveU);

  /* 书芯用克隆材质，才能跟封面一起溶解，不影响其它书
     Box 面序: +x -x +y -y +z -z → 前缘层理 / 书脊侧纸 / 上下切 / 前后纸面 */
  const mBlock = [
    striMatV.clone(),
    paperFlat.clone(),
    striMatH.clone(),
    striMatH.clone(),
    paperFlat.clone(),
    paperFlat.clone(),
  ];
  /* 前缘暖亮；上下切略暗但不闷，简介近景也干净 */
  mBlock[0].color = new THREE.Color(0xfffaf0);
  mBlock[2].color = new THREE.Color(0xe8dcc4);
  mBlock[3].color = new THREE.Color(0xddd0b8);
  mBlock[2].roughness = 0.94;
  mBlock[3].roughness = 0.95;
  const mEndF = endpaperMat.clone();
  const mEndB = endpaperMat.clone();
  attachDissolveAll([...mBlock, mEndF, mEndB], dissolveU);

  /* Extrude 材质组（reindex 后）: 0=+z 盖, 1=-z 盖, 2=侧壁 */
  /* back cover: +z 朝书芯=环衬, -z 朝外=封底画 */
  const backPivot = new THREE.Group();
  backPivot.position.set(-W / 2, 0, BPIVOT_Z);
  const backMesh = new THREE.Mesh(coverGeo, [mEndB, mBack, mEdgeDark]);
  backMesh.position.x = (W + OV) / 2;
  backMesh.castShadow = backMesh.receiveShadow = true;
  backPivot.add(backMesh);
  float.add(backPivot);

  /* front cover: +z 朝外=封面画, -z 朝书芯=环衬 */
  const pivot = new THREE.Group();
  pivot.position.set(-W / 2, 0, PIVOT_Z);
  const frontMesh = new THREE.Mesh(coverGeo, [mFront, mEndF, mEdgeDark]);
  frontMesh.position.x = (W + OV) / 2;
  frontMesh.castShadow = frontMesh.receiveShadow = true;
  pivot.add(frontMesh);
  float.add(pivot);

  /* 微弧书脊：内侧贴铰链，略压进封面封缝 */
  const spine = new THREE.Mesh(spineGeo, mSpine);
  const spineNest = 0.006;
  spine.position.set(-W / 2 + spineNest, 0, 0);
  spine.castShadow = true;
  float.add(spine);

  /* page block with striated edges — 略偏书口，让层理吃侧光 */
  const block = new THREE.Mesh(blockGeo, mBlock);
  block.position.set(0.01, 0, BLOCK_Z);
  block.castShadow = block.receiveShadow = true;
  float.add(block);

  /* 书口多层薄片：错位叠影，侧光下像真切页 */
  const edgeSheetColors = [0xfff8ee, 0xf2e8d6, 0xe6d8c0];
  const edgeSheets = [];
  const edgeSheetMats = [];
  for (let i = 0; i < EDGE_SHEET_N; i++) {
    const em = striMatV.clone();
    em.color = new THREE.Color(edgeSheetColors[i % edgeSheetColors.length]);
    em.bumpScale = 0.01 + i * 0.002;
    em.side = THREE.DoubleSide;
    em.polygonOffset = true;
    em.polygonOffsetFactor = -1 - i;
    em.polygonOffsetUnits = -1 - i;
    edgeSheetMats.push(em);
    const sheet = new THREE.Mesh(edgeSheetGeo, em);
    sheet.rotation.y = Math.PI / 2;
    /* 贴在书芯 +x 前缘外侧，略交错 z/y */
    sheet.position.set(
      W * 0.5 - 0.004 + i * 0.0032,
      (i - 1) * 0.004,
      BLOCK_Z + (i - 1) * 0.014,
    );
    sheet.castShadow = false;
    sheet.receiveShadow = true;
    float.add(sheet);
    edgeSheets.push(sheet);
  }
  attachDissolveAll(edgeSheetMats, dissolveU);

  /* individually hinged top sheets */
  const pages = [],
    pageF = [];
  for (let i = 0; i < PAGE_N; i++) {
    const pp = new THREE.Group();
    pp.position.set(
      -W / 2 + 0.01,
      (Math.random() - 0.5) * 0.006,
      T / 2 - 0.02 - i * 0.0045,
    );
    const pm = new THREE.Mesh(pageGeo, pageMats[i % 3]);
    pm.position.x = PW / 2;
    pm.rotation.z = (Math.random() - 0.5) * 0.006;
    pp.add(pm);
    float.add(pp);
    pages.push(pp);
    pageF.push(0.3 * Math.pow(1 - i / PAGE_N, 2.6));
  }

  /* hinged rear sheets, revealed when the back cover fans */
  const pagesB = [],
    pageFB = [];
  for (let i = 0; i < 6; i++) {
    const pp = new THREE.Group();
    pp.position.set(
      -W / 2 + 0.01,
      (Math.random() - 0.5) * 0.006,
      -(T / 2 - 0.02) + i * 0.0045,
    );
    const pm = new THREE.Mesh(pageGeo, pageMats[i % 3]);
    pm.position.x = PW / 2;
    pm.rotation.z = (Math.random() - 0.5) * 0.006;
    pp.add(pm);
    float.add(pp);
    pagesB.push(pp);
    pageFB.push(0.3 * Math.pow(1 - i / 6, 2.6));
  }

  /* soft blob shadow — 基准值；tick 里跟 lift 联动散开/变淡 */
  const blobMat = new THREE.MeshBasicMaterial({
    map: blobTex,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  const blob = new THREE.Mesh(blobGeo, blobMat);
  /* 亮背景下影子略淡、略收，避免黑板脏斑；抬起时再散 */
  const blobBase = { sx: 3.1, sy: 3.85, op: 0.32, x: 0.1, y: -0.42, z: -0.88 };
  blob.scale.set(blobBase.sx, blobBase.sy, 1);
  blob.position.set(blobBase.x, blobBase.y, blobBase.z);
  blob.renderOrder = -5;
  root.add(blob);

  /* invisible raycast target */
  const hit = new THREE.Mesh(hitGeo, hitMat);
  float.add(hit);
  hitMeshes.push(hit);

  const springs = {
    px: new Spring(0, 17, 6.8),
    py: new Spring(0, 17, 6.8),
    pz: new Spring(0, 17, 6.8),
    rx: new Spring(0, 17, 6.8),
    ry: new Spring(0, 17, 6.8),
    rz: new Spring(0, 17, 6.8),
    sc: new Spring(1, 17, 6.8),
    tiltX: new Spring(0, 120, 13),
    tiltY: new Spring(0, 120, 13),
    lift: new Spring(0, 120, 13),
    cover: new Spring(0, 90, 12),
    coverB: new Spring(0, 90, 12),
    drag: new Spring(0, 160, 16),
  };

  const mats = { mFront, mBack, mEdge, mEdgeDark, mSpine };
  const b = {
    cfg,
    index,
    root,
    float,
    pivot,
    backPivot,
    frontMesh,
    spine,
    block,
    pages,
    pageF,
    pagesB,
    pageFB,
    hit,
    springs,
    dissolveU,
    mats,
    blob,
    blobBase,
    blobMat,
    feelBase: snapshotFeelBase(mats),
    glowAmt: 0,
    phase: Math.random() * 6.28,
    slotScale: 1,
    hitEdge: null,
    scr: { x: 0, y: 0 },
    scrRect: { cx: 0, cy: 0, w: 120, h: 170 },
    orbY: 0,
    orbYv: 0,
    orbPhase: "idle",
    orbTarget: 0,
    orbXs: new Spring(0, 60, 12),
    exit: null,
    repaint() {
      const themeId = activeThemeId();
      const themed = themeBookBoards(cfg.id, themeId);
      Object.assign(cfg, themed);
      const artUrl = coverUrlForTheme(themeId, cfg.id);
      const fx = fc.getContext("2d");
      /* 显式传入 themeId，不依赖闭包时序 */
      paintSubjectCover(fx, 1024, 1536, cfg.subject || { id: cfg.id, name: cfg.title }, themeId);
      paintPrintWear(fx, 1024, 1536);
      paintBack(bc.getContext("2d"), 1024, 1536, cfg);
      paintSpine(sc.getContext("2d"), 220, 1536, cfg);
      frontTex.needsUpdate = true;
      backTex.needsUpdate = true;
      spineTex.needsUpdate = true;
      applyBookFeel(themeBookFeel(themeId), mats, cfg.edge);
      b.feelBase = snapshotFeelBase(mats);
      if (dissolveU?.uDissolveColor) {
        try {
          dissolveU.uDissolveColor.value.set(cfg.edge || 0x6ee7b7);
        } catch (_) {
          /* ignore */
        }
      }
      applyCoverMap(artUrl, themeId);
    },
  };
  books.push(b);
  return b;
}
try {
  BOOKS.forEach(buildBook);
} catch (err) {
  console.error("buildBook failed", err);
}
/* 初始主题灯光 + 教室 env（材质已在 buildBook 内 applyBookFeel） */
try {
  const tid = activeThemeId();
  applyThemeLights(themeBookFeel(tid), tid);
} catch (err) {
  console.warn("applyThemeLights failed", err);
}
if (!books.length) {
  console.error("Bookshelf: no books built — check subjects / buildBook errors");
}
const bookByHit = (m) => books.find((b) => b.hit === m);

/* =========================================================================
   5. Floating motifs (detail view) — per-subject
   ========================================================================= */
const leaves = createDetailFloaters({
  THREE,
  bookRoot,
  std,
  Spring,
  getCamera: () => camera,
  reducedMotion: RM,
});

/* =========================================================================
   6. Layout slots + state machine
   ========================================================================= */
const state = {
  mode: "hero",
  selected: null,
  hovered: null,
  kbIndex: -1,
};
const SLOTS = { hero: [], detail: null, portrait: false };

function computeSlots() {
  const a = viewW() / Math.max(1, viewH());
  const fit = clamp(a / 1.75, 0.62, 1);
  SLOTS.portrait = a < 0.85;
  bookRoot.scale.setScalar(fit);
  /* 上移构图：标题 + 书居中偏上，少留天头空白 */
  bookRoot.position.y = SLOTS.portrait ? -0.04 : -0.02;

  /* hero fan：再下移 10%、放大 20%；略扇开让侧光吃到书脊 */
  const nBooksHero = Math.max(1, BOOKS.length);
  const span = SLOTS.portrait ? 3.35 : 5.35;
  SLOTS.hero = [];
  for (let i = 0; i < nBooksHero; i++) {
    const mid = (nBooksHero - 1) / 2;
    const t = nBooksHero === 1 ? 0.5 : i / (nBooksHero - 1);
    const x = -span / 2 + span * t;
    const dist = Math.abs(i - mid);
    const y = (SLOTS.portrait ? -0.42 : -0.62) - dist * 0.05;
    const z = 0.32 - dist * 0.13;
    const sc = (SLOTS.portrait ? 1.056 : 1.135) - dist * 0.03;
    /* 对齐原版 fan：左书 ry/rz>0、右书 <0 → 顶部外扩、封面略朝中心 */
    const k = mid - i;
    const ry = k * (SLOTS.portrait ? 0.22 : 0.2);
    const rz = k * (SLOTS.portrait ? 0.09 : 0.08);
    SLOTS.hero.push({
      p: [x, y, z],
      r: [-0.04, ry, rz],
      s: sc,
    });
  }

  SLOTS.portal = {
    p: [0, -0.12, 1.2],
    r: [-0.02, -0.35, 0.03],
    s: SLOTS.portrait ? 1.35 : 1.48,
  };

  if (SLOTS.portrait) {
    /* center the book in the region between the nav and the info sheet */
    const el = detail;
    const panelH =
      el && el.offsetHeight > 40 ? el.offsetHeight : viewH() * 0.44;
    const gap = viewH() * 0.035,
      navB = viewH() * 0.1;
    const freeTop = navB;
    const freeBot = Math.max(viewH() - panelH - gap, freeTop + 140);
    const midPx = (freeTop + freeBot) / 2;
    const T13 = 0.23087,
      camZp = 9.9,
      zw = 0.8 * fit,
      rootY = -(1 - fit) * 0.55;
    const yw = 0.1 + (1 - (2 * midPx) / viewH()) * T13 * (camZp - zw);
    const availW =
      (((freeBot - freeTop) * 0.92) / viewH()) *
      2 *
      T13 *
      (camZp - zw);
    const s = clamp(availW / fit / 2.3, 0.5, 1.15);
    SLOTS.detail = {
      p: [0, (yw - rootY) / fit, 0.8],
      r: [-0.02, -0.4, 0.06],
      s: s,
    };
  } else {
    SLOTS.detail = {
      p: [-1.95, 0.0, 1.1],
      r: [0.02, -0.52, 0.1],
      s: 1.26,
    };
  }
}

function setTargets(b, slot) {
  const s = b.springs;
  s.px.t = slot.p[0];
  s.py.t = slot.p[1];
  s.pz.t = slot.p[2];
  s.rx.t = slot.r[0];
  s.ry.t = slot.r[1];
  s.rz.t = slot.r[2];
  b.slotScale = slot.s;
}

/* ---------------------------------------------------------------------
   Exit / return motion.

   A spring aimed far below the frame accelerates the whole way, which
   reads as a fast drop. Instead the vertical axis is handed to a small
   keyframed tween for the duration of the move, so the curve is designed:
   a soft decelerating lift, a beat of hang time, then a long glide down
   that eases in and out. Closing plays the same idea in reverse.
   --------------------------------------------------------------------- */
const EASE = {
  hold: () => 1,
  /* short tail: reaches the apex without loitering there */
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  /* leaves rest promptly, still zero velocity at both ends */
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

const LIFT = 0.38, /* how far the book floats up before letting go */
  CLEAR = 4.2; /* far enough below its slot to be out of frame */

function playY(b, segs) {
  b.exit = { segs, i: 0, t: 0 };
}

/* advances the tween and writes straight into the y spring, keeping the
   spring inert so it neither fights the curve nor snaps at handover */
function stepY(b, dt) {
  const ex = b.exit,
    s = b.springs;
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

/* x, z and rotation are pinned to wherever the book already stands, so the
   whole move happens on the y axis and nothing slides sideways */
function pinInPlace(b) {
  const s = b.springs;
  s.px.t = s.px.v;
  s.pz.t = s.pz.v;
  s.rx.t = s.rx.v;
  s.ry.t = s.ry.v;
  s.rz.t = s.rz.v;
}

function sendOut(b, i, delay) {
  const y0 = SLOTS.hero[i].p[1],
    here = b.springs.py.v,
    apex = y0 + LIFT;
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

function bringBack(b, i, delay) {
  const here = b.springs.py.v;
  b.root.visible = true;
  pinInPlace(b);
  playY(b, [
    { d: delay, from: here, to: here, ease: EASE.hold },
    { d: 1.0, from: here, to: SLOTS.hero[i].p[1], ease: EASE.outQuint },
  ]);
}

function applyMode() {
  if (state.mode === "hero" || state.mode === "closing") {
    books.forEach((b, i) => setTargets(b, SLOTS.hero[i]));
  } else if (state.selected) {
    /* only the open book is retargeted; the other two keep the x, z and
       rotation they stood at while their y is tween-driven */
    setTargets(state.selected, SLOTS.detail);
  }
}

/* camera springs */
const camX = new Spring(0, 13, 6.5),
  camY = new Spring(0.1, 13, 6.5),
  camZ = new Spring(9.6, 13, 6.5);
const lookX = new Spring(0, 13, 6.5),
  lookY = new Spring(0, 13, 6.5);
const parX = new Spring(0, 60, 10),
  parY = new Spring(0, 60, 10);

function camTo(mode) {
  if (mode === "detail") {
    camX.t = SLOTS.portrait ? 0 : -0.4;
    camZ.t = SLOTS.portrait ? 9.9 : 8.9;
    lookX.t = SLOTS.portrait ? 0 : -0.5;
    lookY.t = SLOTS.portrait ? 0 : 0.15;
  } else if (mode === "portal") {
    camX.t = 0;
    camY.t = 0.08;
    camZ.t = RM ? 7.4 : 6.8;
    lookX.t = 0;
    lookY.t = 0.08;
  } else if (mode === "dive") {
    camX.t = 0.15;
    camY.t = 0.05;
    camZ.t = RM ? 3.2 : 2.35;
    lookX.t = -0.05;
    lookY.t = 0.02;
  } else {
    camX.t = 0;
    camY.t = 0.1;
    camZ.t = 9.6;
    lookX.t = 0;
    lookY.t = 0;
  }
}

/* detail panel */
function populatePanel(cfg) {
  if (dpTitle) dpTitle.textContent = cfg.title;
  if (dpEn) dpEn.textContent = cfg.en || "";
  if (dpDesc) dpDesc.textContent = cfg.blurb || cfg.desc || "";
  if (dpStatus) {
    dpStatus.textContent = cfg.status === "ready" ? "开放" : "即将推出";
  }
  if (dpModules) {
    if (cfg.status !== 'ready') {
      dpModules.textContent = '规划中';
    } else if (cfg.id === 'chemistry') {
      dpModules.textContent = '互动教室';
    } else {
      dpModules.textContent = '教室首页';
    }
  }
  if (dpTagline) dpTagline.textContent = cfg.desc || "";
  if (enterBtn) {
    const ready = cfg.status === "ready";
    enterBtn.hidden = !ready;
    enterBtn.disabled = !ready;
  }
  if (lockNote) lockNote.hidden = cfg.status === "ready";
}

/* open slip removed — cursor affordance was noisy */

/** 点书：一律进简介详情（对齐原版 books），不直接进教室 */
function open(book) {
  if (state.mode !== "hero" || !book) return;
  clearOpenTimers();
  transitionSeq += 1;
  enterFx?.cancel();
  state.mode = "opening";
  state.selected = book;
  state.kbIndex = -1;
  book.exit = null;
  document.body.classList.add("transit");
  document.body.classList.remove("detail-open", "bookshelf-entering", "bookshelf-dive-deep");
  populatePanel(book.cfg);
  computeSlots();

  /* beat 1：其它书抬起并下沉；选中书原地等，避免对穿 */
  let out = 0;
  books.forEach((b, i) => {
    if (b !== book) sendOut(b, i, out++ * 0.08);
  });

  /* beat 2：对齐原版固定 760ms — 其它书大致让开后，边回转边移到详情位 */
  later(() => {
    if (state.mode !== "opening" && state.mode !== "detail") return;
    book.orbY = RM ? 0 : -6.2832;
    book.orbYv = RM ? 0 : 3;
    book.orbPhase = "return";
    book.orbTarget = 0;
    book.orbXs.set(0);
    applyMode();
    camTo("detail");
  }, RM ? 200 : 760);
  later(() => leaves.activate(book), RM ? 280 : 1000);
  later(() => {
    if (state.mode !== "opening") return;
    document.body.classList.add("detail-open");
    state.mode = "detail";
  }, RM ? 360 : 1400);
}

/**
 * 简介页「进入教室」：书保持合上，仅轻微前推 → 封面溶解接管转场。
 * 帷幕不透明后才 onEnterSubject，避免白页空镜。
 */
function enterFromDetail() {
  const book = state.selected;
  if (!book || book.cfg.status !== "ready") return;
  if (state.mode !== "detail" && state.mode !== "opening") return;
  clearOpenTimers();
  const tid = ++transitionSeq;
  leaves.deactivate();
  orbit.drag = false;
  state.mode = "entering";
  document.body.classList.add("bookshelf-entering");
  document.body.classList.remove("detail-open", "bookshelf-dive-deep");
  computeSlots();

  /* 合上：溶解用的是封面，不应再掀开露白页 */
  book.springs.cover.t = 0;
  book.springs.coverB.t = 0;
  book.springs.drag.t = 0;
  book.springs.tiltX.t = 0;
  book.springs.tiltY.t = 0;

  const detail = SLOTS.detail || {
    p: [0, -0.2, 0.85],
    r: [-0.02, -0.28, 0.02],
    s: 1.35,
  };

  later(() => {
    if (state.mode !== "entering" || tid !== transitionSeq) return;
    setTargets(book, {
      p: [detail.p[0], detail.p[1] + 0.04, detail.p[2] + 0.28],
      r: detail.r,
      s: detail.s * 1.06,
    });
    camTo("detail");
  }, RM ? 0 : 40);

  later(() => {
    if (state.mode !== "entering" || tid !== transitionSeq) return;
    screenRect(book);
    const origin = { x: book.scr.x, y: book.scr.y };
    const bookRect = { ...book.scrRect };
    resetBookDissolve(book);
    syncBookDissolveForTransition(book);
    if (enterFx) {
      const themeId = document.documentElement.getAttribute("data-theme") || "default";
      enterFx.playEnter({
        id: tid,
        origin,
        bookRect,
        subjectName: book.cfg.title || book.cfg.name || "化学",
        subjectId: book.cfg.id || "chemistry",
        themeId,
        coverURL: book.cfg.coverURL || null,
        onProgress: (t) => {
          if (state.mode !== "entering" || tid !== transitionSeq) return;
          applyBookDissolve(book, t);
        },
        onOpaque: (id) => {
          if (id !== tid || tid !== transitionSeq || state.mode !== "entering") return;
          /* 帷幕已不透明：安全切换到实验室壳 */
          onEnterSubject(book.cfg.id);
        },
        onSettled: (id) => {
          if (id !== tid || tid !== transitionSeq) return;
          document.body.classList.remove("bookshelf-dive-deep", "bookshelf-entering");
        },
      });
    } else onEnterSubject(book.cfg.id);
  }, RM ? 60 : 160);
}

function close() {
  if (state.mode !== "detail") return;
  clearOpenTimers();
  leaves.deactivate();
  orbit.drag = false;
  beginCloseToShelf(state.selected);
}

/**
 * 简介页 → 书架：选中书旋转一圈并移回槽位，其它书升起归位。
 * @param {object | null} b
 * @param {{ onDone?: () => void }} [opts]
 */
function beginCloseToShelf(b, opts = {}) {
  if (!b) {
    opts.onDone?.();
    return;
  }
  clearOpenTimers();
  state.mode = "closing";
  state.selected = b;
  document.body.classList.remove("detail-open", "bookshelf-entering");
  leaves.deactivate();
  orbit.drag = false;

  b.orbTarget = Math.round(b.orbY / 6.2832) * 6.2832 + 6.2832;
  b.orbYv = Math.max(b.orbYv, 3);
  b.orbPhase = "return";
  b.orbXs.t = 0;

  later(() => {
    if (state.mode !== "closing") return;
    document.body.classList.remove("transit");
    applyMode();
    camTo("hero");
    let back = 0;
    books.forEach((bk, i) => {
      if (bk !== b) bringBack(bk, i, 0.85 + back++ * 0.1);
    });
  }, 250);

  later(() => {
    if (state.mode !== "closing") return;
    state.mode = "hero";
    state.selected = null;
    opts.onDone?.();
  }, 1600);
}

function resetToHero() {
  clearOpenTimers();
  transitionSeq += 1;
  enterFx?.cancel();
  document.body.classList.remove(
    "transit",
    "detail-open",
    "bookshelf-entering",
    "bookshelf-dive-deep",
  );
  leaves.deactivate();
  orbit.drag = false;
  state.mode = "hero";
  state.selected = null;
  state.kbIndex = -1;
  computeSlots();
  books.forEach((b, i) => {
    const slot = SLOTS.hero[i];
    if (!slot) return;
    b.root.visible = true;
    b.exit = null;
    resetBookDissolve(b);
    b.orbY = 0;
    b.orbYv = 0;
    b.orbPhase = "idle";
    b.orbTarget = 0;
    b.orbXs.set(0);
    b.springs.cover.set(0);
    b.springs.coverB.set(0);
    b.springs.drag.set(0);
    b.springs.tiltX.set(0);
    b.springs.tiltY.set(0);
    b.springs.lift.set(0);
    b.slotScale = slot.s;
    b.springs.px.set(slot.p[0]);
    b.springs.py.set(slot.p[1]);
    b.springs.pz.set(slot.p[2]);
    b.springs.rx.set(slot.r[0]);
    b.springs.ry.set(slot.r[1]);
    b.springs.rz.set(slot.r[2]);
    b.springs.sc.set(slot.s);
    setTargets(b, slot);
  });
  camX.set(0);
  camY.set(0.1);
  camZ.set(9.6);
  lookX.set(0);
  lookY.set(0);
  camTo("hero");
}

/**
 * 从教室返回：帷幕先不透明 → 再露大厅（幕下）→ 凝聚到简介位 → 旋转归架。
 * @param {object} returnOpts
 * @param {string} [returnOpts.subjectId]
 * @param {string} [returnOpts.subjectName]
 * @param {() => void} [returnOpts.onDone]
 */
function playReturnFromLab(returnOpts = {}) {
  clearOpenTimers();
  enterFx?.cancel();
  const tid = ++transitionSeq;
  const subjectId = returnOpts.subjectId || "chemistry";
  const subjectName = returnOpts.subjectName || "化学";
  const book = books.find((b) => b.cfg.id === subjectId) || books[0];
  if (!book) {
    returnOpts.onDone?.();
    return;
  }

  running = true;
  if (!raf) animate();
  document.body.classList.add("transit", "bookshelf-entering");
  document.body.classList.remove("detail-open", "bookshelf-dive-deep");
  leaves.deactivate();
  orbit.drag = false;
  state.mode = "returning";
  state.selected = book;
  state.kbIndex = -1;
  computeSlots();

  /* 其它书停在简介态「沉下去」的位置，归架时用 bringBack 升起 */
  books.forEach((b, i) => {
    if (b === book) return;
    const slot = SLOTS.hero[i];
    if (!slot) return;
    b.root.visible = false;
    b.exit = null;
    b.orbY = 0;
    b.orbYv = 0;
    b.orbPhase = "idle";
    b.orbTarget = 0;
    b.orbXs.set(0);
    resetBookDissolve(b);
    b.springs.cover.set(0);
    b.springs.coverB.set(0);
    b.springs.drag.set(0);
    b.springs.tiltX.set(0);
    b.springs.tiltY.set(0);
    b.springs.lift.set(0);
    b.slotScale = slot.s;
    b.springs.px.set(slot.p[0]);
    b.springs.py.set(slot.p[1] - CLEAR);
    b.springs.pz.set(slot.p[2]);
    b.springs.rx.set(slot.r[0]);
    b.springs.ry.set(slot.r[1]);
    b.springs.rz.set(slot.r[2]);
    b.springs.sc.set(slot.s);
    setTargets(b, {
      p: [slot.p[0], slot.p[1] - CLEAR, slot.p[2]],
      r: slot.r,
      s: slot.s,
    });
  });

  /* 合着的书停在与简介页完全相同的详情槽 */
  const detail = SLOTS.detail || {
    p: [0, -0.2, 0.85],
    r: [-0.02, -0.28, 0.02],
    s: 1.35,
  };
  book.root.visible = true;
  book.exit = null;
  book.orbY = 0;
  book.orbYv = 0;
  book.orbPhase = "idle";
  book.orbTarget = 0;
  book.orbXs.set(0);
  book.springs.cover.set(0);
  book.springs.coverB.set(0);
  book.springs.drag.set(0);
  book.springs.tiltX.set(0);
  book.springs.tiltY.set(0);
  book.springs.lift.set(0);
  book.slotScale = detail.s;
  book.springs.px.set(detail.p[0]);
  book.springs.py.set(detail.p[1]);
  book.springs.pz.set(detail.p[2]);
  book.springs.rx.set(detail.r[0]);
  book.springs.ry.set(detail.r[1]);
  book.springs.rz.set(detail.r[2]);
  book.springs.sc.set(detail.s);
  setTargets(book, detail);
  camTo("detail");
  applyBookDissolve(book, 1.05);
  screenRect(book);
  syncBookDissolveForTransition(book);

  let hubRevealed = false;
  const revealHubShell = () => {
    if (hubRevealed) return;
    hubRevealed = true;
    onRevealHub?.();
  };

  let shelfStarted = false;
  const startShelfReturn = () => {
    if (shelfStarted) return;
    if (state.mode !== "returning" || tid !== transitionSeq) return;
    shelfStarted = true;
    /* 兜底：若 opaque 回调丢失，归架前必须先露大厅壳 */
    revealHubShell();
    resetBookDissolve(book);
    document.body.classList.remove("bookshelf-entering", "bookshelf-dive-deep");
    beginCloseToShelf(book, { onDone: returnOpts.onDone });
  };

  if (enterFx) {
    const themeId = document.documentElement.getAttribute('data-theme') || 'default';
    enterFx.playExit({
      id: tid,
      subjectName,
      subjectId,
      themeId,
      coverURL: book.cfg.coverURL || null,
      origin: { x: book.scr.x, y: book.scr.y },
      bookRect: { ...book.scrRect },
      onProgress: (t) => {
        if (state.mode !== "returning" || tid !== transitionSeq) return;
        applyBookDissolve(book, 1.05 * (1 - t));
      },
      /* 帷幕不透明后才露大厅（幕下预热），杜绝教室空镜 */
      onOpaque: (id) => {
        if (id !== tid || tid !== transitionSeq) return;
        revealHubShell();
      },
      onSettled: (id) => {
        if (id !== tid || tid !== transitionSeq) return;
        startShelfReturn();
      },
      onDone: startShelfReturn,
    });
    /* 唯一兜底：FX 异常未 settled 时仍归架 */
    later(() => {
      if (tid === transitionSeq && state.mode === "returning") startShelfReturn();
    }, RM ? 600 : 2000);
  } else {
    revealHubShell();
    resetBookDissolve(book);
    startShelfReturn();
  }
}

function syncTheme() {
  const themeId = activeThemeId();
  try {
    applyThemeLights(themeBookFeel(themeId), themeId);
  } catch (err) {
    console.warn("syncTheme lights failed", err);
  }
  books.forEach((b) => {
    try {
      b.repaint?.();
    } catch (err) {
      console.warn("book repaint failed", b?.cfg?.id, err);
    }
  });
}

closeBtn.addEventListener("click", close);
if (enterBtn) {
  enterBtn.addEventListener("click", () => {
    enterFromDetail();
  });
}
if (peek) {
  peek.addEventListener("click", () => {
    close();
  });
}
/* the slip is never a hit target — clicking the book under it opens it,
   which is also what keeps it able to follow the cursor */

/* =========================================================================
   7. Input: pointer as hand, drag to peel, keyboard
   ========================================================================= */
const ptr = {
  ndcX: 0,
  ndcY: 0,
  cx: innerWidth / 2,
  cy: innerHeight / 2,
  lastX: 0,
  lastY: 0,
  down: false,
  downX: 0,
  downY: 0,
  moved: 0,
  t0: 0,
  type: "mouse",
  seen: false,
  id: null, /* only the first finger down drives the scene */
};
const isTouch = () => ptr.type === "touch" || ptr.type === "pen";
let dragBook = null,
  rayBook = null;
const orbit = { drag: false, dxAcc: 0, dyAcc: 0 };
const ray = new THREE.Raycaster();
const tmpV = new THREE.Vector3();

canvas.addEventListener("contextmenu", (e) => e.preventDefault());
/* pointer off the canvas: nothing is hovered, so the slip goes away */
canvas.addEventListener("pointerleave", () => {
  rayBook = null;
  state.kbIndex = -1;
});

canvas.addEventListener("pointermove", (e) => {
  if (ptr.id !== null && e.pointerId !== ptr.id) return;
  const dxN = (e.clientX - ptr.lastX) / innerWidth;
  const dyN = (e.clientY - ptr.lastY) / innerHeight;
  ptr.lastX = e.clientX;
  ptr.lastY = e.clientY;
  ptr.cx = e.clientX;
  ptr.cy = e.clientY;
  ptr.ndcX = (e.clientX / innerWidth) * 2 - 1;
  ptr.ndcY = -(e.clientY / innerHeight) * 2 + 1;
  ptr.type = e.pointerType || "mouse";
  ptr.seen = true;
  if (state.mode === "detail") leaves.nudge(dxN, dyN, ptr.ndcX, ptr.ndcY);
  if (ptr.down && dragBook) {
    ptr.moved += Math.abs(dxN * innerWidth) + Math.abs(dyN * innerHeight);
    dragBook.springs.drag.t = clamp(
      ((ptr.downX - e.clientX) / innerWidth) * 3.4,
      0,
      1.0,
    );
  }
  if (ptr.down && orbit.drag) {
    orbit.dxAcc += dxN;
    orbit.dyAcc += dyN;
    ptr.moved += Math.abs(dxN * innerWidth) + Math.abs(dyN * innerHeight);
  }
});

canvas.addEventListener("pointerdown", (e) => {
  if (ptr.id !== null) return; /* a second finger must not hijack the drag */
  ptr.id = e.pointerId;
  ptr.cx = e.clientX;
  ptr.cy = e.clientY;
  /* seed the move baseline: without this, a touch's first pointermove
     measures from wherever the pointer was last seen and the resulting
     jump is mistaken for a drag, so taps never open a book */
  ptr.lastX = e.clientX;
  ptr.lastY = e.clientY;
  ptr.ndcX = (e.clientX / innerWidth) * 2 - 1;
  ptr.ndcY = -(e.clientY / innerHeight) * 2 + 1;
  ptr.type = e.pointerType || "mouse";
  ptr.seen = true;
  castRay();
  if (state.mode === "hero" && rayBook) {
    ptr.down = true;
    dragBook = rayBook;
    ptr.downX = e.clientX;
    ptr.downY = e.clientY;
    ptr.moved = 0;
    ptr.t0 = performance.now();
    canvas.setPointerCapture(e.pointerId);
  } else if (state.mode === "detail" && rayBook === state.selected) {
    ptr.down = true;
    orbit.drag = true;
    orbit.dxAcc = 0;
    orbit.dyAcc = 0;
    ptr.moved = 0;
    ptr.t0 = performance.now();
    canvas.setPointerCapture(e.pointerId);
  } else {
    state.kbIndex = -1;
  }
});

window.addEventListener("pointerup", (e) => {
  if (ptr.id !== null && e.pointerId !== ptr.id) return;
  ptr.id = null;
  orbit.drag = false;
  if (dragBook) {
    /* fingers wobble and press longer than a mouse click, so a tap gets a
       wider slop radius and a longer window before it counts as a drag */
    const slop = isTouch() ? 26 : 14;
    const limit = isTouch() ? 650 : 450;
    const wasDrag = ptr.moved > slop;
    dragBook.springs.drag.t = 0;
    if (
      !wasDrag &&
      state.mode === "hero" &&
      performance.now() - ptr.t0 < limit
    )
      open(dragBook); /* one tap opens, on touch as well as mouse */
    dragBook = null;
  }
  ptr.down = false;
  /* touch has no hover: drop the hit so the book does not stay lifted */
  if (isTouch()) rayBook = null;
});

/* the OS can take a gesture away (scroll, palm, call). without this the
   book would stay peeled open and the drag state would never clear */
function cancelPointer(e) {
  if (e && ptr.id !== null && e.pointerId !== ptr.id) return;
  ptr.id = null;
  ptr.down = false;
  orbit.drag = false;
  if (dragBook) {
    dragBook.springs.drag.t = 0;
    dragBook = null;
  }
  if (isTouch()) rayBook = null;
}
window.addEventListener("pointercancel", cancelPointer);
canvas.addEventListener("lostpointercapture", cancelPointer);

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") close();
  if (state.mode !== "hero") return;
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    const d = e.key === "ArrowRight" ? 1 : -1;
    state.kbIndex =
      ((state.kbIndex < 0 ? (d > 0 ? -1 : 0) : state.kbIndex) + d + books.length) %
      books.length;
    e.preventDefault();
  }
  if (e.key === "Enter" && state.hovered) open(state.hovered);
});

function castRay() {
  ray.setFromCamera({ x: ptr.ndcX, y: ptr.ndcY }, camera);
  const hits = ray.intersectObjects(hitMeshes, false);
  if (hits.length) {
    rayBook = bookByHit(hits[0].object);
    const lp = rayBook.hit.worldToLocal(hits[0].point.clone());
    rayBook.hitEdge = clamp((lp.x / 0.9) * 0.5 + 0.5, 0, 1);
  } else {
    rayBook = null;
  }
}

/* =========================================================================
   8. Frame loop
   ========================================================================= */
const clock = new THREE.Clock();
const idle = RM ? 0 : 1;

function screenPos(b) {
  b.root.getWorldPosition(tmpV).project(camera);
  b.scr.x = (tmpV.x * 0.5 + 0.5) * innerWidth;
  b.scr.y = (-tmpV.y * 0.5 + 0.5) * innerHeight;
}

const _box = new THREE.Box3();
const _corner = new THREE.Vector3();

/** 书本屏幕包围盒（供碎屑从建模轮廓溅出，而不是凭空卡片） */
function screenRect(b) {
  b.float.updateWorldMatrix(true, true);
  _box.setFromObject(b.float);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < 8; i++) {
    _corner.set(
      i & 1 ? _box.max.x : _box.min.x,
      i & 2 ? _box.max.y : _box.min.y,
      i & 4 ? _box.max.z : _box.min.z,
    );
    _corner.project(camera);
    const sx = (_corner.x * 0.5 + 0.5) * innerWidth;
    const sy = (-_corner.y * 0.5 + 0.5) * innerHeight;
    if (sx < minX) minX = sx;
    if (sx > maxX) maxX = sx;
    if (sy < minY) minY = sy;
    if (sy > maxY) maxY = sy;
  }
  b.scr.x = (minX + maxX) * 0.5;
  b.scr.y = (minY + maxY) * 0.5;
  b.scrRect.cx = b.scr.x;
  b.scrRect.cy = b.scr.y;
  b.scrRect.w = Math.max(40, maxX - minX);
  b.scrRect.h = Math.max(56, maxY - minY);
}

function applyBookDissolve(b, t) {
  if (!b?.dissolveU) return;
  setDissolveProgress(b.dissolveU, t);
  /* 接近消失时关掉投射阴影，避免「空影」 */
  const cast = t < 0.92;
  if (b.frontMesh) b.frontMesh.castShadow = cast;
  if (b.spine) b.spine.castShadow = cast;
  if (b.block) b.block.castShadow = cast;
}

function resetBookDissolve(b) {
  applyBookDissolve(b, 0);
}

/** 转场前同步当前主题下的封面 URL 与溶解边缘色 */
function syncBookDissolveForTransition(book) {
  if (!book?.cfg) return;
  const themeId = document.documentElement.getAttribute('data-theme') || 'default';
  const themed = themeBookBoards(book.cfg.id, themeId);
  Object.assign(book.cfg, themed);
  book.cfg.coverURL = coverUrlForTheme(themeId, book.cfg.id);
  if (book.dissolveU?.uDissolveColor) {
    book.dissolveU.uDissolveColor.value.set(book.cfg.edge || '#6ee7b7');
  }
}

function tickBook(b, dt, t) {
  const s = b.springs;
  const isHov = state.hovered === b;
    const inDetail = state.mode === "detail" && state.selected === b;
    /* opening/closing 也要跑回转（与位移并行）；进教室/退场另有动画 */
    const orbitActive =
      state.selected === b &&
      state.mode !== "hero" &&
      state.mode !== "entering" &&
      state.mode !== "returning";

  /* --- orbit: drag to tumble, flick to spin, settle facing front --- */
  let activity = 0;
  if (orbitActive) {
    if (orbit.drag && inDetail) {
      const step = orbit.dxAcc * 6.5;
      orbit.dxAcc = 0;
      b.orbY += step;
      b.orbYv = clamp(
        b.orbYv * 0.5 + (step / Math.max(dt, 0.001)) * 0.5,
        -14,
        14,
      );
      b.orbXs.t = clamp(b.orbXs.t + orbit.dyAcc * 3.2, -0.55, 0.55);
      orbit.dyAcc = 0;
      b.orbPhase = "drag";
    } else {
      b.orbXs.t = 0;
      if (b.orbPhase === "drag") {
        if (Math.abs(b.orbYv) > 0.6) {
          b.orbPhase = "spin";
        } else {
          b.orbPhase = "return";
          b.orbTarget =
            Math.round((b.orbY + b.orbYv * 1.2) / Math.PI) * Math.PI;
        }
      }
      if (b.orbPhase === "spin") {
        b.orbYv *= Math.exp(-0.9 * dt);
        b.orbY += b.orbYv * dt;
        if (Math.abs(b.orbYv) < 0.5) {
          b.orbPhase = "return";
          b.orbTarget =
            Math.round((b.orbY + b.orbYv * 1.2) / Math.PI) * Math.PI;
        }
      } else if (b.orbPhase === "return") {
        const acc = 16 * (b.orbTarget - b.orbY) - 8 * b.orbYv;
        b.orbYv += acc * dt;
        b.orbY += b.orbYv * dt;
        if (
          Math.abs(b.orbTarget - b.orbY) < 0.002 &&
          Math.abs(b.orbYv) < 0.01
        ) {
          b.orbY = b.orbTarget;
          b.orbYv = 0;
          b.orbPhase = "idle";
        }
      }
    }
    const distRest = Math.abs(
      b.orbY - Math.round(b.orbY / 6.2832) * 6.2832,
    );
    activity = clamp(
      Math.abs(b.orbYv) * 1.5 + (orbit.drag ? 1 : 0) + distRest * 2,
      0,
      1,
    );
  }
  b.orbXs.update(dt);

  /* --- targets --- */
  let coverBase = 0;
  if (inDetail)
    coverBase =
      0.02 +
      (0.13 + Math.sin(t * 0.8 + b.phase) * 0.015 * idle) *
        (1 - activity);
  /* cover inertia: the trailing board gets flung open by the spin.
     positive spin flings the front cover, negative spin the back cover */
  const fan = orbitActive ? clamp(b.orbYv * 0.16, 0, 0.75) : 0;
  const fanB = orbitActive ? clamp(-b.orbYv * 0.16, 0, 0.75) : 0;
  let coverBBase = 0;
  if (inDetail) {
    const nearestBack =
      Math.round((b.orbY - Math.PI) / 6.2832) * 6.2832 + Math.PI;
    const activityB = clamp(
      Math.abs(b.orbYv) * 1.5 +
        (orbit.drag ? 1 : 0) +
        Math.abs(b.orbY - nearestBack) * 2,
      0,
      1,
    );
    coverBBase =
      (0.1 + Math.sin(t * 0.8 + b.phase + 1.7) * 0.012 * idle) *
      (1 - activityB);
  }

  if (isHov && ptr.seen && state.mode === "hero") {
    const dxN = (ptr.cx - b.scr.x) / (innerWidth * 0.25);
    const dyN = (b.scr.y - ptr.cy) / (innerHeight * 0.3);
    s.tiltY.t = clamp(dxN * 0.28, -0.15, 0.15);
    s.tiltX.t = clamp(-dyN * 0.1, -0.09, 0.1);
    s.lift.t = 0.3;
    const edge = b.hitEdge != null ? b.hitEdge : 0.5;
    coverBase = 0.085 + edge * 0.16 + clamp(dyN, 0, 1) * 0.09;
  } else {
    s.tiltY.t = 0;
    s.tiltX.t = 0;
    s.lift.t = 0;
  }
  if (
    (state.mode === "entering" || state.mode === "returning") &&
    state.selected === b
  ) {
    /* 溶解转场期间保持合上，只留极轻抬起 */
    s.cover.t = 0;
    s.coverB.t = 0;
    s.drag.t = 0;
    s.lift.t = 0.06;
  } else {
    s.cover.t = coverBase + fan;
    s.coverB.t = coverBBase + fanB;
  }
  s.sc.t = b.slotScale * (isHov && state.mode === "hero" ? 1.09 : 1);

  s.px.update(dt);
  if (b.exit) stepY(b, dt);
  else s.py.update(dt);
  s.pz.update(dt);
  s.rx.update(dt);
  s.ry.update(dt);
  s.rz.update(dt);
  s.sc.update(dt);
  s.tiltX.update(dt);
  s.tiltY.update(dt);
  s.lift.update(dt);
  s.cover.update(dt);
  s.coverB.update(dt);
  s.drag.update(dt);

  b.float.position.y = Math.sin(t * 0.7 + b.phase) * 0.035 * idle;
  b.float.rotation.z = Math.sin(t * 0.9 + b.phase * 1.7) * 0.006 * idle;

  b.root.position.set(s.px.v, s.py.v, s.pz.v + s.lift.v);
  const sway = inDetail
    ? Math.sin(t * 0.45 + b.phase) * 0.035 * idle * (1 - activity)
    : 0;
  const swing = clamp(-s.px.vel * 0.12, -0.5, 0.5);
  b.root.rotation.set(
    s.rx.v + s.tiltX.v + b.orbXs.v,
    s.ry.v + s.tiltY.v + b.orbY + sway + swing,
    s.rz.v,
  );
  b.root.scale.setScalar(Math.max(s.sc.v, 0.001));

  const ang = Math.max(0, s.cover.v + s.drag.v);
  const angB = Math.max(0, s.coverB.v);
  b.pivot.rotation.y = -ang;
  b.pivot.position.z = PIVOT_Z + ang * 0.022;
  b.backPivot.rotation.y = angB;
  b.backPivot.position.z = BPIVOT_Z - angB * 0.022;
  b.spine.rotation.y = -ang * 0.16 + angB * 0.16;
  b.block.scale.z = 1 - (ang + angB) * 0.05;
  b.block.position.z = BLOCK_Z - ang * 0.006 + angB * 0.006;
  for (let i = 0; i < PAGE_N; i++) {
    const openAmt = ang * b.pageF[i];
    const fl =
      openAmt > 0.03
        ? idle *
          Math.sin(t * 1.15 + b.phase + i * 0.6) *
          0.006 *
          (1 - i / PAGE_N)
        : 0;
    b.pages[i].rotation.y = -(openAmt + Math.max(0, fl));
    /* 封面合上时隐藏散页，避免与封面 z-fight 出白毛边 */
    b.pages[i].visible = ang > 0.035;
  }
  for (let i = 0; i < 6; i++) {
    b.pagesB[i].rotation.y = angB * b.pageFB[i];
    b.pagesB[i].visible = angB > 0.035;
  }

  /* --- 悬停 / 选中：只做极轻 clearcoat 锐化，不抬 env/emissive
     （env 加大会把 studio 雾色反射到封面上，看起来像蒙尘） */
  const focusT =
    state.mode === "entering" || state.mode === "returning"
      ? 0
      : isHov
        ? 1
        : inDetail || (state.selected === b && state.mode === "opening")
          ? 0.55
          : 0;
  b.glowAmt += (focusT - b.glowAmt) * Math.min(1, dt * 7);
  const g = b.glowAmt;
  const fb = b.feelBase;
  const mats = b.mats;
  if (fb && mats?.mFront) {
    mats.mFront.clearcoat = fb.frontCC + g * 0.05;
    mats.mFront.clearcoatRoughness = Math.max(0.05, fb.frontCCR - g * 0.02);
    /* 保持基准 env / roughness，避免蒙尘感 */
    mats.mFront.envMapIntensity = fb.frontEnv;
    mats.mFront.roughness = fb.frontRough;
    if (mats.mFront.emissive) {
      mats.mFront.emissive.setHex(0x000000);
      mats.mFront.emissiveIntensity = 0;
    }
    if (mats.mEdgeDark) {
      mats.mEdgeDark.envMapIntensity = fb.edgeEnv;
      mats.mEdgeDark.clearcoat = (fb.edgeCC ?? 0.2) + g * 0.04;
    }
    if (mats.mSpine) {
      mats.mSpine.envMapIntensity = fb.spineEnv;
      mats.mSpine.clearcoat = fb.spineCC + g * 0.03;
    }
  }

  /* --- 落影跟抬起：落地实、抬起散且更淡（适配亮教室） --- */
  if (b.blob && b.blobBase && b.blobMat) {
    const liftN = clamp(s.lift.v / 0.3, 0, 1.15);
    const detailSoft = inDetail ? 0.22 : 0;
    const k = clamp(liftN + detailSoft + g * 0.1, 0, 1.35);
    const bb = b.blobBase;
    b.blob.scale.set(bb.sx * (1 + k * 0.5), bb.sy * (1 + k * 0.4), 1);
    b.blob.position.set(bb.x, bb.y - k * 0.08, bb.z - k * 0.06);
    b.blobMat.opacity = bb.op * (1 - k * 0.55);
    const diss = b.dissolveU?.uDissolve?.value || 0;
    if (diss > 0.02) {
      b.blobMat.opacity *= clamp(1 - diss * 1.1, 0, 1);
    }
  }
}

function animate() {
  raf = requestAnimationFrame(animate);
  if (!running) return;
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  /* hover resolution */
  if (ptr.seen && (ptr.type === "mouse" || ptr.down)) castRay();
  let hov = null;
  if (state.mode === "hero") {
    hov = rayBook || (state.kbIndex >= 0 ? books[state.kbIndex] : null);
  } else if (state.mode === "detail") {
    hov = rayBook === state.selected ? rayBook : null;
  }
  state.hovered = hov;
  let cur = "default";
  if (state.mode === "hero" && hov) cur = "pointer";
  else if (state.mode === "detail" && state.selected) {
    if (orbit.drag) cur = "grabbing";
    else if (rayBook === state.selected) cur = "grab";
  }
  canvas.style.cursor = cur;

  books.forEach((b) => screenPos(b));
  books.forEach((b) => tickBook(b, dt, t));
  leaves.update(dt, t);

  /* scene parallax */
  parX.t = RM ? 0 : ptr.ndcX * 0.02;
  parY.t = RM ? 0 : -ptr.ndcY * 0.012;
  bookRoot.rotation.y = parX.update(dt);
  bookRoot.rotation.x = parY.update(dt);

  /* camera */
  camera.position.set(camX.update(dt), camY.update(dt), camZ.update(dt));
  camera.lookAt(lookX.update(dt), lookY.update(dt), 0);

  renderer.render(scene, camera);
}

/* =========================================================================
   9. Entrance + resize
   ========================================================================= */
computeSlots();
books.forEach((b, i) => {
  const slot = SLOTS.hero[i];
  if (!slot) {
    console.warn("Bookshelf: missing hero slot for book", i, b?.cfg?.id);
    return;
  }
  const s = b.springs;
  /* 先落到槽位附近，再轻微上浮入场 —— 避免 spring 目标未设时书永久在屏外 */
  const enterY = slot.p[1] - (RM ? 0 : 1.15);
  s.px.set(slot.p[0]);
  s.py.set(enterY);
  s.pz.set(slot.p[2]);
  s.rx.set(slot.r[0]);
  s.ry.set(slot.r[1]);
  s.rz.set(slot.r[2] + 0.35 * (i === 1 ? -1 : Math.sign(slot.p[0] || 1)));
  s.sc.set(slot.s * 0.92);
  b.slotScale = slot.s;
  b.root.visible = true;
  b.root.position.set(slot.p[0], enterY, slot.p[2]);
  b.root.scale.setScalar(Math.max(slot.s * 0.92, 0.001));
  /* 立即设目标；再 staggered 微调，保证首帧后就会往槽位靠 */
  setTargets(b, slot);
  if (!RM) {
    later(() => {
      if (b.springs) setTargets(b, SLOTS.hero[i] || slot);
    }, 80 + i * 90);
  }
});
camTo("hero");

function relayout() {
  const w = viewW(), h = viewH();
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  computeSlots();
  applyMode();
  camTo(
    state.mode === "entering" ||
      state.mode === "returning" ||
      state.mode === "detail" ||
      state.mode === "opening"
      ? "detail"
      : "hero",
  );
}

window.addEventListener("resize", relayout);
/* phones: rotation reports stale dimensions for a beat, and the address bar
   collapsing changes the height without always firing a window resize */
window.addEventListener("orientationchange", () => {
  relayout();
  setTimeout(relayout, 250);
});
if (window.visualViewport)
  window.visualViewport.addEventListener("resize", relayout);

animate();

  window.addEventListener("chem-theme-change", syncTheme);

  return {
    show() {
      running = true;
      resetToHero();
      if (!raf) animate();
      relayout();
    },
    hide() {
      clearOpenTimers();
      // keep page FX running if mid-enter / return; cancel only when idle
      if (state.mode !== "entering" && state.mode !== "returning") enterFx?.cancel();
      running = false;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      document.body.classList.remove("transit", "detail-open", "bookshelf-entering", "bookshelf-dive-deep");
    },
    dispose() {
      window.removeEventListener("chem-theme-change", syncTheme);
      transitionSeq += 1;
      enterFx?.cancel();
      leaves.dispose();
      this.hide();
      window.removeEventListener("resize", relayout);
      try {
        renderer.dispose();
      } catch (_) {}
    },
    relayout,
    syncTheme,
    playReturnFromLab,
    /** @returns {number} */
    transitionId: () => transitionSeq,
  };
}
