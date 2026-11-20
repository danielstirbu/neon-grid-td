// config.js — balance constants: grid, road pieces (tile-builder), economy, towers (Lv.1-3), enemies, palette.

// Tile-builder mode: the CORE sits at the centre of the grid and the player
// grows the road; SPAWN portals live at the open ends of the road network.
export const COLS = 9;
export const ROWS = 14;

export const CORE_CELL = {
  col: Math.floor(COLS / 2),
  row: Math.floor(ROWS / 2),
};

export const GRID = {
  cols: COLS,
  rows: ROWS,
  spawn: { col: 4, row: 4 }, // seed portal; live portals are dynamic: Pathfinder.spawnCells()
  core: CORE_CELL,
};

// Directions in clockwise order, so (dir + rot) % 4 is a quarter turn.
export const DIRS = [
  { name: 'N', dx: 0, dy: -1 },
  { name: 'E', dx: 1, dy: 0 },
  { name: 'S', dx: 0, dy: 1 },
  { name: 'W', dx: -1, dy: 0 },
];
export const rotDir = (d, rot) => (d + rot) % 4;
export const opposite = (d) => (d + 2) % 4;

// Seed segment: 3 road cells north of the core, joined N-S. The south tip
// meets the core (the core accepts every facing port), so the network starts
// as one connected line with a single open end (spawn portal) at the far tip;
// DOUBLE_T is what splits the network into a second open end.
// `ports` lists the DIRS indices a walker may exit through; two adjacent road
// cells connect only when both expose reciprocal ports.
export const INITIAL_ROAD = [0, 1, 2].map((i) => ({
  col: CORE_CELL.col,
  row: CORE_CELL.row - 3 + i,
  ports: [0, 2],
}));

// Road pieces are 1–2 cells. `cells` are (col,row) offsets from the placement
// origin; `ports` are DIRS indices. Rotating turns offsets and ports together.
// A dangling port is an edge to nowhere: over an empty cell it is an open end
// (portal candidate); facing a tower or the core body is rejected.
export const TILE_PIECES = {
  SINGLE_STRAIGHT: {
    name: 'Straight', glyph: '│', size: 1, cost: 0,
    cells: [{ c: 0, r: 0 }], ports: [[0, 2]],
  },
  SINGLE_TURN: {
    name: 'Turn', glyph: '└', size: 1, cost: 0,
    cells: [{ c: 0, r: 0 }], ports: [[0, 1]],
  },
  DOUBLE_STRAIGHT: {
    name: 'Long', glyph: '═', size: 2, cost: 0,
    cells: [{ c: 0, r: 0 }, { c: 0, r: 1 }], ports: [[0, 2], [0, 2]],
  },
  // Joint: cell0.S <-> cell1.N; dangling cell0.E and cell1.S form an E→S bend.
  DOUBLE_L: {
    name: 'L-Bend', glyph: '┗', size: 2, cost: 0,
    cells: [{ c: 0, r: 0 }, { c: 0, r: 1 }], ports: [[1, 2], [0, 2]],
  },
  // Stem cell carries the through N–S line plus one E branch; the tip cell
  // extends the branch (W–E) and dangles E. Placed with its S port on an open
  // end it keeps the line going (N) AND opens a second SPAWN portal at E.
  DOUBLE_T: {
    name: 'T-Joint', glyph: '┣', size: 2, cost: 0,
    cells: [{ c: 0, r: 0 }, { c: 1, r: 0 }], ports: [[0, 1, 2], [3, 1]],
  },
};

// Rotate a piece by rot quarter turns (0..3) clockwise around its origin.
// Pure: returns { cells:[{col,row}], ports:[[dirs], …] } in absolute offsets.
// Screen coords (y down): one clockwise quarter turn maps (c,r) -> (-r,c).
export function rotatePiece(piece, rot) {
  const q = ((rot % 4) + 4) % 4;
  const turn = ({ c, r }) => {
    let [x, y] = [c, r];
    for (let i = 0; i < q; i++) [x, y] = [-y, x];
    return { col: x, row: y };
  };
  return {
    cells: piece.cells.map(turn),
    ports: piece.ports.map((list) => list.map((d) => rotDir(d, q))),
  };
}

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
  // Tile-builder wave clock + piece queue.
  waveCountdownFirst: 15, // s before wave 1
  waveCountdown: 12, // s between waves
  earlyWaveBonus: 5, // cash for starting a wave ahead of the timer
  pieceHandSize: 2, // queue/hand size
  firstWavePrepPieces: 2, // placements expected (auto-filled) before wave 1
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
