// pathfinding.js — dynamic BFS flow-field from the core + placement anti-blockade.
// Grid cells: 0 = open, 1 = blocked (tower). Spawn/core cells are always open.

export class Pathfinder {
  constructor(cols, rows, spawn, core) {
    this.cols = cols;
    this.rows = rows;
    this.spawn = spawn;
    this.core = core;
    this.blocked = new Uint8Array(cols * rows);
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

  isSpawnOrCore(col, row) {
    return (col === this.spawn.col && row === this.spawn.row) ||
           (col === this.core.col && row === this.core.row);
  }

  // Can a tower legally occupy this cell?
  canPlace(col, row) {
    if (!this.inBounds(col, row)) return false;
    if (this.isSpawnOrCore(col, row)) return false;
    if (this.isBlocked(col, row)) return false;
    // Tentatively block and ensure the core stays reachable from spawn.
    const i = this.idx(col, row);
    this.blocked[i] = 1;
    const ok = this._reachabilityOk();
    this.blocked[i] = 0;
    return ok;
  }

  place(col, row) {
    this.blocked[this.idx(col, row)] = 1;
    this.recompute();
  }

  remove(col, row) {
    this.blocked[this.idx(col, row)] = 0;
    this.recompute();
  }

  _reachabilityOk() {
    // Cheap BFS from spawn toward core with early exit.
    const { cols, rows, blocked } = this;
    const seen = new Uint8Array(cols * rows);
    const queue = [this.idx(this.spawn.col, this.spawn.row)];
    seen[queue[0]] = 1;
    const goal = this.idx(this.core.col, this.core.row);
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      if (cur === goal) return true;
      const cx = cur % cols;
      const cy = (cur / cols) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (seen[ni] || blocked[ni]) continue;
        seen[ni] = 1;
        queue.push(ni);
      }
    }
    return false;
  }

  // BFS distance field from the core; enemies follow steepest descent.
  recompute() {
    const { cols, rows, blocked, dist } = this;
    dist.fill(-1);
    const queue = [this.idx(this.core.col, this.core.row)];
    dist[queue[0]] = 0;
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
        if (dist[ni] !== -1 || blocked[ni]) continue;
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
    return this.dist[this.idx(col, row)] >= 0;
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
