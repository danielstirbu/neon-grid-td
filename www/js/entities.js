// entities.js — Tower, Enemy, Projectile, Beam, Particle, FloatingText.
import { TOWERS, ENEMIES, towerLevelStats, towerInvested, TARGET_MODES } from './config.js';

export class Enemy {
  constructor(typeKey, waveScale = 1) {
    const def = ENEMIES[typeKey];
    this.def = def;
    this.key = def.key;
    this.isBoss = !!def.boss;
    this.maxHp = def.hp * waveScale;
    this.hp = this.maxHp;
    this.baseSpeed = def.speed;
    this.speed = def.speed;
    this.armor = def.armor;
    this.reward = def.reward;
    this.coreDmg = def.coreDmg;
    this.size = def.size;
    this.color = def.color;
    this.shape = def.shape;
    this.x = 0;
    this.y = 0;
    this.dead = false;
    this.reachedCore = false;
    this.slowUntil = 0;
    this.slowFactor = 1;
    this.slowResist = def.slowResist || 0;
    this.regen = def.regen || 0;
    this.phaseEvery = def.phaseEvery || 0;
    this.phaseTime = def.phaseTime || 0;
    this.phaseLeft = 0;
    this.nextPhase = this.phaseEvery ? this.phaseEvery : 0;
    this.path = [];
    this.pathIdx = 0;
    this.travel = 0; // distance travelled, used by 'FIRST' targeting
    // Animation state consumed by the toon renderer.
    this.seed = Math.random() * 100;
    this.hurt = 0;
    this.blinkLeft = 0;
    this.nextBlink = 1.6 + Math.random() * 3.4;
    this.dirX = 0;
    this.dirY = 1;
  }

  get phased() {
    return this.phaseLeft > 0;
  }

  applySlow(factor, time, now) {
    const eff = 1 - (1 - factor) * (1 - this.slowResist);
    if (this.slowUntil <= now || eff < this.slowFactor) this.slowFactor = eff;
    this.slowUntil = Math.max(this.slowUntil, now + time);
  }

  takeDamage(amount) {
    if (this.dead) return;
    const dealt = Math.max(1, amount - this.armor);
    this.hp -= dealt;
    this.hurt = 0.16;
    if (this.hp <= 0) this.dead = true;
    return dealt;
  }

  update(dt, now) {
    if (this.hurt > 0) this.hurt -= dt;
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blinkLeft = 0.12;
      this.nextBlink = 1.6 + Math.random() * 3.4;
    }
    if (this.blinkLeft > 0) this.blinkLeft -= dt;
    if (this.phaseEvery) {
      this.nextPhase -= dt;
      if (this.nextPhase <= 0) {
        this.phaseLeft = this.phaseTime;
        this.nextPhase = this.phaseEvery;
      }
      if (this.phaseLeft > 0) this.phaseLeft -= dt;
    }
    if (this.regen && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);
    }
    if (now > this.slowUntil) this.slowFactor = 1;
    this.speed = this.baseSpeed * this.slowFactor;

    // Follow waypoint list; re-pathing is handled by main when the path invalidates.
    if (this.pathIdx < this.path.length) {
      const wp = this.path[this.pathIdx];
      const dx = wp.x - this.x;
      const dy = wp.y - this.y;
      const d = Math.hypot(dx, dy);
      const step = this.speed * dt;
      if (d > 1e-6) {
        this.dirX = dx / d;
        this.dirY = dy / d;
      }
      if (d <= step) {
        this.x = wp.x;
        this.y = wp.y;
        this.travel += d;
        this.pathIdx++;
      } else {
        this.x += (dx / d) * step;
        this.y += (dy / d) * step;
        this.travel += step;
      }
    }
    const last = this.path.length - 1;
    if (this.path.length && this.pathIdx > last) this.reachedCore = true;
  }
}

export class Tower {
  constructor(key, col, row) {
    const def = TOWERS[key];
    this.key = key;
    this.def = def;
    this.col = col;
    this.row = row;
    this.level = 1;
    this.cool = 0;
    this.angle = -Math.PI / 2;
    this.targetMode = 0; // index into TARGET_MODES
    this.recoil = 0;
  }

  get stats() {
    return towerLevelStats(this.key, this.level);
  }

  get invested() {
    return towerInvested(this.key, this.level);
  }

  get canUpgrade() {
    return this.level < 3;
  }

  get upgradeCost() {
    return this.canUpgrade ? this.def.upgradeCost[this.level] : 0;
  }

  get sellValue() {
    return Math.floor(this.invested * 0.6);
  }

  get targetModeName() {
    return TARGET_MODES[this.targetMode];
  }

  cycleTargetMode() {
    this.targetMode = (this.targetMode + 1) % TARGET_MODES.length;
  }

  upgrade() {
    if (this.canUpgrade) this.level++;
  }

  // Pick a target following the current mode.
  pickTarget(enemies) {
    const { range } = this.stats;
    const cx = this.col + 0.5;
    const cy = this.row + 0.5;
    let best = null;
    let bestVal = -Infinity;
    for (const e of enemies) {
      if (e.dead || e.phased) continue;
      const d = Math.hypot(e.x - cx, e.y - cy);
      if (d > range) continue;
      let val;
      switch (TARGET_MODES[this.targetMode]) {
        case 'CLOSE': val = -d; break;
        case 'STRONG': val = e.hp; break;
        default: val = e.travel; break; // FIRST
      }
      if (val > bestVal) {
        bestVal = val;
        best = e;
      }
    }
    return best;
  }
}

export class Projectile {
  constructor(tower, target) {
    const s = tower.stats;
    this.x = tower.col + 0.5;
    this.y = tower.row + 0.5;
    this.target = target;
    this.speed = tower.def.projSpeed;
    this.damage = s.damage;
    this.color = tower.def.color;
    this.cryo = tower.key === 'cryo' ? { factor: s.slowFactor, time: s.slowTime } : null;
    this.dead = false;
    this.life = 3;
  }

  update(dt, now) {
    this.life -= dt;
    if (this.life <= 0) {
      this.dead = true;
      return;
    }
    const t = this.target;
    if (t.dead || t.phased) {
      this.dead = true;
      return;
    }
    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (d <= step + t.size * 0.5) {
      t.takeDamage(this.damage);
      if (this.cryo) t.applySlow(this.cryo.factor, this.cryo.time, now);
      this.dead = true;
      this.impacted = true;
    } else {
      this.x += (dx / d) * step;
      this.y += (dy / d) * step;
    }
  }
}

export class Beam {
  // Instant piercing line (rail) or chain arc (arc node). Both are short-lived VFX
  // whose damage was already applied at fire time.
  constructor(points, color, width, time) {
    this.points = points;
    this.color = color;
    this.width = width;
    this.time = time;
    this.maxTime = time;
  }

  update(dt) {
    this.time -= dt;
  }

  get done() {
    return this.time <= 0;
  }
}

export class Particle {
  constructor(x, y, color, speed, time, size) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.35 + Math.random() * 0.85);
    this.x = x;
    this.y = y;
    this.vx = Math.cos(a) * s;
    this.vy = Math.sin(a) * s;
    this.color = color;
    this.time = time;
    this.maxTime = time;
    this.size = size || 0.07;
  }

  update(dt) {
    this.time -= dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 1 - 2.6 * dt;
    this.vy *= 1 - 2.6 * dt;
  }

  get done() {
    return this.time <= 0;
  }
}

export class FloatingText {
  constructor(x, y, text, color, size = 0.5) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.size = size;
    this.time = 0.9;
    this.maxTime = 0.9;
  }

  update(dt) {
    this.time -= dt;
    this.y -= dt * 0.9;
  }

  get done() {
    return this.time <= 0;
  }
}

const MAX_PARTICLES = 240; // P-09: hard ceiling; bursts drop excess particles instead of growing unbounded

export function burst(list, x, y, color, n = 10, speed = 2.4, time = 0.45, size) {
  const count = Math.max(0, Math.min(n, MAX_PARTICLES - list.length));
  for (let i = 0; i < count; i++) list.push(new Particle(x, y, color, speed, time * (0.6 + Math.random() * 0.7), size));
}
