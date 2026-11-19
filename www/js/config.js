// config.js — balance constants: grid, economy, towers (Lv.1-3), enemies, palette.

export const GRID = {
  cols: 9,
  rows: 14,
  spawn: { col: 4, row: 0 },
  core: { col: 4, row: 13 },
};

export const PALETTE = {
  bg: '#05060f',
  grid: '#1b2a6b',
  cyan: '#00e5ff',
  magenta: '#ff2d95',
  green: '#00ff9d',
  yellow: '#ffe600',
  violet: '#b366ff',
  white: '#d7e4ff',
  danger: '#ff4d5e',
};

export const ECONOMY = {
  startCash: 140,
  startCore: 20,
  sellRatio: 0.6,
  waveBonus: (wave) => 18 + wave * 3,
};

export const TARGET_MODES = ['FIRST', 'CLOSE', 'STRONG'];

// Tower stats indexed by level-1 (0..2). range/fireRate in grid units and shots/sec.
export const TOWERS = {
  pulse: {
    key: 'pulse',
    name: 'Pulse Turret',
    glyph: '▲',
    color: PALETTE.cyan,
    desc: 'Rapid single-target plasma bolts.',
    cost: 40,
    upgradeCost: [0, 45, 80],
    damage: [8, 14, 24],
    range: [2.6, 2.9, 3.2],
    fireRate: [2.0, 2.4, 2.9],
    kind: 'projectile',
    projSpeed: 9,
  },
  cryo: {
    key: 'cryo',
    name: 'Cryo Emitter',
    glyph: '❆',
    color: PALETTE.green,
    desc: 'Slows enemies. Shatter damage on slowed.',
    cost: 55,
    upgradeCost: [0, 55, 95],
    damage: [5, 8, 13],
    range: [2.4, 2.7, 3.0],
    fireRate: [1.3, 1.5, 1.8],
    kind: 'projectile',
    projSpeed: 7,
    slowFactor: [0.55, 0.48, 0.4],
    slowTime: [1.4, 1.7, 2.0],
  },
  arc: {
    key: 'arc',
    name: 'Arc Node',
    glyph: '⚡',
    color: PALETTE.violet,
    desc: 'Chain lightning arcs between enemies.',
    cost: 70,
    upgradeCost: [0, 70, 120],
    damage: [10, 16, 25],
    range: [2.3, 2.5, 2.8],
    fireRate: [0.9, 1.05, 1.25],
    kind: 'chain',
    chainCount: [3, 4, 6],
    chainRange: 1.8,
    chainFalloff: 0.72,
  },
  rail: {
    key: 'rail',
    name: 'Rail Cannon',
    glyph: '➤',
    color: PALETTE.yellow,
    desc: 'Piercing hyper-velocity slug. Long range.',
    cost: 95,
    upgradeCost: [0, 90, 150],
    damage: [34, 55, 88],
    range: [4.4, 5.0, 5.6],
    fireRate: [0.45, 0.55, 0.68],
    kind: 'beam',
    beamWidth: 0.24,
    beamTime: 0.14,
  },
};

export const TOWER_ORDER = ['pulse', 'cryo', 'arc', 'rail'];

export const ENEMIES = {
  drone: {
    key: 'drone', name: 'Recon Drone', hp: 26, speed: 1.7, reward: 6, coreDmg: 1,
    color: PALETTE.cyan, size: 0.26, shape: 'diamond', armor: 0,
  },
  sprinter: {
    key: 'sprinter', name: 'Sprinter', hp: 16, speed: 2.6, reward: 5, coreDmg: 1,
    color: PALETTE.yellow, size: 0.2, shape: 'tri', armor: 0,
  },
  tank: {
    key: 'tank', name: 'Hulk Tank', hp: 130, speed: 0.85, reward: 13, coreDmg: 2,
    color: PALETTE.magenta, size: 0.36, shape: 'hex', armor: 2, slowResist: 0.5,
  },
  shielder: {
    key: 'shielder', name: 'Shielder', hp: 70, speed: 1.15, reward: 11, coreDmg: 2,
    color: PALETTE.green, size: 0.3, shape: 'square', armor: 5,
  },
  phantom: {
    key: 'phantom', name: 'Phantom', hp: 52, speed: 1.5, reward: 10, coreDmg: 2,
    color: PALETTE.violet, size: 0.28, shape: 'ghost', armor: 0,
    regen: 4, phaseEvery: 3.2, phaseTime: 0.7, // brief untargetable blink
  },
  boss: {
    key: 'boss', name: 'GRID REAPER', hp: 650, speed: 0.72, reward: 70, coreDmg: 5,
    color: PALETTE.danger, size: 0.46, shape: 'boss', armor: 4, slowResist: 0.5,
    boss: true,
  },
};

export const WAVES_META = {
  total: 20,
  bossEvery: 5,
  // Speed & HP growth used by the endless generator past wave 20.
  endlessHpGrowth: 0.22,
  endlessCountGrowth: 0.12,
};

export const SPEED_OPTIONS = [1, 2];

export function towerLevelStats(key, level) {
  const t = TOWERS[key];
  const i = Math.min(level, 3) - 1;
  return {
    damage: t.damage[i],
    range: t.range[i],
    fireRate: t.fireRate[i],
    slowFactor: t.slowFactor ? t.slowFactor[i] : 0,
    slowTime: t.slowTime ? t.slowTime[i] : 0,
    chainCount: t.chainCount ? t.chainCount[i] : 0,
  };
}

export function towerInvested(key, level) {
  const t = TOWERS[key];
  let sum = t.cost;
  for (let l = 1; l < level; l++) sum += t.upgradeCost[l];
  return sum;
}
