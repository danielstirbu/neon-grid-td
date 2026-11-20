// renderer.js — Canvas 2D at native DPR: meadow backdrop, grid, towers, enemies, projectiles, beams, VFX.
// Characters are drawn with the toon.js cartoon helpers; projectiles/beams/particles stay neon.
import { GRID, PALETTE } from './config.js';
import { drawToonEnemy, drawToonTower, toonText, clearGradCache } from './toon.js';
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
    this.glowSprites = new Map();
    for (const color of GLOW_COLORS) this.glowSprites.set(color, makeGlowSprite(color));
    this.resize();
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
    clearGradCache(); // P-03: toon gradients are keyed by cell size s; drop stale entries
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
    const w = cell * GRID.cols;
    const h = cell * GRID.rows;
    ctx.save();
    // Translucent panel so the meadow shows through while cells stay legible.
    ctx.fillStyle = 'rgba(10,26,18,0.4)';
    ctx.fillRect(this.ox, this.oy, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.ox + 1, this.oy + 1, w - 2, h - 2);

    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c <= GRID.cols; c++) {
      ctx.moveTo(this.ox + c * cell + 0.5, this.oy);
      ctx.lineTo(this.ox + c * cell + 0.5, this.oy + h);
    }
    for (let r = 0; r <= GRID.rows; r++) {
      ctx.moveTo(this.ox, this.oy + r * cell + 0.5);
      ctx.lineTo(this.ox + w, this.oy + r * cell + 0.5);
    }
    ctx.stroke();

    // Spawn & core markers
    this._marker(GRID.spawn, PALETTE.magenta, 'SPAWN');
    this._marker(GRID.core, PALETTE.green, 'CORE');

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

  drawTower(t) {
    const { ctx, cell } = this;
    ctx.save();
    ctx.translate(this.sx(t.col + 0.5), this.sy(t.row + 0.5));
    drawToonTower(ctx, t, cell, this.time);
    ctx.restore();
  }

  drawEnemy(e) {
    const { ctx, cell } = this;
    const x = this.sx(e.x);
    const y = this.sy(e.y);
    const s = e.size * cell;
    ctx.save();
    ctx.translate(x, y);
    if (e.phased) ctx.globalAlpha = 0.32;
    drawToonEnemy(ctx, e, s, this.time);
    if (e.slowFactor < 1) {
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = PALETTE.green;
      ctx.lineWidth = Math.max(1.5, s * 0.12);
      ctx.beginPath();
      ctx.arc(0, 0, s * 1.35, 0, Math.PI * 2);
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
