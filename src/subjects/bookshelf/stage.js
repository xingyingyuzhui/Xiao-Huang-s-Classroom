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
  });
} catch (e) {
  console.error("WebGL unavailable for subject bookshelf", e);
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewW(), viewH(), false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
/* held just under 1 so cover art keeps its printed saturation instead of
   being rolled off toward white by the filmic curve */
renderer.toneMappingExposure = 0.95;
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

/* studio environment: painted equirect, prefiltered */
function envBlob(x, cx, cy, r, rgb, a) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, "rgba(" + rgb + "," + a + ")");
  g.addColorStop(1, "rgba(" + rgb + ",0)");
  x.fillStyle = g;
  x.beginPath();
  x.arc(cx, cy, r, 0, 6.2832);
  x.fill();
}
(function buildEnv() {
  const c = mkCanvas(512, 256),
    x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#5a6ba6");
  g.addColorStop(0.55, "#262e52");
  g.addColorStop(1, "#0a0d1d");
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 256);
  envBlob(x, 140, 66, 95, "255,255,255", 0.95); // key
  envBlob(x, 405, 84, 55, "255,214,168", 0.55); // warm kicker
  envBlob(x, 256, 150, 120, "255,155,185", 0.28); // pink wash
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(tex).texture;
  tex.dispose();
  pmrem.dispose();
})();

/* 灯光贴近原版 books：主光 + 补光 + 轮廓光 + 左上工作室斜光 + 中心柔光 */
const hemi = new THREE.HemisphereLight(0x8fa0d8, 0x0d1024, 0.38);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 1.12);
key.position.set(3.5, 5.2, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -4.5;
key.shadow.camera.right = 4.5;
key.shadow.camera.top = 4.5;
key.shadow.camera.bottom = -4.5;
key.shadow.camera.near = 1;
key.shadow.camera.far = 22;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key);
const fill = new THREE.DirectionalLight(0xa9b6ff, 0.28);
fill.position.set(-4, 1.2, 4);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xff9db8, 0.42);
rim.position.set(-2.2, 3.2, -5);
scene.add(rim);
/* 左上斜切：原版封面那道亮带的方向 */
const studio = new THREE.DirectionalLight(0xfff3e4, 0.82);
studio.position.set(-4.2, 6.8, 5.2);
scene.add(studio);
/* 中心柔光：原版背后那圈淡粉暖光 */
const glow = new THREE.PointLight(0xffb6c8, 0.62, 16, 2);
glow.position.set(0, 0.15, -0.85);
scene.add(glow);

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

function striationTexture(vertical) {
  const s = 512,
    c = mkCanvas(s, s),
    x = c.getContext("2d");
  x.fillStyle = "#ece4d2";
  x.fillRect(0, 0, s, s);
  let p = 0;
  while (p < s) {
    const w = 1 + Math.random() * 2.4,
      tone = Math.random();
    x.fillStyle =
      tone < 0.12
        ? "rgba(140,125,95,.5)"
        : tone < 0.5
          ? "rgba(255,255,252,.55)"
          : "rgba(190,178,150,.45)";
    if (vertical) x.fillRect(p, 0, w, s);
    else x.fillRect(0, p, s, w);
    p += w + 0.6 + Math.random() * 1.6;
  }
  for (let i = 0; i < 2600; i++) {
    x.fillStyle =
      "rgba(120,108,84," + (Math.random() * 0.1).toFixed(3) + ")";
    x.fillRect(Math.random() * s, Math.random() * s, 1.2, 1.2);
  }
  return tex(c);
}
const striV = striationTexture(true); // fore edge (±x faces)
const striH = striationTexture(false); // top and bottom (±y faces)

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
  CT = 0.03,
  OV = 0.045;
const PAGE_N = 10,
  PW = W - 0.02,
  PH = H - 0.02;
const BLOCK_D = 0.22,
  BLOCK_Z = -0.018,
  PIVOT_Z = T / 2 + CT / 2,
  BPIVOT_Z = -(T / 2 + CT / 2);

const coverGeo = new THREE.BoxGeometry(W + OV, H + OV * 2, CT);
const blockGeo = new THREE.BoxGeometry(W - 0.015, H, BLOCK_D);
const pageGeo = new THREE.PlaneGeometry(PW, PH);
const spineGeo = new THREE.BoxGeometry(
  0.03,
  H + OV * 2,
  T + CT * 2 + 0.008,
);
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
  color: 0xf2ecdd,
  roughness: 0.95,
  envMapIntensity: 0.2,
});
const striMatV = std({
  map: striV,
  bumpMap: striV,
  bumpScale: 0.0025,
  roughness: 0.95,
  envMapIntensity: 0.2,
});
const striMatH = std({
  map: striH,
  bumpMap: striH,
  bumpScale: 0.0025,
  roughness: 0.95,
  envMapIntensity: 0.2,
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

  /* printed boards: matte enough that the environment reads as a soft sheen
     rather than a wash over the artwork */
  const mEdge = phys({
    color: cfg.edge,
    bumpMap: laminateBump,
    bumpScale: 0.0055,
    roughness: 0.48,
    metalness: 0.06,
    clearcoat: 0.35,
    clearcoatRoughness: 0.35,
    envMapIntensity: 0.55,
  });
  const mFront = phys({
    map: frontTex,
    bumpMap: laminateBump,
    bumpScale: 0.0055,
    roughness: 0.24,
    metalness: 0.05,
    clearcoat: 0.88,
    clearcoatRoughness: 0.1,
    envMapIntensity: 0.92,
  });
  const mBack = phys({
    map: backTex,
    bumpMap: laminateBump,
    bumpScale: 0.0048,
    roughness: 0.34,
    clearcoat: 0.55,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.62,
  });
  const mSpine = std({
    map: spineTex,
    bumpMap: clothBump,
    bumpScale: 0.01,
    roughness: 0.55,
    envMapIntensity: 0.48,
  });

  /* optional printed cover art + 烘焙工作室斜光（再提亮高光带） */
  function paintStudioGrade(ctx, w, h) {
    ctx.save();
    const shade = ctx.createLinearGradient(0, 0, w * 0.95, h);
    shade.addColorStop(0, "rgba(255,255,255,0)");
    shade.addColorStop(0.42, "rgba(255,255,255,0)");
    shade.addColorStop(1, "rgba(10,14,32,0.18)");
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);

    const shaft = ctx.createLinearGradient(w * 0.02, 0, w * 0.92, h * 0.98);
    shaft.addColorStop(0, "rgba(255,252,245,0)");
    shaft.addColorStop(0.26, "rgba(255,250,240,0.58)");
    shaft.addColorStop(0.36, "rgba(255,252,248,0.82)");
    shaft.addColorStop(0.46, "rgba(255,248,235,0.38)");
    shaft.addColorStop(0.68, "rgba(0,0,0,0)");
    shaft.addColorStop(1, "rgba(0,0,0,0.12)");
    ctx.globalCompositeOperation = "soft-light";
    ctx.fillStyle = shaft;
    ctx.fillRect(0, 0, w, h);

    const hard = ctx.createLinearGradient(w * 0.08, h * 0.02, w * 0.78, h * 0.72);
    hard.addColorStop(0, "rgba(255,255,255,0)");
    hard.addColorStop(0.34, "rgba(255,255,255,0)");
    hard.addColorStop(0.4, "rgba(255,255,255,0.38)");
    hard.addColorStop(0.48, "rgba(255,255,255,0.16)");
    hard.addColorStop(0.58, "rgba(0,0,0,0.08)");
    hard.addColorStop(1, "rgba(0,0,0,0.14)");
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = hard;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function applyCoverMap(url) {
    cfg.coverURL = url || null;
    if (!url) {
      mFront.map = frontTex;
      mFront.needsUpdate = true;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = mkCanvas(1024, 1536);
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0, 1024, 1536);
      paintStudioGrade(x, 1024, 1536);
      const graded = tex(c);
      mFront.map = graded;
      mFront.needsUpdate = true;
    };
    img.onerror = () =>
      console.warn("Cover load failed, procedural kept:", cfg.title);
    img.src = url;
  }
  if (cfg.coverURL) applyCoverMap(cfg.coverURL);

  /* 每本书独立溶解 uniforms（不共享材质程序状态） */
  const dissolveU = createDissolveUniforms(THREE, cfg.edge || 0x6ee7b7);
  attachDissolveAll([mFront, mBack, mEdge, mSpine], dissolveU);

  /* 书芯用克隆材质，才能跟封面一起溶解，不影响其它书 */
  const mBlock = [
    striMatV.clone(),
    paperFlat.clone(),
    striMatH.clone(),
    striMatH.clone(),
    paperFlat.clone(),
    paperFlat.clone(),
  ];
  const mEndF = endpaperMat.clone();
  const mEndB = endpaperMat.clone();
  attachDissolveAll([...mBlock, mEndF, mEndB], dissolveU);

  /* back cover, hinged at the spine, opens away from the block */
  const backPivot = new THREE.Group();
  backPivot.position.set(-W / 2, 0, BPIVOT_Z);
  const backMesh = new THREE.Mesh(coverGeo, [
    mEdge,
    mEdge,
    mEdge,
    mEdge,
    mEndB,
    mBack,
  ]);
  backMesh.position.x = (W + OV) / 2;
  backMesh.castShadow = backMesh.receiveShadow = true;
  backPivot.add(backMesh);
  float.add(backPivot);

  /* front cover, hinged at the spine */
  const pivot = new THREE.Group();
  pivot.position.set(-W / 2, 0, PIVOT_Z);
  const frontMesh = new THREE.Mesh(coverGeo, [
    mEdge,
    mEdge,
    mEdge,
    mEdge,
    mFront,
    mEndF,
  ]);
  frontMesh.position.x = (W + OV) / 2;
  frontMesh.castShadow = frontMesh.receiveShadow = true;
  pivot.add(frontMesh);
  float.add(pivot);

  /* cloth spine */
  const spine = new THREE.Mesh(spineGeo, mSpine);
  spine.position.set(-W / 2 - 0.016, 0, 0);
  spine.castShadow = true;
  float.add(spine);

  /* page block with striated edges */
  const block = new THREE.Mesh(blockGeo, mBlock);
  block.position.set(-0.0075, 0, BLOCK_Z);
  block.castShadow = block.receiveShadow = true;
  float.add(block);

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

  /* soft blob shadow against the background */
  const blob = new THREE.Mesh(
    blobGeo,
    new THREE.MeshBasicMaterial({
      map: blobTex,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
  );
  blob.scale.set(3.35, 4.15, 1);
  blob.position.set(0.12, -0.38, -0.92);
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
      const themed = themeBookBoards(cfg.id);
      Object.assign(cfg, themed);
      const themeId =
        document.documentElement.getAttribute("data-theme") || "default";
      const artUrl = coverUrlForTheme(themeId, cfg.id);
      cfg.front(fc.getContext("2d"), 1024, 1536);
      paintBack(bc.getContext("2d"), 1024, 1536, cfg);
      paintSpine(sc.getContext("2d"), 220, 1536, cfg);
      frontTex.needsUpdate = true;
      backTex.needsUpdate = true;
      spineTex.needsUpdate = true;
      mEdge.color.set(cfg.edge);
      mEdge.needsUpdate = true;
      if (dissolveU?.uDissolveColor) {
        dissolveU.uDissolveColor.value.set(cfg.edge || 0x6ee7b7);
      }
      applyCoverMap(artUrl);
    },
  };
  books.push(b);
  return b;
}
BOOKS.forEach(buildBook);
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
    dpModules.textContent = cfg.status === "ready" ? "互动教室" : "规划中";
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
    if (enterFx) {
      enterFx.playEnter({
        id: tid,
        origin,
        bookRect,
        subjectName: book.cfg.title || book.cfg.name || "化学",
        subjectId: book.cfg.id || "chemistry",
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
    enterFx.playExit({
      id: tid,
      subjectName,
      subjectId,
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
  books.forEach((b) => b.repaint?.());
  const theme = document.documentElement.getAttribute("data-theme") || "default";
  const packs = {
    default: { hemi: 0x7aa2e8, fill: 0x93c5fd, rim: 0x3b82f6, keyI: 1.15, studioI: 0.86, glowI: 0.62 },
    stationery: { hemi: 0xd6b48e, fill: 0xfff6e8, rim: 0xc23b22, keyI: 1.08, studioI: 0.78, glowI: 0.55 },
    reagent: { hemi: 0xc9b896, fill: 0xfffcf7, rim: 0xb45309, keyI: 1.1, studioI: 0.8, glowI: 0.55 },
    blackboard: { hemi: 0x6aa898, fill: 0xf0d060, rim: 0x7ec8c0, keyI: 1.0, studioI: 0.72, glowI: 0.48 },
    pixel: { hemi: 0x636e72, fill: 0xff6b81, rim: 0x1dd1a1, keyI: 1.2, studioI: 0.9, glowI: 0.68 },
  };
  const p = packs[theme] || packs.default;
  hemi.color.setHex(p.hemi);
  fill.color.setHex(p.fill);
  rim.color.setHex(p.rim);
  key.intensity = p.keyI;
  studio.intensity = p.studioI;
  glow.intensity = p.glowI;
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
  const s = b.springs;
  s.px.set(slot.p[0]);
  s.py.set(slot.p[1] - 3.9);
  s.pz.set(slot.p[2]);
  s.rx.set(slot.r[0]);
  s.ry.set(slot.r[1]);
  s.rz.set(slot.r[2] + 0.35 * (i === 1 ? -1 : Math.sign(slot.p[0])));
  s.sc.set(slot.s);
  b.slotScale = slot.s;
  setTimeout(() => setTargets(b, slot), 240 + i * 150);
});
camTo("hero");

let running = true;
let raf = 0;

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
