// landscape.js — procedural meadow backdrop painted behind the neon grid.
// Sky, mountains, green grass and scattered artifacts (ruins, monoliths, crystals,
// trees, statues) are pre-rendered to an offscreen canvas and rebuilt only on
// resize; clouds, birds and fireflies animate live each frame.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const range = (r, lo, hi) => lo + r() * (hi - lo);
const pick = (r, arr) => arr[(r() * arr.length) | 0];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function rr(ctx, x, y, w, h, rad) {
  const k = Math.min(rad, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function ell(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function shadow(ctx, x, y, rx) {
  ctx.fillStyle = 'rgba(14, 42, 18, 0.28)';
  ell(ctx, x, y, rx, rx * 0.3);
}

function stoneGrad(ctx, x0, x1, y0, y1, base, lit, dark) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, lit);
  g.addColorStop(0.55, base);
  g.addColorStop(1, dark);
  return g;
}

const STONE = { base: '#8d95a8', lit: '#b9c1d2', dark: '#666e86', ink: '#3f4557' };
const MOSS = '#4e9a52';

// ---------------------------------------------------------------- artifacts
// Every artifact draws with its ground contact point at (x, y), size s in px.

function tree(ctx, x, y, s, r) {
  shadow(ctx, x, y, s * 0.95);
  ctx.fillStyle = '#7a5230';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.16, y);
  ctx.quadraticCurveTo(x - s * 0.1, y - s * 0.7, x - s * 0.09, y - s * 1.05);
  ctx.lineTo(x + s * 0.09, y - s * 1.05);
  ctx.quadraticCurveTo(x + s * 0.1, y - s * 0.7, x + s * 0.16, y);
  ctx.closePath();
  ctx.fill();
  const cy = y - s * 1.5;
  const blobs = [[-0.45, 0.16, 0.48], [0.45, 0.16, 0.5], [0, -0.3, 0.55], [0, 0.12, 0.6]];
  ctx.fillStyle = '#2b6b38';
  for (const [bx, by, br] of blobs) ell(ctx, x + s * bx, cy + s * by, s * br * 1.1, s * br * 1.1);
  ctx.fillStyle = pick(r, ['#3f9b52', '#4fae5e', '#45a356']);
  for (const [bx, by, br] of blobs) ell(ctx, x + s * bx, cy + s * by - s * 0.04, s * br, s * br);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ell(ctx, x - s * 0.32, cy - s * 0.42, s * 0.22, s * 0.14);
}

function pine(ctx, x, y, s) {
  shadow(ctx, x, y, s * 0.7);
  ctx.fillStyle = '#6a4a2c';
  ctx.fillRect(x - s * 0.08, y - s * 0.4, s * 0.16, s * 0.4);
  const tiers = [[1.0, 0.55, 0.62], [0.78, 0.44, 1.15], [0.55, 0.34, 1.62]];
  for (const [hw, top, base] of tiers) {
    ctx.fillStyle = '#1f5c39';
    ctx.beginPath();
    ctx.moveTo(x, y - s * (base + top));
    ctx.lineTo(x + s * hw, y - s * base);
    ctx.lineTo(x - s * hw, y - s * base);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2f7d4f';
    ctx.beginPath();
    ctx.moveTo(x, y - s * (base + top) + s * 0.1);
    ctx.lineTo(x + s * hw * 0.72, y - s * base);
    ctx.lineTo(x - s * hw * 0.72, y - s * base);
    ctx.closePath();
    ctx.fill();
  }
}

function bush(ctx, x, y, s, r) {
  shadow(ctx, x, y, s * 0.9);
  const blobs = [[-0.4, 0.1, 0.45], [0.4, 0.1, 0.45], [0, -0.25, 0.5]];
  ctx.fillStyle = '#2b6b38';
  for (const [bx, by, br] of blobs) ell(ctx, x + s * bx, y + s * by, s * br * 1.12, s * br * 1.0);
  ctx.fillStyle = pick(r, ['#3f9b52', '#55a95c']);
  for (const [bx, by, br] of blobs) ell(ctx, x + s * bx, y + s * by - s * 0.04, s * br, s * br);
  ctx.fillStyle = '#e2445a';
  for (let i = 0; i < 4; i++) ell(ctx, x + range(r, -0.5, 0.5) * s, y + range(r, -0.45, 0.1) * s, s * 0.05, s * 0.05);
}

function rock(ctx, x, y, s, r) {
  shadow(ctx, x, y, s * 1.05);
  ctx.beginPath();
  ctx.moveTo(x - s, y);
  ctx.lineTo(x - s * 0.75, y - s * 0.7);
  ctx.lineTo(x - s * 0.15, y - s * 0.95);
  ctx.lineTo(x + s * 0.6, y - s * 0.6);
  ctx.lineTo(x + s, y);
  ctx.closePath();
  ctx.fillStyle = stoneGrad(ctx, x - s, x + s, y - s, y, STONE.base, STONE.lit, STONE.dark);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.6, y - s * 0.55);
  ctx.lineTo(x - s * 0.1, y - s * 0.85);
  ctx.lineTo(x + s * 0.25, y - s * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = MOSS;
  ell(ctx, x - s * 0.45, y - s * 0.1, s * 0.25, s * 0.08);
  ell(ctx, x + s * 0.5, y - s * 0.18, s * 0.2, s * 0.07);
}

function cairn(ctx, x, y, s, r) {
  shadow(ctx, x, y, s * 0.9);
  const stones = [[0, -0.18, 0.62, 0.3], [-0.05, -0.5, 0.48, 0.24], [0.04, -0.76, 0.34, 0.18], [0, -0.98, 0.2, 0.12]];
  for (const [bx, by, rx, ry] of stones) {
    ctx.fillStyle = stoneGrad(ctx, x - s, x + s, y + s * by - s * ry, y + s * by + s * ry, STONE.base, STONE.lit, STONE.dark);
    ell(ctx, x + s * bx, y + s * by, s * rx, s * ry);
    ctx.strokeStyle = 'rgba(63,69,87,0.55)';
    ctx.lineWidth = Math.max(1, s * 0.045);
    ctx.stroke();
  }
  ctx.fillStyle = MOSS;
  ell(ctx, x - s * 0.35, y - s * 0.12, s * 0.14, s * 0.05);
}

function standingStone(ctx, x, y, s, r) {
  shadow(ctx, x, y, s * 0.65);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(range(r, -0.07, 0.07));
  ctx.beginPath();
  ctx.moveTo(-s * 0.4, 0);
  ctx.quadraticCurveTo(-s * 0.45, -s * 0.9, -s * 0.28, -s * 1.45);
  ctx.quadraticCurveTo(0, -s * 1.65, s * 0.28, -s * 1.45);
  ctx.quadraticCurveTo(s * 0.45, -s * 0.9, s * 0.4, 0);
  ctx.closePath();
  ctx.fillStyle = stoneGrad(ctx, -s * 0.5, s * 0.5, -s * 1.6, 0, STONE.base, STONE.lit, STONE.dark);
  ctx.fill();
  ctx.strokeStyle = 'rgba(63,69,87,0.6)';
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.stroke();
  // Faint glowing runes keep the neon accent of the game.
  ctx.strokeStyle = 'rgba(0,229,255,0.75)';
  ctx.shadowColor = 'rgba(0,229,255,0.8)';
  ctx.shadowBlur = s * 0.35;
  ctx.lineWidth = Math.max(1, s * 0.045);
  ctx.beginPath();
  ctx.moveTo(-s * 0.08, -s * 0.55);
  ctx.lineTo(s * 0.08, -s * 0.7);
  ctx.moveTo(-s * 0.08, -s * 0.9);
  ctx.lineTo(s * 0.08, -s * 1.05);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = MOSS;
  ell(ctx, -s * 0.18, -s * 0.1, s * 0.16, s * 0.07);
  ctx.restore();
}

function ruinArch(ctx, x, y, s) {
  shadow(ctx, x, y, s * 1.1);
  const g = stoneGrad(ctx, x - s, x + s, y - s * 1.9, y, STONE.base, STONE.lit, STONE.dark);
  ctx.fillStyle = g;
  ctx.fillRect(x - s, y - s * 1.25, s * 0.38, s * 1.25);
  ctx.fillRect(x + s * 0.62, y - s * 1.25, s * 0.38, s * 1.25);
  ctx.strokeStyle = 'rgba(63,69,87,0.5)';
  ctx.lineWidth = Math.max(1, s * 0.04);
  const cy = y - s * 1.3;
  const R = s * 0.81;
  const lw = s * 0.36;
  for (const [a0, a1] of [[Math.PI, Math.PI * 1.58], [Math.PI * 1.87, Math.PI * 2]]) {
    ctx.beginPath();
    ctx.arc(x, cy, R, a0, a1);
    ctx.lineWidth = lw;
    ctx.strokeStyle = g;
    ctx.stroke();
  }
  ctx.lineWidth = Math.max(1, s * 0.04);
  ctx.strokeStyle = 'rgba(63,69,87,0.45)';
  for (let i = 1; i < 4; i++) {
    const yy = y - (s * 1.25 * i) / 4;
    ctx.beginPath();
    ctx.moveTo(x - s, yy);
    ctx.lineTo(x - s * 0.62, yy);
    ctx.moveTo(x + s * 0.62, yy);
    ctx.lineTo(x + s, yy);
    ctx.stroke();
  }
  ctx.fillStyle = STONE.dark;
  ell(ctx, x - s * 0.25, y - s * 0.06, s * 0.18, s * 0.08);
  ell(ctx, x + s * 0.3, y - s * 0.05, s * 0.13, s * 0.06);
}

function column(ctx, x, y, s) {
  shadow(ctx, x, y, s * 0.95);
  ctx.fillStyle = stoneGrad(ctx, x - s, x + s, y - s * 1.5, y, STONE.base, STONE.lit, STONE.dark);
  rr(ctx, x - s * 0.55, y - s * 0.16, s * 1.1, s * 0.16, 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - s * 0.34, y - s * 0.16);
  ctx.lineTo(x - s * 0.26, y - s * 1.3);
  ctx.lineTo(x - s * 0.1, y - s * 1.42);
  ctx.lineTo(x + s * 0.08, y - s * 1.28);
  ctx.lineTo(x + s * 0.22, y - s * 1.4);
  ctx.lineTo(x + s * 0.3, y - s * 0.16);
  ctx.closePath();
  ctx.fillStyle = stoneGrad(ctx, x - s * 0.4, x + s * 0.4, y, y, STONE.lit, STONE.base, STONE.dark);
  ctx.fill();
  ctx.strokeStyle = 'rgba(63,69,87,0.4)';
  ctx.lineWidth = Math.max(1, s * 0.035);
  for (const fx of [-0.12, 0.05]) {
    ctx.beginPath();
    ctx.moveTo(x + s * fx, y - s * 0.22);
    ctx.lineTo(x + s * fx * 0.9, y - s * 1.25);
    ctx.stroke();
  }
  ctx.fillStyle = stoneGrad(ctx, x + s * 0.3, x + s * 1.1, y, y, STONE.base, STONE.lit, STONE.dark);
  ell(ctx, x + s * 0.75, y - s * 0.12, s * 0.3, s * 0.17);
}

function obelisk(ctx, x, y, s) {
  shadow(ctx, x, y, s * 0.7);
  ctx.beginPath();
  ctx.moveTo(x - s * 0.34, y);
  ctx.lineTo(x - s * 0.18, y - s * 1.85);
  ctx.lineTo(x, y - s * 2.15);
  ctx.lineTo(x + s * 0.18, y - s * 1.85);
  ctx.lineTo(x + s * 0.34, y);
  ctx.closePath();
  ctx.fillStyle = stoneGrad(ctx, x - s * 0.4, x + s * 0.4, y - s * 2.1, y, '#7d86a0', '#aab3c9', '#565d75');
  ctx.fill();
  ctx.strokeStyle = 'rgba(50,55,72,0.6)';
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,229,255,0.85)';
  ctx.shadowColor = 'rgba(0,229,255,0.9)';
  ctx.shadowBlur = s * 0.5;
  ctx.lineWidth = Math.max(1.2, s * 0.06);
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.5);
  ctx.lineTo(x, y - s * 1.5);
  ctx.moveTo(x - s * 0.1, y - s * 1.15);
  ctx.lineTo(x + s * 0.1, y - s * 1.15);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function crystals(ctx, x, y, s, r) {
  shadow(ctx, x, y, s * 0.9);
  const hue = r() < 0.5 ? { a: '#5ff0ff', b: '#18b8d8', glow: 'rgba(0,229,255,0.8)' }
                         : { a: '#d9a8ff', b: '#8a4fe0', glow: 'rgba(179,102,255,0.8)' };
  const shards = [[-0.42, 0.62, 0.2], [0, 1.0, 0.28], [0.42, 0.5, 0.17]];
  for (const [bx, hh, hw] of shards) {
    const jx = range(r, -0.03, 0.03);
    ctx.beginPath();
    ctx.moveTo(x + s * (bx - hw) , y);
    ctx.lineTo(x + s * (bx + jx), y - s * hh);
    ctx.lineTo(x + s * (bx + hw), y);
    ctx.closePath();
    ctx.fillStyle = hue.b;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + s * (bx - hw), y);
    ctx.lineTo(x + s * (bx + jx), y - s * hh);
    ctx.lineTo(x + s * (bx - hw * 0.15), y - s * hh * 0.2);
    ctx.closePath();
    ctx.fillStyle = hue.a;
    ctx.fill();
  }
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.shadowColor = hue.glow;
  ctx.shadowBlur = s * 0.9;
  ctx.fillStyle = hue.glow;
  ell(ctx, x, y - s * 0.45, s * 0.4, s * 0.45);
  ctx.restore();
}

function stump(ctx, x, y, s, r) {
  shadow(ctx, x, y, s * 0.8);
  ctx.fillStyle = '#6a4a2c';
  rr(ctx, x - s * 0.5, y - s * 0.7, s, s * 0.7, 3);
  ctx.fill();
  ctx.fillStyle = '#a8794f';
  ell(ctx, x, y - s * 0.7, s * 0.5, s * 0.2);
  ctx.strokeStyle = 'rgba(90,60,32,0.7)';
  ctx.lineWidth = Math.max(1, s * 0.045);
  for (const k of [0.28, 0.14]) {
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.7, s * k, s * k * 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 2; i++) {
    const mx = x + range(r, -0.6, 0.6) * s;
    ctx.fillStyle = '#efe3c8';
    ctx.fillRect(mx - s * 0.035, y - s * 0.12, s * 0.07, s * 0.12);
    ctx.fillStyle = '#d8503f';
    ell(ctx, mx, y - s * 0.13, s * 0.12, s * 0.08);
  }
}

function mushroom(ctx, x, y, s, r) {
  shadow(ctx, x, y, s * 0.8);
  for (let i = 0; i < 3; i++) {
    const mx = x + range(r, -0.55, 0.55) * s;
    const k = range(r, 0.6, 1);
    ctx.fillStyle = '#efe3c8';
    ctx.fillRect(mx - s * 0.06 * k, y - s * 0.34 * k, s * 0.12 * k, s * 0.34 * k);
    ctx.fillStyle = i === 1 ? '#e8874a' : '#d8503f';
    ctx.beginPath();
    ctx.ellipse(mx, y - s * 0.34 * k, s * 0.22 * k, s * 0.16 * k, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,248,235,0.9)';
    ell(ctx, mx - s * 0.07 * k, y - s * 0.4 * k, s * 0.035, s * 0.03);
    ell(ctx, mx + s * 0.07 * k, y - s * 0.36 * k, s * 0.03, s * 0.026);
  }
}

function pond(ctx, x, y, s, r) {
  ctx.fillStyle = 'rgba(30,80,40,0.25)';
  ell(ctx, x, y, s * 1.22, s * 0.52);
  const g = ctx.createRadialGradient(x, y - s * 0.1, s * 0.1, x, y, s * 1.1);
  g.addColorStop(0, '#8fd0ee');
  g.addColorStop(1, '#3f88bd');
  ctx.fillStyle = g;
  ell(ctx, x, y, s * 1.1, s * 0.45);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.beginPath();
  ctx.ellipse(x - s * 0.15, y - s * 0.08, s * 0.5, s * 0.18, -0.08, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  ctx.strokeStyle = '#2f7d43';
  ctx.lineWidth = Math.max(1, s * 0.05);
  for (let i = 0; i < 4; i++) {
    const rx = x + s * range(r, 0.75, 1.15) * (r() < 0.5 ? 1 : -1);
    ctx.beginPath();
    ctx.moveTo(rx, y);
    ctx.quadraticCurveTo(rx + s * 0.1, y - s * 0.4, rx + s * 0.18, y - s * 0.62);
    ctx.stroke();
  }
}

function statue(ctx, x, y, s) {
  shadow(ctx, x, y, s * 0.85);
  const g = stoneGrad(ctx, x - s * 0.7, x + s * 0.7, y - s * 1.9, y, STONE.base, STONE.lit, STONE.dark);
  ctx.fillStyle = g;
  rr(ctx, x - s * 0.55, y - s * 0.3, s * 1.1, s * 0.3, 3);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - s * 0.3, y - s * 0.3);
  ctx.quadraticCurveTo(x - s * 0.36, y - s * 1.1, x - s * 0.18, y - s * 1.42);
  ctx.lineTo(x + s * 0.18, y - s * 1.42);
  ctx.quadraticCurveTo(x + s * 0.36, y - s * 1.1, x + s * 0.3, y - s * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + s * 0.06, y - s * 1.6, s * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(50,55,72,0.5)';
  ctx.lineWidth = Math.max(1, s * 0.045);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(50,55,72,0.45)';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.05, y - s * 0.45);
  ctx.lineTo(x + s * 0.05, y - s * 0.85);
  ctx.lineTo(x - s * 0.05, y - s * 1.05);
  ctx.stroke();
  ctx.fillStyle = MOSS;
  ell(ctx, x - s * 0.22, y - s * 0.45, s * 0.1, s * 0.05);
}

function stoneCircle(ctx, x, y, s) {
  const spots = [[-1, 0.15, 0.5], [-0.45, -0.28, 0.62], [0.35, -0.32, 0.55], [1, 0.05, 0.45]];
  const list = spots.map(([bx, by, k]) => ({ bx, by, k })).sort((a, b) => a.by - b.by);
  for (const { bx, by, k } of list) {
    const kx = x + s * bx;
    const ky = y + s * by;
    shadow(ctx, kx, ky, s * 0.32 * k);
    ctx.fillStyle = stoneGrad(ctx, kx - s * 0.2, kx + s * 0.2, ky - s * k, ky, STONE.base, STONE.lit, STONE.dark);
    ctx.beginPath();
    ctx.moveTo(kx - s * 0.18 * k, ky);
    ctx.quadraticCurveTo(kx - s * 0.2 * k, ky - s * 0.8 * k, kx, ky - s * k);
    ctx.quadraticCurveTo(kx + s * 0.2 * k, ky - s * 0.8 * k, kx + s * 0.18 * k, ky);
    ctx.closePath();
    ctx.fill();
  }
}

function castle(ctx, x, y, s) {
  ctx.fillStyle = 'rgba(96,120,158,0.9)';
  ctx.fillRect(x - s * 0.9, y - s * 0.5, s * 1.8, s * 0.5);
  for (const tx of [-0.95, 0.55]) {
    ctx.fillRect(x + tx * s, y - s * 1.15, s * 0.4, s * 1.15);
    ctx.beginPath();
    ctx.moveTo(x + tx * s, y - s * 1.15);
    ctx.lineTo(x + (tx + 0.2) * s, y - s * 1.5);
    ctx.lineTo(x + (tx + 0.4) * s, y - s * 1.15);
    ctx.closePath();
    ctx.fill();
  }
  for (let i = 0; i < 5; i++) ctx.fillRect(x - s * 0.85 + i * s * 0.38, y - s * 0.68, s * 0.16, s * 0.2);
}

// ---------------------------------------------------------------- placement

const SMALL = [
  { fn: rock, s: [6, 11], w: 9 },
  { fn: bush, s: [7, 12], w: 7 },
  { fn: mushroom, s: [5, 8], w: 5 },
  { fn: cairn, s: [6, 9], w: 4 },
  { fn: crystals, s: [6, 11], w: 4 },
];

const BIG = [
  { fn: tree, s: [13, 20], w: 7 },
  { fn: pine, s: [13, 19], w: 5 },
  { fn: standingStone, s: [9, 14], w: 4 },
  { fn: stump, s: [8, 12], w: 3 },
  { fn: ruinArch, s: [13, 20], w: 2 },
  { fn: column, s: [9, 14], w: 2 },
  { fn: obelisk, s: [11, 16], w: 1 },
  { fn: statue, s: [8, 12], w: 1 },
  { fn: stoneCircle, s: [13, 18], w: 1 },
  { fn: pond, s: [9, 14], w: 2 },
];

function weighted(list, r) {
  let total = 0;
  for (const it of list) total += it.w;
  let t = r() * total;
  for (const it of list) {
    t -= it.w;
    if (t <= 0) return it;
  }
  return list[0];
}

function inside(rect, x, y) {
  return rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

// ---------------------------------------------------------------- Landscape

export class Landscape {
  constructor() {
    this.layer = document.createElement('canvas');
    this.w = 0;
    this.h = 0;
    this.dpr = 0;
    this.horizon = 0;
    this.clouds = [];
    this.birds = [];
    this.flies = [];
    this.glow = null;
  }

  // avoid: screen-space rect of the playfield; big artifacts dodge it.
  build(w, h, dpr, avoid = null) {
    if (!w || !h) return;
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.horizon = Math.round(h * 0.3);
    this.layer.width = Math.max(1, Math.round(w * dpr));
    this.layer.height = Math.max(1, Math.round(h * dpr));
    const ctx = this.layer.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const seed = (0x9e3779b9 ^ Math.imul(w, 73856093) ^ Math.imul(h, 19349663)) >>> 0;
    const r = mulberry32(seed);
    this._paint(ctx, r, avoid);
    this._sprites();
    this._movers(r, avoid);
  }

  draw(ctx, time) {
    if (!this.w || !this.layer.width) return;
    ctx.drawImage(this.layer, 0, 0, this.w, this.h);
    this._clouds(ctx, time);
    this._birdFlock(ctx, time);
    this._fireflies(ctx, time);
  }

  _paint(ctx, r, avoid) {
    const { w, h, horizon } = this;
    const k = clamp(Math.min(w, h) / 640, 0.7, 1.5);

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#2f7fc4');
    sky.addColorStop(0.6, '#7fc0ef');
    sky.addColorStop(1, '#e6f4ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon + 2);

    // Sun
    const sx = w * 0.8;
    const sy = horizon * 0.32;
    const glow = ctx.createRadialGradient(sx, sy, 2, sx, sy, Math.max(40, w * 0.18));
    glow.addColorStop(0, 'rgba(255,250,214,0.95)');
    glow.addColorStop(0.25, 'rgba(255,240,180,0.55)');
    glow.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = glow;
    ell(ctx, sx, sy, Math.max(40, w * 0.18), Math.max(40, w * 0.18));
    ctx.fillStyle = '#fff8dc';
    ell(ctx, sx, sy, Math.max(9, h * 0.028), Math.max(9, h * 0.028));

    // Far mountains
    ctx.fillStyle = '#9db3d0';
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let x = 0; x <= w; x += 3) {
      const t = x / w;
      const y = horizon - (0.5 + 0.34 * Math.sin(t * 7.3 + 1.7) + 0.16 * Math.sin(t * 17.1 + 0.6)) * h * 0.12;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, horizon);
    ctx.closePath();
    ctx.fill();

    // Near hills
    ctx.fillStyle = '#7fae8b';
    for (let i = 0; i < 6; i++) {
      const cx = range(r, -0.1, 1.1) * w;
      const rx = range(r, 0.18, 0.4) * w;
      const ry = range(r, 0.035, 0.085) * h;
      ctx.beginPath();
      ctx.ellipse(cx, horizon + ry * 0.35, rx, ry, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
    }
    castle(ctx, w * range(r, 0.12, 0.4), horizon - h * 0.028, Math.max(8, h * 0.032));

    // Treeline
    ctx.fillStyle = '#35735a';
    for (let x = -10; x <= w + 10; x += 10) {
      const rr0 = range(r, 7, 15) * Math.max(0.7, k);
      ell(ctx, x + range(r, -4, 4), horizon + 2, rr0, rr0 * 0.9);
    }

    // Grass
    const g = ctx.createLinearGradient(0, horizon - h * 0.02, 0, h);
    g.addColorStop(0, '#6cb85d');
    g.addColorStop(0.35, '#55a850');
    g.addColorStop(1, '#3c8a42');
    ctx.fillStyle = g;
    ctx.fillRect(0, horizon, w, h - horizon);

    // Soft tonal patches
    for (let i = 0; i < 26; i++) {
      const px = r() * w;
      const py = horizon + Math.sqrt(r()) * (h - horizon);
      const prx = range(r, 0.08, 0.25) * w;
      ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(20,80,35,0.07)';
      ell(ctx, px, py, prx, prx * 0.32);
    }

    // Stepping-stone trail
    const p0 = { x: -20, y: h * range(r, 0.72, 0.9) };
    const p1 = { x: w * 0.5, y: h * range(r, 0.9, 1.02) };
    const p2 = { x: w + 20, y: h * range(r, 0.6, 0.82) };
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const bx = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
      const by = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
      const sc = 0.55 + t * 0.5 * (t > 0.5 ? 1 : t * 2 + 0.4);
      ctx.fillStyle = '#aca692';
      ell(ctx, bx, by, 9 * k * sc, 4.2 * k * sc);
      ctx.strokeStyle = 'rgba(80,74,58,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Artifacts
    const avoidRect = avoid && { x: avoid.x - 26, y: avoid.y - 20, w: avoid.w + 52, h: avoid.h + 40 };
    const placed = [];
    const count = Math.round(clamp((w * h) / 24000, 12, 30));
    const items = [];
    for (let i = 0; i < count; i++) {
      const depth = Math.sqrt(r());
      const y = horizon + 6 + depth * (h - horizon - 10);
      const x = range(r, 8, w - 8);
      const bigOk = !inside(avoidRect, x, y);
      const def = bigOk ? weighted(r() < 0.55 ? BIG : SMALL, r) : weighted(SMALL, r);
      const s = range(r, def.s[0], def.s[1]) * k * (0.72 + depth * 0.9);
      let fits = true;
      for (const p of placed) {
        const dx = p.x - x;
        const dy = (p.y - y) * 1.4;
        if (dx * dx + dy * dy < Math.pow((p.r + s * 1.25) * 0.85, 2)) {
          fits = false;
          break;
        }
      }
      if (!fits) continue;
      placed.push({ x, y, r: s });
      items.push({ def, x, y, s, muted: inside(avoidRect, x, y) });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      ctx.save();
      if (it.muted) ctx.globalAlpha = 0.42;
      it.def.fn(ctx, it.x, it.y, it.s, r);
      ctx.restore();
    }

    // Grass blades, tufts, flowers, pebbles
    const blades = Math.round((w * (h - horizon)) / 500);
    const bladeCols = ['#57ad51', '#469a47', '#67c05d', '#3d8a41', '#74c967'];
    ctx.lineWidth = Math.max(1, 1.3 * k);
    ctx.lineCap = 'round';
    for (let i = 0; i < blades; i++) {
      const bx = r() * w;
      const by = horizon + 3 + r() * (h - horizon - 3);
      const bh = range(r, 3, 8) * k * (0.5 + ((by - horizon) / (h - horizon)) * 0.9);
      ctx.strokeStyle = pick(r, bladeCols);
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + range(r, -1.5, 1.5), by - bh * 0.6, bx + range(r, -2.6, 2.6), by - bh);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const tufts = Math.round((w * (h - horizon)) / 3200);
    for (let i = 0; i < tufts; i++) {
      const bx = r() * w;
      const by = horizon + 8 + r() * (h - horizon - 8);
      const sc = k * (0.6 + ((by - horizon) / (h - horizon)) * 0.8);
      ctx.strokeStyle = pick(r, ['#4a9c48', '#5cb254', '#3f8c44']);
      ctx.lineWidth = Math.max(1, 1.5 * k);
      for (let b = -1; b <= 1; b++) {
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + b * 2.4 * sc, by - 4.5 * sc, bx + b * 4.2 * sc, by - 7.5 * sc);
        ctx.stroke();
      }
    }

    const flowers = Math.round((w * (h - horizon)) / 11000);
    const petalCols = ['#ffffff', '#ffe600', '#ff7ba8', '#c9a6ff', '#ff5d5d'];
    for (let i = 0; i < flowers; i++) {
      const fx = r() * w;
      const fy = horizon + 10 + r() * (h - horizon - 10);
      const sc = k * (0.6 + ((fy - horizon) / (h - horizon)) * 0.7);
      ctx.strokeStyle = '#3f8c44';
      ctx.lineWidth = Math.max(1, sc);
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx, fy - 4 * sc);
      ctx.stroke();
      ctx.fillStyle = pick(r, petalCols);
      ell(ctx, fx, fy - 5 * sc, 1.9 * sc, 1.9 * sc);
      ctx.fillStyle = '#ffdf4d';
      ell(ctx, fx, fy - 5 * sc, 0.8 * sc, 0.8 * sc);
    }

    const pebbles = Math.round((w * (h - horizon)) / 14000);
    for (let i = 0; i < pebbles; i++) {
      const px = r() * w;
      const py = horizon + 8 + r() * (h - horizon - 8);
      ctx.fillStyle = '#9aa1af';
      ell(ctx, px, py, range(r, 1.5, 3.2) * k, range(r, 1, 2) * k);
    }

    // Edge vignette keeps HUD and towers readable.
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.78);
    vg.addColorStop(0, 'rgba(8,20,12,0)');
    vg.addColorStop(1, 'rgba(8,20,12,0.34)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  _sprites() {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(16, 16, 1, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,247,190,1)');
    grad.addColorStop(0.35, 'rgba(255,220,90,0.5)');
    grad.addColorStop(1, 'rgba(255,220,90,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    this.glow = c;
  }

  _movers(r, avoid) {
    const { w, h, horizon } = this;
    this.clouds = [];
    const nClouds = Math.round(clamp(w / 240, 3, 7));
    for (let i = 0; i < nClouds; i++) {
      this.clouds.push({
        x: r() * (w + 240),
        y: range(r, 6, Math.max(30, horizon * 0.62)),
        s: range(r, 0.55, 1.25) * clamp(h / 640, 0.7, 1.4),
        v: range(r, 3, 9) * (r() < 0.5 ? 1 : 0.6),
        a: range(r, 0.7, 0.95),
      });
    }
    this.birds = [];
    const nBirds = w > 620 ? 4 : 2;
    for (let i = 0; i < nBirds; i++) {
      this.birds.push({
        x: r() * w,
        y: range(r, 10, Math.max(40, horizon * 0.7)),
        s: range(r, 4, 7),
        v: range(r, 14, 26),
        f: range(r, 5, 8),
        p: r() * Math.PI * 2,
      });
    }
    this.flies = [];
    const nFlies = Math.round(clamp((w * h) / 30000, 6, 22));
    for (let i = 0; i < nFlies; i++) {
      this.flies.push({
        x: r() * w,
        y: horizon + r() * (h - horizon),
        rx: range(r, 8, 26),
        ry: range(r, 5, 16),
        sx: range(r, 0.3, 0.9),
        sy: range(r, 0.3, 0.9),
        tw: range(r, 1.2, 3),
        p: r() * Math.PI * 2,
        s: range(r, 5, 10),
      });
    }
  }

  _clouds(ctx, t) {
    for (const c of this.clouds) {
      const span = this.w + 260;
      const x = ((c.x + c.v * t) % span) - 130;
      const s = c.s;
      ctx.save();
      ctx.globalAlpha = c.a;
      ctx.fillStyle = '#f4faff';
      ell(ctx, x, c.y, 34 * s, 12 * s);
      ell(ctx, x - 18 * s, c.y - 4 * s, 16 * s, 10 * s);
      ell(ctx, x + 2 * s, c.y - 9 * s, 20 * s, 12 * s);
      ell(ctx, x + 20 * s, c.y - 3 * s, 14 * s, 9 * s);
      ctx.globalAlpha = c.a * 0.5;
      ctx.fillStyle = 'rgba(150,180,215,0.55)';
      ell(ctx, x, c.y + 5 * s, 30 * s, 5 * s);
      ctx.restore();
    }
  }

  _birdFlock(ctx, t) {
    ctx.strokeStyle = 'rgba(28,48,78,0.75)';
    ctx.lineCap = 'round';
    for (const b of this.birds) {
      const span = this.w + 160;
      const x = ((b.x + b.v * t) % span) - 80;
      const flap = Math.sin(t * b.f + b.p);
      const up = b.s * (0.35 + 0.35 * flap);
      ctx.lineWidth = Math.max(1, b.s * 0.28);
      ctx.beginPath();
      ctx.moveTo(x - b.s, b.y - up);
      ctx.quadraticCurveTo(x - b.s * 0.35, b.y, x, b.y);
      ctx.quadraticCurveTo(x + b.s * 0.35, b.y, x + b.s, b.y - up);
      ctx.stroke();
    }
  }

  _fireflies(ctx, t) {
    if (!this.glow) return;
    ctx.save();
    for (const f of this.flies) {
      const px = f.x + Math.sin(t * f.sx + f.p) * f.rx;
      const py = f.y + Math.cos(t * f.sy + f.p * 1.7) * f.ry;
      const a = 0.18 + 0.6 * (0.5 + 0.5 * Math.sin(t * f.tw + f.p * 3));
      const sz = f.s * (0.85 + 0.15 * Math.sin(t * f.tw * 1.7));
      ctx.globalAlpha = a;
      ctx.drawImage(this.glow, px - sz, py - sz, sz * 2, sz * 2);
    }
    ctx.restore();
  }
}
