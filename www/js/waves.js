// waves.js — 20-wave campaign generator, boss every 5 waves, endless scaling past 20.
import { WAVES_META } from './config.js';

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
    push('drone', 7 + n, 0.6);
    push('sprinter', 4 + n, 0.42, 3);
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
  return n <= 5 ? 8 : n <= 15 ? 10 : 12;
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

// HP scaling: gentle on campaign (capped), compounding in endless.
export function waveScale(n, endless) {
  if (!endless) return 1 + Math.max(0, n - 1) * 0.06;
  return (1 + (n - 1) * 0.06) * Math.pow(1 + WAVES_META.endlessHpGrowth, Math.max(0, n - WAVES_META.total));
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
