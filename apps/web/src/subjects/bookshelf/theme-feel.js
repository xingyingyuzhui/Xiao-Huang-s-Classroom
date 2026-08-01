/**
 * Theme × book material feel + classroom light tables.
 * env kept low under bright classroom; key/fill shape the covers.
 */

/** @type {Record<string, object>} */
export const THEME_BOOK_FEEL = {
  /* 亮教室 v2：key 右上前半档硬、书比背景跳；含 keyPos 等窗光方位 */
  default: {
    front: { roughness: 0.2, metalness: 0.03, clearcoat: 0.72, clearcoatRoughness: 0.16, envMapIntensity: 0.32, bumpScale: 0.005 },
    back: { roughness: 0.3, clearcoat: 0.45, clearcoatRoughness: 0.24, envMapIntensity: 0.26, bumpScale: 0.0045 },
    edge: { roughness: 0.4, metalness: 0.05, clearcoat: 0.32, clearcoatRoughness: 0.36, envMapIntensity: 0.26, bumpScale: 0.006 },
    spine: { roughness: 0.5, metalness: 0.02, clearcoat: 0.22, clearcoatRoughness: 0.5, envMapIntensity: 0.24, bumpScale: 0.012, cloth: true },
    exposure: 1.16,
    light: {
      hemi: 0xd4e4f6, hemiI: 0.5, hemiGround: 0xc4bdb2,
      key: 0xfffdf8, keyI: 1.72,
      fill: 0xdce8f6, fillI: 0.42,
      rim: 0xb8d0e8, rimI: 0.32,
      studio: 0xf4f8fc, studioI: 0.48,
      glow: 0xfff4ea, glowI: 0.22,
      frontFill: 0xfff6ec, frontFillI: 0.24, frontFillPos: [0, 1.4, 7.5],
      keyPos: [4.0, 6.2, 5.6], fillPos: [-4.8, 2.2, 4.0], rimPos: [-2.0, 3.0, -5.2],
      studioPos: [-0.6, 7.8, 3.2], glowPos: [0.35, 0.4, 2.2],
    },
  },
  stationery: {
    front: { roughness: 0.48, metalness: 0.02, clearcoat: 0.2, clearcoatRoughness: 0.58, envMapIntensity: 0.3, bumpScale: 0.009 },
    back: { roughness: 0.55, clearcoat: 0.12, clearcoatRoughness: 0.68, envMapIntensity: 0.24, bumpScale: 0.007 },
    edge: { roughness: 0.58, metalness: 0.02, clearcoat: 0.1, clearcoatRoughness: 0.72, envMapIntensity: 0.24, bumpScale: 0.009 },
    spine: { roughness: 0.68, metalness: 0.01, clearcoat: 0.08, clearcoatRoughness: 0.78, envMapIntensity: 0.22, bumpScale: 0.016, cloth: true },
    exposure: 1.17,
    light: {
      hemi: 0xf4e6d0, hemiI: 0.5, hemiGround: 0xc8a880,
      key: 0xfff6e8, keyI: 1.66,
      fill: 0xf0dcc0, fillI: 0.44,
      rim: 0xe0b890, rimI: 0.28,
      studio: 0xffecd4, studioI: 0.46,
      glow: 0xffe2b8, glowI: 0.2,
      frontFill: 0xfff2de, frontFillI: 0.26, frontFillPos: [0, 1.4, 7.5],
      keyPos: [3.8, 5.8, 5.4], fillPos: [-4.4, 2.4, 3.8], rimPos: [-1.8, 2.8, -5.0],
      studioPos: [-0.8, 7.4, 3.0], glowPos: [0.25, 0.35, 2.1],
    },
  },
  reagent: {
    front: { roughness: 0.18, metalness: 0.04, clearcoat: 0.82, clearcoatRoughness: 0.12, envMapIntensity: 0.32, bumpScale: 0.0045 },
    back: { roughness: 0.28, clearcoat: 0.52, clearcoatRoughness: 0.2, envMapIntensity: 0.26, bumpScale: 0.004 },
    edge: { roughness: 0.35, metalness: 0.06, clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.26, bumpScale: 0.005 },
    spine: { roughness: 0.42, metalness: 0.03, clearcoat: 0.35, clearcoatRoughness: 0.38, envMapIntensity: 0.24, bumpScale: 0.008, cloth: false },
    exposure: 1.15,
    light: {
      hemi: 0xece2d4, hemiI: 0.48, hemiGround: 0xa89888,
      key: 0xfff8f0, keyI: 1.7,
      fill: 0xe8d8c4, fillI: 0.4,
      rim: 0xd0bc9c, rimI: 0.3,
      studio: 0xfff0dc, studioI: 0.44,
      glow: 0xf0d4b0, glowI: 0.2,
      frontFill: 0xfff4e8, frontFillI: 0.22, frontFillPos: [0, 1.4, 7.5],
      keyPos: [4.1, 6.0, 5.2], fillPos: [-4.6, 2.0, 3.6], rimPos: [-2.2, 2.6, -5.1],
      studioPos: [-1.0, 7.6, 2.8], glowPos: [0.3, 0.3, 2.0],
    },
  },
  blackboard: {
    front: { roughness: 0.7, metalness: 0.01, clearcoat: 0.08, clearcoatRoughness: 0.85, envMapIntensity: 0.28, bumpScale: 0.012 },
    back: { roughness: 0.76, clearcoat: 0.05, clearcoatRoughness: 0.88, envMapIntensity: 0.22, bumpScale: 0.01 },
    edge: { roughness: 0.78, metalness: 0.01, clearcoat: 0.05, clearcoatRoughness: 0.9, envMapIntensity: 0.22, bumpScale: 0.012 },
    spine: { roughness: 0.82, metalness: 0.01, clearcoat: 0.04, clearcoatRoughness: 0.92, envMapIntensity: 0.2, bumpScale: 0.018, cloth: true },
    exposure: 1.18,
    light: {
      hemi: 0xd8eadc, hemiI: 0.5, hemiGround: 0x7a8c78,
      key: 0xf6faf4, keyI: 1.66,
      fill: 0xd0e4d0, fillI: 0.4,
      rim: 0xa8d0b0, rimI: 0.28,
      studio: 0xe8f4e4, studioI: 0.42,
      glow: 0xdcecc8, glowI: 0.2,
      frontFill: 0xf2f8ec, frontFillI: 0.3, frontFillPos: [0, 1.4, 7.5],
      keyPos: [3.6, 6.4, 5.5], fillPos: [-4.2, 2.5, 4.0], rimPos: [-1.6, 3.2, -5.3],
      studioPos: [-0.5, 8.0, 3.0], glowPos: [0.2, 0.45, 2.15],
    },
  },
  pixel: {
    front: { roughness: 0.34, metalness: 0.03, clearcoat: 0.38, clearcoatRoughness: 0.3, envMapIntensity: 0.3, bumpScale: 0.0035 },
    back: { roughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.35, envMapIntensity: 0.24, bumpScale: 0.003 },
    edge: { roughness: 0.38, metalness: 0.03, clearcoat: 0.28, clearcoatRoughness: 0.32, envMapIntensity: 0.24, bumpScale: 0.004 },
    spine: { roughness: 0.42, metalness: 0.02, clearcoat: 0.26, clearcoatRoughness: 0.38, envMapIntensity: 0.22, bumpScale: 0.006, cloth: false },
    exposure: 1.16,
    light: {
      hemi: 0xc0d8d8, hemiI: 0.5, hemiGround: 0x687e7e,
      key: 0xffffff, keyI: 1.72,
      fill: 0xaed8d0, fillI: 0.38,
      rim: 0x78c8b8, rimI: 0.34,
      studio: 0xe8f4f4, studioI: 0.44,
      glow: 0xffc0c8, glowI: 0.18,
      frontFill: 0xeef6f4, frontFillI: 0.24, frontFillPos: [0, 1.4, 7.5],
      keyPos: [4.2, 5.6, 5.8], fillPos: [-5.0, 2.0, 4.2], rimPos: [-2.4, 2.8, -5.0],
      studioPos: [-0.4, 7.2, 3.4], glowPos: [0.4, 0.35, 2.3],
    },
  },
};

/**
 * @param {string} themeId
 */
export function themeBookFeel(themeId) {
  return THEME_BOOK_FEEL[themeId] || THEME_BOOK_FEEL.default;
}

/**
 * @param {object} feel
 * @param {{ mFront: import('three').MeshPhysicalMaterial, mBack: import('three').MeshPhysicalMaterial, mEdge: import('three').MeshPhysicalMaterial, mEdgeDark: import('three').MeshPhysicalMaterial, mSpine: import('three').MeshPhysicalMaterial }} mats
 * @param {string} [edgeHex]
 * @param {{ clothBump: import('three').Texture, laminateBump: import('three').Texture, THREE: typeof import('three') }} bumps
 */
export function applyBookFeel(feel, mats, edgeHex, bumps) {
  const { mFront, mBack, mEdge, mEdgeDark, mSpine } = mats;
  const { clothBump, laminateBump, THREE } = bumps;
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

/**
 * Snapshot theme material baselines for hover/detail micro-glow.
 * @param {{ mFront: import('three').MeshPhysicalMaterial, mEdgeDark: import('three').MeshPhysicalMaterial, mSpine: import('three').MeshPhysicalMaterial }} mats
 */
export function snapshotFeelBase(mats) {
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
 * Apply theme light colors/intensities/positions + exposure.
 * @param {object} feel
 * @param {object} lights
 * @param {import('three').WebGLRenderer} renderer
 * @param {(themeId: string) => void} buildClassroomEnv
 * @param {string} themeId
 */
export function applyThemeLights(feel, lights, renderer, buildClassroomEnv, themeId) {
  const L = feel.light;
  const { hemi, key, fill, rim, studio, glow } = lights;
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
  /* 封面正面补光（可选）：正对书架、不投影，专治封面吃光余弦损失 */
  if (lights.frontFill && L.frontFill != null) {
    lights.frontFill.color.setHex(L.frontFill);
    if (L.frontFillI != null) lights.frontFill.intensity = L.frontFillI;
    if (L.frontFillPos) {
      lights.frontFill.position.set(L.frontFillPos[0], L.frontFillPos[1], L.frontFillPos[2]);
    }
  }
  if (L.keyPos) key.position.set(L.keyPos[0], L.keyPos[1], L.keyPos[2]);
  if (L.fillPos) fill.position.set(L.fillPos[0], L.fillPos[1], L.fillPos[2]);
  if (L.rimPos) rim.position.set(L.rimPos[0], L.rimPos[1], L.rimPos[2]);
  if (L.studioPos) studio.position.set(L.studioPos[0], L.studioPos[1], L.studioPos[2]);
  if (L.glowPos) glow.position.set(L.glowPos[0], L.glowPos[1], L.glowPos[2]);
  if (feel.exposure != null) {
    renderer.toneMappingExposure = feel.exposure;
  }
  buildClassroomEnv(themeId);
}
