/**
 * Single-book mesh construction (covers, spine, pages, dissolve, repaint).
 */

import {
  paintSubjectCover,
  paintBack,
  paintSpine,
  themeBookBoards,
} from './covers.js';
import { coverUrlForTheme } from './cover-urls.js';
import { applyBookFeel, snapshotFeelBase, themeBookFeel } from './theme-feel.js';
import { attachDissolveAll, createDissolveUniforms } from './dissolve.js';
import { Spring } from './spring.js';
import {
  W,
  T,
  OV,
  PAGE_N,
  PW,
  BLOCK_Z,
  PIVOT_Z,
  BPIVOT_Z,
  EDGE_SHEET_N,
} from './book-geometry.js';
import { mkCanvas, paintPrintWear } from './book-textures.js';

/**
 * @param {object} ctx shared stage context
 * @param {typeof import('three')} ctx.THREE
 * @param {import('three').Group} ctx.bookRoot
 * @param {ReturnType<import('./book-geometry.js').createBookGeometries>} ctx.geo
 * @param {ReturnType<import('./book-textures.js').createSharedBookTextures>} ctx.tex
 * @param {() => string} ctx.activeThemeId
 * @param {object[]} ctx.books
 * @param {import('three').Mesh[]} ctx.hitMeshes
 */
export function createBuildBook(ctx) {
  const { THREE, bookRoot, geo, tex, activeThemeId, books, hitMeshes } = ctx;
  const {
    coverGeo,
    blockGeo,
    pageGeo,
    spineGeo,
    edgeSheetGeo,
    hitGeo,
    hitMat,
  } = geo;
  const {
    tex: makeTex,
    laminateBump,
    clothBump,
    paperFlat,
    striMatV,
    striMatH,
    endpaperMat,
    pageMats,
    phys,
  } = tex;

  const feelBumps = { clothBump, laminateBump, THREE };

  /**
   * @param {object} cfg
   * @param {number} index
   */
  function buildBook(cfg, index) {
    const root = new THREE.Group();
    const float = new THREE.Group();
    root.add(float);
    bookRoot.add(root);

    const fc = mkCanvas(1024, 1536);
    cfg.front(fc.getContext('2d'), 1024, 1536);
    const bc = mkCanvas(1024, 1536);
    paintBack(bc.getContext('2d'), 1024, 1536, cfg);
    const sc = mkCanvas(220, 1536);
    paintSpine(sc.getContext('2d'), 220, 1536, cfg);
    const frontTex = makeTex(fc);
    const backTex = makeTex(bc);
    const spineTex = makeTex(sc);

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
      feelBumps,
    );

    /**
     * 量封面图平均亮度：过暗的棋面给出有界补偿（屏幕混合，保单调、不沾高光区）
     * @param {HTMLImageElement} img
     */
    function measureCoverLum(img) {
      try {
        const c = mkCanvas(48, 72);
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0, 48, 72);
        const d = x.getImageData(0, 0, 48, 72).data;
        let s = 0;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 28) continue;
          s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          n++;
        }
        return n ? s / n : 128;
      } catch {
        return 128;
      }
    }

    /**
     * @param {CanvasRenderingContext2D} ctx2
     * @param {number} w
     * @param {number} h
     * @param {number} [artLum] 封面图平均亮度（0-255）；低于 ~90 的暗图自适应抬底
     */
    function paintStudioGrade(ctx2, w, h, artLum = 128) {
      ctx2.save();
      const shade = ctx2.createLinearGradient(0, 0, w * 0.95, h);
      shade.addColorStop(0, 'rgba(255,255,255,0)');
      shade.addColorStop(0.55, 'rgba(255,255,255,0)');
      shade.addColorStop(1, 'rgba(10,14,32,0.03)');
      ctx2.globalCompositeOperation = 'multiply';
      ctx2.fillStyle = shade;
      ctx2.fillRect(0, 0, w, h);

      const lift = ctx2.createLinearGradient(0, 0, w, h * 0.85);
      lift.addColorStop(0, 'rgba(255,252,248,0.15)');
      lift.addColorStop(0.45, 'rgba(255,255,255,0.07)');
      lift.addColorStop(1, 'rgba(255,255,255,0)');
      ctx2.globalCompositeOperation = 'soft-light';
      ctx2.fillStyle = lift;
      ctx2.fillRect(0, 0, w, h);

      /* 暗封面自适应抬底（有界，宁留黑韵不可泛灰）：16→≈67；亮封面（lum≳92）不插手 */
      const deficit = Math.max(0, Math.min(1, (92 - artLum) / 92));
      if (deficit > 0.01) {
        ctx2.globalCompositeOperation = 'screen';
        ctx2.globalAlpha = Math.min(0.3, deficit * 0.26);
        ctx2.fillStyle = '#ffffff';
        ctx2.fillRect(0, 0, w, h);
        ctx2.globalAlpha = 1;
      }
      /* 恢复 soft-light：保持 shaft 光带的既有混合语义 */
      ctx2.globalCompositeOperation = 'soft-light';

      const shaft = ctx2.createLinearGradient(w * 0.02, 0, w * 0.92, h * 0.98);
      shaft.addColorStop(0, 'rgba(255,252,245,0)');
      shaft.addColorStop(0.3, 'rgba(255,250,240,0.15)');
      shaft.addColorStop(0.4, 'rgba(255,252,248,0.22)');
      shaft.addColorStop(0.55, 'rgba(255,248,235,0.08)');
      shaft.addColorStop(1, 'rgba(0,0,0,0)');
      ctx2.fillStyle = shaft;
      ctx2.fillRect(0, 0, w, h);
      ctx2.restore();
      paintPrintWear(ctx2, w, h);
    }

    paintPrintWear(fc.getContext('2d'), 1024, 1536);
    frontTex.needsUpdate = true;

    let coverLoadGen = 0;
    function applyCoverMap(url, themeHint) {
      const gen = ++coverLoadGen;
      cfg.coverURL = url || null;
      mFront.map = frontTex;
      mFront.needsUpdate = true;
      if (!url) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (gen !== coverLoadGen) return;
        try {
          const c = mkCanvas(1024, 1536);
          const x = c.getContext('2d');
          /* 反 ACES 去饱和：贴图就位前对艺术图做轻度饱和预补偿，亮部保住色彩浓度 */
          try {
            if ('filter' in x) x.filter = 'saturate(1.12)';
          } catch (_) {
            /* Safari 等不支持 ctx.filter 时静默跳过 */
          }
          x.drawImage(img, 0, 0, 1024, 1536);
          try {
            x.filter = 'none';
          } catch (_) {
            /* ignore */
          }
          paintStudioGrade(x, 1024, 1536, measureCoverLum(img));
          const graded = makeTex(c);
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
          console.warn('Cover grade failed:', cfg.title, err);
        }
      };
      img.onerror = () => {
        if (gen !== coverLoadGen) return;
        console.warn('Cover load failed, procedural kept:', cfg.title, url);
        mFront.map = frontTex;
        mFront.needsUpdate = true;
      };
      const tip = themeHint || activeThemeId();
      const bust = `${url}${url.includes('?') ? '&' : '?'}theme=${encodeURIComponent(tip)}`;
      img.src = bust;
    }
    if (cfg.coverURL) applyCoverMap(cfg.coverURL, activeThemeId());

    const dissolveU = createDissolveUniforms(THREE, cfg.edge || 0x6ee7b7);
    attachDissolveAll([mFront, mBack, mEdge, mEdgeDark, mSpine], dissolveU);

    const mBlock = [
      striMatV.clone(),
      paperFlat.clone(),
      striMatH.clone(),
      striMatH.clone(),
      paperFlat.clone(),
      paperFlat.clone(),
    ];
    mBlock[0].color = new THREE.Color(0xfffaf0);
    mBlock[2].color = new THREE.Color(0xe8dcc4);
    mBlock[3].color = new THREE.Color(0xddd0b8);
    mBlock[2].roughness = 0.94;
    mBlock[3].roughness = 0.95;
    const mEndF = endpaperMat.clone();
    const mEndB = endpaperMat.clone();
    attachDissolveAll([...mBlock, mEndF, mEndB], dissolveU);

    const backPivot = new THREE.Group();
    backPivot.position.set(-W / 2, 0, BPIVOT_Z);
    const backMesh = new THREE.Mesh(coverGeo, [mEndB, mBack, mEdgeDark]);
    backMesh.position.x = (W + OV) / 2;
    backMesh.castShadow = backMesh.receiveShadow = true;
    backPivot.add(backMesh);
    float.add(backPivot);

    const pivot = new THREE.Group();
    pivot.position.set(-W / 2, 0, PIVOT_Z);
    const frontMesh = new THREE.Mesh(coverGeo, [mFront, mEndF, mEdgeDark]);
    frontMesh.position.x = (W + OV) / 2;
    frontMesh.castShadow = frontMesh.receiveShadow = true;
    pivot.add(frontMesh);
    float.add(pivot);

    const spine = new THREE.Mesh(spineGeo, mSpine);
    const spineNest = 0.006;
    spine.position.set(-W / 2 + spineNest, 0, 0);
    spine.castShadow = true;
    float.add(spine);

    const block = new THREE.Mesh(blockGeo, mBlock);
    block.position.set(0.01, 0, BLOCK_Z);
    block.castShadow = block.receiveShadow = true;
    float.add(block);

    const edgeSheetColors = [0xfff8ee, 0xf2e8d6, 0xe6d8c0];
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
      sheet.position.set(
        W * 0.5 - 0.004 + i * 0.0032,
        (i - 1) * 0.004,
        BLOCK_Z + (i - 1) * 0.014,
      );
      sheet.castShadow = false;
      sheet.receiveShadow = true;
      float.add(sheet);
    }
    attachDissolveAll(edgeSheetMats, dissolveU);

    const pages = [];
    const pageF = [];
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

    const pagesB = [];
    const pageFB = [];
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
      feelBase: snapshotFeelBase(mats),
      glowAmt: 0,
      phase: Math.random() * 6.28,
      slotScale: 1,
      hitEdge: null,
      scr: { x: 0, y: 0 },
      scrRect: { cx: 0, cy: 0, w: 120, h: 170 },
      orbY: 0,
      orbYv: 0,
      orbPhase: 'idle',
      orbTarget: 0,
      orbXs: new Spring(0, 60, 12),
      exit: null,
      repaint() {
        const themeId = activeThemeId();
        const themed = themeBookBoards(cfg.id, themeId);
        Object.assign(cfg, themed);
        const artUrl = coverUrlForTheme(themeId, cfg.id);
        const fx = fc.getContext('2d');
        paintSubjectCover(
          fx,
          1024,
          1536,
          cfg.subject || { id: cfg.id, name: cfg.title },
          themeId,
        );
        paintPrintWear(fx, 1024, 1536);
        paintBack(bc.getContext('2d'), 1024, 1536, cfg);
        paintSpine(sc.getContext('2d'), 220, 1536, cfg);
        frontTex.needsUpdate = true;
        backTex.needsUpdate = true;
        spineTex.needsUpdate = true;
        applyBookFeel(themeBookFeel(themeId), mats, cfg.edge, feelBumps);
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

  return buildBook;
}

/**
 * Map catalog subjects → book config objects.
 * @param {Array<object>} subjects
 * @param {(themeId: string, subjectId: string) => string | null} coverUrlFn
 */
export function mapSubjectsToBooks(subjects, coverUrlFn = coverUrlForTheme) {
  return subjects.map((s) => {
    const themed = themeBookBoards(s.id);
    const book = { ...themed, ...(s.book || {}) };
    const themeId =
      document.documentElement.getAttribute('data-theme') || 'default';
    return {
      id: s.id,
      title: s.name,
      en: s.en || '',
      author: '小黄的教室',
      year: s.status === 'ready' ? '开放' : '即将推出',
      stars: s.status === 'ready' ? 5 : 0,
      desc: s.desc,
      blurb: s.blurb || s.desc,
      modules: Array.isArray(s.modules) ? s.modules : [],
      status: s.status,
      front: (ctx, w, h) => paintSubjectCover(ctx, w, h, s),
      edge: book.edge || '#e8e4d9',
      backBg: book.backBg || '#334155',
      backInk: book.backInk || '255,255,255',
      spineBg: book.spineBg || book.backBg || '#334155',
      spineInk: book.spineInk || '#ffffff',
      spineFont: book.spineFont || '700 44px "PingFang SC", sans-serif',
      spineTitle: s.name,
      coverURL: coverUrlFn(themeId, s.id),
      subject: s,
    };
  });
}
