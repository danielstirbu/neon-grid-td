// unitart.js — F4 paint kit + tower art. Primitives (chamfered plates, ink,
// conic-metal sheen, emissive glow, rivets) and the per-tower bake painters
// used by SpriteBank (sprites.js). Every function paints on a caller-
// provided context centred at the sprite anchor; they run ONLY inside the
// offscreen bake pass, where gradients and shadowBlur are allowed (P-03/P-06).
import { INK } from './toon.js';

// ---------------------------------------------------------------- helpers
// ---------------------------------------------------------------- helpers
// Chamfered polygon path.
export function cham(g, pts) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}

// Armour plate: chamfered polygon fill + dark edge in one call.
export function plate(g, pts, fill, edge = 'rgba(8,12,22,0.9)', lw = 1) {
  cham(g, pts);
  g.fillStyle = fill;
  g.fill();
  if (edge) {
    g.strokeStyle = edge;
    g.lineWidth = lw;
    g.stroke();
  }
}

export function ell(g, x, y, rx, ry) {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
}

export function oct(g, r, sq = 0.72) {
  cham(g, octPts(r, sq));
}

export function ink(g, u, k = 1) {
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = INK;
  g.lineWidth = Math.max(1.2, u * 0.16) * k;
  g.stroke();
}

export function vGrad(g, y0, y1, c0, c1, c2) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, c0);
  gr.addColorStop(0.5, c1);
  gr.addColorStop(1, c2);
  return gr;
}

// One-off emissive stroke/fill pass with baked shadowBlur (offscreen only).
export function emit(g, color, blur, alpha, fn) {
  g.save();
  g.strokeStyle = color;
  g.fillStyle = color;
  g.shadowColor = color;
  g.shadowBlur = blur;
  g.globalAlpha = alpha;
  fn();
  g.restore();
}

// Brushed-metal sheen clipped to the current path: real conic gradient when
// the WebView supports it, diagonal linear fallback otherwise.
export function sheen(g, u) {
  g.save();
  g.clip();
  g.globalCompositeOperation = 'lighter';
  if (g.createConicGradient) {
    const cg = g.createConicGradient(-1.05, 0, 0);
    for (const [o, a] of [[0, 0.2], [0.16, 0.02], [0.33, 0.16], [0.5, 0.02], [0.66, 0.18], [0.83, 0.02], [1, 0.2]]) {
      cg.addColorStop(o, `rgba(255,255,255,${a})`);
    }
    g.fillStyle = cg;
  } else {
    g.fillStyle = vGrad(g, -u, u, 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.08)');
  }
  g.fillRect(-3 * u, -3 * u, 6 * u, 6 * u);
  g.restore();
}

// Bolt head with a specular dot.
export function rivets(g, pts, r) {
  for (const [x, y] of pts) {
    ell(g, x, y, r, r);
    g.fillStyle = 'rgba(10,14,26,0.8)';
    g.fill();
    ell(g, x - r * 0.3, y - r * 0.35, r * 0.4, r * 0.4);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fill();
  }
}

// ------------------------------------------------------------- tower bake
export function towerBase(g, s, level, color) {
  g.fillStyle = 'rgba(0,0,0,0.35)';
  ell(g, 0, 0.6 * s, 1.02 * s, 0.32 * s);
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.28)';
  ell(g, 0, 0.55 * s, 0.62 * s, 0.2 * s);
  g.fill();
  oct(g, 0.95 * s);
  g.fillStyle = vGrad(g, -0.72 * s, 0.72 * s, '#39445f', '#232c44', '#141a2c');
  g.fill();
  sheen(g, s);
  g.strokeStyle = 'rgba(8,12,22,0.9)';
  g.lineWidth = Math.max(1, 0.06 * s);
  g.stroke();
  oct(g, 0.76 * s);
  emit(g, color, 0.45 * s, 0.4 + 0.15 * level, () => {
    g.lineWidth = Math.max(1, 0.05 * s);
    g.stroke();
  });
  // circuit traces + vias: the "tech" layer of the pad
  g.strokeStyle = `rgba(120,220,255,${0.14 + 0.04 * level})`;
  g.lineWidth = Math.max(1, 0.03 * s);
  const via = [];
  for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    const ex = Math.cos(a) * 0.66 * s + Math.cos(a + Math.PI / 2) * 0.18 * s;
    const ey = Math.sin(a) * 0.5 * s;
    g.beginPath();
    g.moveTo(Math.cos(a) * 0.3 * s, Math.sin(a) * 0.22 * s);
    g.lineTo(Math.cos(a) * 0.66 * s, ey);
    g.lineTo(ex, ey);
    g.stroke();
    via.push([ex, ey]);
  }
  g.fillStyle = color;
  g.globalAlpha = 0.55;
  for (const [x, y] of via) { ell(g, x, y, 0.045 * s, 0.045 * s); g.fill(); }
  g.globalAlpha = 1;
  rivets(g, [[-0.74 * s, -0.26 * s], [0.74 * s, -0.26 * s], [-0.74 * s, 0.3 * s], [0.74 * s, 0.3 * s]], 0.07 * s);
  if (level >= 2) {
    oct(g, 0.86 * s);
    g.strokeStyle = color;
    g.globalAlpha = 0.3;
    g.lineWidth = Math.max(1, 0.035 * s);
    g.stroke();
    g.globalAlpha = 1;
  }
  if (level >= 3) {
    for (const sx of [-1, 1]) {
      plate(g, [[sx * 0.5 * s, 0.44 * s], [sx * 0.82 * s, 0.44 * s], [sx * 0.74 * s, 0.6 * s], [sx * 0.46 * s, 0.6 * s]], '#0d1322', color, Math.max(1, 0.03 * s));
    }
  }
  for (let i = 0; i < level; i++) {
    ell(g, (i - (level - 1) / 2) * 0.46 * s, 1.02 * s, 0.15 * s, 0.15 * s);
    g.fillStyle = '#ffe600';
    g.fill();
    ink(g, s, 0.5);
  }
}

export function pulseGun(g, s, level, color) {
  const railG = vGrad(g, -0.42 * s, 0.42 * s, '#4a5878', '#2b3550', '#171d30');
  const lw = Math.max(1, 0.045 * s);
  g.translate(0, -0.3 * s);
  for (const ry of [-0.3, 0.3]) {
    plate(g, [[0.1 * s, (ry - 0.12) * s], [1.32 * s, (ry - 0.08) * s], [1.4 * s, ry * s], [1.32 * s, (ry + 0.08) * s], [0.1 * s, (ry + 0.12) * s]], railG);
    emit(g, color, 0.3 * s, 0.8, () => {
      g.lineWidth = lw;
      g.beginPath();
      g.moveTo(0.3 * s, ry * s);
      g.lineTo(1.26 * s, ry * s);
      g.stroke();
    });
  }
  for (const cx of [0.42, 0.78, 1.14]) {
    plate(g, [[(cx - 0.07) * s, -0.34 * s], [(cx + 0.07) * s, -0.34 * s], [(cx + 0.05) * s, 0.34 * s], [(cx - 0.05) * s, 0.34 * s]], '#1b2236', 'rgba(8,12,22,0.9)', Math.max(1, 0.04 * s));
  }
  plate(g, [[-0.62 * s, -0.3 * s], [0.16 * s, -0.44 * s], [0.5 * s, -0.2 * s], [0.5 * s, 0.2 * s], [0.16 * s, 0.44 * s], [-0.62 * s, 0.3 * s]],
    vGrad(g, -0.44 * s, 0.44 * s, '#57668a', '#2c3752', '#151b2c'));
  sheen(g, s);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = lw;
  g.beginPath();
  g.moveTo(-0.5 * s, -0.24 * s);
  g.lineTo(0.12 * s, -0.36 * s);
  g.stroke();
  emit(g, color, 0.3 * s, 1, () => {
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(-0.44 * s, -0.12 * s);
    g.lineTo(0.1 * s, -0.24 * s);
    g.lineTo(0.3 * s, -0.14 * s);
    g.stroke();
  });
  if (level >= 2) {
    for (const py of [-0.56, 0.56]) {
      plate(g, [[-0.3 * s, (py - 0.14) * s], [0.04 * s, (py - 0.12) * s], [0.04 * s, (py + 0.12) * s], [-0.3 * s, (py + 0.14) * s]], '#232c44', 'rgba(8,12,22,0.9)', Math.max(1, 0.04 * s));
    }
  }
  if (level >= 3) {
    plate(g, [[-0.3 * s, -0.72 * s], [0.02 * s, -0.6 * s], [0.02 * s, -0.46 * s], [-0.3 * s, -0.5 * s]], '#2c3752');
  }
}

export function railGun(g, s, level, color) {
  const len = level >= 3 ? 1.9 : 1.62;
  const lw = Math.max(1, 0.045 * s);
  g.translate(0, -0.14 * s);
  for (const dy of [-0.3, 0.3]) {
    plate(g, [[-0.66 * s, (dy - 0.08) * s], [-0.2 * s, (dy - 0.05) * s], [-0.2 * s, (dy + 0.05) * s], [-0.66 * s, (dy + 0.08) * s]], '#232c44', 'rgba(8,12,22,0.9)', Math.max(1, 0.04 * s));
  }
  for (const bx of level >= 3 ? [-0.78, -1.08] : [-0.82]) {
    plate(g, [[(bx - 0.16) * s, -0.3 * s], [(bx + 0.16) * s, -0.24 * s], [(bx + 0.16) * s, 0.24 * s], [(bx - 0.16) * s, 0.3 * s]],
      vGrad(g, -0.3 * s, 0.3 * s, '#4a5878', '#232c44', '#131a2b'));
    for (let i = 0; i < 3; i++) {
      g.fillStyle = color;
      g.globalAlpha = 0.8;
      g.fillRect((bx - 0.05) * s, (-0.22 + i * 0.17) * s, 0.1 * s, 0.08 * s);
      g.globalAlpha = 1;
    }
  }
  plate(g, [[-0.62 * s, -0.26 * s], [0.3 * s, -0.34 * s], [0.44 * s, 0], [0.3 * s, 0.34 * s], [-0.62 * s, 0.26 * s]],
    vGrad(g, -0.34 * s, 0.34 * s, '#57668a', '#2c3752', '#151b2c'));
  sheen(g, s);
  for (const ry of [-0.24, 0.24]) {
    plate(g, [[0.2 * s, (ry - 0.09) * s], [len * s, (ry - 0.05) * s], [(len + 0.08) * s, ry * s], [len * s, (ry + 0.05) * s], [0.2 * s, (ry + 0.09) * s]], '#39445f', 'rgba(8,12,22,0.9)', Math.max(1, 0.04 * s));
  }
  const coils = level >= 2 ? 4 : 3;
  for (let i = 0; i < coils; i++) {
    const cx = 0.42 + (i * (len - 0.7)) / (coils - 1);
    plate(g, [[(cx - 0.07) * s, -0.3 * s], [(cx + 0.07) * s, -0.28 * s], [(cx + 0.07) * s, 0.28 * s], [(cx - 0.07) * s, 0.3 * s]], '#1b2236', 'rgba(8,12,22,0.9)', Math.max(1, 0.035 * s));
  }
  plate(g, [[-0.42 * s, -0.62 * s], [0.1 * s, -0.56 * s], [0.24 * s, -0.42 * s], [-0.42 * s, -0.4 * s]], '#2c3752');
  emit(g, color, 0.4 * s, 1, () => {
    g.fillRect(-0.3 * s, -0.56 * s, 0.42 * s, Math.max(1, 0.05 * s));
    if (level >= 3) g.fillRect(0.42 * s, -0.5 * s, (len - 0.4) * s, Math.max(1, 0.04 * s));
  });
}

export function cryoTop(g, s, color) {
  g.save();
  g.translate(0, 0.16 * s);
  for (let i = 0; i < 6; i++) {
    g.save();
    g.rotate((Math.PI / 3) * i + Math.PI / 6);
    plate(g, [[0.42 * s, -0.1 * s], [0.88 * s, -0.05 * s], [0.88 * s, 0.05 * s], [0.42 * s, 0.1 * s]], '#232c44', 'rgba(8,12,22,0.9)', Math.max(1, 0.035 * s));
    emit(g, color, 0.2 * s, 0.55, () => g.fillRect(0.5 * s, -0.03 * s, 0.32 * s, 0.06 * s));
    g.restore();
  }
  plate(g, [[-0.52 * s, 0.42 * s], [0.52 * s, 0.42 * s], [0.34 * s, -0.14 * s], [-0.34 * s, -0.14 * s]],
    vGrad(g, -0.14 * s, 0.42 * s, '#4a5878', '#26304a', '#131a2b'));
  sheen(g, s);
  ell(g, 0, -0.14 * s, 0.36 * s, 0.12 * s);
  g.fillStyle = '#101625';
  g.fill();
  g.strokeStyle = color;
  g.globalAlpha = 0.7;
  g.stroke();
  g.globalAlpha = 1;
  g.restore();
  // levitating ice core with gyro ring
  g.translate(0, -0.62 * s);
  g.strokeStyle = '#39445f';
  g.lineWidth = Math.max(1, 0.06 * s);
  ell(g, 0, 0.04 * s, 0.66 * s, 0.2 * s);
  g.stroke();
  for (let i = 0; i < 3; i++) {
    const a = (Math.PI * 2 * i) / 3 - 0.6;
    const fx = Math.cos(a) * 0.66 * s;
    const fy = 0.04 * s + Math.sin(a) * 0.2 * s;
    plate(g, [[fx, fy - 0.14 * s], [fx + 0.09 * s, fy + 0.08 * s], [fx - 0.09 * s, fy + 0.08 * s]], '#c6f7ff', 'rgba(8,12,22,0.9)', Math.max(1, 0.03 * s));
  }
  const h = 0.74 * s;
  const hw = 0.3 * s;
  cham(g, [[0, -h * 0.62], [hw, -h * 0.04], [0, h * 0.62], [-hw, -h * 0.04]]);
  const ig = g.createLinearGradient(-hw, 0, hw, 0);
  ig.addColorStop(0, '#eafffb');
  ig.addColorStop(0.5, color);
  ig.addColorStop(1, '#0f6f66');
  g.fillStyle = ig;
  g.fill();
  sheen(g, s * 0.7);
  g.strokeStyle = 'rgba(8,12,22,0.9)';
  g.lineWidth = Math.max(1, 0.04 * s);
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.beginPath();
  g.moveTo(-hw * 0.45, -h * 0.36);
  g.lineTo(-hw * 0.12, -h * 0.06);
  g.stroke();
}

export function arcTop(g, s, level, color) {
  for (let i = 0; i < 3; i++) {
    const w = (0.62 - 0.15 * i) * s;
    const y = (0.36 - 0.3 * i) * s;
    plate(g, [[-w, y + 0.1 * s], [w, y + 0.1 * s], [w * 0.78, y - 0.1 * s], [-w * 0.78, y - 0.1 * s]],
      vGrad(g, y - 0.12 * s, y + 0.12 * s, '#57668a', '#2c3752', '#151b2c'));
    g.fillStyle = color;
    g.globalAlpha = 0.5;
    g.fillRect(-w * 0.6, y + 0.1 * s, w * 1.2, Math.max(1, 0.035 * s));
    g.globalAlpha = 1;
  }
  plate(g, [[-0.14 * s, 0.28 * s], [0.14 * s, 0.28 * s], [0.1 * s, -0.86 * s], [-0.1 * s, -0.86 * s]], '#1b2236');
  const ry = (level >= 3 ? -0.94 : -0.86) * s;
  g.save();
  g.translate(0, ry);
  plate(g, octPts(0.4 * s, 0.3), '#39445f');
  const n = level >= 3 ? 4 : 3;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n - 0.5;
    const px = Math.cos(a) * 0.4 * s;
    const py = Math.sin(a) * 0.12 * s;
    const tx = Math.cos(a) * 0.62 * s;
    const ty = py - 0.42 * s;
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(tx, ty);
    g.strokeStyle = '#55627f';
    g.lineWidth = Math.max(1, 0.07 * s);
    g.lineCap = 'round';
    g.stroke();
    ell(g, tx, ty, 0.06 * s, 0.06 * s);
    g.fillStyle = color;
    g.fill();
  }
  ell(g, 0, -0.34 * s, 0.24 * s, 0.24 * s);
  const bg = g.createRadialGradient(0, -0.34 * s, 1, 0, -0.34 * s, 0.24 * s);
  bg.addColorStop(0, '#ffffff');
  bg.addColorStop(0.6, color);
  bg.addColorStop(1, 'rgba(179,102,255,0)');
  g.fillStyle = bg;
  g.fill();
  g.restore();
}


export function octPts(r, sq = 0.72) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i + Math.PI / 8;
    pts.push([Math.cos(a) * r * 1.06, Math.sin(a) * r * sq]);
  }
  return pts;
}
