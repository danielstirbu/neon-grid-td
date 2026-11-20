// main.js — game loop (clamped dt), Pointer Events input, state machine, combat orchestration.
import { GRID, ECONOMY, SPEED_OPTIONS, PALETTE, TOWERS, TILE_PIECES, rotatePiece, WAVES_META } from './config.js';
import { audio } from './audio.js';
import { Pathfinder } from './pathfinding.js';
import { Enemy, Tower, Projectile, Beam, FloatingText, burst } from './entities.js';
import { waveGroups, waveScale, enemyScale, buildSchedule, makePieceRng, createPieceQueue } from './waves.js';
import { Renderer } from './renderer.js';
import { UI } from './ui.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new Renderer(this.canvas);
    this.path = new Pathfinder(GRID.cols, GRID.rows, GRID.spawn, GRID.core);
    this.renderer.setNetwork(this.path);
    this.ui = new UI(this);

    this.state = 'menu'; // menu | playing | over
    this._needsRender = true; // P-08: paint the first frame, then idle until an event asks
    this.endless = false;
    this.totalWaves = WAVES_META.total; // L-07: single source of truth with waves.js
    // resetRun() touches these, so they must exist before it is first called.
    this.towerGrid = new Map();
    this.hover = null;
    this.pointerDown = null;
    this.lastTime = performance.now();
    this.resetRun();
    audio.setMusicMode('menu');

    this._bindInput();
    // P-07: named handlers so destroy() can detach every global listener.
    this._onResize = () => {
      this.renderer.resize();
      this.requestRender();
    };
    this._onVisibility = () => {
      if (document.hidden) {
        if (this.state === 'playing' && !this.paused) {
          this.paused = true;
          this.autoPaused = true; // remember it was automatic
          this.ui.showPauseOverlay();
          this.requestRender();
          this._syncMusic();
        }
      } else if (this.autoPaused) {
        this.autoPaused = false;
        // keep paused, but show a "tap to resume" overlay so the state is obvious
        if (this.state === 'playing' && this.paused) {
          this.ui.showPauseOverlay();
          this.requestRender();
        }
      }
    };
    this._onKey = (e) => {
      if (e.key === ' ' || e.key === 'p') this.togglePause();
      if (e.key === 'n') this.startNextWave();
      if (e.key === 'r' || e.key === 'R') this.rotateSelectedPiece();
      if (e.key === 'Escape') {
        this.ui.clearTowerSelect();
        this.ui.closeTowerMenu();
        this.clearPieceSelect();
      }
      if (e.key >= '1' && e.key <= '4') {
        const keys = ['pulse', 'cryo', 'arc', 'rail'];
        this.ui.toggleTowerSelect(keys[+e.key - 1]);
        if (this.ui.selectedTowerKey) this.clearPieceSelect();
      }
      this.requestRender();
    };
    window.addEventListener('resize', this._onResize);
    document.addEventListener('visibilitychange', this._onVisibility);
    window.addEventListener('keydown', this._onKey);
    this._running = true;
    this.ui.updateHUD(this);
    requestAnimationFrame((t) => this.frame(t));
  }

  destroy() {
    this._running = false;
    audio.setMusicMode('off');
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibility);
    window.removeEventListener('keydown', this._onKey);
    this._unbindInput();
    // Free the offscreen landscape canvas so a discarded Game can be collected.
    this.renderer.landscape.layer.width = 0;
    this.renderer.landscape.layer.height = 0;
    this.renderer.sprites.dispose(); // F4: release the baked sprite bank too
  }

  resetRun() {
    this.cash = ECONOMY.startCash;
    this.core = ECONOMY.startCore;
    this.wave = 0;
    this.waveActive = false;
    this.schedule = null;
    this.spawnClock = 0;
    this.paused = false;
    this.autoPaused = false;
    this.speedIndex = 0;
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.beams = [];
    this.particles = [];
    this.floaters = [];
    this.towerGrid.clear();
    this.path = new Pathfinder(GRID.cols, GRID.rows, GRID.spawn, GRID.core);
    this.renderer.setNetwork(this.path);
    this.selectedTower = null;
    // Tile-builder: seeded 2-piece hand + auto-wave countdown for this run.
    this.pieceRng = makePieceRng((Math.random() * 0xffffffff) >>> 0);
    this.roadHand = createPieceQueue(this.pieceRng);
    this.pendingPieces = ECONOMY.firstWavePrepPieces; // auto-placed if not built in time
    this.waveCountdown = ECONOMY.waveCountdownFirst; // 15 s prep clock
    this.countdownArmed = true;
    this.selectedPiece = null; // index into roadHand, or null
    this.pieceRotation = 0;
    this.piecePreview = null;
    this.hoverCell = null;
    this.ui.refreshPieceDock(this);
    this.ui.closeTowerMenuSilent();
    this.ui.clearTowerSelect();
  }

  // BGM follows the state machine: menu theme in the menu, driving arp while
  // playing (hotter variant on boss waves), silence while paused/over.
  _syncMusic() {
    if (this.state !== 'playing' || this.paused) {
      audio.setMusicMode(this.state === 'menu' ? 'menu' : 'off');
      return;
    }
    const isBoss = this.waveActive && this.wave > 0 && this.wave % WAVES_META.bossEvery === 0;
    audio.setMusicMode(isBoss ? 'boss' : 'game');
  }

  begin(endless) {
    this.endless = endless;
    this.resetRun();
    this.state = 'playing';
    this.ui.hideStart();
    this.ui.hideOver();
    this.requestRender();
    audio.play('wave');
    this._syncMusic();
  }

  retry() {
    this.begin(this.endless);
  }

  toMenu() {
    this.state = 'menu';
    this.resetRun();
    this.ui.showStart();
    this.requestRender();
    this._syncMusic();
  }

  togglePause() {
    if (this.state !== 'playing') return;
    this.paused = !this.paused;
    this.autoPaused = false;
    if (this.paused) this.ui.showPauseOverlay();
    else this.ui.hidePauseOverlay();
    this.requestRender();
    audio.play('tap');
    this._syncMusic();
  }

  toggleSpeed() {
    this.speedIndex = (this.speedIndex + 1) % SPEED_OPTIONS.length;
    this.requestRender();
    audio.play('tap');
  }

  toggleSound() {
    audio.setEnabled(!audio.enabled);
    this.requestRender();
    if (audio.enabled) audio.play('tap');
  }

  // ---------- Waves ----------
  startNextWave(early = false) {
    // Blocked while paused: starting a wave during a phantom pause would set
    // waveActive without step() ever running, locking the run (L-05).
    if (this.state !== 'playing' || this.waveActive || this.paused) return;
    // Safety net: any mandatory piece still in the hand is auto-placed so the
    // road keeps a continuous line to the core before enemies march.
    const autoCells = this._autoPlacePending();
    if (early && this.countdownArmed && this.waveCountdown > 0.5) {
      const bonus = ECONOMY.earlyWaveBonus(this.wave + 1);
      this.cash += bonus;
      this.floaters.push(new FloatingText(
        GRID.core.col + 0.5, GRID.core.row - 0.5, `+¤${bonus} EARLY`, PALETTE.yellow, 0.55));
    }
    this.wave += 1;
    const groups = waveGroups(this.wave, this.endless);
    this.schedule = buildSchedule(groups);
    this.spawnClock = 0;
    this.waveActive = true;
    this._armNextCountdown();
    if (autoCells.length) this.requestRender();
    const isBoss = this.wave % WAVES_META.bossEvery === 0;
    this.ui.showBanner(isBoss ? `⚠ WAVE ${this.wave} — BOSS ⚠` : `WAVE ${this.wave}`);
    audio.play(isBoss ? 'boss' : 'wave');
    this._syncMusic();
    this.ui.vibrate(isBoss ? [40, 60, 40] : 15);
  }

  // Cells holding live walkers — the auto-placer must never build under them.
  _enemyCells() {
    const keys = new Set();
    for (const e of this.enemies) {
      if (!e.dead && !e.reachedCore) keys.add(this.path.idx(Math.floor(e.x), Math.floor(e.y)));
    }
    return keys;
  }

  // Auto-place every pending piece in the hand; returns the cells added.
  // Tries each card in turn — the strict single-chain rule can leave one piece
  // unplaceable at the current tip while another still fits. If the whole
  // hand is dead, the refill reroll gets one more chance before giving up.
  _autoPlacePending() {
    const cells = [];
    let rerolled = false;
    while (this.pendingPieces > 0 && this.roadHand.length > 0) {
      const occupied = this._enemyCells();
      let spot = null;
      let handIdx = -1;
      for (let i = 0; i < this.roadHand.length; i++) {
        const found = this.path.findRoadPiecePlacement(TILE_PIECES[this.roadHand[i]], occupied);
        if (found) { spot = found; handIdx = i; break; }
      }
      if (!spot) {
        const before = this.roadHand.join();
        this._ensurePlayableHand();
        if (rerolled || this.roadHand.join() === before) {
          this.ui.toast('NO ROOM FOR ROAD');
          break;
        }
        rerolled = true;
        continue;
      }
      const res = this.path.placeRoadPiece(TILE_PIECES[this.roadHand[handIdx]], spot.origin, spot.rotation);
      if (!res.ok) break;
      this.roadHand.splice(handIdx, 1);
      this.pendingPieces -= 1;
      cells.push(...res.cells);
    }
    if (cells.length) {
      this.renderer._buildBoard();
      this.repathAll();
      for (const c of cells) burst(this.particles, c.col + 0.5, c.row + 0.5, PALETTE.cyan, 5, 1.6, 0.3);
      audio.play('place');
      this.ui.toast('ROAD AUTO-EXTENDED');
      this.requestRender();
    }
    return cells;
  }

  // A wave just started: top the hand back up to 2 balanced pieces, owe one
  // placement for the next gap, and re-arm the 12 s clock (it only ticks
  // while no wave is active).
  _armNextCountdown() {
    this._refillHand();
    this.pendingPieces = 1;
    this.waveCountdown = ECONOMY.waveCountdown;
    this.countdownArmed = true;
  }

  // Keep the hand at ECONOMY.pieceHandSize with an even size mix: the hand
  // must always hold at least one 1-cell and one 2-cell piece AND at least one
  // corner piece (Turn / L-Bend). Two collinear pieces (Straight + Long)
  // cannot turn a tip whose front touches a wall — under the strict
  // single-path rule that is a dead hand, so the corner guarantee wins over
  // the size mix.
  _refillHand() {
    const corner = (k) => k === 'SINGLE_TURN' || k === 'DOUBLE_L';
    while (this.roadHand.length < ECONOMY.pieceHandSize) {
      const [one, two] = createPieceQueue(this.pieceRng);
      const has1 = this.roadHand.some((k) => TILE_PIECES[k].size === 1);
      const has2 = this.roadHand.some((k) => TILE_PIECES[k].size === 2);
      const want = !has1 ? one
        : !has2 ? two
          : TILE_PIECES[this.roadHand[this.roadHand.length - 1]].size === 1 ? two : one;
      let key = want;
      if (!corner(want) && !this.roadHand.some(corner)) {
        const partner = want === one ? two : one;
        key = corner(partner) ? partner
          : TILE_PIECES[want].size === 1 ? 'SINGLE_TURN' : 'DOUBLE_L';
      }
      this.roadHand.push(key);
    }
    this.roadHand.length = ECONOMY.pieceHandSize;
    this._ensurePlayableHand();
  }

  // Dead-hand guard: under the strict single-chain rule the road only grows
  // at the tip, so a hand of collinear pieces facing a wall-front is
  // unplayable (e.g. Straight + Long at a corner). When NO card fits the
  // current tip, reroll one card into a piece that does — corner first, since
  // tips beside a wall always need a TURN — keeping the 1+2 size mix when
  // possible, so neither the player nor the auto-placer can be locked with an
  // impossible hand.
  _ensurePlayableHand() {
    if (this.state !== 'playing' || this.roadHand.length === 0) return;
    const fits = (k) => this.path.findRoadPiecePlacement(TILE_PIECES[k]) !== null;
    if (this.roadHand.some(fits)) return;
    const swap = ['SINGLE_TURN', 'DOUBLE_L', 'SINGLE_STRAIGHT', 'DOUBLE_STRAIGHT']
      .find((k) => fits(k));
    if (!swap) return; // tip walled in on every side — nothing can fit anywhere
    const size = TILE_PIECES[swap].size;
    const i = this.roadHand.findIndex((k) => TILE_PIECES[k].size === size);
    this.roadHand[i < 0 ? 0 : i] = swap;
    this.clearPieceSelect();
    audio.play('tap');
    this.ui.toast(`HAND REROLL — ${TILE_PIECES[swap].name.toUpperCase()}`);
    this.ui.refreshPieceDock(this);
    this.requestRender();
  }

  // Auto-wave clock: only advances between waves while un-paused, so pause
  // and visibilitychange freeze it for free (step() is not called).
  updateWaveCountdown(dt) {
    if (this.waveActive || !this.countdownArmed) return;
    this.waveCountdown -= dt;
    if (this.waveCountdown > 0) return;
    this.waveCountdown = 0;
    this.countdownArmed = false;
    this.startNextWave(false);
  }

  updateWave(dt) {
    if (!this.waveActive) return;
    this.spawnClock += dt;
    const ev = this.schedule.events;
    while (ev.length && ev[0].at <= this.spawnClock) {
      const e = ev.shift();
      const enemy = new Enemy(e.type, enemyScale(this.wave, e.type, this.endless), waveScale(this.wave, this.endless));
      // Exactly one SPAWN portal is live — the farthest open end from the
      // core; every road extension moves it, so all enemies enter through it.
      const portal = this.path.spawnCells()[0] || GRID.spawn;
      enemy.x = portal.col + 0.5;
      enemy.y = portal.row + 0.5;
      this.repath(enemy);
      this.enemies.push(enemy);
    }
    if (ev.length === 0 && this.enemies.length === 0) {
      this.waveActive = false;
      const bonus = ECONOMY.waveBonus(this.wave);
      this.cash += bonus;
      this.floaters.push(new FloatingText(GRID.core.col + 0.5, GRID.core.row, `+¤${bonus}`, PALETTE.yellow, 0.55));
      if (!this.endless && this.wave >= this.totalWaves) return this.victory();
      this._syncMusic(); // boss wave cleared → drop back to the normal theme
    } else if (ev.length === 0 && this.spawnClock > this.schedule.duration + 30) {
      // Failsafe (L-02): a stuck enemy must never leave the wave — and the NEXT
      // WAVE button — locked forever. Remove stragglers (zero reward, no leak
      // credit) and close the wave out.
      console.warn(`Wave ${this.wave}: forcing close after ${this.spawnClock.toFixed(1)}s (${this.enemies.length} stuck enemies)`);
      for (const e of this.enemies) {
        if (!e.dead && !e.reachedCore) {
          e.reward = 0;
          e.dead = true;
        }
      }
    }
  }

  // Walk the flow-field from a float position toward the core, building waypoints.
  _flowPath(fx, fy) {
    const pts = [];
    let guard = 0;
    while (guard++ < GRID.cols * GRID.rows + 4) {
      const col = Math.floor(fx);
      const row = Math.floor(fy);
      if (col === GRID.core.col && row === GRID.core.row) break;
      const nxt = this.path.nextStep(fx, fy);
      if (Math.abs(nxt.x - (col + 0.5)) < 1e-9 && Math.abs(nxt.y - (row + 0.5)) < 1e-9) {
        // nextStep returned the same cell center (no reachable neighbor) — stop here.
        break;
      }
      pts.push(nxt);
      fx = nxt.x;
      fy = nxt.y;
    }
    return pts;
  }

  repath(enemy) {
    enemy.pathIdx = 0;
    const pts = this._flowPath(enemy.x, enemy.y);
    if (pts.length > 0) {
      enemy.path = pts;
      return;
    }
    const col = Math.floor(enemy.x);
    const row = Math.floor(enemy.y);
    if (col === GRID.core.col && row === GRID.core.row) {
      // L-02: already on the core cell — finish the journey instead of leaving an
      // empty path that freezes the enemy (and the wave) forever.
      enemy.path = [];
      enemy.reachedCore = true;
      return;
    }
    // L-01 safety net: the cell has no path to the core (isolated pocket). Never
    // credit reachedCore; walk out of the pocket, then rejoin the flow-field.
    const escape = this._escapeToReachable(col, row);
    if (escape) {
      const last = escape[escape.length - 1];
      enemy.path = escape.concat(this._flowPath(last.x, last.y));
    } else {
      // Walled in with nowhere to walk: remove with zero reward (never a fake leak)
      // so the wave can still end.
      enemy.path = [];
      enemy.reward = 0;
      enemy.dead = true;
    }
  }

  repathAll() {
    for (const e of this.enemies) this.repath(e);
  }

  // BFS through open cells from (col,row) to the nearest cell that has a live
  // path to the core; returns the waypoint chain (cell centers), or null if none.
  _escapeToReachable(col, row) {
    const path = this.path;
    const prev = new Map();
    const seen = new Set([path.idx(col, row)]);
    let queue = [[col, row]];
    let goal = null;
    while (queue.length && !goal) {
      const next = [];
      for (const [cx, cy] of queue) {
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dy] of dirs) {
          const nx = cx + dx;
          const ny = cy + dy;
          // Escape walks along the lane only — platforms are never walkable.
          if (!path.inBounds(nx, ny) || !path.isRoad(nx, ny) || path.isBlocked(nx, ny)) continue;
          const ni = path.idx(nx, ny);
          if (seen.has(ni)) continue;
          seen.add(ni);
          prev.set(ni, [cx, cy]);
          if (path.isReachableFromCore(nx, ny)) {
            goal = [nx, ny];
            break;
          }
          next.push([nx, ny]);
        }
        if (goal) break;
      }
      queue = next;
    }
    if (!goal) return null;
    const pts = [];
    let cur = goal;
    while (cur) {
      pts.push({ x: cur[0] + 0.5, y: cur[1] + 0.5 });
      cur = prev.get(path.idx(cur[0], cur[1]));
    }
    pts.reverse();
    return pts;
  }

  victory() {
    this.state = 'over';
    this.requestRender();
    audio.play('victory');
    this._syncMusic();
    this.ui.showOver('GRID SECURED', `All ${this.totalWaves} waves repelled. Core integrity ${this.core}/${ECONOMY.startCore}.`);
  }

  defeat() {
    this.state = 'over';
    this.requestRender();
    audio.play('defeat');
    this._syncMusic();
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
      this.ui.toast(this.path.isBlocked(col, row) ? 'CELL OCCUPIED' : 'THE ROAD IS NOT BUILDABLE');
      this.ui.vibrate(30);
      return false;
    }
    // The cell directly in front of the SPAWN tip is where the road continues:
    // a tower there can never be built over and locks the chain forever.
    if (this.path.isTipFront(col, row)) {
      audio.play('deny');
      this.ui.toast('ROAD CONTINUES HERE');
      this.ui.vibrate(30);
      return false;
    }
    // L-11: refuse to build on top of a walking enemy.
    const occupied = this.enemies.some(
      (e) => !e.dead && !e.reachedCore && Math.floor(e.x) === col && Math.floor(e.y) === row
    );
    if (occupied) {
      audio.play('deny');
      this.ui.toast('ENEMY IN CELL');
      this.ui.vibrate(30);
      return false;
    }
    const t = new Tower(key, col, row);
    this.path.place(col, row);
    // L-01: a legal spawn→core path is not enough — no enemy already on the map
    // may end up in a pocket cut off from the core. Roll back if one would.
    const trapped = this.enemies.some(
      (e) => !e.dead && !e.reachedCore &&
             !this.path.isReachableFromCore(Math.floor(e.x), Math.floor(e.y))
    );
    if (trapped) {
      this.path.remove(col, row);
      audio.play('deny');
      this.ui.toast('WOULD TRAP ENEMIES');
      this.ui.vibrate(30);
      return false;
    }
    this.towers.push(t);
    this.towerGrid.set(`${col},${row}`, t);
    this.repathAll();
    this.cash -= def.cost;
    audio.play('place');
    this.ui.vibrate(12);
    burst(this.particles, col + 0.5, row + 0.5, def.color, 8, 1.6, 0.4);
    if (this.cash < def.cost) this.ui.clearTowerSelect();
    this._ensurePlayableHand();
    return true;
  }

  // Tile-builder: grow the road with a TILE_PIECES piece at origin, rot
  // quarter-turns. The single SPAWN portal moves to the new farthest tip
  // automatically; the baked board is re-rendered and every walker re-joins
  // the new flow-field.
  placeRoadPiece(piece, originCell, rotation) {
    const res = this.path.placeRoadPiece(piece, originCell, rotation);
    if (!res.ok) {
      audio.play('deny');
      this.ui.toast(res.reason);
      this.ui.vibrate(30);
      return res;
    }
    this.renderer._buildBoard();
    this.repathAll();
    for (const c of res.cells) burst(this.particles, c.col + 0.5, c.row + 0.5, PALETTE.cyan, 6, 1.8, 0.35);
    audio.play('place');
    this.ui.vibrate(12);
    this.requestRender();
    return res;
  }

  // Dock: tap a queued piece to select it; tap the already-selected card again
  // to rotate (same as the ROTATE button / R key).
  selectPiece(index) {
    audio.unlock();
    audio.play('tap');
    this.ui.vibrate(8);
    if (this.selectedPiece === index) {
      this.rotateSelectedPiece();
      return;
    }
    this.selectedPiece = index;
    this.pieceRotation = 0;
    this.ui.clearTowerSelect();
    this.clearSelectedTower();
    this.ui.closeTowerMenuSilent();
    this.piecePreview = null;
    this.ui.refreshPieceDock(this);
    this.requestRender();
  }

  rotateSelectedPiece() {
    if (this.selectedPiece === null) return;
    this.pieceRotation = (this.pieceRotation + 1) % 4;
    audio.play('tap');
    this._updatePiecePreview();
    this.requestRender();
  }

  clearPieceSelect() {
    this.selectedPiece = null;
    this.pieceRotation = 0;
    this.piecePreview = null;
    this.ui.refreshPieceDock(this);
  }

  // Recompute the ghost preview under the cursor for the selected piece.
  _updatePiecePreview() {
    if (this.selectedPiece === null || !this.hoverCell) {
      this.piecePreview = null;
      return;
    }
    this._makePreview(this.hoverCell.col, this.hoverCell.row);
  }

  _makePreview(col, row) {
    const piece = this.selectedPiece === null ? null : TILE_PIECES[this.roadHand[this.selectedPiece]];
    if (!piece) {
      this.piecePreview = null;
      return;
    }
    const check = this.path.canPlaceRoadPiece(piece, { col, row }, this.pieceRotation);
    const shape = rotatePiece(piece, this.pieceRotation);
    this.piecePreview = {
      origin: { col, row },
      valid: check.ok,
      cells: shape.cells.map((c) => ({ col: col + c.col, row: row + c.row })),
      ports: shape.ports,
    };
  }

  tryPlaceSelectedPiece(col, row) {
    if (this.selectedPiece === null) return false;
    const piece = TILE_PIECES[this.roadHand[this.selectedPiece]];
    if (!piece) return false;
    // L-11 mirror for roads: never pave over a walking enemy.
    const keys = this._enemyCells();
    const check = this.path.canPlaceRoadPiece(piece, { col, row }, this.pieceRotation);
    if (check.ok && check.cells.some((c) => keys.has(this.path.idx(c.col, c.row)))) {
      audio.play('deny');
      this.ui.toast('ENEMY IN CELL');
      this.ui.vibrate(30);
      return false;
    }
    const res = this.placeRoadPiece(piece, { col, row }, this.pieceRotation);
    if (!res.ok) return false;
    this._consumeHandPiece(this.selectedPiece);
    this.clearPieceSelect();
    return true;
  }

  // A hand piece built by the player leaves the queue; top the hand back up to
  // a balanced 2-piece hand and credit the pending-placement debt.
  _consumeHandPiece(index) {
    this.roadHand.splice(index, 1);
    this._refillHand();
    if (this.pendingPieces > 0) this.pendingPieces -= 1;
  }

  upgradeSelected() {
    const t = this.ui.menuTower;
    if (!t || !t.canUpgrade || !this.towers.includes(t)) return;
    this.requestRender();
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
    if (!t || !this.towers.includes(t)) return;
    this.requestRender();
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
    if (!t || !this.towers.includes(t)) return;
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
    this._onPointerDown = (e) => {
      e.preventDefault();
      audio.unlock();
      this.pointerDown = { x: e.clientX, y: e.clientY, id: e.pointerId };
      c.setPointerCapture?.(e.pointerId);
    };
    this._onPointerMove = (e) => {
      if (this.state !== 'playing') return;
      const rect = c.getBoundingClientRect();
      const g = this.renderer.toGrid(e.clientX - rect.left, e.clientY - rect.top);
      const col = Math.floor(g.x);
      const row = Math.floor(g.y);
      const inGrid = col >= 0 && row >= 0 && col < GRID.cols && row < GRID.rows;
      this.hoverCell = inGrid ? { col, row } : null;
      this.hover = this.ui.selectedTowerKey && inGrid
        ? { col, row, valid: this.path.canPlace(col, row) && this.cash >= TOWERS[this.ui.selectedTowerKey].cost }
        : null;
      if (this.selectedPiece !== null) this._updatePiecePreview();
      if (this.paused) this.requestRender();
    };
    this._onPointerUp = (e) => {
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
      this.requestRender();
    };
    this._onPointerCancel = () => { this.pointerDown = null; };
    // F2b: the ghost preview must vanish when the cursor leaves the stage.
    this._onPointerLeave = () => {
      this.hoverCell = null;
      this.hover = null;
      this.piecePreview = null;
      if (this.paused) this.requestRender();
    };
    c.addEventListener('pointerdown', this._onPointerDown);
    c.addEventListener('pointermove', this._onPointerMove);
    c.addEventListener('pointerup', this._onPointerUp);
    c.addEventListener('pointercancel', this._onPointerCancel);
    c.addEventListener('pointerleave', this._onPointerLeave);
  }

  _unbindInput() {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this._onPointerDown);
    c.removeEventListener('pointermove', this._onPointerMove);
    c.removeEventListener('pointerup', this._onPointerUp);
    c.removeEventListener('pointercancel', this._onPointerCancel);
    c.removeEventListener('pointerleave', this._onPointerLeave);
  }

  handleTap(col, row) {
    if (this.selectedPiece !== null) {
      this.tryPlaceSelectedPiece(col, row);
      return;
    }
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
    // F4: turrets swing to their new aim over a few frames (shortest arc),
    // so the baked sprite rotation reads smooth instead of snapping.
    const da = Math.atan2(Math.sin(t.angle - t.viewAngle), Math.cos(t.angle - t.viewAngle));
    t.viewAngle += da * Math.min(1, dt * 10);
    t.cool -= dt;
    if (t.cool > 0) return;
    const target = t.pickTarget(this.enemies);
    if (!target) {
      t.cool = 0; // don't bank negative cooldown while idle
      return;
    }
    const s = t.stats;
    // L-04: carry the overshoot across shots instead of overwriting, so fire
    // rate is framerate-independent; clamp only after long stalls.
    t.cool += 1 / s.fireRate;
    if (t.cool < 0) t.cool = 0;
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
        if (!from) break;
        hitSet.add(from);
        pts.push({ x: from.x, y: from.y });
        const dealt = from.takeDamage(dmg);
        this.floaters.push(new FloatingText(from.x, from.y - from.size, `-${dealt}`, t.def.color, 0.36));
        dmg *= t.def.chainFalloff;
        // next nearest unhit enemy within chainRange (L-12: skip-and-continue,
        // inclusive range bound, so chainCount is never cut short)
        let next = null;
        let nd = Infinity;
        for (const e of this.enemies) {
          if (e.dead || hitSet.has(e) || e.phased) continue;
          const d = Math.hypot(e.x - from.x, e.y - from.y);
          if (d <= t.def.chainRange && d < nd) { nd = d; next = e; }
        }
        from = next;
      }
      this.beams.push(new Beam(pts, t.def.color, 0.12, 0.18));
      audio.play('arc');
    }
  }

  // ---------- Loop ----------
  frame(now) {
    if (!this._running) return; // P-07: destroy() stops the rAF loop
    requestAnimationFrame((t) => this.frame(t));
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    dt = Math.min(Math.max(dt, 0), 0.05); // clamp to avoid tunnelling after tab-switch
    const active = this.state === 'playing' && !this.paused;
    if (active) {
      const steps = SPEED_OPTIONS[this.speedIndex];
      for (let i = 0; i < steps; i++) this.step(dt);
      this.render();
      this.ui.updateHUD(this);
    } else if (this._needsRender) {
      // P-08: menu / game-over / paused stay fully idle except one repaint
      // per state change, so a static screen does not burn GPU/battery.
      this._needsRender = false;
      this.render();
      this.ui.updateHUD(this);
    }
  }

  requestRender() {
    this._needsRender = true;
  }

  step(dt) {
    const now = performance.now() / 1000;
    this.updateWaveCountdown(dt);
    if (this.state !== 'playing') return; // countdown expiry can't start a wave while over/menu
    this.updateWave(dt);
    for (const t of this.towers) this.fireTower(t, dt, now);
    for (const e of this.enemies) e.update(dt, now);
    for (const p of this.projectiles) p.update(dt, now, this.enemies);
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
    if (this.piecePreview) r.drawPieceGhost(this.piecePreview);
    for (const t of this.towers) r.drawTower(t);
    for (const b of this.beams) r.drawBeam(b);
    // P-10: viewport culling. Cheap bounds check in grid coordinates before the
    // expensive toon character draw. Margin of one grid cell keeps the bob
    // animation from clipping at the edge.
    const viewMinX = -r.ox / r.cell - 1;
    const viewMaxX = (r.canvas.width / r.dpr - r.ox) / r.cell + 1;
    const viewMinY = -r.oy / r.cell - 1;
    const viewMaxY = (r.canvas.height / r.dpr - r.oy) / r.cell + 1;
    for (const e of this.enemies) {
      const rad = e.size + 0.15;
      if (e.x + rad < viewMinX || e.x - rad > viewMaxX ||
          e.y + rad < viewMinY || e.y - rad > viewMaxY) continue;
      r.drawEnemy(e);
    }
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
