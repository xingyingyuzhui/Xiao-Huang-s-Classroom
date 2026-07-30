/**
 * 书本材质噪声溶解（参考 Codrops / JatinChopra emissive-dissolve 思路）：
 * - 多 octave 连续噪声 → 自然蚀刻边缘
 * - progress 阈值 discard + 软边 emissive
 * - 多材质共用同一组 uniforms，uDissolve: 0 完整 → 1 消失
 *
 * @see https://tympanus.net/codrops/2025/02/17/implementing-a-dissolve-effect-with-shaders-and-particles-in-three-js/
 * @see https://github.com/JatinChopra/emissive-dissolve-effect
 */

/**
 * @param {import('three')} THREE
 * @param {number} [edgeHex]
 */
export function createDissolveUniforms(THREE, edgeHex = 0x6ee7b7) {
  return {
    _key: `d${Math.random().toString(36).slice(2, 9)}`,
    uDissolve: { value: 0 },
    /** 边缘带宽（噪声空间），略宽一点更有“燃烧前线” */
    uDissolveEdge: { value: 0.14 },
    uDissolveColor: { value: new THREE.Color(edgeHex) },
    /** 边缘发光强度 */
    uDissolveGlow: { value: 0.55 },
  };
}

/**
 * @param {import('three').Material} material
 * @param {ReturnType<typeof createDissolveUniforms>} uniforms
 */
export function attachDissolve(material, uniforms) {
  if (!material || material.userData?.dissolveAttached) return;
  material.userData.dissolveAttached = true;
  material.userData.dissolveUniforms = uniforms;

  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () =>
    `${prevKey ? prevKey() : material.type}|book-dissolve-v2|${uniforms._key}`;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDissolve = uniforms.uDissolve;
    shader.uniforms.uDissolveEdge = uniforms.uDissolveEdge;
    shader.uniforms.uDissolveColor = uniforms.uDissolveColor;
    shader.uniforms.uDissolveGlow = uniforms.uDissolveGlow;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vDissolvePos;
varying vec3 vDissolveLocal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vDissolvePos = transformed;
vDissolveLocal = position;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uDissolve;
uniform float uDissolveEdge;
uniform vec3 uDissolveColor;
uniform float uDissolveGlow;
varying vec3 vDissolvePos;
varying vec3 vDissolveLocal;

/* 连续 value noise（插值），比 hash 硬切更自然 —— Codrops 同族思路 */
float bookHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float bookValueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  /* quintic smoothstep —— 比 hermite 更顺 */
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = bookHash(i);
  float n100 = bookHash(i + vec3(1.0, 0.0, 0.0));
  float n010 = bookHash(i + vec3(0.0, 1.0, 0.0));
  float n110 = bookHash(i + vec3(1.0, 1.0, 0.0));
  float n001 = bookHash(i + vec3(0.0, 0.0, 1.0));
  float n101 = bookHash(i + vec3(1.0, 0.0, 1.0));
  float n011 = bookHash(i + vec3(0.0, 1.0, 1.0));
  float n111 = bookHash(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

/* 3-octave fbm：低频定形态，高频定细节 */
float bookDissolveFbm(vec3 p) {
  float a = 0.55 * bookValueNoise(p);
  a += 0.30 * bookValueNoise(p * 2.17 + vec3(1.7, 9.2, 3.1));
  a += 0.15 * bookValueNoise(p * 5.41 + vec3(4.2, 1.3, 8.7));
  return a;
}
`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
if (uDissolve > 0.001) {
  /* 局部坐标 + 前向偏置：更像“从书面向外开” */
  vec3 sampleP = vDissolveLocal * 2.85 + vec3(0.37, 1.13, 0.61);
  /* 前向轻微偏置（z 轴靠近相机/书面向外） */
  sampleP.z += 0.3;
  float n = bookDissolveFbm(sampleP);

  /* 轻微径向偏置：封面中心略先蚀刻，更像“从书面向外开” */
  float radial = length(vDissolveLocal.xy) * 0.22;
  n = clamp(n * 0.88 + radial * 0.12, 0.0, 1.0);

  if (n < uDissolve) discard;

  float edge = uDissolve + uDissolveEdge;
  if (n < edge) {
    float t = clamp((n - uDissolve) / max(uDissolveEdge, 1e-4), 0.0, 1.0);
    /* 边缘内侧最亮，向外平滑衰减（pow 让前线更锐、余晖更柔） */
    float k = pow(1.0 - t, 1.65);
    vec3 base = gl_FragColor.rgb;
    gl_FragColor.rgb = mix(base, uDissolveColor, k * 0.88);
    gl_FragColor.rgb += uDissolveColor * k * uDissolveGlow;
    /* 极窄前线再加一点高光 */
    float hot = pow(1.0 - abs(t * 2.0 - 0.35), 4.0) * k;
    gl_FragColor.rgb += vec3(1.0, 0.98, 0.92) * hot * 0.35;
  }
}
`,
      );

    material.userData.shader = shader;
  };

  material.needsUpdate = true;
}

/**
 * @param {import('three').Material | import('three').Material[]} mats
 * @param {ReturnType<typeof createDissolveUniforms>} uniforms
 */
export function attachDissolveAll(mats, uniforms) {
  const list = Array.isArray(mats) ? mats : [mats];
  const seen = new Set();
  list.forEach((m) => {
    if (!m || seen.has(m)) return;
    seen.add(m);
    attachDissolve(m, uniforms);
  });
}

/**
 * @param {ReturnType<typeof createDissolveUniforms>} uniforms
 * @param {number} t 0..1
 */
export function setDissolveProgress(uniforms, t) {
  if (!uniforms) return;
  /* 略超 1 保证完全蚀尽；曲线在 stage/enter-fx 侧做 ease */
  uniforms.uDissolve.value = Math.max(0, Math.min(1.18, t));
}
