// pathfinding.js — fixed serpentine lane: BFS flow-field restricted to the road
// + placement rules. Grid cells: off-road = platform (never walkable), road =
// lane. Towers may only occupy platforms, so the lane can never be blocked:
// the L-01 (no enemy isolated from the core) and L-02 (no stuck/teleported
// enemy) invariants hold by construction, and the checks are kept as guards.

import { ROAD } from './config.js';

export class Pathfinder {
  constructor(cols, rows, spawn, core) {
    this.cols = cols;
    this.rows = rows;
    this.spawn = spawn;
    this.core = core;
    this.road = new Uint8Array(cols * rows);
    for (const { col, row } of ROAD) {
      if (col >= 0 && col < cols && row >= 0 && row < rows) this.road[this.idx(col, row)] = 1;
    }
    this.blocked = new Uint8Array(cols * rows); // towers on platforms
    this.dist = new Int32Array(cols * rows);
    this.recompute();
  }

  idx(col, row) {
    return row * this.cols + col;
  }

  inBounds(col, row) {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }

  isBlocked(col, row) {
    return this.blocked[this.idx(col, row)] === 1;
  }

  isRoad(col, row) {
    if (!this.inBounds(col, row)) return false;
    return this.road[this.idx(col, row)] === 1;
  }

  // Can a tower legally occupy this cell? Platforms only — the lane stays open.
  canPlace(col, row) {
    if (!this.inBounds(col, row)) return false;
    if (this.isRoad(col, row)) return false;
    return !this.isBlocked(col, row);
  }

  place(col, row) {
    this.blocked[this.idx(col, row)] = 1;
    // dist never changes now (towers are off-road), but keep the call cheap
    // and the API identical for callers.
  }

  remove(col, row) {
    this.blocked[this.idx(col, row)] = 0;
  }

  // BFS distance field over road cells only, seeded from the core. If the core
  // cell is off-road, every road cell adjacent to it seeds at distance 0.
  recompute() {
    const { cols, rows, road, dist } = this;
    dist.fill(-1);
    const queue = [];
    const seed = (col, row) => {
      if (!this.inBounds(col, row)) return;
      const i = this.idx(col, row);
      if (road[i] && dist[i] === -1) {
        dist[i] = 0;
        queue.push(i);
      }
    };
    if (road[this.idx(this.core.col, this.core.row)]) {
      seed(this.core.col, this.core.row);
    } else {
      seed(this.core.col - 1, this.core.row);
      seed(this.core.col + 1, this.core.row);
      seed(this.core.col, this.core.row - 1);
      seed(this.core.col, this.core.row + 1);
    }
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      const cx = cur % cols;
      const cy = (cur / cols) | 0;
      const nd = dist[cur] + 1;
      for (let d = 0; d < 4; d++) {
        const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (dist[ni] !== -1 || !road[ni]) continue;
        dist[ni] = nd;
        queue.push(ni);
      }
    }
  }

  distAt(col, row) {
    if (!this.inBounds(col, row)) return -1;
    return this.dist[this.idx(col, row)];
  }

  // True when a live path from this cell to the core still exists (L-01).
  isReachableFromCore(col, row) {
    if (!this.inBounds(col, row)) return false;
    if (col === this.core.col && row === this.core.row) return true;
    if (this.isRoad(col, row)) return this.dist[this.idx(col, row)] >= 0;
    // Platforms are not walkable; an enemy that ended up on one must escape.
    return false;
  }

  // Unit-space next waypoint toward the core from a float position.
  nextStep(fx, fy) {
    const col = Math.floor(fx);
    const row = Math.floor(fy);
    if (!this.inBounds(col, row)) return { x: this.core.col + 0.5, y: this.core.row + 0.5 };
    const here = this.dist[this.idx(col, row)];
    let best = here < 0 ? Infinity : here;
    let bx = col + 0.5;
    let by = row + 0.5;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      const nx = col + dx;
      const ny = row + dy;
      if (!this.inBounds(nx, ny)) continue;
      const nd = this.dist[this.idx(nx, ny)];
      if (nd >= 0 && nd < best) {
        best = nd;
        bx = nx + 0.5;
        by = ny + 0.5;
      }
    }
    return { x: bx, y: by };
  }
}
