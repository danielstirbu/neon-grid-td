// main.js — game loop (clamped dt), Pointer Events input, state machine, combat orchestration.
import { GRID, ECONOMY, SPEED_OPTIONS, PALETTE, TOWERS } from './config.js';
import { audio } from './audio.js';
import { Pathfinder } from './pathfinding.js';
import { Enemy, Tower, Projectile, Beam, FloatingText, burst } from './entities.js';
import { waveGroups, waveScale, buildSchedule } from './waves.js';
import { Renderer } from './renderer.js';
import { UI } from './ui.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new Renderer(this.canvas);
    this.path = new Pathfinder(GRID.cols, GRID.rows, GRID.spawn, GRID.core);
    this.ui = new UI(this);

    this.state = 'menu'; // menu | playing | over
    this.endless = false;
    this.totalWaves = 20;
    // resetRun() touches these, so they must exist before it is first called.
    this.towerGrid = new Map();
    this.hover = null;
    this.pointerDown = null;
    this.lastTime = performance.now();
    this.resetRun();

    this._bindInput();
    window.addEventListener('resize', () => this.renderer.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.paused = true;
    });
    this.ui.updateHUD(this);
    requestAnimationFrame((t) => this.frame(t));
  }

  resetRun() {
    this.cash = ECONOMY.startCash;
    this.core = ECONOMY.startCore;
    this.wave = 0;
    this.waveActive = false;
    this.schedule = null;
    this.spawnClock = 0;
    this.paused = false;
    this.speedIndex = 0;
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.beams = [];
    this.particles = [];
    this.floaters = [];
    this.towerGrid.clear();
    this.path = new Pathfinder(GRID.cols, GRID.rows, GRID.spawn, GRID.core);
    this.selectedTower = null;
    this.ui.closeTowerMenuSilent();
    this.ui.clearTowerSelect();
  }

  begin(endless) {
    this.endless = endless;
    this.resetRun();
    this.state = 'playing';
    this.ui.hideStart();
    this.ui.hideOver();
    audio.play('wave');
  }

  retry() {
    this.begin(this.endless);
  }

  toMenu() {
    this.state = 'menu';
    this.resetRun();
    this.ui.showStart();
  }

  togglePause() {
    if (this.state !== 'playing') return;
    this.paused = !this.paused;
    audio.play('tap');
  }

  toggleSpeed() {
    this.speedIndex = (this.speedIndex + 1) % SPEED_OPTIONS.length;
    audio.play('tap');
  }

  toggleSound() {
    audio.setEnabled(!audio.enabled);
    if (audio.enabled) audio.play('tap');
  }

  // ---------- Waves ----------
  startNextWave() {
    if (this.state !== 'playing' || this.waveActive) return;
    this.wave += 1;
    const groups = waveGroups(this.wave, this.endless);
    this.schedule = buildSchedule(groups);
    this.spawnClock = 0;
    this.waveScale = waveScale(this.wave, this.endless);
    this.waveActive = true;
    const isBoss = this.wave % 5 === 0;
    this.ui.showBanner(isBoss ? `⚠ WAVE ${this.wave} — BOSS ⚠` : `WAVE ${this.wave}`);
    audio.play(isBoss ? 'boss' : 'wave');
    this.ui.vibrate(isBoss ? [40, 60, 40] : 15);
  }

  updateWave(dt) {
    if (!this.waveActive) return;
    this.spawnClock += dt;
    const ev = this.schedule.events;
    while (ev.length && ev[0].at <= this.spawnClock) {
      const e = ev.shift();
      const enemy = new Enemy(e.type, this.waveScale);
      enemy.x = GRID.spawn.col + 0.5;
      enemy.y = GRID.spawn.row + 0.5;
      this.repath(enemy);
      this.enemies.push(enemy);
    }
    if (ev.length === 0 && this.enemies.length === 0) {
      this.waveActive = false;
      const bonus = ECONOMY.waveBonus(this.wave);
      this.cash += bonus;
      this.floaters.push(new FloatingText(GRID.core.col + 0.5, GRID.core.row, `+¤${bonus}`, PALETTE.yellow, 0.55));
      if (!this.endless && this.wave >= this.totalWaves) return this.victory();
    }
  }

  repath(enemy) {
    // Walk the flow-field from the enemy's current cell to the core, building waypoints.
    const pts = [];
    let fx = enemy.x;
    let fy = enemy.y;
    let guard = 0;
    while (guard++ < GRID.cols * GRID.rows + 4) {
      const col = Math.floor(fx);
      const row = Math.floor(fy);
      if (col === GRID.core.col && row === GRID.core.row) break;
      const nxt = this.path.nextStep(fx, fy);
      pts.push(nxt);
      fx = nxt.x;
      fy = nxt.y;
      if (Math.abs(nxt.x - (col + 0.5)) < 1e-9 && Math.abs(nxt.y - (row + 0.5)) < 1e-9) {
        // nextStep returned the same cell center (stuck on a wall) — nudge forward.
        break;
      }
    }
    enemy.path = pts;
    enemy.pathIdx = 0;
  }

  repathAll() {
    for (const e of this.enemies) this.repath(e);
  }

  victory() {
    this.state = 'over';
    audio.play('victory');
    this.ui.showOver('GRID SECURED', `All ${this.totalWaves} waves repelled. Core integrity ${this.core}/${ECONOMY.startCore}.`);
  }

  defeat() {
    this.state = 'over';
    audio.play('defeat');
    this.ui.vibrate([60, 50, 60, 50, 120]);
    this.ui.showOver('GRID BREACHED', `The core fell on wave ${this.wave}.`);
  }

  // ---------- Building ----------
  towerAt(col, row) {
    return this.towerGrid.get(`${col},${row}`);
  }

  tryPlaceTower(col, row) {
    const key = this.ui.selectedTowerKey;
    if (!key) return false;
    const def = TOWERS[key];
    if (this.cash < def.cost) {
      audio.play('deny');
      this.ui.toast('NOT ENOUGH CREDITS');
      this.ui.vibrate(30);
      return false;
    }
    if (!this.path.canPlace(col, row)) {
      audio.play('deny');
      this.ui.toast(this.path.isBlocked(col, row) ? 'CELL OCCUPIED' : 'PATH MUST STAY OPEN');
      this.ui.vibrate(30);
      return false;
    }
    const t = new Tower(key, col, row);
    this.towers.push(t);
    this.towerGrid.set(`${col},${row}`, t);
    this.path.place(col, row);
    this.repathAll();
    this.cash -= def.cost;
    audio.play('place');
    this.ui.vibrate(12);
    burst(this.particles, col + 0.5, row + 0.5, def.color, 8, 1.6, 0.4);
    if (this.cash < def.cost) this.ui.clearTowerSelect();
    return true;
  }

  upgradeSelected() {
    const t = this.ui.menuTower;
    if (!t || !t.canUpgrade) return;
    const cost = t.upgradeCost;
    if (this.cash < cost) {
      audio.play('deny');
      this.ui.toast('NOT ENOUGH CREDITS');
      return;
    }
    this.cash -= cost;
    t.upgrade();
    audio.play('upgrade');
    this.ui.vibrate(18);
    burst(this.particles, t.col + 0.5, t.row + 0.5, t.def.color, 12, 2, 0.5);
    this.ui.refreshTowerMenu();
  }

  sellSelected() {
    const t = this.ui.menuTower;
    if (!t) return;
    this.cash += t.sellValue;
    this.towers = this.towers.filter((x) => x !== t);
    this.towerGrid.delete(`${t.col},${t.row}`);
    this.path.remove(t.col, t.row);
    this.repathAll();
    audio.play('sell');
    this.ui.vibrate(10);
    burst(this.particles, t.col + 0.5, t.row + 0.5, PALETTE.yellow, 8, 1.8, 0.4);
    this.ui.closeTowerMenu();
  }

  cycleSelectedTarget() {
    const t = this.ui.menuTower;
    if (!t) return;
    t.cycleTargetMode();
    audio.play('tap');
    this.ui.refreshTowerMenu();
  }

  clearSelectedTower() {
    this.selectedTower = null;
  }

  // ---------- Input ----------
  _bindInput() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      audio.unlock();
      this.pointerDown = { x: e.clientX, y: e.clientY, id: e.pointerId };
      c.setPointerCapture?.(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (this.state !== 'playing') return;
      const rect = c.getBoundingClientRect();
      const g = this.renderer.toGrid(e.clientX - rect.left, e.clientY - rect.top);
      const col = Math.floor(g.x);
      const row = Math.floor(g.y);
      this.hover = this.ui.selectedTowerKey &&
        col >= 0 && row >= 0 && col < GRID.cols && row < GRID.rows
        ? { col, row, valid: this.path.canPlace(col, row) && this.cash >= TOWERS[this.ui.selectedTowerKey].cost }
        : null;
    });
    c.addEventListener('pointerup', (e) => {
      e.preventDefault();
      const down = this.pointerDown;
      this.pointerDown = null;
      if (!down || down.id !== e.pointerId || this.state !== 'playing') return;
      const rect = c.getBoundingClientRect();
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved > 24) return;
      const g = this.renderer.toGrid(e.clientX - rect.left, e.clientY - rect.top);
      const col = Math.floor(g.x);
      const row = Math.floor(g.y);
      if (col < 0 || row < 0 || col >= GRID.cols || row >= GRID.rows) return;
      this.handleTap(col, row);
    });
    c.addEventListener('pointercancel', () => { this.pointerDown = null; });
    window.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'p') this.togglePause();
      if (e.key === 'n') this.startNextWave();
      if (e.key === 'Escape') { this.ui.clearTowerSelect(); this.ui.closeTowerMenu(); }
      if (e.key >= '1' && e.key <= '4') {
        const keys = ['pulse', 'cryo', 'arc', 'rail'];
        this.ui.toggleTowerSelect(keys[+e.key - 1]);
      }
    });
  }

  handleTap(col, row) {
    const existing = this.towerAt(col, row);
    if (this.ui.selectedTowerKey) {
      if (!existing) {
        if (this.tryPlaceTower(col, row)) this.ui.clearTowerSelect();
      } else {
        audio.play('deny');
        this.ui.toast('CELL OCCUPIED');
      }
      return;
    }
    if (existing) {
      this.selectedTower = existing;
      this.ui.openTowerMenu(existing);
      audio.play('tap');
    } else {
      this.ui.closeTowerMenu();
      this.selectedTower = null;
    }
  }

  // ---------- Combat ----------
  fireTower(t, dt, now) {
    t.recoil = Math.max(0, t.recoil - dt * 6);
    t.cool -= dt;
    if (t.cool > 0) return;
    const target = t.pickTarget(this.enemies);
    if (!target) return;
    const s = t.stats;
    t.cool = 1 / s.fireRate;
    t.recoil = 1;
    t.angle = Math.atan2(target.y - (t.row + 0.5), target.x - (t.col + 0.5));
    const cx = t.col + 0.5;
    const cy = t.row + 0.5;

    if (t.def.kind === 'projectile') {
      this.projectiles.push(new Projectile(t, target));
      audio.play(t.key === 'cryo' ? 'cryo' : 'pulse');
    } else if (t.def.kind === 'beam') {
      // Piercing line: hit everything along the ray up to range.
      const dx = Math.cos(t.angle);
      const dy = Math.sin(t.angle);
      const endX = cx + dx * s.range;
      const endY = cy + dy * s.range;
      const pts = [{ x: cx, y: cy }, { x: endX, y: endY }];
      for (const e of this.enemies) {
        if (e.dead || e.phased) continue;
        // point-to-segment distance
        const vx = endX - cx; const vy = endY - cy;
        const wx = e.x - cx; const wy = e.y - cy;
        const tt = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
        const px = cx + vx * tt - e.x;
        const py = cy + vy * tt - e.y;
        if (Math.hypot(px, py) <= e.size + t.def.beamWidth) {
          const dealt = e.takeDamage(s.damage);
          this.floaters.push(new FloatingText(e.x, e.y - e.size, `-${dealt}`, t.def.color, 0.4));
        }
      }
      this.beams.push(new Beam(pts, t.def.color, t.def.beamWidth, t.def.beamTime));
      audio.play('rail');
    } else if (t.def.kind === 'chain') {
      const pts = [{ x: cx, y: cy }];
      let from = target;
      const hitSet = new Set();
      let dmg = s.damage;
      for (let i = 0; i < s.chainCount; i++) {
        if (!from || hitSet.has(from)) break;
        hitSet.add(from);
        pts.push({ x: from.x, y: from.y });
        const dealt = from.takeDamage(dmg);
        this.floaters.push(new FloatingText(from.x, from.y - from.size, `-${dealt}`, t.def.color, 0.36));
        dmg *= t.def.chainFalloff;
        // next nearest unhit enemy within chainRange
        let next = null;
        let nd = t.def.chainRange;
        for (const e of this.enemies) {
          if (e.dead || hitSet.has(e) || e.phased) continue;
          const d = Math.hypot(e.x - from.x, e.y - from.y);
          if (d < nd) { nd = d; next = e; }
        }
        from = next;
      }
      this.beams.push(new Beam(pts, t.def.color, 0.12, 0.18));
      audio.play('arc');
    }
  }

  // ---------- Loop ----------
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    dt = Math.min(Math.max(dt, 0), 0.05); // clamp to avoid tunnelling after tab-switch
    if (this.state === 'playing' && !this.paused) {
      const steps = SPEED_OPTIONS[this.speedIndex];
      for (let i = 0; i < steps; i++) this.step(dt);
    }
    this.render();
    this.ui.updateHUD(this);
  }

  step(dt) {
    const now = performance.now() / 1000;
    this.updateWave(dt);
    for (const t of this.towers) this.fireTower(t, dt, now);
    for (const e of this.enemies) e.update(dt, now);
    for (const p of this.projectiles) p.update(dt, now);
    for (const b of this.beams) b.update(dt);

    // kills & leaks
    for (const e of this.enemies) {
      if (e.dead) {
        this.cash += e.reward;
        this.floaters.push(new FloatingText(e.x, e.y, `+¤${e.reward}`, PALETTE.yellow, 0.42));
        burst(this.particles, e.x, e.y, e.color, e.isBoss ? 26 : 10, e.isBoss ? 3.4 : 2.2, 0.5);
        audio.play('kill');
        if (e.isBoss) this.ui.vibrate([30, 40, 30]);
      } else if (e.reachedCore) {
        this.core -= e.coreDmg;
        burst(this.particles, GRID.core.col + 0.5, GRID.core.row + 0.5, PALETTE.danger, 14, 2.6, 0.5);
        audio.play('leak');
        this.ui.vibrate(25);
        if (this.core <= 0) {
          this.core = 0;
          return this.defeat();
        }
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead && !e.reachedCore);
    for (const p of this.projectiles) {
      if (p.impacted) burst(this.particles, p.x, p.y, p.color, 5, 1.6, 0.25);
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.beams = this.beams.filter((b) => !b.done);
    for (const p of this.particles) p.update(dt);
    this.particles = this.particles.filter((p) => !p.done);
    for (const f of this.floaters) f.update(dt);
    this.floaters = this.floaters.filter((f) => !f.done);
  }

  render() {
    const r = this.renderer;
    r.begin();
    r.drawGrid(this.ui.selectedTowerKey ? this.hover : null);
    if (this.ui.selectedTowerKey && this.hover) {
      r.drawRange(this.hover.col, this.hover.row,
        TOWERS[this.ui.selectedTowerKey].range[0],
        TOWERS[this.ui.selectedTowerKey].color);
    }
    if (this.selectedTower) r.drawSelected(this.selectedTower);
    for (const t of this.towers) r.drawTower(t);
    for (const b of this.beams) r.drawBeam(b);
    for (const e of this.enemies) r.drawEnemy(e);
    for (const p of this.projectiles) r.drawProjectile(p);
    for (const p of this.particles) r.drawParticle(p);
    for (const f of this.floaters) r.drawFloatingText(f);
  }
}

// Expose game instance for smoke tests and debugging.
window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
});
export { Game };
