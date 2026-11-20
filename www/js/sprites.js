// sprites.js — F4: Offscreen Canvas Sprite Baking. Every unit texture
// (layered towers per level, per-class enemies, energy cores, muzzle flashes,
// projectile trails) is pre-rendered HERE, once per resize, at up to 3x
// devicePixelRatio, using the paint kit in unitart.js / enemyart.js. The
// render loop only composites the baked canvases with transforms + drawImage
// — zero per-frame gradients (P-03) and no shadowBlur outside this offscreen
// bake pass (P-06).
import { TOWERS, ENEMIES } from './config.js';
import { cham, ell, towerBase, pulseGun, railGun, cryoTop, arcTop } from './unitart.js';
import { enemyBody } from './enemyart.js';

// Retina/AMOLED: bake up to 3x DPR; anything above adds memory, not pixels.
export const bakeScaleFor = (dpr) => Math.max(1, Math.min(dpr || 1, 3));
export const towerSpriteKey = (key, level) => `${key}:${Math.min(3, Math.max(1, level | 0))}`;
// Spring-style ease so barrel recoil reads physical instead of linear.
export const easeRecoil = (r) => (r <= 0 ? 0 : r * (2 - r));
// Walk-cycle frame from distance travelled: animation stays pinned to the
// road while the game runs at 1x/2x speed and freezes with the world.
export const enemyFrame = (e) => (Math.floor(((e && e.travel) || 0) * 2.4 + ((e && e.seed) || 0) * 7) & 1);

const HOVER = { diamond: 1, tri: 1, ghost: 1 };

// Bake one centred canvas of w×h CSS px at scale K; the paint fn draws in
// unit space with (0,0) at the sprite anchor.
function bake(w, h, K, fn) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * K));
  c.height = Math.max(1, Math.round(h * K));
  const g = c.getContext('2d');
  g.setTransform(K, 0, 0, K, c.width / 2, c.height / 2);
  fn(g);
  return c;
}

// Additive radial sprite (energy cores, flares). Soft by nature, so a fixed
// bake size upscales invisibly — one per color, shared by all users.
function radialSprite(stops, px = 96) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(px / 2, px / 2, 1, px / 2, px / 2, px / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, px, px);
  return c;
}

// Tail-fading additive streak used as the projectile trail.
function streakSprite(color) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 32;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 64, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.7, color);
  gr.addColorStop(1, 'rgba(255,255,255,0.9)');
  g.fillStyle = gr;
  cham(g, [[0, 16], [40, 10.5], [64, 13.5], [64, 18.5], [40, 21.5]]);
  g.fill();
  return c;
}

// Four-spike star for muzzle flashes; drawn additively on top of the glow.
function flashSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 48, 48);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  cham(g, [[0, -46], [7, -8], [46, 0], [7, 8], [0, 46], [-7, 8], [-46, 0], [-7, -8]]);
  g.fill();
  g.beginPath();
  g.arc(0, 0, 12, 0, Math.PI * 2);
  g.fill();
  return c;
}

export class SpriteBank {
  constructor() {
    this.K = 1;
    this.towers = new Map();
    this.enemies = new Map();
    this.glows = new Map();
    this.streaks = new Map();
    this.flash = null;
  }

  _glow(color) {
    let g = this.glows.get(color);
    if (!g) {
      g = radialSprite([[0, 'rgba(255,255,255,0.95)'], [0.35, color], [1, 'rgba(0,0,0,0)']]);
      this.glows.set(color, g);
    }
    return g;
  }

  // Full rebuild, called from Renderer.resize() — gradients/shadowBlur are
  // only allowed inside this one-shot offscreen pass (P-03 / P-06).
  build(cell, dpr) {
    this.dispose();
    const K = (this.K = bakeScaleFor(dpr));
    const s = cell * 0.38;
    const THW = 2.2 * s;
    const THH = 1.5 * s;
    for (const key of Object.keys(TOWERS)) {
      const color = TOWERS[key].color;
      for (const level of [1, 2, 3]) {
        const spec = { hw: THW, hh: THH, rot: null, top: null, corePos: [0, 0], coreR: 0, tip: null, glow: this._glow(color) };
        spec.base = bake(THW * 2, THH * 2, K, (g) => towerBase(g, s, level, color));
        if (key === 'pulse') {
          spec.rot = bake(THW * 2, THH * 2, K, (g) => pulseGun(g, s, level, color));
          spec.corePos = [1.34, -0.3];
          spec.coreR = 0.42 * s;
          spec.tip = [1.5, -0.3];
        } else if (key === 'rail') {
          spec.rot = bake(THW * 2, THH * 2, K, (g) => railGun(g, s, level, color));
          spec.corePos = [-0.82, -0.14];
          spec.coreR = 0.3 * s;
          spec.tip = [level >= 3 ? 2.06 : 1.78, -0.14];
        } else if (key === 'cryo') {
          spec.top = bake(THW * 2, THH * 2, K, (g) => cryoTop(g, s, color));
          spec.corePos = [0, -0.66];
          spec.coreR = 0.55 * s;
        } else {
          spec.top = bake(THW * 2, THH * 2, K, (g) => arcTop(g, s, level, color));
          spec.corePos = [0, -1.2];
          spec.coreR = 0.45 * s;
        }
        spec.core = spec.glow;
        this.towers.set(towerSpriteKey(key, level), spec);
      }
    }
    for (const key of Object.keys(ENEMIES)) {
      const def = ENEMIES[key];
      const u = def.size * cell;
      const HW = 1.62 * u;
      const HH = 1.85 * u;
      const lift = HOVER[def.shape] ? 1.28 : 0.98;
      const spec = { hw: HW, hh: HH, hover: !!HOVER[def.shape], corePos: [0, -0.15], coreR: (def.boss ? 0.6 : 0.34) * u, glow: this._glow(def.color) };
      spec.shadow = bake(HW * 2, HH * 2, K, (g) => {
        g.fillStyle = spec.hover ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.32)';
        ell(g, 0, lift * u, (spec.hover ? 0.7 : 0.95) * u, (spec.hover ? 0.22 : 0.32) * u);
        g.fill();
      });
      spec.frames = [0, 1].map((f) => bake(HW * 2, HH * 2, K, (g) => enemyBody(g, def, u, f, false)));
      spec.blink = bake(HW * 2, HH * 2, K, (g) => enemyBody(g, def, u, 0, true));
      this.enemies.set(key, spec);
    }
    for (const c of new Set(Object.values(TOWERS).map((t) => t.color))) {
      this.streaks.set(c, streakSprite(c));
    }
    this.flash = flashSprite();
  }

  dispose() {
    for (const m of [this.towers, this.enemies, this.glows, this.streaks]) {
      for (const spec of m.values()) {
        const list = spec.base ? [spec.base, spec.rot, spec.top, spec.shadow, spec.blink, ...(spec.frames || [])] : [spec];
        for (const c of list) if (c) { c.width = 0; c.height = 0; }
      }
      m.clear();
    }
    this.flash = null;
  }
}
