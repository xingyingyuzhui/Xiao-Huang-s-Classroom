/**
 * 介绍页环绕悬浮物（按学科换语汇）
 *
 * 逻辑要点：
 * - 椭圆环绕书本，避开封面中心遮挡
 * - 进场从书心绽开，退场缩回再解锚
 * - 指针做柔和斥力场（不是每帧乱推）
 * - 符号类用 Sprite 始终朝向相机
 *
 * chemistry → 磨砂元素圆牌
 * math → 轻盈数学符号
 * biology → 水彩叶
 * physics → 轨道环 + 光子
 */

const COUNT = 12;

const CHEM = [
  { s: 'H', c: '#7dd3fc' },
  { s: 'O', c: '#67e8f9' },
  { s: 'C', c: '#c4b5fd' },
  { s: 'N', c: '#a5b4fc' },
  { s: 'Fe', c: '#fda4af' },
  { s: 'Au', c: '#fcd34d' },
  { s: 'Na', c: '#f9a8d4' },
  { s: 'Cl', c: '#6ee7b7' },
  { s: 'He', c: '#93c5fd' },
  { s: 'Cu', c: '#fdba74' },
  { s: 'Zn', c: '#86efac' },
  { s: 'P', c: '#fde68a' },
];

const MATH = [
  { s: 'π', c: '#e2e8f0' },
  { s: '∑', c: '#fde68a' },
  { s: '∞', c: '#cbd5e1' },
  { s: '∫', c: '#bae6fd' },
  { s: 'Δ', c: '#fef3c7' },
  { s: 'θ', c: '#e0e7ff' },
  { s: '√', c: '#d1fae5' },
  { s: '∂', c: '#fce7f3' },
  { s: '∇', c: '#e0f2fe' },
  { s: '±', c: '#f1f5f9' },
  { s: '≈', c: '#fef9c3' },
  { s: 'α', c: '#ede9fe' },
];

/**
 * @param {object} deps
 * @param {typeof import('three')} deps.THREE
 * @param {import('three').Object3D} deps.bookRoot
 * @param {(o: object) => import('three').MeshStandardMaterial} deps.std
 * @param {new (v?: number, k?: number, d?: number) => { t: number, v: number, set: (n: number) => void, update: (dt: number) => number }} deps.Spring
 * @param {() => import('three').Camera} deps.getCamera
 * @param {boolean} deps.reducedMotion
 */
export function createDetailFloaters(deps) {
  const { THREE, bookRoot, std, Spring, getCamera, reducedMotion: RM } = deps;

  /** @type {any[]} */
  const items = [];
  /** @type {any} */
  let anchor = null;
  /** @type {string | null} */
  let kind = null;
  let live = false;
  const _bookPos = new THREE.Vector3();
  const _cursor = new THREE.Vector3();
  const _tmp = new THREE.Vector3();
  let cursorNx = 0;
  let cursorNy = 0;
  let hasCursor = false;

  function homeOffsets(i, n) {
    const t = i / Math.max(1, n);
    const angle = t * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
    /* 椭圆环绕：左右更开，上下略收，避开封面正中 */
    const rx = 1.55 + Math.random() * 1.35;
    const ry = 0.95 + Math.random() * 0.85;
    let hx = Math.cos(angle) * rx;
    let hy = Math.sin(angle) * ry * 0.85;
    if (Math.abs(hx) < 0.55) hx += Math.sign(hx || 1) * 0.75;
    return {
      hx,
      hy,
      hz: 0.15 + Math.random() * 1.1,
      sp: 0.18 + Math.random() * 0.35,
      ph: Math.random() * 6.28,
      rv: new THREE.Vector3(
        (Math.random() - 0.5) * 0.55,
        (Math.random() - 0.5) * 0.55,
        (Math.random() - 0.5) * 0.55,
      ),
      kick: new THREE.Vector3(),
      size: 1,
      spin: (Math.random() - 0.5) * 0.6,
      opacity: 0.55 + Math.random() * 0.35,
    };
  }

  function pushItem(mesh, i, extras = {}) {
    mesh.visible = false;
    mesh.renderOrder = 3;
    bookRoot.add(mesh);
    const home = homeOffsets(i, COUNT);
    items.push({
      mesh,
      ...home,
      s: new Spring(0, 48, 11),
      ...extras,
      size: extras.size ?? home.size,
    });
  }

  function disposeMesh(mesh) {
    bookRoot.remove(mesh);
    mesh.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      const mat = obj.material;
      if (!mat) return;
      (Array.isArray(mat) ? mat : [mat]).forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    });
  }

  function clearItems() {
    items.forEach((it) => disposeMesh(it.mesh));
    items.length = 0;
  }

  /* ---------- canvas painters ---------- */

  function makeChemSprite(symbol, color) {
    const size = 160;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const x = c.getContext('2d');
    x.clearRect(0, 0, size, size);

    const g = x.createRadialGradient(size * 0.42, size * 0.38, 8, size * 0.5, size * 0.5, size * 0.46);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.45, hexAlpha(color, 0.28));
    g.addColorStop(0.78, hexAlpha(color, 0.12));
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
    x.fill();

    x.strokeStyle = hexAlpha(color, 0.55);
    x.lineWidth = 2.5;
    x.beginPath();
    x.arc(size / 2, size / 2, size * 0.34, 0, Math.PI * 2);
    x.stroke();

    x.fillStyle = hexAlpha('#f8fafc', 0.92);
    x.font = `600 ${symbol.length > 1 ? 46 : 54}px "IBM Plex Mono", "SF Mono", monospace`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(symbol, size / 2, size / 2 + 2);

    return spriteFromCanvas(c, 0.82);
  }

  function makeMathSprite(symbol, color) {
    const size = 160;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const x = c.getContext('2d');
    x.clearRect(0, 0, size, size);

    const g = x.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size * 0.48);
    g.addColorStop(0, hexAlpha(color, 0.22));
    g.addColorStop(0.55, hexAlpha(color, 0.06));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);

    x.fillStyle = hexAlpha(color, 0.9);
    x.font = `500 68px Georgia, "Noto Serif SC", "Times New Roman", serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(symbol, size / 2, size / 2 + 4);

    return spriteFromCanvas(c, 0.78);
  }

  function makeLeafSprite(tone) {
    const size = 160;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const x = c.getContext('2d');
    x.clearRect(0, 0, size, size);
    x.translate(size / 2, size / 2);
    x.rotate((tone.rot || 0) * 0.2);

    const g = x.createLinearGradient(0, -50, 20, 55);
    g.addColorStop(0, tone.light);
    g.addColorStop(0.55, tone.mid);
    g.addColorStop(1, tone.dark);
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(0, -52);
    x.bezierCurveTo(28, -28, 34, 10, 4, 52);
    x.bezierCurveTo(-2, 58, -2, 58, 0, 52);
    x.bezierCurveTo(-34, 10, -28, -28, 0, -52);
    x.closePath();
    x.fill();

    x.strokeStyle = hexAlpha('#14532d', 0.35);
    x.lineWidth = 1.5;
    x.beginPath();
    x.moveTo(0, -44);
    x.quadraticCurveTo(2, 0, 0, 46);
    x.stroke();
    for (let i = 0; i < 3; i++) {
      const y = -24 + i * 22;
      x.beginPath();
      x.moveTo(0, y);
      x.quadraticCurveTo(14 + i, y + 4, 18 + i * 2, y + 10);
      x.stroke();
      x.beginPath();
      x.moveTo(0, y + 4);
      x.quadraticCurveTo(-(12 + i), y + 6, -(16 + i * 2), y + 12);
      x.stroke();
    }

    return spriteFromCanvas(c, 0.88);
  }

  function makePhotonSprite(color) {
    const size = 96;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const x = c.getContext('2d');
    x.clearRect(0, 0, size, size);
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.2, hexAlpha(color, 0.95));
    g.addColorStop(0.55, hexAlpha(color, 0.35));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    return spriteFromCanvas(c, 0.9);
  }

  function spriteFromCanvas(canvas, opacity) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      opacity,
      blending: THREE.NormalBlending,
    });
    const sprite = new THREE.Sprite(mat);
    return sprite;
  }

  function makeOrbitRing(colorHex) {
    const geo = new THREE.TorusGeometry(0.55, 0.018, 8, 48);
    const mat = std({
      color: colorHex,
      roughness: 0.25,
      metalness: 0.4,
      emissive: colorHex,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    return new THREE.Mesh(geo, mat);
  }

  /* ---------- builders ---------- */

  function buildChemistry() {
    CHEM.forEach((item, i) => {
      const mesh = makeChemSprite(item.s, item.c);
      pushItem(mesh, i, {
        kind: 'sprite',
        size: 0.32 + Math.random() * 0.12,
        opacity: 0.7 + Math.random() * 0.2,
      });
    });
  }

  function buildMath() {
    MATH.forEach((item, i) => {
      const mesh = makeMathSprite(item.s, item.c);
      pushItem(mesh, i, {
        kind: 'sprite',
        size: 0.28 + Math.random() * 0.14,
        opacity: 0.65 + Math.random() * 0.25,
      });
    });
  }

  function buildBiology() {
    const tones = [
      { light: '#86efac', mid: '#4ade80', dark: '#166534' },
      { light: '#bbf7d0', mid: '#22c55e', dark: '#14532d' },
      { light: '#a3e635', mid: '#65a30d', dark: '#3f6212' },
      { light: '#fde68a', mid: '#84cc16', dark: '#3f6212' },
      { light: '#6ee7b7', mid: '#10b981', dark: '#064e3b' },
      { light: '#d9f99d', mid: '#65a30d', dark: '#365314' },
    ];
    for (let i = 0; i < COUNT; i++) {
      const tone = { ...tones[i % tones.length], rot: Math.random() * 6 };
      const mesh = makeLeafSprite(tone);
      pushItem(mesh, i, {
        kind: 'sprite',
        size: 0.26 + Math.random() * 0.16,
        opacity: 0.75 + Math.random() * 0.2,
      });
    }
  }

  function buildPhysics() {
    const ringColors = [0x38bdf8, 0xa78bfa, 0xf0abfc, 0x7dd3fc];
    const photonColors = ['#7dd3fc', '#c4b5fd', '#f0abfc', '#e0f2fe', '#a5f3fc'];
    for (let i = 0; i < COUNT; i++) {
      if (i % 4 === 0) {
        const mesh = makeOrbitRing(ringColors[(i / 4) % ringColors.length]);
        pushItem(mesh, i, {
          kind: 'ring',
          size: 0.22 + Math.random() * 0.1,
          opacity: 0.65,
        });
      } else {
        const mesh = makePhotonSprite(photonColors[i % photonColors.length]);
        pushItem(mesh, i, {
          kind: 'sprite',
          size: 0.1 + Math.random() * 0.1,
          opacity: 0.8 + Math.random() * 0.15,
        });
      }
    }
  }

  function rebuild(subjectId) {
    const id = subjectId || 'biology';
    if (kind === id && items.length) return;
    clearItems();
    kind = id;
    if (id === 'chemistry') buildChemistry();
    else if (id === 'math') buildMath();
    else if (id === 'physics') buildPhysics();
    else buildBiology();
  }

  function activate(book) {
    const subjectId = book?.cfg?.id || book?.id || 'biology';
    rebuild(subjectId);
    anchor = book;
    live = true;
    hasCursor = false;
    items.forEach((l) => {
      /* 从书心绽开到环绕位 */
      l.kick.set(-l.hx * 0.92, -l.hy * 0.92, -l.hz * 0.35);
      l.s.set(0);
      l.s.t = l.size;
      l.mesh.visible = true;
      if (l.mesh.material && 'opacity' in l.mesh.material) {
        l.mesh.material.opacity = l.opacity ?? 0.8;
      }
    });
  }

  function deactivate() {
    live = false;
    hasCursor = false;
    items.forEach((l) => {
      l.s.t = 0;
    });
  }

  /**
   * 指针柔和斥力：只在有意义位移时记一次光标位置，由 update 施加力场
   * @param {number} dxN
   * @param {number} dyN
   * @param {number} ndcX
   * @param {number} ndcY
   */
  function nudge(dxN, dyN, ndcX, ndcY) {
    if (!live || !anchor) return;
    const mag = Math.abs(dxN) + Math.abs(dyN);
    if (mag < 0.0015) return;
    cursorNx = ndcX;
    cursorNy = ndcY;
    hasCursor = true;
    /* 轻推：与位移相关，但幅度收着 */
    const force = Math.min(mag, 0.08) * 9;
    items.forEach((l) => {
      l.kick.x += dxN * force * (0.35 + Math.random() * 0.65);
      l.kick.y += -dyN * force * (0.35 + Math.random() * 0.65);
    });
  }

  /** @deprecated use nudge */
  function push(dx, dy) {
    nudge(dx, dy, cursorNx, cursorNy);
  }

  function update(dt, t) {
    if (!anchor) return;

    const float = anchor.float || anchor.root;
    float.getWorldPosition(_bookPos);
    bookRoot.worldToLocal(_bookPos);

    /* 指针投影到书本附近平面，形成软斥力 */
    if (live && hasCursor) {
      const cam = getCamera?.();
      if (cam) {
        _cursor.set(cursorNx * 2.4, cursorNy * 1.6, 0.4);
      }
    }

    const drift = RM ? 0.12 : 1;
    let anyVisible = false;

    items.forEach((l) => {
      l.kick.multiplyScalar(Math.exp(-1.35 * dt));

      if (live && hasCursor) {
        _tmp.set(
          _bookPos.x + l.hx - _cursor.x,
          _bookPos.y + l.hy - _cursor.y,
          0,
        );
        const d2 = Math.max(0.35, _tmp.lengthSq());
        if (d2 < 2.8) {
          const f = (0.55 / d2) * dt * drift;
          l.kick.x += _tmp.x * f;
          l.kick.y += _tmp.y * f;
        }
      }

      const bobX = Math.sin(t * l.sp + l.ph) * 0.22 * drift;
      const bobY = Math.cos(t * l.sp * 0.83 + l.ph * 1.2) * 0.16 * drift;
      l.mesh.position.set(
        _bookPos.x + l.hx + bobX + l.kick.x,
        _bookPos.y + l.hy + bobY + l.kick.y,
        _bookPos.z + l.hz + l.kick.z * 0.5,
      );

      if (l.kind === 'ring') {
        l.mesh.rotation.x += l.rv.x * dt * (0.4 + drift);
        l.mesh.rotation.y += l.rv.y * dt * (0.55 + drift);
        l.mesh.rotation.z += l.rv.z * dt * 0.25;
      } else if (l.kind === 'sprite') {
        /* Sprite 自带朝向相机；只给轻微自转感（material rotation） */
        if (l.mesh.material) {
          l.mesh.material.rotation += l.spin * dt * 0.35;
        }
      } else {
        l.mesh.rotation.x += l.rv.x * dt * (0.25 + drift);
        l.mesh.rotation.y += l.rv.y * dt * (0.25 + drift);
        l.mesh.rotation.z += l.rv.z * dt * (0.25 + drift);
      }

      const s = l.s.update(dt);
      const scale = Math.max(s, 0.0001);
      l.mesh.scale.setScalar(scale);
      if (l.mesh.material && 'opacity' in l.mesh.material && l.opacity != null) {
        const fade = Math.min(1, scale / Math.max(0.001, l.size));
        l.mesh.material.opacity = l.opacity * fade;
      }

      if (l.s.t === 0 && s < 0.01) {
        l.mesh.visible = false;
      } else {
        anyVisible = true;
        l.mesh.visible = true;
      }
    });

    if (!live && !anyVisible) {
      anchor = null;
      hasCursor = false;
    }
  }

  function dispose() {
    clearItems();
    anchor = null;
    kind = null;
    live = false;
    hasCursor = false;
  }

  return { activate, deactivate, nudge, push, update, dispose, rebuild };
}

function hexAlpha(hex, a) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}
