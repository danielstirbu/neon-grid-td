// enemyart.js — F4 enemy bake painters: chassis per shape (AO-ready body,
// metallic gradient + conic sheen, panel seams, rivets, emissive accent),
// per-class extras (feet/pucks for the armored tank, antenna for the drone,
// speed streaks for the fast sprinter, shield bubble for the shielder, regen
// cross for the healing phantom, crown for the boss). Two walk frames + one
// blink frame are baked per class by SpriteBank; the loop just alternates.
import { INK, lighten, darken, shapePoints } from './toon.js';
import { ell, plate, ink, vGrad, sheen, rivets, emit } from './unitart.js';

const FACE = {
  drone: { r: 0.3, gap: 0.36, mouth: 'smile' },
  sprinter: { r: 0.26, gap: 0.36, angry: true, mouth: 'grin' },
  tank: { r: 0.22, gap: 0.34, angry: true, mouth: 'grin' },
  shielder: { r: 0.26, gap: 0.38, mouth: 'flat' },
  phantom: { r: 0.32, gap: 0.32, mouth: 'o' },
  boss: { r: 0.24, gap: 0.34, angry: true, mouth: 'fangs' },
};

// ------------------------------------------------------------- enemy bake

// Eyes / brows / mouth, baked straight into the body frames (2 walk
// frames + 1 blink frame per class).
// ------------------------------------------------------------- enemy face

function faceDraw(g, u, key, blink) {
  const f = FACE[key] || FACE.drone;
  const r = u * f.r;
  for (const side of [-1, 1]) {
    const ex = side * u * f.gap;
    const ey = -u * 0.12;
    if (blink) {
      g.strokeStyle = INK;
      g.lineCap = 'round';
      g.lineWidth = Math.max(1.2, r * 0.42);
      g.beginPath();
      g.moveTo(ex - r * 0.7, ey + r * 0.1);
      g.lineTo(ex + r * 0.7, ey + r * 0.1);
      g.stroke();
      continue;
    }
    ell(g, ex, ey, r * 0.8, r);
    g.fillStyle = '#ffffff';
    g.fill();
    ink(g, u, 0.55);
    ell(g, ex, ey + r * 0.18, r * 0.42, r * 0.5);
    g.fillStyle = INK;
    g.fill();
    ell(g, ex - r * 0.2, ey - r * 0.06, r * 0.15, r * 0.15);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.fill();
  }
  if (f.angry) {
    g.strokeStyle = INK;
    g.lineCap = 'round';
    g.lineWidth = Math.max(1.2, r * 0.5);
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(side * u * f.gap - side * r * 0.9, -u * 0.12 - r * 1.35);
      g.lineTo(side * u * f.gap + side * r * 0.7, -u * 0.12 - r * 0.85);
      g.stroke();
    }
  }
  const y = u * 0.42;
  g.lineCap = 'round';
  g.strokeStyle = INK;
  g.lineWidth = Math.max(1.2, u * 0.1);
  if (f.mouth === 'o') {
    ell(g, 0, y, u * 0.14, u * 0.17);
    g.fillStyle = INK;
    g.fill();
  } else if (f.mouth === 'flat') {
    g.beginPath();
    g.moveTo(-u * 0.2, y);
    g.lineTo(u * 0.2, y);
    g.stroke();
  } else if (f.mouth === 'smile') {
    g.beginPath();
    g.arc(0, y - u * 0.12, u * 0.26, 0.25 * Math.PI, 0.75 * Math.PI);
    g.stroke();
  } else {
    plate(g, [[-u * 0.32, y - u * 0.12], [0, y + u * 0.4], [u * 0.32, y - u * 0.12]], INK, null);
    g.save();
    g.clip();
    g.fillStyle = '#ffffff';
    g.fillRect(-u * 0.4, y - u * 0.14, u * 0.8, u * 0.14);
    g.restore();
    if (f.mouth === 'fangs') {
      for (const side of [-1, 1]) {
        plate(g, [[side * u * 0.16, y - u * 0.02], [side * u * 0.26, y - u * 0.02], [side * u * 0.21, y + u * 0.18]], INK, null);
      }
    }
  }
}

export function enemyBody(g, def, u, frame, blink) {
  const color = def.color;
  if (def.shape === 'tri') {
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.lineCap = 'round';
    g.lineWidth = Math.max(1, u * 0.14);
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(side * u * 0.75, -u * 0.1);
      g.lineTo(side * u * 0.75, u * 1.05);
      g.stroke();
    }
  }
  if (def.shape === 'hex') {
    for (const side of [-1, 1]) {
      ell(g, side * u * 0.45, u * (0.92 + (side > 0 === !!frame ? 0.12 : -0.12)), u * 0.3, u * 0.2);
      g.fillStyle = darken(color, 0.35);
      g.fill();
      ink(g, u, 0.6);
      ell(g, side * u, u * (0.15 + (frame ? 0.12 : -0.12) * side), u * 0.28, u * 0.28);
      g.fillStyle = lighten(color, 0.15);
      g.fill();
      ink(g, u, 0.6);
    }
  }
  if (def.shape === 'diamond') {
    const ax = (frame ? 0.22 : -0.18) * u;
    g.strokeStyle = INK;
    g.lineCap = 'round';
    g.lineWidth = Math.max(1.2, u * 0.11);
    g.beginPath();
    g.moveTo(0, -u * 0.82);
    g.quadraticCurveTo(ax * 0.4, -u * 1.16, ax, -u * 1.42);
    g.stroke();
    ell(g, ax, -u * 1.42, u * 0.2, u * 0.2);
    g.fillStyle = lighten(color, 0.35);
    g.fill();
    ink(g, u, 0.6);
  }
  enemyShape(g, def.shape, u, color, def.key);
  faceDraw(g, u, def.key, blink);
  if (def.boss) {
    plate(g, [[-u * 0.46, -u * 0.72], [-u * 0.46, -u * 1.06], [-u * 0.18, -u * 0.86], [0, -u * 1.16],
      [u * 0.18, -u * 0.86], [u * 0.46, -u * 1.06], [u * 0.46, -u * 0.72]], '#ffe600');
  }
  if (def.key === 'phantom') {
    g.fillStyle = 'rgba(190,255,225,0.9)';
    g.fillRect(-u * 0.06, -u * 0.55, u * 0.12, u * 0.34);
    g.fillRect(-u * 0.17, -u * 0.44, u * 0.34, u * 0.12);
  }
  if (def.shape === 'square') {
    ell(g, 0, u * 0.95, u * 0.46, u * 0.46);
    g.fillStyle = lighten(color, 0.2);
    g.globalAlpha = 0.75;
    g.fill();
    g.globalAlpha = 1;
    ink(g, u, 0.8);
    ell(g, 0, u * 0.95, u * 0.2, u * 0.2);
    g.fillStyle = darken(color, 0.3);
    g.fill();
  }
}

function enemyShape(g, shape, u, color, key) {
  if (shape === 'ghost') {
    const span = (u * 1.8) / 3;
    g.beginPath();
    g.arc(0, -u * 0.05, u * 0.9, Math.PI, 0);
    g.lineTo(u * 0.9, u * 0.6);
    for (let i = 0; i < 3; i++) {
      const x0 = u * 0.9 - span * i;
      g.quadraticCurveTo(x0 - span / 2, u * (i % 2 === 0 ? 1.05 : 0.3), x0 - span, u * 0.6);
    }
    g.closePath();
  } else {
    roundPolyPath(g, shapePoints(shape, u), shape === 'square' ? 0.5 : shape === 'boss' ? 0.45 : shape === 'tri' ? 0.7 : 0.8);
  }
  g.fillStyle = vGrad(g, -u, u, lighten(color, 0.45), color, darken(color, 0.32));
  g.fill();
  sheen(g, u);
  // armor plating: panel seams + rivets read as hard surface under the ink
  g.save();
  g.clip();
  g.strokeStyle = 'rgba(8,12,22,0.28)';
  g.lineWidth = Math.max(1, u * 0.05);
  for (const yy of [-0.42, 0.5]) {
    g.beginPath();
    g.moveTo(-u, u * yy);
    g.lineTo(u, u * yy);
    g.stroke();
  }
  rivets(g, [[-u * 0.55, -u * 0.28], [u * 0.55, -u * 0.28], [-u * 0.4, u * 0.68], [u * 0.4, u * 0.68]], Math.max(1.2, u * 0.07));
  emit(g, color, u * 0.35, 0.7, () => {
    g.lineWidth = Math.max(1, u * 0.06);
    g.beginPath();
    if (key === 'tank' || key === 'boss') {
      g.moveTo(-u * 0.6, u * 0.14);
      g.lineTo(-u * 0.3, u * 0.14);
      g.moveTo(u * 0.6, u * 0.14);
      g.lineTo(u * 0.3, u * 0.14);
    } else {
      g.moveTo(-u * 0.5, -u * 0.62);
      g.lineTo(u * 0.5, -u * 0.62);
    }
    g.stroke();
  });
  g.restore();
  ink(g, u);
  ell(g, -u * 0.3, -u * 0.5, u * 0.3, u * 0.16);
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fill();
}


function roundPolyPath(g, pts, round) {
  const n = pts.length;
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const lp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  g.beginPath();
  for (let j = 0; j <= n; j++) {
    const i = j % n;
    const inn = lp(pts[i], mid(pts[i], pts[(i - 1 + n) % n]), round);
    const out = lp(pts[i], mid(pts[i], pts[(i + 1) % n]), round);
    if (j === 0) g.moveTo(out.x, out.y);
    else g.lineTo(inn.x, inn.y);
    g.quadraticCurveTo(pts[i].x, pts[i].y, out.x, out.y);
  }
  g.closePath();
}
