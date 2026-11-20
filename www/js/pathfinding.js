// pathfinding.js — tile-builder road network: BFS flow-field toward the central
// CORE + piece placement rules. The network is a set of road cells, each with
// connector ports (DIRS indices). Two adjacent cells connect only when both
// expose reciprocal ports; the CORE connects to every adjacent port it faces.
// A port not matched by a neighbouring road cell is a dangling edge: over an
// empty cell it forms an OPEN END. Exactly ONE SPAWN portal is ever live: the
// open end farthest from the core (max BFS distance, ties won by a
// just-placed cell); every extension of the road moves it to the new tip.
// Towers may only occupy platforms (off-road), so the road can never be
// blocked: the L-01/L-02 invariants hold by construction and the guards stay.

import { CORE_CELL, DIRS, INITIAL_ROAD, opposite, rotatePiece } from './config.js';

export class Pathfinder {
  constructor(cols, rows, spawn, core = CORE_CELL, initialRoad = INITIAL_ROAD) {
    this.cols = cols;
    this.rows = rows;
    this.spawn = spawn;
    this.core = core;
    this.road = new Uint8Array(cols * rows);
    this.ports = new Int8Array(cols * rows); // bitmask over DIRS
    this.cells = new Map(); // key -> { col, row }
    this.blocked = new Uint8Array(cols * rows); // towers on platforms
    this.dist = new Int32Array(cols * rows);
    this._lastPlaced = new Set(); // idx keys of the newest placed piece (spawn tie-break)
    for (const cell of initialRoad) this._addRoad(cell.col, cell.row, cell.ports);
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

  isCore(col, row) {
    return col === this.core.col && row === this.core.row;
  }

  // The core links to every facing port; platforms expose none.
  hasPort(col, row, dir) {
    if (this.isCore(col, row)) return true;
    if (!this.isRoad(col, row)) return false;
    return (this.ports[this.idx(col, row)] & (1 << dir)) !== 0;
  }

  _addRoad(col, row, portList) {
    const i = this.idx(col, row);
    this.road[i] = 1;
    let mask = 0;
    for (const d of portList) mask |= 1 << d;
    this.ports[i] = mask;
    this.cells.set(i, { col, row });
  }

  // Can a tower legally occupy this cell? Platforms only — the road stays open.
  canPlace(col, row) {
    if (!this.inBounds(col, row)) return false;
    if (this.isRoad(col, row) || this.isCore(col, row)) return false;
    return !this.isBlocked(col, row);
  }

  place(col, row) {
    this.blocked[this.idx(col, row)] = 1;
  }

  remove(col, row) {
    this.blocked[this.idx(col, row)] = 0;
  }

  // Road cells with at least one dangling port over an empty (non-core,
  // non-road) cell, reachable from the core. These are the SPAWN portals.
  openEnds() {
    const ends = [];
    for (const cell of this.cells.values()) {
      if (this.dist[this.idx(cell.col, cell.row)] < 0) continue;
      for (let d = 0; d < 4; d++) {
        if (!this.hasPort(cell.col, cell.row, d)) continue;
        const nx = cell.col + DIRS[d].dx;
        const ny = cell.row + DIRS[d].dy;
        if (this.isRoad(nx, ny) || this.isCore(nx, ny)) continue;
        ends.push(cell);
        break;
      }
    }
    return ends;
  }

  // The single live SPAWN portal: the tip of the one SPAWN→CORE chain. Under
  // the strict extension rule the network is always a single path with exactly
  // one open end, so that tip IS the spawn; the max-distance scan is only a
  // belt-and-braces guard.
  spawnCells() {
    const ends = this.openEnds();
    if (ends.length === 0) return [];
    let best = ends[0];
    let bestD = this.dist[this.idx(best.col, best.row)];
    let bestNew = this._lastPlaced.has(this.idx(best.col, best.row));
    for (let i = 1; i < ends.length; i++) {
      const e = ends[i];
      const d = this.dist[this.idx(e.col, e.row)];
      const isNew = this._lastPlaced.has(this.idx(e.col, e.row));
      if (d > bestD || (d === bestD && isNew && !bestNew)) {
        best = e;
        bestD = d;
        bestNew = isNew;
      }
    }
    return [best];
  }

  // Topology guard: the road must stay a single continuous chain from the one
  // SPAWN tip to CORE. Exactly ONE dangling port exists on the whole network
  // (a cell with two is a fork/dead end — openEnds() alone would undercount
  // it because it breaks on the first dangling port), its front cell is a free
  // platform inside the grid (a tip facing a wall or a tower could never be
  // extended again — a road lock), every road cell is reachable, and there is
  // one matching connection per road cell (edges == cells ⇔ tree: no loops;
  // with ≤1 dangling this rules out branches and dead ends alike).
  _isSingleChain() {
    let dangling = 0;
    let edges = 0;
    for (const cell of this.cells.values()) {
      if (this.dist[this.idx(cell.col, cell.row)] < 0) return false;
      for (let d = 0; d < 4; d++) {
        if (!this.hasPort(cell.col, cell.row, d)) continue;
        const nx = cell.col + DIRS[d].dx;
        const ny = cell.row + DIRS[d].dy;
        if (this.isCore(nx, ny)) { edges++; continue; }
        if (this.isRoad(nx, ny)) {
          if (d < 2 && this.hasPort(nx, ny, opposite(d))) edges++;
        } else {
          if (!this.inBounds(nx, ny) || this.isBlocked(nx, ny)) return false;
          dangling++;
        }
      }
    }
    return dangling === 1 && edges === this.cells.size;
  }

  // The front cell(s) of the tip's dangling port: the exact cell the next road
  // piece must occupy to keep extending the chain. A tower there locks the
  // road forever, so platforms in front of the SPAWN are not buildable.
  isTipFront(col, row) {
    const spawn = this.spawnCells()[0];
    if (!spawn) return false;
    for (let d = 0; d < 4; d++) {
      if (!this.hasPort(spawn.col, spawn.row, d)) continue;
      const nx = spawn.col + DIRS[d].dx;
      const ny = spawn.row + DIRS[d].dy;
      if (this.isRoad(nx, ny) || this.isCore(nx, ny)) continue;
      if (col === nx && row === ny) return true;
    }
    return false;
  }

  // Validate a road piece (TILE_PIECES entry) at origin with rot quarter-turns.
  // Strict single-path rule: every cell in-bounds and free (no core, no road,
  // no tower); internal joints and external ports must match reciprocally; the
  // piece must EXTEND THE CURRENT SPAWN TIP — one of its cells sits exactly in
  // front of the spawn's dangling port and exposes the reciprocal port there,
  // consuming it; and after a simulated placement the network must still be a
  // single SPAWN→CORE chain (_isSingleChain). Lateral T-junctions, side
  // branches and dead ends are refused, so SPAWN never jumps sideways.
  canPlaceRoadPiece(piece, originCell, rotation) {
    const placed = rotatePiece(piece, rotation);
    const abs = placed.cells.map(({ col, row }) => ({
      col: originCell.col + col,
      row: originCell.row + row,
    }));
    const pieceSet = new Set(abs.map((c) => this.idx(c.col, c.row)));
    for (const c of abs) {
      if (!this.inBounds(c.col, c.row)) return { ok: false, reason: 'OUT OF GRID' };
      if (this.isCore(c.col, c.row)) return { ok: false, reason: 'CORE CELL' };
      if (this.isRoad(c.col, c.row)) return { ok: false, reason: 'CELL OCCUPIED' };
      if (this.isBlocked(c.col, c.row)) return { ok: false, reason: 'TOWER IN CELL' };
    }
    for (let i = 0; i < abs.length; i++) {
      const c = abs[i];
      for (const d of placed.ports[i]) {
        const nx = c.col + DIRS[d].dx;
        const ny = c.row + DIRS[d].dy;
        const nIdx = this.inBounds(nx, ny) ? this.idx(nx, ny) : -1;
        if (pieceSet.has(nIdx)) {
          // internal joint: the partner cell must expose the reciprocal port
          const j = abs.findIndex((p) => this.idx(p.col, p.row) === nIdx);
          if (!placed.ports[j].includes(opposite(d))) {
            return { ok: false, reason: 'BROKEN JOINT' };
          }
          continue;
        }
        if ((this.isRoad(nx, ny) || this.isCore(nx, ny)) && !this.hasPort(nx, ny, opposite(d))) {
          return { ok: false, reason: 'PORT MISMATCH' };
        }
        // facing an empty cell: dangling port -> potential new tip, checked below
      }
    }
    // The piece must sit in front of the current spawn's dangling port and
    // connect to it reciprocally — i.e. it extends the chain, nothing else.
    const spawn = this.spawnCells()[0];
    if (!spawn) return { ok: false, reason: 'NO SPAWN TIP' };
    let extendsSpawn = false;
    for (let d = 0; d < 4; d++) {
      if (!this.hasPort(spawn.col, spawn.row, d)) continue;
      const nx = spawn.col + DIRS[d].dx;
      const ny = spawn.row + DIRS[d].dy;
      if (this.isRoad(nx, ny) || this.isCore(nx, ny)) continue; // not dangling
      const j = abs.findIndex((p) => p.col === nx && p.row === ny);
      if (j >= 0 && placed.ports[j].includes(opposite(d))) { extendsSpawn = true; break; }
    }
    if (!extendsSpawn) return { ok: false, reason: 'MUST EXTEND THE SPAWN TIP' };
    // Simulate the placement and verify the result stays a single chain.
    for (let i = 0; i < abs.length; i++) this._addRoad(abs[i].col, abs[i].row, placed.ports[i]);
    this.recompute();
    const chainOk = this._isSingleChain();
    for (const c of abs) {
      const i = this.idx(c.col, c.row);
      this.road[i] = 0;
      this.ports[i] = 0;
      this.cells.delete(i);
    }
    this.recompute();
    if (!chainOk) return { ok: false, reason: 'BREAKS THE SPAWN-CORE PATH' };
    return { ok: true, cells: abs, ports: placed.ports };
  }

  // Place a validated piece: extend the chain and recompute the flow-field.
  // The single SPAWN portal moves to the new tip automatically; the old tip
  // becomes a normal road cell.
  placeRoadPiece(piece, originCell, rotation) {
    const check = this.canPlaceRoadPiece(piece, originCell, rotation);
    if (!check.ok) return check;
    for (let i = 0; i < check.cells.length; i++) {
      const c = check.cells[i];
      this._addRoad(c.col, c.row, check.ports[i]);
    }
    this._lastPlaced = new Set(check.cells.map((c) => this.idx(c.col, c.row)));
    this.recompute();
    return { ok: true, cells: check.cells, spawns: this.spawnCells(), openEnds: this.openEnds() };
  }

  // Pure helper for auto-placement: anchor every rotation so one of the
  // piece's ports faces each open end (the piece sits beside it, never on it),
  // and return the first legal {origin, rotation}. `occupiedKeys` (Set of idx)
  // lets callers exclude cells holding live enemies. Returns null if none fit.
  findRoadPiecePlacement(piece, occupiedKeys = null) {
    for (let rot = 0; rot < 4; rot++) {
      const placed = rotatePiece(piece, rot);
      for (const end of this.openEnds()) {
        for (let i = 0; i < placed.cells.length; i++) {
          const cell = placed.cells[i];
          for (const d of placed.ports[i]) {
            const origin = {
              col: end.col - cell.col - DIRS[d].dx,
              row: end.row - cell.row - DIRS[d].dy,
            };
            const check = this.canPlaceRoadPiece(piece, origin, rot);
            if (!check.ok) continue;
            if (occupiedKeys && check.cells.some((c) => occupiedKeys.has(this.idx(c.col, c.row)))) {
              continue;
            }
            return { origin, rotation: rot, cells: check.cells };
          }
        }
      }
    }
    return null;
  }

  // BFS distance field seeded from the core, walking only reciprocal-port
  // edges between road cells.
  recompute() {
    const { cols, rows, dist } = this;
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
        if (!this.hasPort(cx, cy, d)) continue;
        const nx = cx + DIRS[d].dx;
        const ny = cy + DIRS[d].dy;
        if (!this.inBounds(nx, ny)) continue;
        const ni = this.idx(nx, ny);
        if (dist[ni] !== -1 || !this.isRoad(nx, ny)) continue;
        if (!this.hasPort(nx, ny, opposite(d))) continue;
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
    if (this.isCore(col, row)) return true;
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
    for (let d = 0; d < 4; d++) {
      if (!this.hasPort(col, row, d)) continue;
      const nx = col + DIRS[d].dx;
      const ny = row + DIRS[d].dy;
      if (!this.inBounds(nx, ny)) continue;
      if (!this.isRoad(nx, ny) && !this.isCore(nx, ny)) continue;
      if (!this.hasPort(nx, ny, opposite(d))) continue;
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
