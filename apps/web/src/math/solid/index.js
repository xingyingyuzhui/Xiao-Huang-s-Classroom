/**
 * 空间立体几何：可旋转长方体 / 正方体 / 棱锥，标注棱长与体积
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { renderTex } from '../shared/tex.js';
import { bindRangeNumber, syncRangeNumber } from '../shared/param-controls.js';
import { getMathBoardChrome, readCssVar } from '../shared/math-theme.js';

/** @type {'box' | 'cube' | 'pyramid'} */
let solidType = 'box';
/** @type {{ a: number, b: number, c: number }} */
let dims = { a: 2.4, b: 1.6, c: 1.2 };

let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let rootGroup = null;
let raf = 0;
let stageEl = null;
let inited = false;
let running = false;

function theme() {
  const c = getMathBoardChrome();
  return {
    stamp: c.stamp,
    diagram: c.diagram,
    paper: c.paper,
    ink: c.ink,
    soft: readCssVar('--stamp-soft', '#fde68a'),
    pointRing: c.pointRing,
  };
}

function clearGroup() {
  if (!rootGroup) return;
  while (rootGroup.children.length) {
    const obj = rootGroup.children[0];
    rootGroup.remove(obj);
    obj.traverse?.((ch) => {
      ch.geometry?.dispose?.();
      if (ch.material) {
        if (Array.isArray(ch.material)) ch.material.forEach((m) => m.dispose());
        else ch.material.dispose();
      }
    });
  }
}

function edgeLines(geometry, color) {
  const edges = new THREE.EdgesGeometry(geometry);
  return new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color, linewidth: 2 }),
  );
}

function buildSolid() {
  clearGroup();
  const t = theme();
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(t.soft),
    metalness: 0.05,
    roughness: 0.35,
    transparent: true,
    opacity: 0.72,
    transmission: 0.15,
    thickness: 0.6,
    side: THREE.DoubleSide,
  });

  if (solidType === 'box' || solidType === 'cube') {
    // 正方体：三边同取 a，避免 UI 残留 b/c 造成体/线不一致
    const a = dims.a;
    const b = solidType === 'cube' ? dims.a : dims.b;
    const c = solidType === 'cube' ? dims.a : dims.c;
    const geo = new THREE.BoxGeometry(a, c, b);
    const mesh = new THREE.Mesh(geo, mat);
    // BoxGeometry 默认以原点为中心，抬高 c/2 使底面落在 y=0
    mesh.position.y = c / 2;
    const edges = edgeLines(geo, t.stamp);
    edges.position.copy(mesh.position);
    rootGroup.add(mesh);
    rootGroup.add(edges);
    // 底面尺寸示意（贴地）
    addDimArrow(
      [-a / 2, 0.02, b / 2 + 0.2],
      [a / 2, 0.02, b / 2 + 0.2],
      `a=${a.toFixed(1)}`,
      t.diagram,
    );
  } else {
    // 正四棱锥：底边 a、高 h=dims.c；ConeGeometry 中心在原点
    const a = dims.a;
    const h = dims.c;
    const geo = new THREE.ConeGeometry(a / Math.SQRT2, h, 4, 1, false);
    geo.rotateY(Math.PI / 4);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = h / 2;
    const edges = edgeLines(geo, t.stamp);
    edges.position.copy(mesh.position);
    rootGroup.add(mesh);
    rootGroup.add(edges);
  }

  // floor grid
  const grid = new THREE.GridHelper(8, 16, t.ink, t.diagram);
  grid.material.opacity = 0.35;
  grid.material.transparent = true;
  rootGroup.add(grid);

  updateFormulas();
}

function addDimArrow(from, to, _label, color) {
  const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const len = dir.length();
  const helper = new THREE.ArrowHelper(dir.clone().normalize(), new THREE.Vector3(...from), len, color, 0.15, 0.1);
  rootGroup.add(helper);
}

function updateFormulas() {
  const box = document.getElementById('mathSolidFormulas');
  if (!box) return;
  if (solidType === 'cube') {
    const a = dims.a;
    box.innerHTML = `<div class="math-stat-row math-stat-emphasis"><strong>正方体</strong><div class="math-tex" data-t></div></div>`;
    renderTex(
      box.querySelector('[data-t]'),
      String.raw`V=a^3=${a.toFixed(2)}^3=${(a ** 3).toFixed(2)},\ S=6a^2=${(6 * a * a).toFixed(2)}`,
      true,
    );
  } else if (solidType === 'box') {
    const { a, b, c } = dims;
    box.innerHTML = `<div class="math-stat-row math-stat-emphasis"><strong>长方体</strong><div class="math-tex" data-t></div></div>`;
    renderTex(
      box.querySelector('[data-t]'),
      String.raw`V=abc=${a.toFixed(1)}\times${b.toFixed(1)}\times${c.toFixed(1)}=${(a * b * c).toFixed(2)}`,
      true,
    );
  } else {
    const a = dims.a;
    const h = dims.c;
    const V = (1 / 3) * a * a * h;
    box.innerHTML = `<div class="math-stat-row math-stat-emphasis"><strong>正四棱锥</strong><div class="math-tex" data-t></div></div>`;
    renderTex(
      box.querySelector('[data-t]'),
      String.raw`V=\dfrac13 a^2 h=\dfrac13\cdot${a.toFixed(1)}^2\cdot${h.toFixed(1)}=${V.toFixed(2)}`,
      true,
    );
  }
}

function tick() {
  if (!running) return;
  raf = requestAnimationFrame(tick);
  controls?.update();
  renderer?.render(scene, camera);
}

function onResize() {
  if (!stageEl || !renderer || !camera) return;
  const w = stageEl.clientWidth;
  const h = stageEl.clientHeight;
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

export function initSolidUI() {
  stageEl = document.getElementById('mathSolidStage');
  const canvasHost = document.getElementById('mathSolidCanvasHost');
  if (!stageEl || !canvasHost) return;

  if (inited) {
    onResize();
      return;
  }

  const t = theme();
  scene = new THREE.Scene();
  scene.background = new THREE.Color(t.paper);

  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(4.2, 3.2, 5.2);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  canvasHost.innerHTML = '';
  canvasHost.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0.8, 0);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.1);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(4, 8, 3);
  scene.add(dir);

  rootGroup = new THREE.Group();
  scene.add(rootGroup);

  const solidControls = document.getElementById('panel-math-solid');
  if (solidControls && !solidControls.dataset.mathBound) {
    solidControls.dataset.mathBound = '1';
    solidControls.querySelectorAll('[data-math-solid]').forEach((btn) => {
      btn.addEventListener('click', () => {
        solidType = /** @type {any} */ (btn.getAttribute('data-math-solid'));
        solidControls.querySelectorAll('[data-math-solid]').forEach((b) => {
          b.classList.toggle('active', b === btn);
        });
        syncSolidControlsUi();
        buildSolid();
      });
    });

    for (const [id, key, numId] of [
      ['mathSolidA', 'a', 'mathSolidANum'],
      ['mathSolidB', 'b', 'mathSolidBNum'],
      ['mathSolidC', 'c', 'mathSolidCNum'],
    ]) {
      bindRangeNumber({
        range: /** @type {HTMLInputElement | null} */ (document.getElementById(id)),
        number: /** @type {HTMLInputElement | null} */ (document.getElementById(numId)),
        onChange: (v) => {
          dims[key] = v;
          if (solidType === 'cube' && key === 'a') {
            dims.b = dims.a;
            dims.c = dims.a;
            syncRangeNumber(
              /** @type {HTMLInputElement | null} */ (document.getElementById('mathSolidB')),
              /** @type {HTMLInputElement | null} */ (document.getElementById('mathSolidBNum')),
              dims.a,
            );
            syncRangeNumber(
              /** @type {HTMLInputElement | null} */ (document.getElementById('mathSolidC')),
              /** @type {HTMLInputElement | null} */ (document.getElementById('mathSolidCNum')),
              dims.a,
            );
          }
          buildSolid();
        },
      });
    }
  }

  syncSolidControlsUi();
  buildSolid();
  onResize();
  running = true;
  tick();
  inited = true;

  new ResizeObserver(onResize).observe(stageEl);
}

function solidVolume() {
  if (solidType === 'cube') return dims.a ** 3;
  if (solidType === 'box') return dims.a * dims.b * dims.c;
  return (1 / 3) * dims.a * dims.a * dims.c;
}

/** 按几何体类型显隐滑条；正方体只保留棱长 a */
function syncSolidControlsUi() {
  const bRow = document.getElementById('mathSolidBRow');
  const cRow = document.getElementById('mathSolidCLabel');
  const cName = document.querySelector('#mathSolidCLabel .math-slider-name');
  if (bRow) bRow.hidden = solidType === 'cube';
  if (cRow) cRow.hidden = solidType === 'cube';
  if (cName) cName.textContent = solidType === 'pyramid' ? '高 h' : '高 c';

  // 正方体时把 b、c 同步为 a，读数一致
  if (solidType === 'cube') {
    dims.b = dims.a;
    dims.c = dims.a;
  }
  for (const [id, key, numId] of [
    ['mathSolidA', 'a', 'mathSolidANum'],
    ['mathSolidB', 'b', 'mathSolidBNum'],
    ['mathSolidC', 'c', 'mathSolidCNum'],
  ]) {
    syncRangeNumber(
      /** @type {HTMLInputElement | null} */ (document.getElementById(id)),
      /** @type {HTMLInputElement | null} */ (document.getElementById(numId)),
      dims[key],
    );
  }
}

/** @returns {import('../shared/lab-bridge.js').LabSnapshot | null} */
export function getLabSnapshot() {
  if (!inited) return null;
  const typeLabel =
    solidType === 'cube' ? '正方体' : solidType === 'pyramid' ? '正四棱锥' : '长方体';
  return {
    tab: 'solid',
    label: '立体几何',
    summary: `${typeLabel} · a=${dims.a} b=${dims.b} c=${dims.c} · V≈${solidVolume().toFixed(2)}`,
    formula:
      solidType === 'cube'
        ? 'V=a^3'
        : solidType === 'pyramid'
          ? 'V=\\frac13 a^2 h'
          : 'V=abc',
    params: { solidType, dims: { ...dims }, volume: solidVolume() },
  };
}

/**
 * @param {import('../shared/lab-bridge.js').LabAction} action
 */
export function applyLabAction(action) {
  if (action.solidType) solidType = action.solidType;
  if (action.dims) {
    if (action.dims.a != null) dims.a = Number(action.dims.a);
    if (action.dims.b != null) dims.b = Number(action.dims.b);
    if (action.dims.c != null) dims.c = Number(action.dims.c);
  }
  const solidControls = document.getElementById('panel-math-solid');
  solidControls?.querySelectorAll('[data-math-solid]').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-math-solid') === solidType);
  });
  syncSolidControlsUi();
  if (inited) buildSolid();
  return { ok: true, message: action.label || '已应用到立体几何' };
}

export function resizeSolid() {
  onResize();
}

export function disposeSolid() {
  running = false;
  cancelAnimationFrame(raf);
  controls?.dispose();
  renderer?.dispose();
  clearGroup();
  renderer = null;
  scene = null;
  camera = null;
  controls = null;
  rootGroup = null;
  inited = false;
}
