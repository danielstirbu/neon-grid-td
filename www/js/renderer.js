// renderer.js — Canvas 2D at native DPR: meadow backdrop, tile-builder road
// network (baked board), towers, enemies, projectiles, beams, VFX.
// Units are composited from the pre-baked, multi-layer sprite bank (sprites.js
// F4): the draw loop is only drawImage + transforms, so recoil, core pulses,
// turret rotation, walk/hover cycles and trails cost no vector re-raster.
import { GRID, PALETTE, CORE_CELL } from './config.js';
import { toonText } from './toon.js';
import { SpriteBank, towerSpriteKey, easeRecoil, enemyFrame } from './sprites.js';
import { Landscape } from './landscape.js';

// P-06: pre-rendered 64px white radial glow, tinted via 'source-atop' per color.
// Replaces per-projectile/per-beam shadowBlur (1-3 ms per call on mobile GPUs).
const GLOW_COLORS = [
  'DEFAULT', PALETTE.cyan, PALETTE.green, PALETTE.magenta, PALETTE.yellow, PALETTE.danger,
];

function makeGlowSprite(color) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 1, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  if (color !== 'DEFAULT') {
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = color;
    g.fillRect(0, 0, 64, 64);
  }
  return c;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.cell = 24;
    this.ox = 0;
    this.oy = 0;
    this.time = 0; // seconds since load, drives toon idle animations
    this.landscape = new Landscape();
    this.sprites = new SpriteBank(); // F4: baked unit textures, rebuilt on resize
    this.glowSprites = new Map();
    for (const color of GLOW_COLORS) this.glowSprites.set(color, makeGlowSprite(color));
    this.board = null; // pre-rendered panel + road network + platforms (P-03/P-06 safe)
    this.path = null; // Pathfinder set by Game via setNetwork(); board derives from it
    this.resize();
  }

  // The road network lives in the Pathfinder; the board must be re-baked
  // whenever the network changes (new run, placed road piece).
  setNetwork(pathfinder) {
    this.path = pathfinder;
    this._buildBoard();
  }

  _glow(color) {
    let sprite = this.glowSprites.get(color);
    if (!sprite) {
      sprite = makeGlowSprite(color);
      this.glowSprites.set(color, sprite);
    }
    return sprite;
  }

  resize() {
    const parent = this.canvas.parentElement;
    const cssW = parent.clientWidth;
    const cssH = parent.clientHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.max(1, Math.round(cssW * this.dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * this.dpr));
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    // Fit the grid inside the stage preserving square cells.
    this.cell = Math.floor(Math.min(cssW / GRID.cols, cssH / GRID.rows));
    this.ox = Math.round((cssW - this.cell * GRID.cols) / 2);
    this.oy = Math.round((cssH - this.cell * GRID.rows) / 2);
    this.landscape.build(cssW, cssH, this.dpr, {
      x: this.ox,
      y: this.oy,
      w: this.cell * GRID.cols,
      h: this.cell * GRID.rows,
    });
    this._buildBoard();
    // F4: bake sprites at the RAW device DPR (up to 3x for Retina/AMOLED) —
    // crisper than the canvas' own 2.5x clamp lets them be.
    this.sprites.build(this.cell, Math.min(window.devicePixelRatio || 1, 3));
  }

  // Pre-render panel, platforms and the road network once per rebuild; per
  // frame it is a single drawImage (no per-frame gradients — P-03 — and no
  // shadowBlur — P-06). Rebuilt on resize and whenever the road grows.
  _buildBoard() {
    const { cell, dpr } = this;
    const w = cell * GRID.cols;
    const h = cell * GRID.rows;
    if (!w || !h) return;
    if (!this.board) this.board = document.createElement('canvas');
    this.board.width = Math.round(w * dpr);
    this.board.height = Math.round(h * dpr);
    const g = this.board.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    // Translucent panel so the backdrop shows through while cells stay legible.
    g.fillStyle = 'rgba(10,26,18,0.4)';
    g.fillRect(0, 0, w, h);

    const net = this.path;

    // Build platforms: raised tiles with corner studs, inset from the road.
    for (let row = 0; row < GRID.rows; row++) {
      for (let col = 0; col < GRID.cols; col++) {
        if (net && net.isRoad(col, row)) continue;
        const x = col * cell;
        const y = row * cell;
        const p = Math.max(2, cell * 0.11);
        g.fillStyle = 'rgba(27,42,107,0.5)';
        g.fillRect(x + p, y + p, cell - p * 2, cell - p * 2);
        g.strokeStyle = 'rgba(0,229,255,0.28)';
        g.lineWidth = 1;
        g.strokeRect(x + p + 0.5, y + p + 0.5, cell - p * 2 - 1, cell - p * 2 - 1);
        g.fillStyle = 'rgba(0,229,255,0.5)';
        const s = Math.max(1.5, cell * 0.06);
        g.fillRect(x + p, y + p, s, s);
        g.fillRect(x + cell - p - s, y + p, s, s);
        g.fillRect(x + p, y + cell - p - s, s, s);
        g.fillRect(x + cell - p - s, y + cell - p - s, s, s);
      }
    }

    if (!net) return;

    // Road tiles: dark plate with a neon rim; every port grows a connector tab
    // to the cell border, so reciprocal ports read as seamless joints and a
    // dangling port reads as an open connector pointing at its SPAWN portal.
    const inset = Math.max(2, cell * 0.12);
    const tabHalf = cell * 0.21;
    const tabLen = cell / 2 - inset + 1;
    for (const { col, row } of net.cells.values()) {
      const x = col * cell;
      const y = row * cell;
      const cx = x + cell / 2;
      const cy = y + cell / 2;
      g.fillStyle = '#081221';
      g.strokeStyle = 'rgba(0,229,255,0.55)';
      g.lineWidth = Math.max(1, cell * 0.05);
      g.fillRect(x + inset, y + inset, cell - inset * 2, cell - inset * 2);
      g.strokeRect(x + inset + 0.5, y + inset + 0.5, cell - inset * 2 - 1, cell - inset * 2 - 1);
      for (let d = 0; d < 4; d++) {
        if (!net.hasPort(col, row, d)) continue;
        const dx = [0, 1, 0, -1][d];
        const dy = [-1, 0, 1, 0][d];
        // tab from the plate edge to the cell border
        const tx = dx === 1 ? cx : dx === -1 ? cx - tabLen : cx - tabHalf;
        const ty = dy === 1 ? cy : dy === -1 ? cy - tabLen : cy - tabHalf;
        const tw = dx === 0 ? tabHalf * 2 : tabLen;
        const th = dy === 0 ? tabHalf * 2 : tabLen;
        g.fillStyle = '#081221';
        g.fillRect(tx, ty, tw, th);
        // open connector: neon cap where the port faces an empty cell
        const ex = col + dx;
        const ey = row + dy;
        const matched = (net.isRoad(ex, ey) && net.hasPort(ex, ey, (d + 2) % 4)) || net.isCore(ex, ey);
        if (!matched) {
          g.strokeStyle = 'rgba(0,229,255,0.9)';
          g.lineWidth = Math.max(1.5, cell * 0.08);
          const bx = x + cell / 2 + dx * (cell / 2 - 1);
          const by = y + cell / 2 + dy * (cell / 2 - 1);
          g.beginPath();
          if (dx !== 0) {
            g.moveTo(bx, cy - tabHalf);
            g.lineTo(bx, cy + tabHalf);
          } else {
            g.moveTo(cx - tabHalf, by);
            g.lineTo(cx + tabHalf, by);
          }
          g.stroke();
        }
      }
      // baked flow hint: small chevron pointing one step closer to the core
      const here = net.distAt(col, row);
      if (here > 0) {
        const nxt = net.nextStep(col + 0.5, row + 0.5);
        const ang = Math.atan2(nxt.y - (row + 0.5), nxt.x - (col + 0.5));
        g.save();
        g.translate(cx, cy);
        g.rotate(ang);
        g.strokeStyle = 'rgba(0,229,255,0.8)';
        g.lineWidth = Math.max(1, cell * 0.06);
        const a = cell * 0.16;
        g.beginPath();
        g.moveTo(-a * 0.5, -a);
        g.lineTo(a * 0.6, 0);
        g.lineTo(-a * 0.5, a);
        g.stroke();
        g.restore();
      }
    }

    // Panel frame on top of everything.
    g.strokeStyle = 'rgba(255,255,255,0.28)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, w - 2, h - 2);
  }

  // Screen CSS px -> grid float coords
  toGrid(px, py) {
    return { x: (px - this.ox) / this.cell, y: (py - this.oy) / this.cell };
  }

  sx(x) { return this.ox + x * this.cell; }
  sy(y) { return this.oy + y * this.cell; }

  begin() {
    const { ctx } = this;
    this.time = performance.now() / 1000;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
    this.landscape.draw(ctx, this.time);
  }

  drawGrid(hover) {
    const { ctx, cell } = this;
    ctx.save();
    // Panel + platforms + road network were baked into this.board.
    if (this.board) ctx.drawImage(this.board, this.ox, this.oy, cell * GRID.cols, cell * GRID.rows);

    // CORE at the centre; the single SPAWN portal pulses at the farthest tip.
    this._marker(CORE_CELL, PALETTE.green, 'CORE');
    if (this.path) {
      const portal = this.path.spawnCells()[0];
      if (portal) {
        const pulse = 0.55 + 0.35 * Math.sin(this.time * 4);
        ctx.save();
        ctx.globalAlpha = pulse;
        this._marker(portal, PALETTE.magenta, 'SPAWN');
        ctx.restore();
      }
    }

    if (hover) {
      const { col, row, valid } = hover;
      ctx.fillStyle = valid ? 'rgba(0,229,255,0.18)' : 'rgba(255,77,94,0.22)';
      ctx.strokeStyle = valid ? PALETTE.cyan : PALETTE.danger;
      ctx.lineWidth = 2;
      ctx.fillRect(this.ox + col * cell, this.oy + row * cell, cell, cell);
      ctx.strokeRect(this.ox + col * cell + 1, this.oy + row * cell + 1, cell - 2, cell - 2);
    }
    ctx.restore();
  }

  // Ghost preview of the selected road piece: flat fills + strokes only
  // (no gradients/shadowBlur — P-03/P-06). Cyan when canPlaceRoadPiece says
  // the spot is valid, red otherwise.
  drawPieceGhost(preview) {
    if (!preview) return;
    const { ctx, cell } = this;
    const ok = preview.valid;
    const fill = ok ? 'rgba(0,229,255,0.22)' : 'rgba(255,77,94,0.24)';
    const stroke = ok ? PALETTE.cyan : PALETTE.danger;
    ctx.save();
    ctx.lineWidth = 2;
    for (let i = 0; i < preview.cells.length; i++) {
      const c = preview.cells[i];
      if (c.col < 0 || c.row < 0 || c.col >= GRID.cols || c.row >= GRID.rows) continue;
      const x = this.sx(c.col);
      const y = this.sy(c.row);
      ctx.fillStyle = fill;
      ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
      ctx.strokeStyle = stroke;
      ctx.strokeRect(x + 3, y + 3, cell - 6, cell - 6);
      // connector tabs show where the piece would link or dangle
      for (const d of preview.ports[i]) {
        const dx = [0, 1, 0, -1][d];
        const dy = [-1, 0, 1, 0][d];
        const bx = x + cell / 2 + dx * cell * 0.42;
        const by = y + cell / 2 + dy * cell * 0.42;
        ctx.beginPath();
        if (dx !== 0) {
          ctx.moveTo(bx, by - cell * 0.18);
          ctx.lineTo(bx, by + cell * 0.18);
        } else {
          ctx.moveTo(bx - cell * 0.18, by);
          ctx.lineTo(bx + cell * 0.18, by);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  _marker(cellPos, color, label) {
    const { ctx, cell } = this;
    const x = this.sx(cellPos.col);
    const y = this.sy(cellPos.row);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.9;
    ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4);
    ctx.globalAlpha = 0.16;
    ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
    ctx.globalAlpha = 1;
    ctx.font = `bold ${Math.max(7, cell * 0.26)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + cell / 2, y + cell / 2);
    ctx.restore();
  }

  drawRange(col, row, range, color) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(this.sx(col + 0.5), this.sy(row + 0.5), range * this.cell, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  // Blit a baked canvas of the given unit half-box at the local origin.
  _blit(c, hw, hh) {
    if (c) this.ctx.drawImage(c, -hw, -hh, hw * 2, hh * 2);
  }

  // Baked-base tower: pad stays grounded, turret rotates + recoils along the
  // aim axis, energy core pulses additively, muzzle flash rides the recoil.
  // Zero vector art per frame (F4 / P-03 / P-06).
  drawTower(t) {
    const { ctx, cell } = this;
    const spec = this.sprites.towers.get(towerSpriteKey(t.key, t.level));
    if (!spec) return;
    const s = cell * 0.38;
    const seed = t.col * 7.13 + t.row * 3.71;
    const bob = Math.sin(this.time * 3 + seed) * s * 0.045;
    const rec = easeRecoil(t.recoil);
    const pulse = 0.5 + 0.5 * Math.sin(this.time * (2.2 + (t.key === 'arc' ? 0.9 : 0)) + seed);
    ctx.save();
    ctx.translate(this.sx(t.col + 0.5), this.sy(t.row + 0.5));
    this._blit(spec.base, spec.hw, spec.hh);
    const dyn = () => {
      // additive energy core, hotter while recoiling
      const cr = spec.coreR * (1 + 0.16 * pulse + 0.4 * rec);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.4 + 0.3 * pulse + 0.35 * rec;
      ctx.drawImage(spec.core, (spec.corePos[0] * s) - cr, (spec.corePos[1] * s) - cr, cr * 2, cr * 2);
    };
    if (spec.rot) {
      ctx.save();
      ctx.translate(0, bob);
      ctx.rotate(t.viewAngle);
      ctx.translate(-rec * s * 0.26, 0);
      this._blit(spec.rot, spec.hw, spec.hh);
      dyn();
      if (rec > 0.22 && spec.tip) {
        const fr = s * (0.42 + 0.55 * rec);
        ctx.globalAlpha = rec;
        ctx.drawImage(this.sprites.flash, (spec.tip[0] * s) - fr, (spec.tip[1] * s) - fr, fr * 2, fr * 2);
      }
      ctx.restore();
    } else if (spec.top) {
      ctx.save();
      ctx.translate(0, bob);
      this._blit(spec.top, spec.hw, spec.hh);
      dyn();
      ctx.restore();
    }
    ctx.restore();
  }

  // Baked enemy: AO shadow stays on the ground, body frame alternates with
  // distance travelled (walk) or bobs/tilts (hover), hurt flash and energy
  // core pulse are additive drawImage passes — no vector re-draw (F4).
  drawEnemy(e) {
    const { ctx, cell } = this;
    const spec = this.sprites.enemies.get(e.key);
    if (!spec) return;
    const s = e.size * cell;
    const x = this.sx(e.x);
    const y = this.sy(e.y);
    const f = enemyFrame(e);
    const bob = spec.hover
      ? Math.sin(this.time * 6 + e.seed) * s * 0.14
      : -Math.abs(Math.sin((e.travel * 2.4 + e.seed * 7) * Math.PI)) * s * 0.07;
    ctx.save();
    ctx.translate(x, y);
    if (e.phased) ctx.globalAlpha = 0.32;
    this._blit(spec.shadow, spec.hw, spec.hh);
    ctx.save();
    ctx.translate(0, bob);
    if (spec.hover) ctx.rotate(Math.sin(this.time * 2.5 + e.seed) * 0.06);
    this._blit(e.blinkLeft > 0 ? spec.blink : spec.frames[f], spec.hw, spec.hh);
    ctx.globalCompositeOperation = 'lighter';
    if (e.hurt > 0) {
      ctx.globalAlpha = Math.min(0.7, e.hurt * 4);
      ctx.drawImage(spec.glow, -s * 1.25, -s * 1.25, s * 2.5, s * 2.5);
    }
    const cr = spec.coreR * (1 + 0.18 * Math.sin(this.time * 4 + e.seed));
    ctx.globalAlpha = (e.isBoss ? 0.6 : 0.34) + 0.2 * Math.sin(this.time * 4 + e.seed);
    ctx.drawImage(spec.glow, spec.corePos[0] * s - cr, spec.corePos[1] * s - cr, cr * 2, cr * 2);
    ctx.restore();
    if (e.slowFactor < 1) {
      ctx.globalAlpha = 0.85;
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = PALETTE.green;
      ctx.lineWidth = Math.max(1.5, s * 0.12);
      ctx.beginPath();
      ctx.arc(0, bob, s * 1.35, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // HP bar
    if (e.hp < e.maxHp && !e.dead) {
      const w = cell * 0.7;
      const frac = Math.max(0, e.hp / e.maxHp);
      ctx.save();
      ctx.translate(x - w / 2, y - s - cell * 0.28);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, w, 4);
      ctx.fillStyle = frac > 0.5 ? PALETTE.green : frac > 0.25 ? PALETTE.yellow : PALETTE.danger;
      ctx.fillRect(0, 0, w * frac, 4);
      ctx.restore();
    }
  }

  drawProjectile(p) {
    const { ctx, cell } = this;
    const x = this.sx(p.x);
    const y = this.sy(p.y);
    const r = cell * 0.28;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // F4 trail: baked tail-fading streak along the velocity vector.
    const streak = this.sprites.streaks.get(p.color);
    if (streak && (p.dirX || p.dirY)) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(p.dirY, p.dirX));
      ctx.globalAlpha = 0.5;
      const tl = cell * 1.15;
      ctx.drawImage(streak, -tl, -cell * 0.22, tl, cell * 0.44);
      ctx.restore();
    }
    ctx.globalAlpha = 0.55;
    ctx.drawImage(this._glow(p.color), x - r, y - r, r * 2, r * 2);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x, y, cell * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Draw one polyline pass; widths/alphas in CSS px / fraction.
  _beamPath(b, width, alpha) {
    const { ctx } = this;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i < b.points.length; i++) {
      const pt = b.points[i];
      i === 0 ? ctx.moveTo(this.sx(pt.x), this.sy(pt.y)) : ctx.lineTo(this.sx(pt.x), this.sy(pt.y));
    }
    ctx.stroke();
  }

  drawBeam(b) {
    const { ctx, cell } = this;
    const a = Math.max(0, b.time / b.maxTime);
    const w = Math.max(1.5, b.width * cell * a);
    // Soft halo via glow sprites along the polyline — shadowBlur is too expensive
    // per beam (P-06); 'lighter' keeps the neon additive look.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sprite = this._glow(b.color);
    const gr = Math.max(6, w * 2.6);
    for (let i = 1; i < b.points.length; i++) {
      const x0 = this.sx(b.points[i - 1].x);
      const y0 = this.sy(b.points[i - 1].y);
      const x1 = this.sx(b.points[i].x);
      const y1 = this.sy(b.points[i].y);
      const seg = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.max(1, Math.min(10, Math.ceil(seg / gr)));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        ctx.globalAlpha = a * 0.35;
        ctx.drawImage(sprite, x0 + (x1 - x0) * t - gr, y0 + (y1 - y0) * t - gr, gr * 2, gr * 2);
      }
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = b.color;
    ctx.lineCap = 'round';
    this._beamPath(b, w, a);
    // hot core line keeps the beam legible against the halo
    ctx.strokeStyle = '#ffffff';
    this._beamPath(b, Math.max(1, w * 0.35), a * 0.8);
    ctx.restore();
  }

  drawParticle(pt) {
    const { ctx, cell } = this;
    const a = Math.max(0, pt.time / pt.maxTime);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = pt.color;
    ctx.fillRect(this.sx(pt.x) - cell * pt.size / 2, this.sy(pt.y) - cell * pt.size / 2,
      cell * pt.size * a, cell * pt.size * a);
    ctx.restore();
  }

  drawFloatingText(ft) {
    const { ctx, cell } = this;
    const a = Math.max(0, ft.time / ft.maxTime);
    ctx.save();
    ctx.globalAlpha = a;
    toonText(ctx, ft.text, this.sx(ft.x), this.sy(ft.y), Math.max(10, ft.size * cell), ft.color);
    ctx.restore();
  }

  drawSelected(t) {
    const { ctx, cell } = this;
    ctx.save();
    ctx.strokeStyle = PALETTE.yellow;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(this.ox + t.col * cell + 1, this.oy + t.row * cell + 1, cell - 2, cell - 2);
    ctx.restore();
    this.drawRange(t.col, t.row, t.stats.range, t.def.color);
  }
}
