/**
 * 学科书封面：按主题 × 学科精心绘制（非整色换皮）。
 * 主题语汇对齐 tokens：default / stationery / reagent / blackboard / pixel
 */

import { getActiveThemeId } from '../../shared/theme/apply.js';

function cssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

export function readAccent() {
  return {
    stamp: cssVar('--stamp', '#3b82f6'),
    diagram: cssVar('--diagram', '#2563eb'),
    note: cssVar('--note', '#fbbf24'),
    ink: cssVar('--ink', '#1e293b'),
    paper: cssVar('--paper', '#f0f4f8'),
    card: cssVar('--card-elevated', '#ffffff'),
    soft: cssVar('--stamp-soft', '#eff6ff'),
  };
}

function rr(x, px, py, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  x.beginPath();
  x.moveTo(px + rad, py);
  x.arcTo(px + w, py, px + w, py + h, rad);
  x.arcTo(px + w, py + h, px, py + h, rad);
  x.arcTo(px, py + h, px, py, rad);
  x.arcTo(px, py, px + w, py, rad);
  x.closePath();
}

function fillNoise(x, w, h, rgba, n = 80) {
  x.fillStyle = rgba;
  for (let i = 0; i < n; i++) {
    x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1);
  }
}

function titleBlock(x, w, h, name, en, ink, enColor) {
  x.textAlign = 'center';
  x.fillStyle = ink;
  x.font = `800 ${Math.floor(h * 0.092)}px "PingFang SC", "Segoe UI", sans-serif`;
  x.fillText(name, w / 2, h * 0.78);
  x.fillStyle = enColor;
  x.font = `600 ${Math.floor(h * 0.026)}px Georgia, "Times New Roman", serif`;
  const gap = 5;
  const chars = [...en];
  let tot = 0;
  const widths = chars.map((ch) => {
    const m = x.measureText(ch).width;
    tot += m;
    return m;
  });
  tot += gap * (chars.length - 1);
  let px = w / 2 - tot / 2;
  chars.forEach((ch, i) => {
    x.fillText(ch, px + widths[i] / 2, h * 0.84);
    px += widths[i] + gap;
  });
}

function panel(x, w, h, bg) {
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
}

function frame(x, w, h, color, inset = 36, stroke = 6) {
  x.strokeStyle = color;
  x.lineWidth = stroke;
  rr(x, inset, inset, w - inset * 2, h - inset * 2, 18);
  x.stroke();
}

/* ---------- default：教材浅蓝印刷感 ---------- */
function paintDefaultChemistry(x, w, h, a) {
  panel(x, w, h, '#163a4a');
  fillNoise(x, w, h, 'rgba(255,255,255,0.05)', 60);
  const g = x.createRadialGradient(w * 0.5, h * 0.36, 10, w * 0.5, h * 0.36, w * 0.4);
  g.addColorStop(0, a.diagram);
  g.addColorStop(0.55, a.stamp);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.beginPath();
  x.arc(w * 0.5, h * 0.36, w * 0.34, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = a.paper;
  x.lineWidth = 9;
  x.beginPath();
  x.moveTo(w * 0.43, h * 0.2);
  x.lineTo(w * 0.43, h * 0.32);
  x.lineTo(w * 0.33, h * 0.5);
  x.quadraticCurveTo(w * 0.5, h * 0.6, w * 0.67, h * 0.5);
  x.lineTo(w * 0.57, h * 0.32);
  x.lineTo(w * 0.57, h * 0.2);
  x.stroke();
  x.fillStyle = 'rgba(94,234,212,0.5)';
  x.beginPath();
  x.moveTo(w * 0.37, h * 0.45);
  x.quadraticCurveTo(w * 0.5, h * 0.55, w * 0.63, h * 0.45);
  x.lineTo(w * 0.56, h * 0.34);
  x.lineTo(w * 0.44, h * 0.34);
  x.fill();
  frame(x, w, h, 'rgba(255,255,255,0.18)', 28, 3);
  titleBlock(x, w, h, '化学', 'CHEMISTRY', a.paper, a.diagram);
}

function paintDefaultPhysics(x, w, h, a) {
  panel(x, w, h, '#1a1840');
  fillNoise(x, w, h, 'rgba(167,139,250,0.12)', 50);
  x.strokeStyle = a.stamp;
  x.lineWidth = 5;
  for (let i = 0; i < 6; i++) {
    x.beginPath();
    x.ellipse(w * 0.5, h * 0.34, w * (0.1 + i * 0.055), h * (0.07 + i * 0.035), i * 0.4, 0, Math.PI * 2);
    x.stroke();
  }
  x.fillStyle = a.note;
  x.beginPath();
  x.arc(w * 0.5, h * 0.34, 18, 0, Math.PI * 2);
  x.fill();
  frame(x, w, h, 'rgba(255,255,255,0.14)', 28, 3);
  titleBlock(x, w, h, '物理', 'PHYSICS', a.paper, a.stamp);
}

function paintDefaultBiology(x, w, h, a) {
  panel(x, w, h, '#143528');
  const leaf = x.createRadialGradient(w * 0.5, h * 0.34, 8, w * 0.5, h * 0.34, w * 0.28);
  leaf.addColorStop(0, a.diagram);
  leaf.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = leaf;
  x.beginPath();
  x.ellipse(w * 0.5, h * 0.34, w * 0.22, h * 0.16, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = a.note;
  x.globalAlpha = 0.85;
  x.beginPath();
  x.ellipse(w * 0.42, h * 0.32, w * 0.07, h * 0.05, -0.5, 0, Math.PI * 2);
  x.ellipse(w * 0.58, h * 0.36, w * 0.06, h * 0.045, 0.4, 0, Math.PI * 2);
  x.fill();
  x.globalAlpha = 1;
  frame(x, w, h, 'rgba(255,255,255,0.14)', 28, 3);
  titleBlock(x, w, h, '生物', 'BIOLOGY', a.paper, a.diagram);
}

function paintDefaultMath(x, w, h, a) {
  panel(x, w, h, '#1c1917');
  x.strokeStyle = 'rgba(251,191,36,0.28)';
  x.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    const y = h * 0.18 + i * h * 0.035;
    x.beginPath();
    x.moveTo(w * 0.18, y);
    x.lineTo(w * 0.82, y);
    x.stroke();
  }
  x.fillStyle = a.note;
  x.font = `700 ${Math.floor(h * 0.12)}px Georgia, serif`;
  x.textAlign = 'center';
  x.fillText('∑  ∫  π', w / 2, h * 0.4);
  frame(x, w, h, 'rgba(252,211,77,0.25)', 28, 3);
  titleBlock(x, w, h, '数学', 'MATHEMATICS', a.paper, a.note);
}

/* ---------- stationery：校刊纸 + 朱红章 ---------- */
function kraft(x, w, h) {
  panel(x, w, h, '#e8d7c0');
  fillNoise(x, w, h, 'rgba(120,80,40,0.08)', 120);
  fillNoise(x, w, h, 'rgba(255,255,255,0.12)', 40);
}

function seal(x, cx, cy, r, color) {
  x.strokeStyle = color;
  x.lineWidth = 5;
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.stroke();
  x.lineWidth = 2;
  x.beginPath();
  x.arc(cx, cy, r * 0.78, 0, Math.PI * 2);
  x.stroke();
}

function paintStationeryChemistry(x, w, h, a) {
  kraft(x, w, h);
  seal(x, w * 0.5, h * 0.34, w * 0.18, a.stamp);
  x.strokeStyle = a.ink;
  x.lineWidth = 7;
  x.beginPath();
  x.moveTo(w * 0.44, h * 0.24);
  x.lineTo(w * 0.44, h * 0.32);
  x.lineTo(w * 0.36, h * 0.44);
  x.quadraticCurveTo(w * 0.5, h * 0.52, w * 0.64, h * 0.44);
  x.lineTo(w * 0.56, h * 0.32);
  x.lineTo(w * 0.56, h * 0.24);
  x.stroke();
  x.fillStyle = 'rgba(194,59,34,0.2)';
  x.fillRect(w * 0.12, h * 0.62, w * 0.76, 2);
  titleBlock(x, w, h, '化学', 'CHEMISTRY', a.ink, a.stamp);
}

function paintStationeryPhysics(x, w, h, a) {
  kraft(x, w, h);
  x.strokeStyle = a.diagram;
  x.lineWidth = 4;
  for (let i = 0; i < 5; i++) {
    x.beginPath();
    x.arc(w * 0.5, h * 0.34, w * (0.08 + i * 0.045), 0, Math.PI * 2);
    x.stroke();
  }
  seal(x, w * 0.78, h * 0.2, 48, a.stamp);
  titleBlock(x, w, h, '物理', 'PHYSICS', a.ink, a.diagram);
}

function paintStationeryBiology(x, w, h, a) {
  kraft(x, w, h);
  x.fillStyle = a.diagram;
  x.beginPath();
  x.moveTo(w * 0.5, h * 0.2);
  x.quadraticCurveTo(w * 0.68, h * 0.34, w * 0.5, h * 0.5);
  x.quadraticCurveTo(w * 0.32, h * 0.34, w * 0.5, h * 0.2);
  x.fill();
  x.fillStyle = a.stamp;
  x.font = `700 ${Math.floor(h * 0.04)}px "PingFang SC", sans-serif`;
  x.textAlign = 'center';
  x.fillText('兴趣小组·标本', w / 2, h * 0.58);
  titleBlock(x, w, h, '生物', 'BIOLOGY', a.ink, a.diagram);
}

function paintStationeryMath(x, w, h, a) {
  kraft(x, w, h);
  x.strokeStyle = 'rgba(26,34,48,0.2)';
  x.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    x.beginPath();
    x.moveTo(w * 0.16, h * 0.16 + i * h * 0.035);
    x.lineTo(w * 0.84, h * 0.16 + i * h * 0.035);
    x.stroke();
  }
  x.fillStyle = a.ink;
  x.font = `700 ${Math.floor(h * 0.11)}px Georgia, serif`;
  x.textAlign = 'center';
  x.fillText('a²+b²=c²', w / 2, h * 0.4);
  seal(x, w * 0.78, h * 0.7, 42, a.stamp);
  titleBlock(x, w, h, '数学', 'MATHEMATICS', a.ink, a.stamp);
}

/* ---------- reagent：石灰柜 · 紫铜扣 ---------- */
function wood(x, w, h) {
  panel(x, w, h, '#3a342c');
  for (let i = 0; i < 18; i++) {
    x.strokeStyle = `rgba(201,162,39,${0.05 + Math.random() * 0.08})`;
    x.lineWidth = 1 + Math.random() * 2;
    x.beginPath();
    const y = (i / 18) * h;
    x.moveTo(0, y);
    x.bezierCurveTo(w * 0.3, y + 8, w * 0.7, y - 6, w, y + 4);
    x.stroke();
  }
}

function brassPlate(x, cx, cy, ww, hh) {
  const g = x.createLinearGradient(cx - ww / 2, cy, cx + ww / 2, cy);
  g.addColorStop(0, '#8a6a28');
  g.addColorStop(0.5, '#e6c76a');
  g.addColorStop(1, '#6e541c');
  x.fillStyle = g;
  rr(x, cx - ww / 2, cy - hh / 2, ww, hh, 6);
  x.fill();
}

function paintReagentChemistry(x, w, h, a) {
  wood(x, w, h);
  brassPlate(x, w * 0.5, h * 0.22, w * 0.55, 36);
  x.fillStyle = '#2a231c';
  x.font = `700 ${Math.floor(h * 0.028)}px Georgia, serif`;
  x.textAlign = 'center';
  x.fillText('REAGENT  ·  chem', w / 2, h * 0.235);
  // vial
  x.fillStyle = 'rgba(180,100,40,0.35)';
  rr(x, w * 0.42, h * 0.3, w * 0.16, h * 0.22, 10);
  x.fill();
  x.strokeStyle = a.note;
  x.lineWidth = 4;
  rr(x, w * 0.42, h * 0.3, w * 0.16, h * 0.22, 10);
  x.stroke();
  x.fillStyle = a.stamp;
  x.beginPath();
  x.arc(w * 0.5, h * 0.28, 14, 0, Math.PI * 2);
  x.fill();
  titleBlock(x, w, h, '化学', 'CHEMISTRY', '#f5efe3', a.note);
}

function paintReagentPhysics(x, w, h, a) {
  wood(x, w, h);
  brassPlate(x, w * 0.5, h * 0.22, w * 0.55, 36);
  x.fillStyle = '#2a231c';
  x.font = `700 ${Math.floor(h * 0.028)}px Georgia, serif`;
  x.textAlign = 'center';
  x.fillText('REAGENT  ·  phys', w / 2, h * 0.235);
  x.strokeStyle = a.note;
  x.lineWidth = 4;
  for (let i = 0; i < 4; i++) {
    x.beginPath();
    x.arc(w * 0.5, h * 0.4, 30 + i * 22, 0, Math.PI * 2);
    x.stroke();
  }
  titleBlock(x, w, h, '物理', 'PHYSICS', '#f5efe3', a.note);
}

function paintReagentBiology(x, w, h, a) {
  wood(x, w, h);
  brassPlate(x, w * 0.5, h * 0.22, w * 0.55, 36);
  x.fillStyle = '#2a231c';
  x.font = `700 ${Math.floor(h * 0.028)}px Georgia, serif`;
  x.textAlign = 'center';
  x.fillText('REAGENT  ·  bio', w / 2, h * 0.235);
  x.fillStyle = a.diagram;
  x.beginPath();
  x.ellipse(w * 0.5, h * 0.4, 70, 50, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = a.note;
  x.beginPath();
  x.ellipse(w * 0.45, h * 0.38, 22, 16, -0.4, 0, Math.PI * 2);
  x.fill();
  titleBlock(x, w, h, '生物', 'BIOLOGY', '#f5efe3', a.diagram);
}

function paintReagentMath(x, w, h, a) {
  wood(x, w, h);
  brassPlate(x, w * 0.5, h * 0.22, w * 0.55, 36);
  x.fillStyle = '#2a231c';
  x.font = `700 ${Math.floor(h * 0.028)}px Georgia, serif`;
  x.textAlign = 'center';
  x.fillText('REAGENT  ·  math', w / 2, h * 0.235);
  x.fillStyle = a.note;
  x.font = `700 ${Math.floor(h * 0.12)}px Georgia, serif`;
  x.fillText('Δ  ∇  ∞', w / 2, h * 0.42);
  titleBlock(x, w, h, '数学', 'MATHEMATICS', '#f5efe3', a.note);
}

/* ---------- blackboard：粉笔线稿 ---------- */
function board(x, w, h) {
  panel(x, w, h, '#1a3d32');
  fillNoise(x, w, h, 'rgba(255,255,255,0.04)', 90);
  // chalk dust
  x.fillStyle = 'rgba(240,208,96,0.08)';
  for (let i = 0; i < 30; i++) {
    x.beginPath();
    x.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 0, Math.PI * 2);
    x.fill();
  }
}

function chalkStroke(x, color, alpha = 0.9) {
  x.strokeStyle = color;
  x.globalAlpha = alpha;
  x.lineCap = 'round';
  x.lineJoin = 'round';
}

function paintBlackboardChemistry(x, w, h, a) {
  board(x, w, h);
  chalkStroke(x, a.stamp);
  x.lineWidth = 8;
  x.beginPath();
  x.moveTo(w * 0.42, h * 0.22);
  x.lineTo(w * 0.42, h * 0.34);
  x.lineTo(w * 0.34, h * 0.5);
  x.quadraticCurveTo(w * 0.5, h * 0.58, w * 0.66, h * 0.5);
  x.lineTo(w * 0.58, h * 0.34);
  x.lineTo(w * 0.58, h * 0.22);
  x.stroke();
  chalkStroke(x, a.diagram, 0.7);
  x.lineWidth = 3;
  x.beginPath();
  x.arc(w * 0.5, h * 0.36, w * 0.26, 0, Math.PI * 2);
  x.stroke();
  x.globalAlpha = 1;
  titleBlock(x, w, h, '化学', 'CHEMISTRY', a.paper, a.stamp);
}

function paintBlackboardPhysics(x, w, h, a) {
  board(x, w, h);
  chalkStroke(x, a.paper);
  x.lineWidth = 4;
  for (let i = 0; i < 5; i++) {
    x.beginPath();
    x.ellipse(w * 0.5, h * 0.34, w * (0.1 + i * 0.05), h * (0.07 + i * 0.03), i * 0.5, 0, Math.PI * 2);
    x.stroke();
  }
  x.fillStyle = a.stamp;
  x.globalAlpha = 0.95;
  x.beginPath();
  x.arc(w * 0.5, h * 0.34, 14, 0, Math.PI * 2);
  x.fill();
  x.globalAlpha = 1;
  titleBlock(x, w, h, '物理', 'PHYSICS', a.paper, a.stamp);
}

function paintBlackboardBiology(x, w, h, a) {
  board(x, w, h);
  chalkStroke(x, a.diagram);
  x.lineWidth = 6;
  x.beginPath();
  x.moveTo(w * 0.5, h * 0.2);
  x.quadraticCurveTo(w * 0.7, h * 0.34, w * 0.5, h * 0.5);
  x.quadraticCurveTo(w * 0.3, h * 0.34, w * 0.5, h * 0.2);
  x.stroke();
  chalkStroke(x, a.note, 0.85);
  x.lineWidth = 4;
  x.beginPath();
  x.ellipse(w * 0.44, h * 0.34, 22, 14, -0.3, 0, Math.PI * 2);
  x.ellipse(w * 0.56, h * 0.38, 18, 12, 0.4, 0, Math.PI * 2);
  x.stroke();
  x.globalAlpha = 1;
  titleBlock(x, w, h, '生物', 'BIOLOGY', a.paper, a.diagram);
}

function paintBlackboardMath(x, w, h, a) {
  board(x, w, h);
  x.fillStyle = a.stamp;
  x.font = `700 ${Math.floor(h * 0.13)}px "Comic Sans MS", "PingFang SC", sans-serif`;
  x.textAlign = 'center';
  x.globalAlpha = 0.92;
  x.fillText('Σ ∫ π', w / 2, h * 0.38);
  x.font = `600 ${Math.floor(h * 0.045)}px "PingFang SC", sans-serif`;
  x.fillStyle = a.diagram;
  x.fillText('板书推演', w / 2, h * 0.5);
  x.globalAlpha = 1;
  titleBlock(x, w, h, '数学', 'MATHEMATICS', a.paper, a.stamp);
}

/* ---------- pixel：厚描边色块 ---------- */
function pixelRect(x, px, py, ww, hh, color) {
  x.fillStyle = color;
  x.fillRect(Math.round(px), Math.round(py), Math.round(ww), Math.round(hh));
}

function paintPixelChemistry(x, w, h, a) {
  panel(x, w, h, '#2d3436');
  // chunky shadow
  pixelRect(x, w * 0.16 + 12, h * 0.18 + 12, w * 0.68, h * 0.42, '#1e272e');
  pixelRect(x, w * 0.16, h * 0.18, w * 0.68, h * 0.42, a.diagram);
  pixelRect(x, w * 0.16, h * 0.18, w * 0.68, 14, a.stamp);
  pixelRect(x, w * 0.4, h * 0.26, w * 0.2, h * 0.08, '#fff');
  pixelRect(x, w * 0.36, h * 0.34, w * 0.28, h * 0.16, a.stamp);
  pixelRect(x, w * 0.4, h * 0.38, w * 0.2, h * 0.08, a.note);
  // outline
  x.strokeStyle = a.ink;
  x.lineWidth = 10;
  x.strokeRect(w * 0.16, h * 0.18, w * 0.68, h * 0.42);
  titleBlock(x, w, h, '化学', 'CHEMISTRY', '#fff', a.stamp);
}

function paintPixelPhysics(x, w, h, a) {
  panel(x, w, h, '#2d3436');
  pixelRect(x, w * 0.18 + 12, h * 0.2 + 12, w * 0.64, h * 0.38, '#1e272e');
  pixelRect(x, w * 0.18, h * 0.2, w * 0.64, h * 0.38, a.note);
  for (let i = 0; i < 4; i++) {
    const s = 40 + i * 36;
    x.strokeStyle = a.stamp;
    x.lineWidth = 8;
    x.strokeRect(w * 0.5 - s / 2, h * 0.39 - s / 2, s, s);
  }
  pixelRect(x, w * 0.5 - 10, h * 0.39 - 10, 20, 20, '#fff');
  x.strokeStyle = a.ink;
  x.lineWidth = 10;
  x.strokeRect(w * 0.18, h * 0.2, w * 0.64, h * 0.38);
  titleBlock(x, w, h, '物理', 'PHYSICS', '#fff', a.note);
}

function paintPixelBiology(x, w, h, a) {
  panel(x, w, h, '#2d3436');
  pixelRect(x, w * 0.18 + 12, h * 0.2 + 12, w * 0.64, h * 0.38, '#1e272e');
  pixelRect(x, w * 0.18, h * 0.2, w * 0.64, h * 0.38, a.diagram);
  pixelRect(x, w * 0.34, h * 0.3, w * 0.14, h * 0.14, a.note);
  pixelRect(x, w * 0.52, h * 0.34, w * 0.14, h * 0.12, a.stamp);
  x.strokeStyle = a.ink;
  x.lineWidth = 10;
  x.strokeRect(w * 0.18, h * 0.2, w * 0.64, h * 0.38);
  titleBlock(x, w, h, '生物', 'BIOLOGY', '#fff', a.diagram);
}

function paintPixelMath(x, w, h, a) {
  panel(x, w, h, '#2d3436');
  pixelRect(x, w * 0.18 + 12, h * 0.2 + 12, w * 0.64, h * 0.38, '#1e272e');
  pixelRect(x, w * 0.18, h * 0.2, w * 0.64, h * 0.38, '#1e272e');
  const cells = [a.stamp, a.diagram, a.note, a.stamp, a.note, a.diagram];
  cells.forEach((c, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    pixelRect(x, w * 0.26 + col * w * 0.16, h * 0.26 + row * h * 0.12, w * 0.14, h * 0.1, c);
  });
  x.strokeStyle = a.ink;
  x.lineWidth = 10;
  x.strokeRect(w * 0.18, h * 0.2, w * 0.64, h * 0.38);
  titleBlock(x, w, h, '数学', 'MATHEMATICS', '#fff', a.stamp);
}

const TABLE = {
  default: {
    chemistry: paintDefaultChemistry,
    physics: paintDefaultPhysics,
    biology: paintDefaultBiology,
    math: paintDefaultMath,
  },
  stationery: {
    chemistry: paintStationeryChemistry,
    physics: paintStationeryPhysics,
    biology: paintStationeryBiology,
    math: paintStationeryMath,
  },
  reagent: {
    chemistry: paintReagentChemistry,
    physics: paintReagentPhysics,
    biology: paintReagentBiology,
    math: paintReagentMath,
  },
  blackboard: {
    chemistry: paintBlackboardChemistry,
    physics: paintBlackboardPhysics,
    biology: paintBlackboardBiology,
    math: paintBlackboardMath,
  },
  pixel: {
    chemistry: paintPixelChemistry,
    physics: paintPixelPhysics,
    biology: paintPixelBiology,
    math: paintPixelMath,
  },
};

/**
 * @param {CanvasRenderingContext2D} x
 * @param {number} w
 * @param {number} h
 * @param {{ id: string, name: string }} subject
 * @param {string} [themeId]
 */
export function paintSubjectCover(x, w, h, subject, themeId) {
  const theme = themeId || getActiveThemeId();
  const a = readAccent();
  const pack = TABLE[theme] || TABLE.default;
  const fn = pack[subject.id] || TABLE.default.chemistry;
  fn(x, w, h, a);
}

export function paintBack(x, w, h, cfg) {
  const a = readAccent();
  x.fillStyle = cfg.backBg || a.diagram;
  x.fillRect(0, 0, w, h);
  fillNoise(x, w, h, 'rgba(255,255,255,0.06)', 40);
  const ink = cfg.backInk || '255,255,255';
  x.fillStyle = `rgba(${ink},0.75)`;
  let y = h * 0.2;
  for (let i = 0; i < 10; i++) {
    const ww = w * (0.4 + (i % 3) * 0.12);
    rr(x, (w - ww) / 2, y, ww, 9, 4);
    x.fill();
    y += 30;
  }
  x.fillStyle = a.paper;
  rr(x, w * 0.34, h * 0.8, w * 0.32, h * 0.08, 6);
  x.fill();
}

export function paintSpine(x, w, h, cfg) {
  const a = readAccent();
  x.fillStyle = cfg.spineBg || a.stamp;
  x.fillRect(0, 0, w, h);
  fillNoise(x, w, h, 'rgba(0,0,0,0.08)', 30);
  x.save();
  x.translate(w / 2, h / 2);
  x.rotate(-Math.PI / 2);
  x.fillStyle = cfg.spineInk || a.paper;
  x.font = cfg.spineFont || '700 44px "PingFang SC", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(cfg.spineTitle || cfg.title, 0, 0);
  x.restore();
}

/** Theme-tinted boards — edge/spine/back 对齐各主题封面布面主色 */
export function themeBookBoards(subjectId, themeId) {
  const a = readAccent();
  const theme = themeId || getActiveThemeId();
  const byTheme = {
    /* v1：绿化学 / 深蓝物理 / 羊皮纸生物 / 金边数学 */
    default: {
      chemistry: {
        edge: '#2a9a4a',
        backBg: '#1a7935',
        spineBg: '#1f8a3d',
        spineInk: '#f5f0e0',
        backInk: '245,240,224',
      },
      physics: {
        edge: '#1a2040',
        backBg: '#000824',
        spineBg: '#0a1230',
        spineInk: '#e8dcc0',
        backInk: '232,220,192',
      },
      biology: {
        edge: '#e8d4b0',
        backBg: '#b8956a',
        spineBg: '#c4a078',
        spineInk: '#3d2a18',
        backInk: '244,236,216',
      },
      math: {
        edge: '#f0e4d0',
        backBg: '#0a2056',
        spineBg: '#1e3a8a',
        spineInk: '#fbf2dd',
        backInk: '251,242,221',
      },
    },
    /* v2：暗夜化学 / 海军物理 / 羊皮生物 / 暗蓝数学 */
    stationery: {
      chemistry: {
        edge: '#2a2228',
        backBg: '#0a0b10',
        spineBg: '#151213',
        spineInk: '#f3e7d4',
        backInk: '243,231,212',
      },
      physics: {
        edge: '#1a2838',
        backBg: '#051123',
        spineBg: '#0a1828',
        spineInk: '#e8e0d4',
        backInk: '232,224,212',
      },
      biology: {
        edge: '#f4e9dd',
        backBg: '#e8d4b8',
        spineBg: '#df8a36',
        spineInk: '#1a2230',
        backInk: '255,250,242',
      },
      math: {
        edge: '#2a344a',
        backBg: '#0e1b34',
        spineBg: '#1a2840',
        spineInk: '#f0c75e',
        backInk: '255,250,242',
      },
    },
    /* v3：藕粉化学 / 朱红物理 / 苔绿生物 / 金箔数学 */
    reagent: {
      chemistry: {
        edge: '#d4b8c8',
        backBg: '#9a6a78',
        spineBg: '#b89db1',
        spineInk: '#2a231c',
        backInk: '245,239,227',
      },
      physics: {
        edge: '#d06058',
        backBg: '#b20e17',
        spineBg: '#c32728',
        spineInk: '#f5efe3',
        backInk: '245,239,227',
      },
      biology: {
        edge: '#5a6e5c',
        backBg: '#1c291f',
        spineBg: '#3b4e40',
        spineInk: '#d6c9ae',
        backInk: '245,239,227',
      },
      math: {
        edge: '#e8d070',
        backBg: '#a89028',
        spineBg: '#dbb93a',
        spineInk: '#2a231c',
        backInk: '245,239,227',
      },
    },
    /* v4：灰蓝化学 / 叶绿物理 / 钢青生物 / 赤陶数学 */
    blackboard: {
      chemistry: {
        edge: '#c8c4bc',
        backBg: '#0f2359',
        spineBg: '#5a6a88',
        spineInk: '#e4e0d8',
        backInk: '228,224,216',
      },
      physics: {
        edge: '#a8b020',
        backBg: '#141414',
        spineBg: '#757e0f',
        spineInk: '#e8ecd0',
        backInk: '232,236,208',
      },
      biology: {
        edge: '#c4d0d8',
        backBg: '#4a5560',
        spineBg: '#6a7880',
        spineInk: '#eef4f6',
        backInk: '238,244,246',
      },
      math: {
        edge: '#d08070',
        backBg: '#6f2a1d',
        spineBg: '#b23220',
        spineInk: '#e8dccb',
        backInk: '232,220,203',
      },
    },
    /* v5：青绿化学 / 橙物理 / 紫生物 / 玫瑰数学（布面精装） */
    pixel: {
      chemistry: {
        edge: '#1a5a66',
        backBg: '#00242b',
        spineBg: '#003c47',
        spineInk: '#e8ece8',
        backInk: '232,236,232',
      },
      physics: {
        edge: '#e86820',
        backBg: '#4f301e',
        spineBg: '#da4a06',
        spineInk: '#1a1208',
        backInk: '255,240,230',
      },
      biology: {
        edge: '#3a2048',
        backBg: '#1f0b2e',
        spineBg: '#241032',
        spineInk: '#e8dce8',
        backInk: '232,220,232',
      },
      math: {
        edge: '#c07068',
        backBg: '#271513',
        spineBg: '#ad5049',
        spineInk: '#f5e8e4',
        backInk: '245,232,228',
      },
    },
  };
  const pack = byTheme[theme] || byTheme.default;
  return (
    pack[subjectId] || {
      edge: a.paper,
      backBg: a.stamp,
      spineBg: a.stamp,
      spineInk: a.paper,
      backInk: '255,255,255',
    }
  );
}

function parseHex(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const raw = hex.trim().replace('#', '');
  const norm =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw.slice(0, 6);
  const n = Number.parseInt(norm, 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

function lightenHex(hex, amount) {
  const c = parseHex(hex);
  if (!c) return hex;
  return rgbToHex(
    c.r + (255 - c.r) * amount,
    c.g + (255 - c.g) * amount,
    c.b + (255 - c.b) * amount,
  );
}

/**
 * 进 / 退教室转场色板：与 themeBookBoards + 主题 tokens 对齐（非学科固定色）。
 * @param {string} subjectId
 * @param {string} [themeId]
 * @returns {string[]}
 */
export function transitionPaletteFor(subjectId, themeId) {
  const a = readAccent();
  const boards = themeBookBoards(subjectId, themeId);
  const edge = boards.edge || a.stamp || '#3b82f6';
  const dark = boards.backBg || boards.spineBg || edge;
  const accent = a.note || lightenHex(edge, 0.15);
  const light = a.paper || '#f8fafc';
  return [
    edge,
    lightenHex(edge, 0.32),
    lightenHex(edge, 0.52),
    accent,
    dark,
    light,
  ];
}

/**
 * 翻页用内页：有排线/插画/主题痕迹，不是纯白。
 * @param {HTMLCanvasElement} canvas
 * @param {object} opts
 */
export function paintFlipPage(canvas, opts) {
  const { index = 0, total = 6, subjectName = '化学', themeId, direction = 'enter' } = opts;
  const theme = themeId || getActiveThemeId();
  const a = readAccent();
  const w = canvas.width;
  const h = canvas.height;
  const x = canvas.getContext('2d');
  if (!x) return;

  // paper base per theme
  if (theme === 'stationery') {
    x.fillStyle = '#f4ebd9';
  } else if (theme === 'reagent') {
    x.fillStyle = '#f0e6d2';
  } else if (theme === 'blackboard') {
    x.fillStyle = '#243f37';
  } else if (theme === 'pixel') {
    x.fillStyle = '#f5f6fa';
  } else {
    x.fillStyle = a.paper;
  }
  x.fillRect(0, 0, w, h);

  // theme wash
  if (theme === 'stationery') {
    fillNoise(x, w, h, 'rgba(140,90,40,0.06)', 90);
    x.fillStyle = 'rgba(194,59,34,0.06)';
    x.fillRect(0, 0, w * 0.08, h);
  } else if (theme === 'reagent') {
    for (let i = 0; i < 14; i++) {
      x.strokeStyle = `rgba(201,162,39,${0.04 + (i % 3) * 0.02})`;
      x.beginPath();
      const y = (i / 14) * h;
      x.moveTo(0, y);
      x.bezierCurveTo(w * 0.35, y + 10, w * 0.65, y - 8, w, y + 4);
      x.stroke();
    }
  } else if (theme === 'blackboard') {
    fillNoise(x, w, h, 'rgba(240,208,96,0.04)', 40);
  } else if (theme === 'pixel') {
    for (let y = 0; y < h; y += 16) {
      for (let px = 0; px < w; px += 16) {
        if ((px + y) % 48 === 0) {
          x.fillStyle = 'rgba(45,52,54,0.05)';
          x.fillRect(px, y, 16, 16);
        }
      }
    }
  } else {
    fillNoise(x, w, h, 'rgba(37,99,235,0.04)', 50);
  }

  // margin rule
  const gutter = w * 0.1;
  x.fillStyle = theme === 'blackboard' ? 'rgba(240,208,96,0.35)' : a.stamp;
  x.globalAlpha = theme === 'pixel' ? 1 : 0.35;
  x.fillRect(gutter, 0, theme === 'pixel' ? 6 : 3, h);
  x.globalAlpha = 1;

  // ruled lines / pixel rows / chalk lines
  if (theme === 'pixel') {
    for (let i = 0; i < 16; i++) {
      x.fillStyle = i % 2 ? 'rgba(45,52,54,0.06)' : 'rgba(45,52,54,0.12)';
      x.fillRect(gutter + 16, h * 0.12 + i * (h * 0.048), w * 0.72, h * 0.04);
    }
  } else if (theme === 'blackboard') {
    x.strokeStyle = 'rgba(238,244,239,0.18)';
    x.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const y = h * 0.14 + i * (h * 0.05);
      x.beginPath();
      x.moveTo(gutter + 20, y);
      x.lineTo(w * 0.88, y);
      x.stroke();
    }
  } else {
    x.strokeStyle = 'rgba(30,40,60,0.12)';
    x.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      const y = h * 0.14 + i * (h * 0.045);
      x.beginPath();
      x.moveTo(gutter + 18, y);
      x.lineTo(w * 0.88, y);
      x.stroke();
    }
  }

  // motif vignette — each page clearly different
  const motifs = [
    () => {
      x.strokeStyle = a.diagram;
      x.lineWidth = 6;
      x.beginPath();
      x.arc(w * 0.58, h * 0.4, 78, 0, Math.PI * 2);
      x.stroke();
      x.beginPath();
      x.moveTo(w * 0.48, h * 0.32);
      x.lineTo(w * 0.48, h * 0.4);
      x.lineTo(w * 0.4, h * 0.5);
      x.quadraticCurveTo(w * 0.58, h * 0.58, w * 0.74, h * 0.5);
      x.lineTo(w * 0.66, h * 0.4);
      x.lineTo(w * 0.66, h * 0.32);
      x.stroke();
      x.fillStyle = a.stamp;
      x.font = `800 40px "PingFang SC", sans-serif`;
      x.fillText('① 开篇', gutter + 28, h * 0.2);
      x.font = `600 22px Georgia, serif`;
      x.fillStyle = theme === 'blackboard' ? a.paper : a.ink;
      x.fillText(subjectName, gutter + 28, h * 0.7);
    },
    () => {
      x.fillStyle = a.stamp;
      x.font = `800 36px "PingFang SC", sans-serif`;
      x.fillText(`${subjectName} · 目录`, gutter + 28, h * 0.2);
      const rows = ['第一章 · 开门见山', '第二章 · 动手试一试', '第三章 · 总结笔记', '附录 · 小工具', '练习 · 今日小题'];
      rows.forEach((row, i) => {
        x.fillStyle = theme === 'blackboard' ? 'rgba(238,244,239,0.12)' : 'rgba(0,0,0,0.08)';
        rr(x, gutter + 28, h * 0.28 + i * 58, w * 0.62, 36, 8);
        x.fill();
        x.fillStyle = theme === 'blackboard' ? a.paper : a.ink;
        x.font = `600 24px "PingFang SC", sans-serif`;
        x.fillText(row, gutter + 42, h * 0.28 + i * 58 + 24);
      });
    },
    () => {
      x.fillStyle = a.diagram;
      x.font = `800 34px "PingFang SC", sans-serif`;
      x.fillText('要点速写', gutter + 28, h * 0.2);
      x.strokeStyle = a.note;
      x.lineWidth = 5;
      x.beginPath();
      x.moveTo(gutter + 40, h * 0.55);
      x.quadraticCurveTo(w * 0.5, h * 0.28, w * 0.78, h * 0.58);
      x.stroke();
      for (let i = 0; i < 4; i++) {
        x.fillStyle = a.stamp;
        x.globalAlpha = 0.55;
        x.beginPath();
        x.arc(gutter + 70 + i * 90, h * 0.42 + (i % 2) * 30, 14, 0, Math.PI * 2);
        x.fill();
      }
      x.globalAlpha = 1;
      x.fillStyle = theme === 'blackboard' ? a.paper : a.ink;
      x.font = `600 20px "PingFang SC", sans-serif`;
      x.fillText('图注：通路 · 反应 · 关联', gutter + 28, h * 0.78);
    },
    () => {
      x.fillStyle = a.stamp;
      x.font = `800 34px "PingFang SC", sans-serif`;
      x.fillText(direction === 'enter' ? '推开门缝…' : '合上书页…', gutter + 28, h * 0.2);
      for (let i = 0; i < 4; i++) {
        x.strokeStyle = a.diagram;
        x.globalAlpha = 0.35 + i * 0.15;
        x.lineWidth = 4;
        x.strokeRect(gutter + 48 + i * 16, h * 0.32 + i * 16, w * 0.45, h * 0.3);
      }
      x.globalAlpha = 1;
      if (theme === 'stationery') {
        seal(x, w * 0.72, h * 0.72, 52, a.stamp);
      }
    },
    () => {
      x.fillStyle = theme === 'blackboard' ? a.paper : a.ink;
      x.font = `800 ${Math.floor(h * 0.09)}px "PingFang SC", sans-serif`;
      x.textAlign = 'center';
      x.fillText(direction === 'enter' ? '进入教室' : '回到大厅', w / 2, h * 0.42);
      x.font = `600 24px Georgia, serif`;
      x.fillStyle = a.stamp;
      x.fillText(direction === 'enter' ? 'the classroom opens' : 'the shelf returns', w / 2, h * 0.52);
      x.textAlign = 'left';
      x.strokeStyle = a.note;
      x.lineWidth = 4;
      x.beginPath();
      x.moveTo(w * 0.28, h * 0.6);
      x.lineTo(w * 0.72, h * 0.6);
      x.stroke();
    },
    () => {
      const g = x.createRadialGradient(w * 0.5, h * 0.42, 20, w * 0.5, h * 0.42, w * 0.42);
      g.addColorStop(0, a.soft);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      x.fillStyle = a.stamp;
      x.font = `800 30px "PingFang SC", sans-serif`;
      x.textAlign = 'center';
      x.fillText(direction === 'enter' ? '下一页是课堂' : '书脊在闪光', w / 2, h * 0.48);
      x.font = `600 20px "PingFang SC", sans-serif`;
      x.fillStyle = theme === 'blackboard' ? a.paper : a.ink;
      x.fillText(`${index + 1} 页纸还带着温度`, w / 2, h * 0.56);
      x.textAlign = 'left';
    },
  ];
  const fn = motifs[index % motifs.length];
  fn();

  // page number
  x.fillStyle = theme === 'blackboard' ? 'rgba(238,244,239,0.55)' : 'rgba(0,0,0,0.35)';
  x.font = `600 22px Georgia, serif`;
  x.textAlign = 'right';
  x.fillText(`${index + 1} / ${total}`, w * 0.88, h * 0.92);
  x.textAlign = 'left';

  // paper grain
  fillNoise(x, w, h, 'rgba(0,0,0,0.03)', 50);
}
