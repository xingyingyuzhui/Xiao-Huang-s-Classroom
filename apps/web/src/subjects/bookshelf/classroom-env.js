/**
 * Equirect classroom environment → PMREM for book reflections.
 */

/**
 * @param {CanvasRenderingContext2D} x
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {string} rgb
 * @param {number} a
 */
function envBlob(x, cx, cy, r, rgb, a) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
  g.addColorStop(1, 'rgba(' + rgb + ',0)');
  x.fillStyle = g;
  x.beginPath();
  x.arc(cx, cy, r, 0, 6.2832);
  x.fill();
}

/**
 * @param {object} deps
 * @param {typeof import('three')} deps.THREE
 * @param {import('three').Scene} deps.scene
 * @param {import('three').PMREMGenerator} deps.pmremGen
 * @param {(w: number, h: number) => HTMLCanvasElement} deps.mkCanvas
 */
export function createClassroomEnvBuilder(deps) {
  const { THREE, scene, pmremGen, mkCanvas } = deps;
  /** @type {import('three').Texture | null} */
  let envMapRT = null;

  /**
   * 按主题画 equirect 教室环境 → PMREM
   * 目标：亮天窗 + 墙面漫反射 + 地板暖回弹，去掉粉雾棚拍
   * @param {string} themeId
   */
  function buildClassroomEnv(themeId) {
    const c = mkCanvas(512, 256);
    const x = c.getContext('2d');
    const packs = {
      default: {
        sky: ['#d8e4f2', '#a8bdd4', '#6a7f96'],
        key: '255,252,248',
        fill: '210,220,235',
        floor: '180,175,168',
        warm: '255,230,200',
      },
      stationery: {
        sky: ['#f0e4d0', '#d4b896', '#8a6a4a'],
        key: '255,248,235',
        fill: '232,210,175',
        floor: '160,130,95',
        warm: '255,210,160',
      },
      reagent: {
        sky: ['#e8dfd2', '#c4b4a0', '#6e6256'],
        key: '255,250,242',
        fill: '210,195,175',
        floor: '120,108,95',
        warm: '255,200,150',
      },
      blackboard: {
        sky: ['#e8f0e6', '#a8c4b0', '#3d5c4a'],
        key: '248,252,245',
        fill: '190,210,195',
        floor: '90,100,85',
        warm: '240,220,160',
      },
      pixel: {
        sky: ['#c8d8d8', '#7a9a9a', '#3a5050'],
        key: '255,255,255',
        fill: '160,200,195',
        floor: '70,90,95',
        warm: '255,170,180',
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
    envBlob(x, 160, 70, 110, p.key, 0.72);
    envBlob(x, 400, 100, 70, p.fill, 0.4);
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
      if (prev && prev !== next) {
        try {
          prev.dispose();
        } catch (_) {
          /* ignore */
        }
      }
    } catch (err) {
      console.warn('Classroom env map failed, keep previous', err);
    }
  }

  return { buildClassroomEnv };
}
