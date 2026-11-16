// toon.js — cartoon character art: soft blobs, ink outlines, big eyes, squash & stretch.
// Pure Canvas 2D helpers; every draw call assumes the context is translated to the
// character's centre and works in "unit" space scaled by s (the character radius in px).

import { PALETTE } from './config.js';

export const INK = '#0a0c1e';
export const TOON_FONT = '"Trebuchet MS", Verdana, "Segoe UI", sans-serif';

function rgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function mix(hex, target, amt) {
  const a = rgb(hex);
  const b = rgb(target);
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * amt));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export const lighten = (hex, amt = 0.45) => mix(hex, '#ffffff', amt);
export const darken = (hex, amt = 0.45) => mix(hex, '#000000', amt);

export function rr(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

// Polygon with rounded corners; round=1 gives a soft blob, lower values stay boxier.
export function roundPoly(ctx, pts, round = 0.85) {
  const n = pts.length;
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const lp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const inn = [];
  const out = [];
  for (let i = 0; i < n; i++) {
    inn[i] = lp(pts[i], mid(pts[i], pts[(i - 1 + n) % n]), round);
    out[i] = lp(pts[i], mid(pts[i], pts[(i + 1) % n]), round);
  }
  ctx.beginPath();
  ctx.moveTo(out[0].x, out[0].y);
  for (let j = 1; j <= n; j++) {
    const i = j % n;
    ctx.lineTo(inn[i].x, inn[i].y);
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, out[i].x, out[i].y);
  }
  ctx.closePath();
}

function P(x, y) {
  return { x, y };
}

export function shapePoints(shape, s) {
  switch (shape) {
    case 'tri':
      return [P(0, -s * 1.05), P(s * 0.95, s * 0.8), P(-s * 0.95, s * 0.8)];
    case 'square':
      return [P(-s * 0.85, -s * 0.85), P(s * 0.85, -s * 0.85), P(s * 0.85, s * 0.85), P(-s * 0.85, s * 0.85)];
    case 'hex': {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        pts.push(P(Math.cos(a) * s, Math.sin(a) * s));
      }
      return pts;
    }
    case 'boss': {
      const pts = [];
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i - Math.PI / 8;
        const r = i % 2 === 0 ? s : s * 0.62;
        pts.push(P(Math.cos(a) * r, Math.sin(a) * r));
      }
      return pts;
    }
    default: // diamond
      return [P(0, -s), P(s * 0.82, 0), P(0, s), P(-s * 0.82, 0)];
  }
}

export function bodyPath(ctx, shape, s) {
  if (shape === 'ghost') {
    const span = (s * 1.8) / 3;
    ctx.beginPath();
    ctx.arc(0, -s * 0.05, s * 0.9, Math.PI, 0);
    ctx.lineTo(s * 0.9, s * 0.6);
    for (let i = 0; i < 3; i++) {
      const x0 = s * 0.9 - span * i;
      ctx.quadraticCurveTo(x0 - span / 2, s * (i % 2 === 0 ? 1.05 : 0.3), x0 - span, s * 0.6);
    }
    ctx.closePath();
    return;
  }
  const round = shape === 'square' ? 0.5 : shape === 'boss' ? 0.45 : shape === 'tri' ? 0.7 : 0.8;
  roundPoly(ctx, shapePoints(shape, s), round);
}

// Ink outline of the current path (call right after fill).
export function ink(ctx, s, k = 1) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1.2, s * 0.16) * k;
  ctx.stroke();
}

function paint(ctx, color, s) {
  const g = ctx.createLinearGradient(0, -s, 0, s);
  g.addColorStop(0, lighten(color, 0.5));
  g.addColorStop(0.52, color);
  g.addColorStop(1, darken(color, 0.3));
  ctx.fillStyle = g;
  ctx.fill();
}

function gloss(ctx, s, alpha = 0.5) {
  ctx.beginPath();
  ctx.ellipse(-s * 0.3, -s * 0.5, s * 0.3, s * 0.16, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.fill();
}

export function groundShadow(ctx, r, lift = 0.85) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, r * lift, r * 0.95, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fill();
  ctx.restore();
}

function brows(ctx, s, ratio, gap, cy) {
  const r = s * ratio;
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.2, r * 0.5);
  for (const side of [-1, 1]) {
    const ex = side * s * gap;
    ctx.beginPath();
    ctx.moveTo(ex - side * r * 0.9, cy * s - r * 1.35);
    ctx.lineTo(ex + side * r * 0.7, cy * s - r * 0.85);
    ctx.stroke();
  }
}

export function eyes(ctx, s, look, o = {}) {
  const ratio = o.ratio ?? 0.27;
  const gap = o.gap ?? 0.4;
  const cy = o.cy ?? -0.12;
  const r = s * ratio;
  for (const side of [-1, 1]) {
    const ex = side * s * gap;
    const ey = cy * s;
    if (o.blink) {
      ctx.strokeStyle = INK;
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1.2, r * 0.42);
      ctx.beginPath();
      ctx.moveTo(ex - r * 0.7, ey + r * 0.1);
      ctx.lineTo(ex + r * 0.7, ey + r * 0.1);
      ctx.stroke();
      continue;
    }
    ctx.beginPath();
    ctx.ellipse(ex, ey, r * 0.8, r, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ink(ctx, s, 0.55);
    const px = ex + look.x * r * 0.3;
    const py = ey + look.y * r * 0.3;
    ctx.beginPath();
    ctx.ellipse(px, py, r * 0.42, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px - r * 0.2, py - r * 0.24, r * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();
  }
  if (o.angry) brows(ctx, s, ratio, gap, cy);
}

export function mouth(ctx, s, kind) {
  const y = s * 0.42;
  ctx.lineCap = 'round';
  if (kind === 'o') {
    ctx.beginPath();
    ctx.ellipse(0, y, s * 0.14, s * 0.17, 0, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    return;
  }
  if (kind === 'flat') {
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.2, s * 0.1);
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, y);
    ctx.lineTo(s * 0.2, y);
    ctx.stroke();
    return;
  }
  if (kind === 'smile') {
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.2, s * 0.1);
    ctx.beginPath();
    ctx.arc(0, y - s * 0.12, s * 0.26, 0.25 * Math.PI, 0.75 * Math.PI);
    ctx.stroke();
    return;
  }
  // 'grin' / 'fangs': open mouth with a white tooth band.
  ctx.beginPath();
  ctx.moveTo(-s * 0.32, y - s * 0.12);
  ctx.quadraticCurveTo(0, y + s * 0.4, s * 0.32, y - s * 0.12);
  ctx.closePath();
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-s * 0.4, y - s * 0.14, s * 0.8, s * 0.14);
  if (kind === 'fangs') {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * s * 0.16, y - s * 0.02);
      ctx.lineTo(side * s * 0.26, y - s * 0.02);
      ctx.lineTo(side * s * 0.21, y + s * 0.18);
      ctx.closePath();
      ctx.fillStyle = INK;
      ctx.fill();
    }
  }
  ctx.restore();
}

function crown(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(-s * 0.46, -s * 0.72);
  ctx.lineTo(-s * 0.46, -s * 1.06);
  ctx.lineTo(-s * 0.18, -s * 0.86);
  ctx.lineTo(0, -s * 1.16);
  ctx.lineTo(s * 0.18, -s * 0.86);
  ctx.lineTo(s * 0.46, -s * 1.06);
  ctx.lineTo(s * 0.46, -s * 0.72);
  ctx.closePath();
  ctx.fillStyle = PALETTE.yellow;
  ctx.fill();
  ink(ctx, s, 0.7);
}

function feet(ctx, s, wob, color) {
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * s * 0.45, s * (0.92 + (side > 0 ? wob : -wob) * 0.12), s * 0.3, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = darken(color, 0.35);
    ctx.fill();
    ink(ctx, s, 0.6);
  }
}

function antenna(ctx, s, sway, color) {
  const ax = sway * s * 0.22;
  const ay = -s * 1.42;
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.2, s * 0.11);
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.82);
  ctx.quadraticCurveTo(ax * 0.4, -s * 1.16, ax, ay);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ax, ay, s * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = lighten(color, 0.35);
  ctx.fill();
  ink(ctx, s, 0.6);
}

function streaks(ctx, s, e) {
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, s * 0.14);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * s * 0.75, -s * 0.1);
    ctx.lineTo(side * s * 0.75 - e.dirX * s * 1.15, -s * 0.1 - e.dirY * s * 1.15);
    ctx.stroke();
  }
}

function shield(ctx, s, e, color) {
  const fx = e.dirX || 0;
  const fy = e.dirY || 1;
  ctx.beginPath();
  ctx.arc(fx * s * 0.85, fy * s * 0.85 + s * 0.1, s * 0.46, 0, Math.PI * 2);
  paint(ctx, color, s * 0.5);
  ink(ctx, s, 0.8);
  ctx.beginPath();
  ctx.arc(fx * s * 0.85, fy * s * 0.85 + s * 0.1, s * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = darken(color, 0.3);
  ctx.fill();
}

const FACE = {
  drone: { ratio: 0.3, gap: 0.36, mouth: 'smile' },
  sprinter: { ratio: 0.26, gap: 0.36, angry: true, mouth: 'grin' },
  tank: { ratio: 0.22, gap: 0.34, angry: true, mouth: 'grin' },
  shielder: { ratio: 0.26, gap: 0.38, mouth: 'flat' },
  phantom: { ratio: 0.32, gap: 0.32, mouth: 'o' },
  boss: { ratio: 0.24, gap: 0.34, angry: true, mouth: 'fangs' },
};

// Full enemy character. Caller translates to the enemy position and handles alpha.
export function drawToonEnemy(ctx, e, s, time) {
  const color = e.color;
  const blink = e.blinkLeft > 0;
  const look = { x: e.dirX || 0, y: e.dirY || 1 };
  const wob = Math.sin(time * 8 + e.seed);
  const face = FACE[e.key] || FACE.drone;

  ctx.save();
  if (e.shape === 'tri') streaks(ctx, s, e);
  if (e.shape === 'hex') feet(ctx, s, wob, color);
  if (e.shape === 'diamond') antenna(ctx, s, wob, color);
  ctx.restore();

  bodyPath(ctx, e.shape, s);
  paint(ctx, color, s);
  if (e.hurt > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.7, e.hurt * 4)})`;
    ctx.fill();
  }
  ink(ctx, s);
  gloss(ctx, s);

  if (e.isBoss) crown(ctx, s);
  eyes(ctx, s, look, { ...face, blink });
  mouth(ctx, s, face.mouth);

  if (e.shape === 'hex') {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * s * 1.0, s * (0.15 + wob * 0.12 * side), s * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = lighten(color, 0.15);
      ctx.fill();
      ink(ctx, s, 0.6);
    }
  }
  if (e.shape === 'square') shield(ctx, s, e, lighten(color, 0.2));
}

// Each tower has its own silhouette that telegraphs its role:
// pulse = fast twin-barrel gatling, cryo = floating frost crystal, arc = tesla coil,
// rail = long sniper cannon. All share shadow, bob, and level pips.
function jit(n) {
  return Math.abs((Math.sin(n * 127.1) * 43758.5453) % 1);
}

function emblem(ctx, t, s, y) {
  ctx.font = `bold ${Math.round(s * 0.62)}px ${TOON_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.4, s * 0.2);
  ctx.strokeStyle = INK;
  ctx.strokeText(t.def.glyph, 0, y);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(t.def.glyph, 0, y);
}

function muzzleFlash(ctx, s, x, y, len) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i;
    const r = i % 2 ? s * 0.16 : s * len;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();
  ctx.restore();
}

function zigZap(ctx, x0, y0, x1, y1, s, seedT) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  for (let i = 1; i < 4; i++) {
    const f = i / 4;
    ctx.lineTo(x0 + (x1 - x0) * f + (jit(seedT + i * 7.3) - 0.5) * s * 0.55,
      y0 + (y1 - y0) * f + (jit(seedT + i * 3.7) - 0.5) * s * 0.4);
  }
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, s * 0.1);
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

// Pulse turret: hard-surface plasma emitter — octagonal tech pad, angular
// gunmetal turret, dual plasma rails with a charged core orb. No face, no ink.
function bolt(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function chamferPath(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

function pulseArt(ctx, t, s, time, bob) {
  const color = t.def.color;
  const seed = t.col * 7.13 + t.row * 3.71;
  const idle = 0.5 + 0.5 * Math.sin(time * 2.2 + seed);
  const heat = t.recoil;
  const edge = 'rgba(8,12,22,0.9)';

  // --- static octagonal tech pad with emissive rim ---
  ctx.save();
  ctx.translate(0, s * 0.42 + bob);
  const oct = (r) => {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i + Math.PI / 8;
      const x = Math.cos(a) * r * 1.06;
      const y = Math.sin(a) * r * 0.72;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  oct(s * 0.95);
  const pad = ctx.createLinearGradient(0, -s * 0.72, 0, s * 0.72);
  pad.addColorStop(0, '#39445f');
  pad.addColorStop(0.5, '#232c44');
  pad.addColorStop(1, '#141a2c');
  ctx.fillStyle = pad;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = Math.max(1, s * 0.06);
  ctx.stroke();
  ctx.save();
  oct(s * 0.76);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.3 + 0.3 * idle;
  ctx.shadowColor = color;
  ctx.shadowBlur = s * 0.45;
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#55627f';
  for (const bx of [-0.74, 0.74]) for (const by of [-0.26, 0.3]) bolt(ctx, s * bx, s * by, s * 0.07);
  ctx.strokeStyle = 'rgba(10,14,26,0.55)';
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.beginPath();
  ctx.moveTo(-s * 0.42, -s * 0.5);
  ctx.lineTo(-s * 0.42, s * 0.5);
  ctx.moveTo(s * 0.42, -s * 0.5);
  ctx.lineTo(s * 0.42, s * 0.5);
  ctx.stroke();
  ctx.restore();

  // --- rotating turret, recoil slides along the aim axis ---
  ctx.save();
  ctx.translate(0, -s * 0.3 + bob);
  ctx.rotate(t.angle);
  ctx.translate(-s * 0.2 * heat, 0);

  // dual plasma rails
  const railG = ctx.createLinearGradient(0, -s * 0.42, 0, s * 0.42);
  railG.addColorStop(0, '#4a5878');
  railG.addColorStop(0.5, '#2b3550');
  railG.addColorStop(1, '#171d30');
  for (const ry of [-s * 0.3, s * 0.3]) {
    chamferPath(ctx, [[s * 0.1, ry - s * 0.12], [s * 1.32, ry - s * 0.08], [s * 1.4, ry], [s * 1.32, ry + s * 0.08], [s * 0.1, ry + s * 0.12]]);
    ctx.fillStyle = railG;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = Math.max(1, s * 0.045);
    ctx.stroke();
    // energy conduit along each rail
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5 + 0.4 * heat;
    ctx.shadowColor = color;
    ctx.shadowBlur = s * 0.3;
    ctx.lineWidth = Math.max(1, s * 0.045);
    ctx.beginPath();
    ctx.moveTo(s * 0.3, ry);
    ctx.lineTo(s * 1.26, ry);
    ctx.stroke();
    ctx.restore();
  }

  // charge coils bridging the rails
  for (const cx of [s * 0.42, s * 0.78, s * 1.14]) {
    chamferPath(ctx, [[cx - s * 0.07, -s * 0.34], [cx + s * 0.07, -s * 0.34], [cx + s * 0.05, s * 0.34], [cx - s * 0.05, s * 0.34]]);
    ctx.fillStyle = '#1b2236';
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.stroke();
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.35 + 0.45 * idle * (1 - heat) + heat;
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(cx, -s * 0.27);
    ctx.lineTo(cx, s * 0.27);
    ctx.stroke();
    ctx.restore();
  }

  // plasma core orb between the rail tips
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const orb = s * (0.24 + 0.07 * idle + 0.3 * heat);
  const og = ctx.createRadialGradient(s * 1.34, 0, 0, s * 1.34, 0, orb);
  og.addColorStop(0, 'rgba(255,255,255,0.95)');
  og.addColorStop(0.35, color);
  og.addColorStop(1, 'rgba(0,229,255,0)');
  ctx.fillStyle = og;
  ctx.beginPath();
  ctx.arc(s * 1.34, 0, orb, 0, Math.PI * 2);
  ctx.fill();
  // arcing between the rail tips
  const arcA = heat > 0.15 ? heat : idle > 0.86 ? 0.5 : 0;
  if (arcA > 0) {
    ctx.globalAlpha = Math.min(1, arcA + 0.2);
    ctx.strokeStyle = '#e9fbff';
    ctx.lineWidth = Math.max(1, s * 0.06);
    ctx.lineCap = 'round';
    const q = Math.floor(time * 14);
    ctx.beginPath();
    ctx.moveTo(s * 1.3, -s * 0.29);
    for (let i = 1; i <= 3; i++) {
      ctx.lineTo(s * 1.3 + (jit(seed + q + i) - 0.5) * s * 0.3,
        -s * 0.29 + (s * 0.58 * i) / 3 + (jit(seed - q + i * 5.2) - 0.5) * s * 0.16);
    }
    ctx.stroke();
  }
  if (heat > 0.3) {
    // muzzle flare + shockwave ring on fire
    const len = s * (0.4 + 0.7 * heat);
    const fg = ctx.createRadialGradient(s * 1.45, 0, 0, s * 1.45, 0, len);
    fg.addColorStop(0, `rgba(255,255,255,${0.9 * heat})`);
    fg.addColorStop(0.4, `rgba(140,240,255,${0.55 * heat})`);
    fg.addColorStop(1, 'rgba(0,229,255,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(s * 1.45, 0, len, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = heat * 0.8;
    ctx.strokeStyle = '#bff4ff';
    ctx.lineWidth = Math.max(1, s * 0.07 * heat);
    ctx.beginPath();
    ctx.arc(s * 1.45, 0, s * (0.2 + (1 - heat) * 0.6), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // angular turret housing (drawn last so it laps the rail roots)
  chamferPath(ctx, [
    [-s * 0.62, -s * 0.3], [s * 0.16, -s * 0.44], [s * 0.5, -s * 0.2],
    [s * 0.5, s * 0.2], [s * 0.16, s * 0.44], [-s * 0.62, s * 0.3],
  ]);
  const body = ctx.createLinearGradient(0, -s * 0.44, 0, s * 0.44);
  body.addColorStop(0, '#57668a');
  body.addColorStop(0.42, '#2c3752');
  body.addColorStop(1, '#151b2c');
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.stroke();
  // specular ridge + cyan trim
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, s * 0.045);
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, -s * 0.24);
  ctx.lineTo(s * 0.12, -s * 0.36);
  ctx.stroke();
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.65 + 0.35 * heat;
  ctx.shadowColor = color;
  ctx.shadowBlur = s * 0.3;
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.beginPath();
  ctx.moveTo(-s * 0.44, -s * 0.12);
  ctx.lineTo(s * 0.1, -s * 0.24);
  ctx.lineTo(s * 0.3, -s * 0.14);
  ctx.stroke();
  ctx.restore();

  // rear exhaust: flickers hot right after a shot
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.25 + 0.6 * heat + 0.15 * idle;
  for (const ey of [-s * 0.16, s * 0.16]) {
    chamferPath(ctx, [[-s * 0.6, ey - s * 0.05], [-s * 0.44, ey - s * 0.05], [-s * 0.4, ey], [-s * 0.44, ey + s * 0.05], [-s * 0.6, ey + s * 0.05]]);
    ctx.fill();
  }
  ctx.restore();

  // level extras: Lv2 side pods, Lv3 top stabiliser blade
  if (t.level >= 2) {
    for (const py of [-s * 0.56, s * 0.56]) {
      chamferPath(ctx, [[-s * 0.3, py - s * 0.14], [s * 0.04, py - s * 0.12], [s * 0.04, py + s * 0.12], [-s * 0.3, py + s * 0.14]]);
      ctx.fillStyle = '#232c44';
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.lineWidth = Math.max(1, s * 0.04);
      ctx.stroke();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.6 + 0.4 * idle;
      bolt(ctx, -s * 0.12, py, s * 0.06);
      ctx.restore();
    }
  }
  if (t.level >= 3) {
    chamferPath(ctx, [[-s * 0.3, -s * 0.72], [s * 0.02, -s * 0.6], [s * 0.02, -s * 0.46], [-s * 0.3, -s * 0.5]]);
    ctx.fillStyle = '#2c3752';
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.stroke();
  }
  ctx.restore();
}

function cryoArt(ctx, t, s, time, bob) {
  const color = t.def.color;
  const seed = t.col * 7.13 + t.row * 3.71;
  const blink = ((time * 0.55 + seed) % 3.6) < 0.13;
  const cy = -s * 0.6 + bob * 1.6;

  // frosty mist pooled at the base
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, s * 0.78 + bob, s * 1.0, s * 0.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(160,255,225,${0.16 + 0.06 * Math.sin(time * 2 + seed)})`;
  ctx.fill();
  ctx.restore();

  // chiselled ice plinth
  roundPoly(ctx, [P(-s * 0.8, s * 1.06), P(s * 0.8, s * 1.06), P(s * 0.5, s * 0.3), P(-s * 0.5, s * 0.3)], 0.35);
  paint(ctx, color, s * 1.15);
  ink(ctx, s);

  // floating snowflake crystal, slowly spinning and breathing
  ctx.save();
  ctx.translate(0, cy);
  const pulse = 1 + 0.06 * Math.sin(time * 2.4 + seed);
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = time * 0.7 + (Math.PI / 6) * i;
    const r = (i % 2 === 0 ? s * 0.68 : s * 0.3) * pulse;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  paint(ctx, color, s * 0.75);
  ink(ctx, s);
  gloss(ctx, s * 0.5, 0.5);
  eyes(ctx, s * 0.55, { x: Math.cos(t.angle), y: Math.sin(t.angle) }, { ratio: 0.3, gap: 0.36, cy: -0.1, blink });
  ctx.restore();

  // orbiting ice shards
  for (let i = 0; i < 3; i++) {
    const a = time * 1.5 + (i * Math.PI * 2) / 3;
    ctx.save();
    ctx.translate(Math.cos(a) * s * 0.98, cy + Math.sin(a) * s * 0.44);
    ctx.rotate(a);
    roundPoly(ctx, [P(0, -s * 0.2), P(s * 0.17, s * 0.14), P(-s * 0.17, s * 0.14)], 0.4);
    ctx.fillStyle = lighten(color, 0.45);
    ctx.fill();
    ink(ctx, s, 0.5);
    ctx.restore();
  }
}

function arcArt(ctx, t, s, time, bob) {
  const color = t.def.color;
  const seed = t.col * 7.13 + t.row * 3.71;
  const blink = ((time * 0.55 + seed) % 3.6) < 0.13;
  const look = { x: Math.cos(t.angle), y: Math.sin(t.angle) };

  // heavy trapezoid base
  roundPoly(ctx, [P(-s * 0.85, s * 1.08), P(s * 0.85, s * 1.08), P(s * 0.62, s * 0.2), P(-s * 0.62, s * 0.2)], 0.4);
  paint(ctx, color, s * 1.15);
  ink(ctx, s);
  emblem(ctx, t, s, s * 0.72 + bob);

  // coil windings stacked up the column
  for (let i = 0; i < 3; i++) {
    const w = s * (0.56 - 0.13 * i);
    rr(ctx, -w, s * (0.06 - i * 0.3) + bob, w * 2, s * 0.24, s * 0.1);
    ctx.fillStyle = i % 2 ? darken(color, 0.35) : lighten(color, 0.25);
    ctx.fill();
    ink(ctx, s, 0.6);
  }

  // toroid ring + plasma ball electrode
  const ty = -s * 1.02 + bob;
  ctx.beginPath();
  ctx.ellipse(0, ty, s * 0.62, s * 0.26, 0, 0, Math.PI * 2);
  paint(ctx, color, s * 0.7);
  ink(ctx, s, 0.85);
  for (const side of [-1, 1]) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.2, s * 0.11);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(side * s * 0.52, ty - s * 0.06);
    ctx.lineTo(side * s * 0.66, ty - s * 0.3);
    ctx.stroke();
  }

  const by = ty - s * 0.44;
  ctx.beginPath();
  ctx.arc(0, by, s * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(179,102,255,${0.18 + 0.1 * Math.sin(time * 5 + seed)})`;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, by, s * 0.3, 0, Math.PI * 2);
  paint(ctx, lighten(color, 0.35), s * 0.34);
  ink(ctx, s, 0.7);

  // arcs spark from the ball to the ring right after firing
  if (t.recoil > 0.05) {
    const zt = Math.floor(time * 18) * 1.37;
    zigZap(ctx, 0, by, -s * 0.55, ty, s, zt);
    zigZap(ctx, 0, by, s * 0.55, ty, s, zt + 9.1);
  }

  eyes(ctx, s * 0.3, look, { ratio: 0.3, gap: 0.34, cy: -0.05, blink });
}

function railArt(ctx, t, s, time, bob) {
  const color = t.def.color;
  const seed = t.col * 7.13 + t.row * 3.71;
  const blink = ((time * 0.55 + seed) % 3.6) < 0.13;
  const look = { x: Math.cos(t.angle), y: Math.sin(t.angle) };

  // gantry legs + long angular platform
  for (const side of [-1, 1]) {
    rr(ctx, side * s * 0.62 - s * 0.17, s * 0.72 + bob, s * 0.34, s * 0.4, s * 0.12);
    ctx.fillStyle = darken(color, 0.4);
    ctx.fill();
    ink(ctx, s, 0.6);
  }
  roundPoly(ctx, [P(-s, s * 0.78), P(s, s * 0.78), P(s * 0.7, s * 0.04), P(-s * 0.7, s * 0.04)], 0.28);
  paint(ctx, color, s * 1.1);
  ink(ctx, s);
  emblem(ctx, t, s, s * 0.48 + bob);

  // very long rail barrel: guide rails + glowing charge strip, slides on recoil
  ctx.save();
  ctx.translate(0, -s * 0.3 + bob);
  ctx.rotate(t.angle + Math.PI / 2);
  const rec = t.recoil * s * 0.3;
  for (const off of [-s * 0.34, s * 0.34]) {
    rr(ctx, off - s * 0.07, -s * 1.42 + rec, s * 0.14, s * 1.42, s * 0.07);
    ctx.fillStyle = darken(color, 0.4);
    ctx.fill();
    ink(ctx, s, 0.55);
  }
  rr(ctx, -s * 0.18, -s * 1.78 + rec, s * 0.36, s * 1.72, s * 0.14);
  ctx.fillStyle = darken(color, 0.12);
  ctx.fill();
  ink(ctx, s, 0.8);
  ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(time * 6 + seed));
  rr(ctx, -s * 0.05, -s * 1.68 + rec, s * 0.1, s * 1.5, s * 0.05);
  ctx.fillStyle = lighten(color, 0.7);
  ctx.fill();
  ctx.globalAlpha = 1;
  // muzzle brake
  roundPoly(ctx, [P(0, -s * 1.95 + rec), P(s * 0.2, -s * 1.75 + rec), P(0, -s * 1.55 + rec), P(-s * 0.2, -s * 1.75 + rec)], 0.3);
  ctx.fillStyle = lighten(color, 0.3);
  ctx.fill();
  ink(ctx, s, 0.7);
  if (t.recoil > 0.5) muzzleFlash(ctx, s, 0, -s * 1.95 + rec, 0.5);
  ctx.restore();

  // boxy scope head
  rr(ctx, -s * 0.52, -s * 0.86 + bob, s * 1.04, s * 1.0, s * 0.32);
  paint(ctx, color, s * 0.85);
  ink(ctx, s);
  gloss(ctx, s * 0.7, 0.5);
  eyes(ctx, s * 0.7, look, { ratio: 0.26, gap: 0.38, cy: -0.15, angry: true, blink });
}

const TOWER_ART = { pulse: pulseArt, cryo: cryoArt, arc: arcArt, rail: railArt };

export function drawToonTower(ctx, t, cell, time) {
  const s = cell * 0.38;
  const bob = Math.sin(time * 3 + t.col * 1.7 + t.row) * s * 0.05;
  groundShadow(ctx, s * 1.05, 1.05);
  (TOWER_ART[t.key] || pulseArt)(ctx, t, s, time, bob);

  // level pips
  for (let i = 0; i < t.level; i++) {
    ctx.beginPath();
    ctx.arc((i - (t.level - 1) / 2) * s * 0.46, s * 1.02 + bob, s * 0.15, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.yellow;
    ctx.fill();
    ink(ctx, s, 0.5);
  }
}

// Outlined text used by floating damage / credit numbers.
export function toonText(ctx, text, x, y, size, color) {
  ctx.font = `800 ${size}px ${TOON_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size * 0.28);
  ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
