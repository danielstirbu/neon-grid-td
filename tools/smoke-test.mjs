// tools/smoke-test.mjs — Playwright smoke test: mobile 390x844 touch + desktop 1280x800 mouse.
// Asserts: zero console/page errors, centered start overlay, PLAY click starts the game,
// tower placement via canvas tap, anti-blockade placement rule, wave start spawns moving
// enemies, towers engage, HUD buttons, tower context menu (upgrade/target/sell), endless.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8002';
const VIEWPORTS = [
  { name: 'mobile 390x844 (touch)', width: 390, height: 844, hasTouch: true, isMobile: true },
  { name: 'desktop 1280x800 (mouse)', width: 1280, height: 800, hasTouch: false, isMobile: false },
];

let failures = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

async function runViewport(browser, vp) {
  console.log(`\n== ${vp.name} ==`);
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: vp.hasTouch,
    isMobile: vp.isMobile,
    deviceScaleFactor: vp.isMobile ? 2 : 1,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('reqfail: ' + r.url()));

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.game === 'object' && window.game !== null, null, { timeout: 8000 });

  for (const asset of ['manifest.json', 'sw.js', 'style.css', 'icons/icon-180.png', 'icons/icon-192.svg', 'icons/icon-512.svg']) {
    const res = await page.request.get(BASE + '/' + asset);
    ok(res.ok(), `GET ${asset} -> ${res.status()}`);
  }

  // Start overlay perfectly centered in the viewport.
  const center = await page.evaluate(() => {
    const r = document.querySelector('#screen-start .overlay-panel').getBoundingClientRect();
    return { dx: Math.abs(r.x + r.width / 2 - innerWidth / 2), dy: Math.abs(r.y + r.height / 2 - innerHeight / 2) };
  });
  ok(center.dx <= 2 && center.dy <= 2, `overlay centered (dx=${center.dx.toFixed(1)}px, dy=${center.dy.toFixed(1)}px)`);

  // Real click: PLAY CAMPAIGN must start the game.
  await page.click('#btn-play');
  await page.waitForTimeout(250);
  const st = await page.evaluate(() => ({ state: window.game.state, hidden: document.getElementById('screen-start').classList.contains('hidden') }));
  ok(st.state === 'playing' && st.hidden, 'PLAY CAMPAIGN click starts game and hides overlay');

  const hud = await page.evaluate(() => ({ cash: document.getElementById('hud-cash').textContent, wave: document.getElementById('hud-wave').textContent }));
  ok(hud.cash === '140' && hud.wave === '0/20', `HUD initial values (cash=${hud.cash}, wave=${hud.wave})`);

  const cellPoint = (col, row) => page.evaluate(([c, rrow]) => {
    const g = window.game;
    const rect = g.canvas.getBoundingClientRect();
    return { x: rect.left + g.renderer.ox + (c + 0.5) * g.renderer.cell, y: rect.top + g.renderer.oy + (rrow + 0.5) * g.renderer.cell };
  }, [col, row]);

  // Select Pulse from the dock, then place it by tapping a legal cell.
  await page.click('.tower-card');
  const sel = await page.evaluate(() => window.game.ui.selectedTowerKey);
  ok(sel === 'pulse', 'tower card selection (pulse)');

  const p = await cellPoint(2, 5);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(150);
  let towers = await page.evaluate(() => window.game.towers.length);
  ok(towers === 1, 'tower placed on canvas tap');

  // Rejection: tapping an occupied cell does not place a second tower.
  await page.click('.tower-card');
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(120);
  towers = await page.evaluate(() => window.game.towers.length);
  ok(towers === 1, 'occupied cell rejected (still 1 tower)');
  const cashAfterBad = await page.evaluate(() => window.game.cash);
  ok(cashAfterBad === 100, 'no credits spent on rejected placement');

  // Tile-builder: the road is fixed (towers only build on platforms), so all
  // three platform cells around the core are placeable and the flow field from
  // the spawn portal (open end at 4,4) must stay connected to the core.
  const blockade = await page.evaluate(() => {
    const g = window.game;
    g.cash = 999;
    g.ui.selectedTowerKey = 'pulse';
    let placed = 0;
    for (const [c, r] of [[3, 7], [5, 7], [4, 8]]) {
      const before = g.towers.length;
      g.tryPlaceTower(c, r);
      if (g.towers.length > before) placed++;
    }
    const roadCell = g.tryPlaceTower(4, 6); // road tile: never buildable
    const connected = g.path.distAt(4, 4) >= 0;
    g.ui.clearTowerSelect();
    return { placed, roadCell, connected };
  });
  ok(blockade.placed === 3 && !blockade.roadCell && blockade.connected,
    `road can never be blocked (platforms=${blockade.placed}/3, road refused=${!blockade.roadCell}, portal reachable=${blockade.connected})`);

  // F2b dock: two road-piece cards, ROTATE (button + R key), wave countdown label.
  const dock = await page.evaluate(() => ({
    cards: document.querySelectorAll('#piece-cards .piece-card').length,
    glyph: document.querySelector('#piece-cards .piece-card .glyph').textContent.trim(),
    rotateDisabled: document.getElementById('btn-rotate').disabled,
    next: document.getElementById('btn-next-wave').textContent,
    hand: window.game.roadHand.length,
  }));
  ok(dock.cards === 2 && dock.hand === 2 && dock.glyph.length > 0 && dock.rotateDisabled,
    `piece dock shows 2 queued pieces, ROTATE disabled with no selection (cards=${dock.cards}, glyph=${dock.glyph})`);
  ok(/^NEXT WAVE IN \d+s/.test(dock.next), `wave countdown label on the wave button ("${dock.next}")`);

  await page.click('#piece-cards .piece-card');
  await page.keyboard.press('r');
  const rot = await page.evaluate(() => ({
    sel: window.game.selectedPiece,
    rot: window.game.pieceRotation,
    rotateDisabled: document.getElementById('btn-rotate').disabled,
  }));
  ok(rot.sel === 0 && rot.rot === 1 && !rot.rotateDisabled,
    `piece card selects and R rotates it (selected=${rot.sel}, rotation=${rot.rot}, ROTATE enabled)`);
  await page.click('#btn-rotate');
  ok(await page.evaluate(() => window.game.pieceRotation === 2), 'ROTATE button advances the rotation');

  // Ghost preview: cyan/valid over a legal open-end spot, red/invalid over the
  // core, and gone once the pointer leaves the stage.
  const spot = await page.evaluate(async () => {
    const { TILE_PIECES } = await import('/js/config.js');
    const g = window.game;
    return g.path.findRoadPiecePlacement(TILE_PIECES[g.roadHand[g.selectedPiece]], new Set());
  });
  ok(spot !== null, 'a legal road-piece placement exists for the selected piece');
  for (let i = 0; i < 4 && await page.evaluate((r) => window.game.pieceRotation !== r, spot.rotation); i++) {
    await page.keyboard.press('r');
  }
  const sp = await cellPoint(spot.origin.col, spot.origin.row);
  await page.mouse.move(sp.x, sp.y);
  const ghostOk = await page.evaluate(() => window.game.piecePreview);
  ok(ghostOk && ghostOk.valid, 'ghost preview is valid over a legal cell');
  const cp = await cellPoint(4, 7); // CORE cell
  await page.mouse.move(cp.x, cp.y);
  const ghostBad = await page.evaluate(() => window.game.piecePreview);
  ok(ghostBad && !ghostBad.valid, 'ghost preview turns invalid over an illegal cell');
  await page.mouse.move(sp.x, 4); // leave the canvas
  ok(await page.evaluate(() => window.game.piecePreview === null), 'ghost preview clears when the pointer leaves the grid');
  await page.keyboard.press('Escape');

  // Single dynamic SPAWN: a piece that extends the road moves the ONE live
  // portal to the new farthest tip; the old end stays as a normal road cell.
  const portal = await page.evaluate(async () => {
    const { TILE_PIECES } = await import('/js/config.js');
    const g = window.game;
    const before = g.path.spawnCells();
    const piece = TILE_PIECES.DOUBLE_STRAIGHT;
    const spot = g.path.findRoadPiecePlacement(piece, new Set());
    if (!spot) return { fail: 'no legal spot' };
    const res = g.placeRoadPiece(piece, spot.origin, spot.rotation);
    const after = g.path.spawnCells();
    const ends = g.path.openEnds();
    const maxD = Math.max(...ends.map((e) => g.path.distAt(e.col, e.row)));
    return {
      ok: res.ok,
      before: before.length,
      after: after.length,
      moved: before.length === 1 && after.length === 1 &&
        (after[0].col !== before[0].col || after[0].row !== before[0].row),
      oldIsRoad: g.path.isRoad(before[0].col, before[0].row),
      farthest: after.length === 1 && g.path.distAt(after[0].col, after[0].row) === maxD,
    };
  });
  ok(portal.ok && portal.before === 1 && portal.after === 1 && portal.moved && portal.oldIsRoad && portal.farthest,
    `exactly one SPAWN portal, moved to the farthest new tip (ends=${portal.before}→${portal.after}, moved=${portal.moved}, old cell is road=${portal.oldIsRoad}, farthest=${portal.farthest})`);

  // Strict single-path rule: lateral T-junctions and side branches are refused
  // (red ghost), so SPAWN only advances along the chain and never jumps.
  const branch = await page.evaluate(async () => {
    const { TILE_PIECES } = await import('/js/config.js');
    const g = window.game;
    const spawn = g.path.spawnCells()[0];
    const anyOk = (piece, origin) => [0, 1, 2, 3].some((r) => g.path.canPlaceRoadPiece(piece, origin, r).ok);
    const side = anyOk(TILE_PIECES.SINGLE_STRAIGHT, { col: spawn.col + 1, row: spawn.row });
    const trunk = anyOk(TILE_PIECES.DOUBLE_STRAIGHT, { col: 5, row: 5 });
    const after = g.path.spawnCells();
    return {
      side, trunk,
      unchanged: after.length === 1 && after[0].col === spawn.col && after[0].row === spawn.row,
      singleEnd: g.path.openEnds().length === 1,
    };
  });
  ok(!branch.side && !branch.trunk && branch.unchanged && branch.singleEnd,
    `T-junctions / side branches refused, SPAWN stays at the tip (side=${branch.side}, trunk=${branch.trunk}, unchanged=${branch.unchanged})`);

  // A tower directly in front of the SPAWN tip could never be built over and
  // would lock the road — the cell must stay free for the next extension.
  const frontLock = await page.evaluate(() => {
    const g = window.game;
    g.cash = 999;
    g.ui.selectedTowerKey = 'pulse';
    const tip = g.path.spawnCells()[0];
    let d = 0;
    for (; d < 4; d++) {
      if (!g.path.hasPort(tip.col, tip.row, d)) continue;
      const nx = tip.col + [0, 1, 0, -1][d];
      const ny = tip.row + [-1, 0, 1, 0][d];
      if (!g.path.isRoad(nx, ny) && !g.path.isCore(nx, ny)) break;
    }
    const front = { col: tip.col + [0, 1, 0, -1][d], row: tip.row + [-1, 0, 1, 0][d] };
    const placed = g.tryPlaceTower(front.col, front.row);
    g.ui.clearTowerSelect();
    return { placed, cash: g.cash, towers: g.towers.length };
  });
  ok(!frontLock.placed && frontLock.cash === 999 && frontLock.towers === 4,
    `tower in front of the SPAWN tip refused — road can never be walled in (placed=${frontLock.placed})`);

  // Dead-hand guard: the road only grows at the tip. Push it to (4,1) dangling
  // north, where the front cell (4,0) sits on the wall — a straight piece
  // would dangle out of the grid, so ONLY a TURN fits (exactly the run7
  // corner lock). A hand of collinear pieces must auto-reroll into a fitting
  // piece so neither the player nor the auto-placer can lock the road.
  const deadHand = await page.evaluate(async () => {
    const { TILE_PIECES } = await import('/js/config.js');
    const g = window.game;
    const fits = (k) => g.path.findRoadPiecePlacement(TILE_PIECES[k], new Set()) !== null;
    const step = g.path.placeRoadPiece(TILE_PIECES.SINGLE_STRAIGHT, { col: 4, row: 1 }, 0);
    if (!step.ok) return { fail: step.reason };
    g.roadHand = ['SINGLE_STRAIGHT', 'DOUBLE_STRAIGHT'];
    const before = g.roadHand.some(fits);
    g._refillHand(); // tops up to hand size and runs the dead-hand guard
    const after = g.roadHand.slice();
    g.ui.refreshPieceDock(g);
    return { before, after, fitCount: after.filter(fits).length, sizes: after.map((k) => TILE_PIECES[k].size).sort() };
  });
  ok(deadHand.fail === undefined && !deadHand.before && deadHand.fitCount >= 1 &&
    deadHand.after.length === 2 && deadHand.sizes.join() === '1,2',
    `wall-front dead hand auto-rerolls into a fitting piece, size mix kept (hand=${deadHand.after}, fits=${deadHand.fitCount})`);

  // Start wave 1: enemies spawn on the single SPAWN portal and follow the BFS flow field.
  await page.click('#btn-next-wave');
  await page.waitForTimeout(1400);
  const wave = await page.evaluate(() => {
    const g = window.game;
    return {
      active: g.waveActive,
      count: g.enemies.length,
      singlePortal: g.path.spawnCells().length === 1,
      onRoad: g.enemies.length > 0 && g.enemies.every((e) =>
        g.path.isRoad(Math.floor(e.x), Math.floor(e.y)) &&
        g.path.distAt(Math.floor(e.x), Math.floor(e.y)) >= 0),
    };
  });
  ok(wave.active && wave.count > 0, `wave 1 started with ${wave.count} enemies`);
  ok(wave.singlePortal, 'only one SPAWN portal is live during the wave');
  ok(wave.onRoad, 'every enemy walks the connected road toward the core (spawned from the single portal)');
  // Tag the leading enemy; if it dies or leaks it advanced, if it is still
  // alive its BFS distance to the core must have dropped. (A plain list scan
  // is flaky: new spawns queue up behind the portal during the wait window.)
  const probe = await page.evaluate(() => {
    const e = window.game.enemies[0];
    if (!e) return null;
    e.__probeD = window.game.path.distAt(Math.floor(e.x), Math.floor(e.y));
    return e.__probeD;
  });
  await page.waitForTimeout(700);
  const moved = await page.evaluate((d0) => {
    const g = window.game;
    if (d0 === null) return true;
    const e = g.enemies.find((x) => x.__probeD !== undefined);
    return !e || g.path.distAt(Math.floor(e.x), Math.floor(e.y)) < d0;
  }, probe);
  ok(moved, 'enemies advance along the BFS path (distance to core decreases)');

  // Towers engage within a couple of seconds.
  await page.waitForTimeout(2200);
  const combat = await page.evaluate(() => {
    const g = window.game;
    return { fx: g.projectiles.length + g.beams.length + g.floaters.length + g.particles.length, anyDamaged: g.enemies.some((e) => e.hp < e.maxHp) };
  });
  ok(combat.fx > 0 || combat.anyDamaged, 'towers engage enemies (VFX/damage observed)');

  // Speed + pause buttons respond; the resume button on the pause overlay
  // (the overlay covers the HUD) un-pauses the run.
  await page.click('#btn-speed');
  await page.click('#btn-pause');
  const flags = await page.evaluate(() => ({ s: window.game.speedIndex, p: window.game.paused }));
  ok(flags.s === 1 && flags.p === true, 'speed and pause HUD buttons work');
  await page.click('#btn-resume');
  ok(await page.evaluate(() => !window.game.paused), 'resume button on the pause overlay un-pauses');

  // Tap the placed tower -> contextual menu (upgrade / target / sell).
  const tp = await cellPoint(2, 5);
  await page.mouse.click(tp.x, tp.y);
  await page.waitForTimeout(150);
  const menuOpen = await page.evaluate(() => !document.getElementById('tower-menu').classList.contains('hidden'));
  ok(menuOpen, 'tower context menu opens on tap');
  await page.evaluate(() => { window.game.cash = 500; });
  const lvlBefore = await page.evaluate(() => window.game.towers[0].level);
  await page.click('#tm-upgrade');
  const after = await page.evaluate(() => ({ lvl: window.game.towers[0].level, mode: window.game.towers[0].targetMode }));
  ok(after.lvl === lvlBefore + 1, 'upgrade increases tower level');
  await page.click('#tm-target');
  const mode = await page.evaluate(() => window.game.towers[0].targetMode);
  ok(mode === 1, 'target mode cycles');
  await page.click('#tm-close');
  const menuClosed = await page.evaluate(() => document.getElementById('tower-menu').classList.contains('hidden'));
  ok(menuClosed, 'context menu closes');

  const endless = await page.evaluate(() => {
    window.game.toMenu();
    window.game.begin(true);
    return window.game.endless && window.game.state === 'playing';
  });
  ok(endless, 'endless mode entry works');

  await page.waitForTimeout(400);
  ok(errors.length === 0, `zero console/page errors${errors.length ? ' -> ' + errors.join(' | ') : ''}`);

  mkdirSync('.agent_tmp', { recursive: true });
  await page.screenshot({ path: `.agent_tmp/smoke-${vp.isMobile ? 'mobile' : 'desktop'}.png` });
  await ctx.close();
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const vp of VIEWPORTS) await runViewport(browser, vp);
await browser.close();

if (failures) {
  console.error(`\nSMOKE TEST FAILED — ${failures} failing assertion(s).`);
  process.exit(1);
}
console.log('\nSMOKE TEST PASSED — all assertions green on both viewports.');
