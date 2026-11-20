// waves.js — 20-wave campaign generator, boss every 5 waves, endless scaling past 20,
// + the tile-builder piece queue (seeded, size-balanced).
import { TILE_PIECES, WAVES_META, ENEMIES } from './config.js';

// A wave is a list of groups: { type, count, gap (s between spawns), delay (s until group starts) }.
function campaignWave(n) {
  const groups = [];
  const boss = n % WAVES_META.bossEvery === 0;
  const t = n / WAVES_META.total;

  const push = (type, count, gap = 0.75, delay = 0) => groups.push({ type, count, gap, delay });

  if (n === 1) {
    push('drone', 6, 0.95);
  } else if (n === 2) {
    push('drone', 8, 0.8);
  } else if (n === 3) {
    push('drone', 6, 0.7);
    push('sprinter', 5, 0.5, 5);
  } else if (n === 4) {
    push('sprinter', 8, 0.45);
    push('drone', 6, 0.7, 4);
  } else if (n <= 8) {
    // Boss waves (only w5 sits in this band) run a lighter escort so the
    // reaper itself — not the swarm — is the threat at wave 5.
    const eMul = boss ? 0.72 : 1;
    push('drone', Math.round((7 + n) * eMul), 0.6);
    push('sprinter', Math.round((4 + n) * eMul), 0.42, 3);
    if (n >= 6) push('tank', n - 5, 2.2, 6);
    if (n >= 7) push('shielder', n - 6, 1.8, 8);
  } else if (n <= 14) {
    push('shielder', 3 + n - 8, 1.3);
    push('phantom', 2 + n - 8, 1.2, 2);
    push('drone', 8 + n, 0.5, 4);
    push('tank', n - 6, 1.9, 7);
  } else if (n <= 19) {
    push('tank', n - 8, 1.5);
    push('phantom', n - 9, 1.0, 2);
    push('shielder', n - 8, 1.1, 4);
    push('sprinter', 8 + n, 0.32, 6);
  } else {
    // Wave 20 finale
    push('tank', 8, 1.2);
    push('shielder', 8, 0.9, 2);
    push('phantom', 7, 0.8, 4);
    push('sprinter', 16, 0.28, 6);
    push('drone', 14, 0.4, 8);
  }

  if (boss) {
    push('boss', 1, 1, bossWaveDelay(n));
    if (n >= 10) push('drone', 8, 0.5, bossWaveDelay(n) + 1);
  }
  return groups;
}

function bossWaveDelay(n) {
  const firstGroup = campaignBossDelayHint(n);
  return firstGroup;
}

function campaignBossDelayHint(n) {
  // The first reaper enters after its escort has mostly spent the towers'
  // attention, so a 6-tower line can still kill it; later bosses mix in.
  return n <= 5 ? 10 : n <= 15 ? 11 : 13;
}

function endlessWave(n) {
  // Endless: cycle archetypes, scale counts; boss still every 5.
  const loop = ((n - 1) % 5) + 1;
  const cycle = Math.floor((n - 1) / WAVES_META.total);
  const groups = [];
  const push = (type, count, gap = 0.6, delay = 0) =>
    groups.push({ type, count: Math.max(1, Math.round(count)), gap: Math.max(0.22, gap * 0.92), delay });

  const mul = 1 + cycle * WAVES_META.endlessCountGrowth * 5;
  const types = ['drone', 'sprinter', 'tank', 'shielder', 'phantom'];
  push(types[loop - 1], (6 + loop * 2) * mul, 0.55);
  push(types[(loop + 1) % 5], (5 + loop) * mul, 0.5, 3);
  push(types[(loop + 3) % 5], (3 + loop) * mul, 0.8, 6);
  if (n % WAVES_META.bossEvery === 0) {
    push('boss', 1 + cycle, 2.5, 9);
  }
  return groups;
}

export function waveGroups(n, endless) {
  return endless ? endlessWave(n) : campaignWave(n);
}

// HP scaling: gentle through wave 8, steeper after (hpGrowthLate) so the
// finale out-scales a maxed board; compounding further in endless.
export function waveScale(n, endless) {
  const late = WAVES_META.hpGrowthLate || WAVES_META.hpGrowth;
  const base = n <= 8
    ? 1 + Math.max(0, n - 1) * WAVES_META.hpGrowth
    : 1 + 7 * WAVES_META.hpGrowth + (n - 8) * late;
  if (!endless) return base;
  return base * Math.pow(1 + WAVES_META.endlessHpGrowth, Math.max(0, n - WAVES_META.total));
}

// Extra boss HP on top of waveScale, indexed by the boss appearance number
// (waves 5/10/15/20 → WAVES_META.bossHpMult). Past the campaign the same
// endlessHpGrowth compounds each further appearance.
export function bossHpScale(n) {
  const mults = WAVES_META.bossHpMult;
  const appearance = Math.floor((n - 1) / WAVES_META.bossEvery); // 0-based
  const base = mults[Math.min(appearance, mults.length - 1)];
  return base * Math.pow(1 + WAVES_META.endlessHpGrowth, Math.max(0, appearance - (mults.length - 1)));
}

// Final HP multiplier for one spawn: bosses carry their appearance multiplier.
export function enemyScale(n, type, endless) {
  const s = waveScale(n, endless);
  return ENEMIES[type] && ENEMIES[type].boss ? s * bossHpScale(n) : s;
}

// Expand groups into an ordered spawn schedule: [{at, type}], plus total duration.
export function buildSchedule(groups) {
  const events = [];
  let end = 0;
  for (const g of groups) {
    for (let i = 0; i < g.count; i++) {
      const at = g.delay + i * g.gap;
      events.push({ at, type: g.type });
      if (at > end) end = at;
    }
  }
  events.sort((a, b) => a.at - b.at);
  return { events, duration: end + 2 };
}

// ---------- Tile-builder piece queue ----------

// mulberry32: small deterministic PRNG so a run's queue is reproducible from
// its seed (testable in Node without Math.random).
export function makePieceRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Balanced hand of TILE_PIECES keys: [one 1-cell piece, one 2-cell piece] —
// the rng only decides which concrete piece comes out of each bucket, so the
// queue is always an even mix and road growth keeps pace with the wave clock.
// Deterministic for a seeded rng.
const PIECE_KEYS = Object.keys(TILE_PIECES);
// Branch pieces (T-Joint) can never satisfy the strict single SPAWN→CORE
// chain rule, so they are never dealt into the hand — only smoke/bot probes.
const USABLE_KEYS = PIECE_KEYS.filter((k) => !TILE_PIECES[k].branch);
const SIZE1_KEYS = USABLE_KEYS.filter((k) => TILE_PIECES[k].size === 1);
const SIZE2_KEYS = USABLE_KEYS.filter((k) => TILE_PIECES[k].size === 2);

export function createPieceQueue(rng) {
  const pick = (bucket) => bucket[Math.floor(rng() * bucket.length)];
  let one = pick(SIZE1_KEYS);
  const two = pick(SIZE2_KEYS);
  // Two collinear pieces (Straight + Long) cannot turn a tip that sits one
  // cell from a wall — under the strict single-path rule that would be an
  // unplaceable hand. Guarantee every hand carries a corner piece.
  if (one === 'SINGLE_STRAIGHT' && two === 'DOUBLE_STRAIGHT') one = 'SINGLE_TURN';
  return [one, two];
}
