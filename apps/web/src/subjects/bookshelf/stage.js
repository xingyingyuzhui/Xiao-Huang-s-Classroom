/**
 * Bookshelf subject stage — orchestrator.
 * Adapted from https://books-sigma-ashen.vercel.app/
 *
 * Geometry / materials / motion / theme live in sibling modules; this file
 * owns the WebGL scene, input, mode state machine, and public API.
 */
import * as THREE from 'three';
import { themeBookBoards } from './covers.js';
import { createEnterPageFx } from './enter-fx.js';
import { createDetailFloaters } from './floaters.js';
import { setDissolveProgress } from './dissolve.js';
import { Spring, clamp } from './spring.js';
import { coverUrlForTheme } from './cover-urls.js';
import {
  themeBookFeel,
  applyThemeLights as applyThemeLightsTable,
} from './theme-feel.js';
import { createClassroomEnvBuilder } from './classroom-env.js';
import {
  PAGE_N,
  BLOCK_Z,
  PIVOT_Z,
  BPIVOT_Z,
  createBookGeometries,
} from './book-geometry.js';
import { mkCanvas, createSharedBookTextures } from './book-textures.js';
import { createBuildBook, mapSubjectsToBooks } from './build-book.js';
import { computeSlots as computeSlotsLayout } from './slots.js';
import {
  CLEAR,
  setTargets,
  stepY,
  sendOut,
  bringBack,
} from './motion.js';

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
     0. Renderer, scene, camera, lights
     ========================================================================= */
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
    console.error('WebGL unavailable for subject bookshelf', e);
    throw e;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(viewW(), viewH(), false);
  /* 透明清屏：让 CSS 主题教室背景从 canvas 下透出 */
  renderer.setClearColor(0x000000, 0);
  renderer.setClearAlpha(0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
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

  const pmremGen = new THREE.PMREMGenerator(renderer);
  const { buildClassroomEnv } = createClassroomEnvBuilder({
    THREE,
    scene,
    pmremGen,
    mkCanvas,
  });

  const hemi = new THREE.HemisphereLight(0xd8e6f8, 0xc8c0b4, 0.55);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfffdf8, 1.55);
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
  const fill = new THREE.DirectionalLight(0xe8f0fc, 0.52);
  fill.position.set(-4.5, 2.8, 4.5);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xc8dcf0, 0.36);
  rim.position.set(-1.5, 2.8, -5.5);
  scene.add(rim);
  const studio = new THREE.DirectionalLight(0xfff8ee, 0.55);
  studio.position.set(-1.0, 7.5, 3.5);
  scene.add(studio);
  const glow = new THREE.PointLight(0xfff0e0, 0.28, 12, 2);
  glow.position.set(0.2, 0.35, 2.4);
  scene.add(glow);

  const lights = { hemi, key, fill, rim, studio, glow };

  function activeThemeId() {
    return document.documentElement.getAttribute('data-theme') || 'default';
  }

  function applyThemeLights(feel, themeId) {
    applyThemeLightsTable(feel, lights, renderer, buildClassroomEnv, themeId || activeThemeId());
  }

  try {
    buildClassroomEnv(activeThemeId());
  } catch (err) {
    console.warn('Initial classroom env failed', err);
  }

  const bookRoot = new THREE.Group();
  scene.add(bookRoot);

  /* =========================================================================
     1. Shared assets + books
     ========================================================================= */
  const geo = createBookGeometries(THREE);
  const tex = createSharedBookTextures(THREE, ANISO);
  const BOOKS = mapSubjectsToBooks(subjects, coverUrlForTheme);
  const books = [];
  const hitMeshes = [];
  const buildBook = createBuildBook({
    THREE,
    bookRoot,
    geo,
    tex,
    activeThemeId,
    books,
    hitMeshes,
  });

  try {
    BOOKS.forEach(buildBook);
  } catch (err) {
    console.error('buildBook failed', err);
  }
  try {
    const tid = activeThemeId();
    applyThemeLights(themeBookFeel(tid), tid);
  } catch (err) {
    console.warn('applyThemeLights failed', err);
  }
  if (!books.length) {
    console.error('Bookshelf: no books built — check subjects / buildBook errors');
  }
  const bookByHit = (m) => books.find((b) => b.hit === m);

  /* =========================================================================
     2. Detail floaters
     ========================================================================= */
  const leaves = createDetailFloaters({
    THREE,
    bookRoot,
    std: tex.std,
    Spring,
    getCamera: () => camera,
    reducedMotion: RM,
  });

  /* =========================================================================
     3. Layout slots + state machine
     ========================================================================= */
  const state = {
    mode: 'hero',
    selected: null,
    hovered: null,
    kbIndex: -1,
  };
  const SLOTS = { hero: [], detail: null, portrait: false };

  function computeSlots() {
    computeSlotsLayout({
      viewW: viewW(),
      viewH: viewH(),
      bookRoot,
      bookCount: BOOKS.length,
      detailEl: detail,
      SLOTS,
    });
  }

  function applyMode() {
    if (state.mode === 'hero' || state.mode === 'closing') {
      books.forEach((b, i) => setTargets(b, SLOTS.hero[i]));
    } else if (state.selected) {
      setTargets(state.selected, SLOTS.detail);
    }
  }

  const camX = new Spring(0, 13, 6.5);
  const camY = new Spring(0.1, 13, 6.5);
  const camZ = new Spring(9.6, 13, 6.5);
  const lookX = new Spring(0, 13, 6.5);
  const lookY = new Spring(0, 13, 6.5);
  const parX = new Spring(0, 60, 10);
  const parY = new Spring(0, 60, 10);

  function camTo(mode) {
    if (mode === 'detail') {
      camX.t = SLOTS.portrait ? 0 : -0.4;
      camY.t = 0.1;
      camZ.t = SLOTS.portrait ? 9.9 : 8.9;
      lookX.t = SLOTS.portrait ? 0 : -0.5;
      lookY.t = SLOTS.portrait ? 0 : 0.15;
    } else if (mode === 'portal') {
      camX.t = 0;
      camY.t = 0.08;
      camZ.t = RM ? 7.4 : 6.8;
      lookX.t = 0;
      lookY.t = 0.08;
    } else if (mode === 'dive') {
      camX.t = 0.15;
      camY.t = 0.05;
      camZ.t = RM ? 3.2 : 2.35;
      lookX.t = -0.05;
      lookY.t = 0.02;
    } else {
      camX.t = 0;
      camY.t = 0.22;
      camZ.t = 9.75;
      lookX.t = 0;
      lookY.t = -0.12;
    }
  }

  function populatePanel(cfg) {
    if (dpTitle) dpTitle.textContent = cfg.title;
    if (dpEn) dpEn.textContent = cfg.en || '';
    if (dpDesc) dpDesc.textContent = cfg.blurb || cfg.desc || '';
    if (dpStatus) {
      dpStatus.textContent = cfg.status === 'ready' ? '开放' : '即将推出';
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
    if (dpTagline) dpTagline.textContent = cfg.desc || '';
    if (enterBtn) {
      const ready = cfg.status === 'ready';
      enterBtn.hidden = !ready;
      enterBtn.disabled = !ready;
    }
    if (lockNote) lockNote.hidden = cfg.status === 'ready';
  }

  /** 点书：一律进简介详情（对齐原版 books），不直接进教室 */
  function open(book) {
    if (state.mode !== 'hero' || !book) return;
    clearOpenTimers();
    transitionSeq += 1;
    enterFx?.cancel();
    state.mode = 'opening';
    state.selected = book;
    state.kbIndex = -1;
    book.exit = null;
    document.body.classList.add('transit');
    document.body.classList.remove('detail-open', 'bookshelf-entering', 'bookshelf-dive-deep');
    populatePanel(book.cfg);
    computeSlots();

    let out = 0;
    books.forEach((b, i) => {
      if (b !== book) sendOut(b, i, out++ * 0.08, SLOTS);
    });

    later(() => {
      if (state.mode !== 'opening' && state.mode !== 'detail') return;
      book.orbY = RM ? 0 : -6.2832;
      book.orbYv = RM ? 0 : 3;
      book.orbPhase = 'return';
      book.orbTarget = 0;
      book.orbXs.set(0);
      applyMode();
      camTo('detail');
    }, RM ? 200 : 760);
    later(() => leaves.activate(book), RM ? 280 : 1000);
    later(() => {
      if (state.mode !== 'opening') return;
      document.body.classList.add('detail-open');
      state.mode = 'detail';
    }, RM ? 360 : 1400);
  }

  /**
   * 简介页「进入教室」：书保持合上，仅轻微前推 → 封面溶解接管转场。
   * 帷幕不透明后才 onEnterSubject，避免白页空镜。
   */
  function enterFromDetail() {
    const book = state.selected;
    if (!book || book.cfg.status !== 'ready') return;
    if (state.mode !== 'detail' && state.mode !== 'opening') return;
    clearOpenTimers();
    const tid = ++transitionSeq;
    leaves.deactivate();
    orbit.drag = false;
    state.mode = 'entering';
    document.body.classList.add('bookshelf-entering');
    document.body.classList.remove('detail-open', 'bookshelf-dive-deep');
    computeSlots();

    book.springs.cover.t = 0;
    book.springs.coverB.t = 0;
    book.springs.drag.t = 0;
    book.springs.tiltX.t = 0;
    book.springs.tiltY.t = 0;

    const detailSlot = SLOTS.detail || {
      p: [0, -0.2, 0.85],
      r: [-0.04, -0.32, 0.05],
      s: 1.35,
    };

    later(() => {
      if (state.mode !== 'entering' || tid !== transitionSeq) return;
      setTargets(book, {
        p: [detailSlot.p[0], detailSlot.p[1] + 0.04, detailSlot.p[2] + 0.28],
        r: detailSlot.r,
        s: detailSlot.s * 1.06,
      });
      camTo('detail');
    }, RM ? 0 : 40);

    later(() => {
      if (state.mode !== 'entering' || tid !== transitionSeq) return;
      screenRect(book);
      const origin = { x: book.scr.x, y: book.scr.y };
      const bookRect = { ...book.scrRect };
      resetBookDissolve(book);
      syncBookDissolveForTransition(book);
      if (enterFx) {
        const themeId = document.documentElement.getAttribute('data-theme') || 'default';
        enterFx.playEnter({
          id: tid,
          origin,
          bookRect,
          subjectName: book.cfg.title || book.cfg.name || '化学',
          subjectId: book.cfg.id || 'chemistry',
          themeId,
          coverURL: book.cfg.coverURL || null,
          onProgress: (t) => {
            if (state.mode !== 'entering' || tid !== transitionSeq) return;
            applyBookDissolve(book, t);
          },
          onOpaque: (id) => {
            if (id !== tid || tid !== transitionSeq || state.mode !== 'entering') return;
            onEnterSubject(book.cfg.id);
          },
          onSettled: (id) => {
            if (id !== tid || tid !== transitionSeq) return;
            document.body.classList.remove('bookshelf-dive-deep', 'bookshelf-entering');
          },
        });
      } else onEnterSubject(book.cfg.id);
    }, RM ? 60 : 160);
  }

  function close() {
    if (state.mode !== 'detail') return;
    clearOpenTimers();
    leaves.deactivate();
    orbit.drag = false;
    beginCloseToShelf(state.selected);
  }

  /**
   * 简介页 → 书架：选中书旋转一圈并移回槽位，其它书升起归位。
   * @param {object | null} b
   * @param {{ onDone?: () => void }} [closeOpts]
   */
  function beginCloseToShelf(b, closeOpts = {}) {
    if (!b) {
      closeOpts.onDone?.();
      return;
    }
    clearOpenTimers();
    state.mode = 'closing';
    state.selected = b;
    document.body.classList.remove('detail-open', 'bookshelf-entering');
    leaves.deactivate();
    orbit.drag = false;

    b.orbTarget = Math.round(b.orbY / 6.2832) * 6.2832 + 6.2832;
    b.orbYv = Math.max(b.orbYv, 3);
    b.orbPhase = 'return';
    b.orbXs.t = 0;

    later(() => {
      if (state.mode !== 'closing') return;
      document.body.classList.remove('transit');
      applyMode();
      camTo('hero');
      let back = 0;
      books.forEach((bk, i) => {
        if (bk !== b) bringBack(bk, i, 0.85 + back++ * 0.1, SLOTS);
      });
    }, 250);

    later(() => {
      if (state.mode !== 'closing') return;
      state.mode = 'hero';
      state.selected = null;
      closeOpts.onDone?.();
    }, 1600);
  }

  function resetToHero() {
    clearOpenTimers();
    transitionSeq += 1;
    enterFx?.cancel();
    document.body.classList.remove(
      'transit',
      'detail-open',
      'bookshelf-entering',
      'bookshelf-dive-deep',
    );
    leaves.deactivate();
    orbit.drag = false;
    state.mode = 'hero';
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
      b.orbPhase = 'idle';
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
    camTo('hero');
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
    const subjectId = returnOpts.subjectId || 'chemistry';
    const subjectName = returnOpts.subjectName || '化学';
    const book = books.find((b) => b.cfg.id === subjectId) || books[0];
    if (!book) {
      returnOpts.onDone?.();
      return;
    }

    running = true;
    if (!raf) animate();
    document.body.classList.add('transit', 'bookshelf-entering');
    document.body.classList.remove('detail-open', 'bookshelf-dive-deep');
    leaves.deactivate();
    orbit.drag = false;
    state.mode = 'returning';
    state.selected = book;
    state.kbIndex = -1;
    computeSlots();

    books.forEach((b, i) => {
      if (b === book) return;
      const slot = SLOTS.hero[i];
      if (!slot) return;
      b.root.visible = false;
      b.exit = null;
      b.orbY = 0;
      b.orbYv = 0;
      b.orbPhase = 'idle';
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

    const detailSlot = SLOTS.detail || {
      p: [0, -0.2, 0.85],
      r: [-0.04, -0.32, 0.05],
      s: 1.35,
    };
    book.root.visible = true;
    book.exit = null;
    book.orbY = 0;
    book.orbYv = 0;
    book.orbPhase = 'idle';
    book.orbTarget = 0;
    book.orbXs.set(0);
    book.springs.cover.set(0);
    book.springs.coverB.set(0);
    book.springs.drag.set(0);
    book.springs.tiltX.set(0);
    book.springs.tiltY.set(0);
    book.springs.lift.set(0);
    book.slotScale = detailSlot.s;
    book.springs.px.set(detailSlot.p[0]);
    book.springs.py.set(detailSlot.p[1]);
    book.springs.pz.set(detailSlot.p[2]);
    book.springs.rx.set(detailSlot.r[0]);
    book.springs.ry.set(detailSlot.r[1]);
    book.springs.rz.set(detailSlot.r[2]);
    book.springs.sc.set(detailSlot.s);
    setTargets(book, detailSlot);
    camTo('detail');
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
      if (state.mode !== 'returning' || tid !== transitionSeq) return;
      shelfStarted = true;
      revealHubShell();
      /* 不在此 resetBookDissolve：复原尾巴由 FX onProgress 连续收完（见上） */
      document.body.classList.remove('bookshelf-entering', 'bookshelf-dive-deep');
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
          /* 归架（closing）已开始也继续收完复原尾巴，避免 cleared 时瞬跳复原 */
          if (tid !== transitionSeq) return;
          if (state.mode !== 'returning' && state.mode !== 'closing') return;
          applyBookDissolve(book, 1.05 * (1 - t));
        },
        onOpaque: (id) => {
          if (id !== tid || tid !== transitionSeq) return;
          revealHubShell();
        },
        /* 帷幕一离开前景（约 1.0s）就并联启动归架，不等 FX 全清（1.5s） */
        onCleared: (id) => {
          if (state.mode !== 'returning' || tid !== transitionSeq) return;
          if (id !== tid) return;
          startShelfReturn();
        },
        onSettled: (id) => {
          if (id !== tid || tid !== transitionSeq) return;
          startShelfReturn();
        },
        onDone: startShelfReturn,
      });
      later(() => {
        if (tid !== transitionSeq || state.mode !== 'returning') return;
        /* FX 停摆保险：强制复原后再归架，避免半蚀刻状态卡住 */
        resetBookDissolve(book);
        startShelfReturn();
      }, RM ? 600 : 1700);
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
      console.warn('syncTheme lights failed', err);
    }
    books.forEach((b) => {
      try {
        b.repaint?.();
      } catch (err) {
        console.warn('book repaint failed', b?.cfg?.id, err);
      }
    });
  }

  closeBtn.addEventListener('click', close);
  if (enterBtn) {
    enterBtn.addEventListener('click', () => {
      enterFromDetail();
    });
  }
  if (peek) {
    peek.addEventListener('click', () => {
      close();
    });
  }

  /* =========================================================================
     4. Input
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
    type: 'mouse',
    seen: false,
    id: null,
  };
  const isTouch = () => ptr.type === 'touch' || ptr.type === 'pen';
  let dragBook = null;
  let rayBook = null;
  const orbit = { drag: false, dxAcc: 0, dyAcc: 0 };
  const ray = new THREE.Raycaster();
  const tmpV = new THREE.Vector3();

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerleave', () => {
    rayBook = null;
    state.kbIndex = -1;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (ptr.id !== null && e.pointerId !== ptr.id) return;
    const dxN = (e.clientX - ptr.lastX) / innerWidth;
    const dyN = (e.clientY - ptr.lastY) / innerHeight;
    ptr.lastX = e.clientX;
    ptr.lastY = e.clientY;
    ptr.cx = e.clientX;
    ptr.cy = e.clientY;
    ptr.ndcX = (e.clientX / innerWidth) * 2 - 1;
    ptr.ndcY = -(e.clientY / innerHeight) * 2 + 1;
    ptr.type = e.pointerType || 'mouse';
    ptr.seen = true;
    if (state.mode === 'detail') leaves.nudge(dxN, dyN, ptr.ndcX, ptr.ndcY);
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

  canvas.addEventListener('pointerdown', (e) => {
    if (ptr.id !== null) return;
    ptr.id = e.pointerId;
    ptr.cx = e.clientX;
    ptr.cy = e.clientY;
    ptr.lastX = e.clientX;
    ptr.lastY = e.clientY;
    ptr.ndcX = (e.clientX / innerWidth) * 2 - 1;
    ptr.ndcY = -(e.clientY / innerHeight) * 2 + 1;
    ptr.type = e.pointerType || 'mouse';
    ptr.seen = true;
    castRay();
    if (state.mode === 'hero' && rayBook) {
      ptr.down = true;
      dragBook = rayBook;
      ptr.downX = e.clientX;
      ptr.downY = e.clientY;
      ptr.moved = 0;
      ptr.t0 = performance.now();
      canvas.setPointerCapture(e.pointerId);
    } else if (state.mode === 'detail' && rayBook === state.selected) {
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

  window.addEventListener('pointerup', (e) => {
    if (ptr.id !== null && e.pointerId !== ptr.id) return;
    ptr.id = null;
    orbit.drag = false;
    if (dragBook) {
      const slop = isTouch() ? 26 : 14;
      const limit = isTouch() ? 650 : 450;
      const wasDrag = ptr.moved > slop;
      dragBook.springs.drag.t = 0;
      if (
        !wasDrag &&
        state.mode === 'hero' &&
        performance.now() - ptr.t0 < limit
      )
        open(dragBook);
      dragBook = null;
    }
    ptr.down = false;
    if (isTouch()) rayBook = null;
  });

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
  window.addEventListener('pointercancel', cancelPointer);
  canvas.addEventListener('lostpointercapture', cancelPointer);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (state.mode !== 'hero') return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const d = e.key === 'ArrowRight' ? 1 : -1;
      state.kbIndex =
        ((state.kbIndex < 0 ? (d > 0 ? -1 : 0) : state.kbIndex) + d + books.length) %
        books.length;
      e.preventDefault();
    }
    if (e.key === 'Enter' && state.hovered) open(state.hovered);
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
     5. Frame loop
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
    const inDetail = state.mode === 'detail' && state.selected === b;
    const orbitActive =
      state.selected === b &&
      state.mode !== 'hero' &&
      state.mode !== 'entering' &&
      state.mode !== 'returning';

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
        b.orbPhase = 'drag';
      } else {
        b.orbXs.t = 0;
        if (b.orbPhase === 'drag') {
          if (Math.abs(b.orbYv) > 0.6) {
            b.orbPhase = 'spin';
          } else {
            b.orbPhase = 'return';
            b.orbTarget =
              Math.round((b.orbY + b.orbYv * 1.2) / Math.PI) * Math.PI;
          }
        }
        if (b.orbPhase === 'spin') {
          b.orbYv *= Math.exp(-0.9 * dt);
          b.orbY += b.orbYv * dt;
          if (Math.abs(b.orbYv) < 0.5) {
            b.orbPhase = 'return';
            b.orbTarget =
              Math.round((b.orbY + b.orbYv * 1.2) / Math.PI) * Math.PI;
          }
        } else if (b.orbPhase === 'return') {
          const acc = 16 * (b.orbTarget - b.orbY) - 8 * b.orbYv;
          b.orbYv += acc * dt;
          b.orbY += b.orbYv * dt;
          if (
            Math.abs(b.orbTarget - b.orbY) < 0.002 &&
            Math.abs(b.orbYv) < 0.01
          ) {
            b.orbY = b.orbTarget;
            b.orbYv = 0;
            b.orbPhase = 'idle';
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

    let coverBase = 0;
    if (inDetail)
      coverBase =
        (0.16 + Math.sin(t * 0.7 + b.phase) * 0.02 * idle) * (1 - activity * 0.55);
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

    if (isHov && ptr.seen && state.mode === 'hero') {
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
      (state.mode === 'entering' || state.mode === 'returning') &&
      state.selected === b
    ) {
      s.cover.t = 0;
      s.coverB.t = 0;
      s.drag.t = 0;
      s.lift.t = 0.06;
    } else {
      s.cover.t = coverBase + fan;
      s.coverB.t = coverBBase + fanB;
    }
    s.sc.t = b.slotScale * (isHov && state.mode === 'hero' ? 1.09 : 1);

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
      b.pages[i].visible = ang > 0.035;
    }
    for (let i = 0; i < 6; i++) {
      b.pagesB[i].rotation.y = angB * b.pageFB[i];
      b.pagesB[i].visible = angB > 0.035;
    }

    const focusT =
      state.mode === 'entering' || state.mode === 'returning'
        ? 0
        : isHov
          ? 1
          : inDetail || (state.selected === b && state.mode === 'opening')
            ? 0.55
            : 0;
    b.glowAmt += (focusT - b.glowAmt) * Math.min(1, dt * 7);
    const g = b.glowAmt;
    const fb = b.feelBase;
    const mats = b.mats;
    if (fb && mats?.mFront) {
      mats.mFront.clearcoat = fb.frontCC + g * 0.05;
      mats.mFront.clearcoatRoughness = Math.max(0.05, fb.frontCCR - g * 0.02);
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
  }

  function animate() {
    raf = requestAnimationFrame(animate);
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    if (ptr.seen && (ptr.type === 'mouse' || ptr.down)) castRay();
    let hov = null;
    if (state.mode === 'hero') {
      hov = rayBook || (state.kbIndex >= 0 ? books[state.kbIndex] : null);
    } else if (state.mode === 'detail') {
      hov = rayBook === state.selected ? rayBook : null;
    }
    state.hovered = hov;
    let cur = 'default';
    if (state.mode === 'hero' && hov) cur = 'pointer';
    else if (state.mode === 'detail' && state.selected) {
      if (orbit.drag) cur = 'grabbing';
      else if (rayBook === state.selected) cur = 'grab';
    }
    canvas.style.cursor = cur;

    books.forEach((b) => screenPos(b));
    books.forEach((b) => tickBook(b, dt, t));
    leaves.update(dt, t);

    parX.t = RM ? 0 : ptr.ndcX * 0.02;
    parY.t = RM ? 0 : -ptr.ndcY * 0.012;
    bookRoot.rotation.y = parX.update(dt);
    bookRoot.rotation.x = parY.update(dt);

    camera.position.set(camX.update(dt), camY.update(dt), camZ.update(dt));
    camera.lookAt(lookX.update(dt), lookY.update(dt), 0);

    renderer.render(scene, camera);
  }

  /* =========================================================================
     6. Entrance + resize
     ========================================================================= */
  computeSlots();
  books.forEach((b, i) => {
    const slot = SLOTS.hero[i];
    if (!slot) {
      console.warn('Bookshelf: missing hero slot for book', i, b?.cfg?.id);
      return;
    }
    const s = b.springs;
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
    setTargets(b, slot);
    if (!RM) {
      later(() => {
        if (b.springs) setTargets(b, SLOTS.hero[i] || slot);
      }, 80 + i * 90);
    }
  });
  camTo('hero');

  function relayout() {
    const w = viewW();
    const h = viewH();
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    computeSlots();
    applyMode();
    camTo(
      state.mode === 'entering' ||
        state.mode === 'returning' ||
        state.mode === 'detail' ||
        state.mode === 'opening'
        ? 'detail'
        : 'hero',
    );
  }

  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', () => {
    relayout();
    setTimeout(relayout, 250);
  });
  if (window.visualViewport)
    window.visualViewport.addEventListener('resize', relayout);

  animate();

  window.addEventListener('chem-theme-change', syncTheme);

  return {
    show() {
      running = true;
      resetToHero();
      if (!raf) animate();
      relayout();
    },
    hide() {
      clearOpenTimers();
      if (state.mode !== 'entering' && state.mode !== 'returning') enterFx?.cancel();
      running = false;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      document.body.classList.remove('transit', 'detail-open', 'bookshelf-entering', 'bookshelf-dive-deep');
    },
    dispose() {
      window.removeEventListener('chem-theme-change', syncTheme);
      transitionSeq += 1;
      enterFx?.cancel();
      leaves.dispose();
      this.hide();
      window.removeEventListener('resize', relayout);
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
