// renderer.js — Canvas 2D at native DPR: grid, towers, enemies, projectiles, beams, VFX.
import { GRID, PALETTE } from './config.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.cell = 24;
    this.ox = 0;
    this.oy = 0;
    this.resize();
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
  }

  // Screen CSS px -> grid float coords
  toGrid(px, py) {
    return { x: (px - this.ox) / this.cell, y: (py - this.oy) / this.cell };
  }

  sx(x) { return this.ox + x * this.cell; }
  sy(y) { return this.oy + y * this.cell; }

  begin() {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
  }

  drawGrid(hover) {
    const { ctx, cell } = this;
    const w = cell * GRID.cols;
    const h = cell * GRID.rows;
    ctx.save();
    ctx.fillStyle = 'rgba(8,11,30,0.85)';
    ctx.fillRect(this.ox, this.oy, w, h);

    ctx.strokeStyle = PALETTE.gridSoft;
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
    const cx = this.sx(t.col + 0.5);
    const cy = this.sy(t.row + 0.5);
    const r = cell * 0.36;
    ctx.save();
    ctx.translate(cx, cy);

    // base plate
    ctx.strokeStyle = t.def.color;
    ctx.fillStyle = 'rgba(5,6,15,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // level pips
    ctx.fillStyle = t.def.color;
    for (let i = 0; i < t.level; i++) {
      ctx.fillRect(-r + 3 + i * (cell * 0.12), r + 2, cell * 0.08, 3);
    }

    // turret head
    ctx.rotate(t.angle + Math.PI / 2);
    const rec = t.recoil > 0 ? t.recoil * cell * 0.12 : 0;
    ctx.font = `bold ${Math.round(cell * 0.5)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = t.def.color;
    ctx.shadowBlur = cell * 0.28;
    ctx.fillStyle = t.def.color;
    ctx.fillText(t.def.glyph, 0, rec);
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
    ctx.shadowColor = e.color;
    ctx.shadowBlur = cell * 0.22;
    ctx.fillStyle = e.color;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    switch (e.shape) {
      case 'tri':
        ctx.moveTo(0, -s); ctx.lineTo(s * 0.87, s * 0.5); ctx.lineTo(-s * 0.87, s * 0.5);
        ctx.closePath();
        break;
      case 'square':
        ctx.rect(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6);
        break;
      case 'hex': {
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 6;
          const px = Math.cos(a) * s; const py = Math.sin(a) * s;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        break;
      }
      case 'ghost': {
        ctx.arc(0, -s * 0.15, s * 0.85, Math.PI, 0);
        ctx.lineTo(s * 0.85, s * 0.7);
        ctx.quadraticCurveTo(s * 0.42, s * 0.35, 0, s * 0.7);
        ctx.quadraticCurveTo(-s * 0.42, s * 0.35, -s * 0.85, s * 0.7);
        ctx.closePath();
        break;
      }
      case 'boss': {
        for (let i = 0; i < 8; i++) {
          const a = (Math.PI / 4) * i;
          const rr = i % 2 === 0 ? s : s * 0.55;
          const px = Math.cos(a) * rr; const py = Math.sin(a) * rr;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        break;
      }
      default: // diamond
        ctx.moveTo(0, -s); ctx.lineTo(s * 0.75, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.75, 0);
        ctx.closePath();
    }
    ctx.fill();
    if (e.armor > 0) ctx.stroke();
    if (e.slowFactor < 1) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = PALETTE.green;
      ctx.globalAlpha = 0.85;
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
    ctx.save();
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = cell * 0.3;
    ctx.beginPath();
    ctx.arc(this.sx(p.x), this.sy(p.y), cell * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawBeam(b) {
    const { ctx, cell } = this;
    const a = Math.max(0, b.time / b.maxTime);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = cell * 0.4;
    ctx.lineWidth = Math.max(1.5, b.width * cell * a);
    ctx.beginPath();
    for (let i = 0; i < b.points.length; i++) {
      const pt = b.points[i];
      i === 0 ? ctx.moveTo(this.sx(pt.x), this.sy(pt.y)) : ctx.lineTo(this.sx(pt.x), this.sy(pt.y));
    }
    ctx.stroke();
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
    ctx.fillStyle = ft.color;
    ctx.font = `bold ${Math.max(10, ft.size * cell)}px monospace`;
    ctx.textAlign = 'center';
    ctx.shadowColor = ft.color;
    ctx.shadowBlur = 6;
    ctx.fillText(ft.text, this.sx(ft.x), this.sy(ft.y));
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
