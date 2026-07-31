/**
 * Shared procedural book textures (laminate, cloth, page striation, endpaper).
 */

/**
 * @param {number} w
 * @param {number} h
 * @returns {HTMLCanvasElement}
 */
export function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * 封面极淡印刷瑕疵
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 */
export function paintPrintWear(ctx, w, h) {
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  for (let i = 0; i < 4; i++) {
    const y = Math.random() * h;
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.02 + Math.random() * 0.03).toFixed(3) + ')';
    ctx.lineWidth = 0.7 + Math.random();
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y + (Math.random() - 0.5) * 22);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'multiply';
  const corners = [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ];
  for (const [cx, cy] of corners) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.16);
    g.addColorStop(0, 'rgba(40,32,24,0.035)');
    g.addColorStop(1, 'rgba(40,32,24,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - w * 0.16, cy - h * 0.14, w * 0.32, h * 0.28);
  }
  ctx.restore();
}

/**
 * @param {typeof import('three')} THREE
 * @param {number} ANISO
 */
export function createSharedBookTextures(THREE, ANISO) {
  function tex(c) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = ANISO;
    return t;
  }

  function noiseTexture(base, amp, scratches) {
    const s = 256;
    const c = mkCanvas(s, s);
    const x = c.getContext('2d');
    const img = x.createImageData(s, s);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = base + (Math.random() - 0.5) * 2 * amp;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    if (scratches) {
      x.strokeStyle = 'rgba(200,200,200,.25)';
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
    const s = 128;
    const c = mkCanvas(s, s);
    const x = c.getContext('2d');
    x.fillStyle = '#808080';
    x.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 2) {
      x.fillStyle = i % 4 === 0 ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.22)';
      x.fillRect(i, 0, 1, s);
      x.fillRect(0, i, s, 1);
    }
    return new THREE.CanvasTexture(c);
  })();

  function striationTexture(vertical) {
    const s = 512;
    const c = mkCanvas(s, s);
    const x = c.getContext('2d');
    x.fillStyle = '#e4d9c4';
    x.fillRect(0, 0, s, s);
    let p = 0;
    while (p < s) {
      const w = 0.55 + Math.random() * 1.9;
      const tone = Math.random();
      x.fillStyle =
        tone < 0.08
          ? 'rgba(88,72,48,.78)'
          : tone < 0.2
            ? 'rgba(150,130,95,.58)'
            : tone < 0.55
              ? 'rgba(255,252,245,.72)'
              : 'rgba(198,182,150,.52)';
      if (vertical) x.fillRect(p, 0, w, s);
      else x.fillRect(0, p, s, w);
      p += w + 0.28 + Math.random() * 1.0;
    }
    for (let i = 0; i < 22; i++) {
      const q = Math.random() * s;
      const thick = 1.1 + Math.random() * 2.4;
      x.fillStyle = 'rgba(70,55,38,' + (0.3 + Math.random() * 0.28).toFixed(3) + ')';
      if (vertical) x.fillRect(q, 0, thick, s);
      else x.fillRect(0, q, s, thick);
    }
    for (let i = 0; i < 3600; i++) {
      x.fillStyle = 'rgba(110,95,70,' + (Math.random() * 0.14).toFixed(3) + ')';
      x.fillRect(Math.random() * s, Math.random() * s, 1.1, 1.1);
    }
    const wash = vertical
      ? x.createLinearGradient(0, 0, s, 0)
      : x.createLinearGradient(0, 0, 0, s);
    wash.addColorStop(0, 'rgba(210,175,110,.14)');
    wash.addColorStop(0.45, 'rgba(0,0,0,0)');
    wash.addColorStop(1, 'rgba(40,30,18,.12)');
    x.fillStyle = wash;
    x.fillRect(0, 0, s, s);
    return tex(c);
  }

  function striationBumpTexture(vertical) {
    const s = 512;
    const c = mkCanvas(s, s);
    const x = c.getContext('2d');
    x.fillStyle = '#808080';
    x.fillRect(0, 0, s, s);
    let p = 0;
    while (p < s) {
      const w = 0.5 + Math.random() * 1.7;
      const tone = Math.random();
      const g =
        tone < 0.12
          ? 48 + Math.random() * 30
          : tone < 0.45
            ? 170 + Math.random() * 50
            : 100 + Math.random() * 40;
      x.fillStyle = `rgb(${g | 0},${g | 0},${g | 0})`;
      if (vertical) x.fillRect(p, 0, w, s);
      else x.fillRect(0, p, s, w);
      p += w + 0.22 + Math.random() * 0.85;
    }
    for (let i = 0; i < 28; i++) {
      const q = Math.random() * s;
      const thick = 1.4 + Math.random() * 2.8;
      const g = 28 + Math.random() * 36;
      x.fillStyle = `rgb(${g | 0},${g | 0},${g | 0})`;
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
    const s = 512;
    const c = mkCanvas(s, s);
    const x = c.getContext('2d');
    x.fillStyle = '#f3edde';
    x.fillRect(0, 0, s, s);
    for (let i = 0; i < 1400; i++) {
      x.fillStyle =
        'rgba(120,105,70,' + (0.04 + Math.random() * 0.08).toFixed(3) + ')';
      x.fillRect(Math.random() * s, Math.random() * s, 1.4, 1.4);
    }
    const g = x.createLinearGradient(0, 0, s, 0);
    g.addColorStop(0, 'rgba(0,0,0,.07)');
    g.addColorStop(0.12, 'rgba(0,0,0,0)');
    g.addColorStop(0.88, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.07)');
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
    return tex(c);
  })();

  function std(o) {
    return new THREE.MeshStandardMaterial(Object.assign({ metalness: 0.02 }, o));
  }

  function phys(o) {
    return new THREE.MeshPhysicalMaterial(Object.assign({ metalness: 0.03 }, o));
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

  return {
    tex,
    laminateBump,
    clothBump,
    paperFlat,
    striMatV,
    striMatH,
    endpaperMat,
    pageMats,
    std,
    phys,
  };
}
