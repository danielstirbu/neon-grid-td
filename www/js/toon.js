// toon.js — shared art primitives: ink/palette mixers, shape outlines and the
// outlined text used by floating numbers. The unit art itself was retired
// here in F4: towers/enemies are now baked once per resize by sprites.js
// (kit in unitart.js / enemyart.js), so this module no longer allocates any
// gradients or draws any characters.

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

function P(x, y) {
  return { x, y };
}

// Canonical silhouette of each enemy shape in unit space (y down); the
// bakers in enemyart.js fill these with the metallic gradient + ink pass.
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
