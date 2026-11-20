// tools/smoke-test.mjs — Playwright smoke test: mobile 390x844 touch + desktop 1280x800 mouse.
// Asserts: zero console/page errors, centered start overlay, PLAY click starts the game,
// tower placement via canvas tap, anti-blockade placement rule, wave start spawns moving
// enemies, towers engage, HUD buttons, tower context menu (upgrade/target/sell), endless.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

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

  // Start wave 1: enemies spawn and follow the BFS path.
  await page.click('#btn-next-wave');
  await page.waitForTimeout(1400);
  const wave = await page.evaluate(() => {
    const g = window.game;
    const portal = g.path.spawnCells()[0];
    return {
      active: g.waveActive,
      count: g.enemies.length,
      onPortal: g.enemies.every((e) => Math.floor(e.x) === portal.col),
      moved: g.enemies.some((e) => e.y > portal.row + 0.5),
    };
  });
  ok(wave.active && wave.count > 0, `wave 1 started with ${wave.count} enemies`);
  ok(wave.onPortal && wave.moved, 'enemies spawn at the open-end portal and move along the BFS path');

  // Towers engage within a couple of seconds.
  await page.waitForTimeout(2200);
  const combat = await page.evaluate(() => {
    const g = window.game;
    return { fx: g.projectiles.length + g.beams.length + g.floaters.length + g.particles.length, anyDamaged: g.enemies.some((e) => e.hp < e.maxHp) };
  });
  ok(combat.fx > 0 || combat.anyDamaged, 'towers engage enemies (VFX/damage observed)');

  // Speed + pause buttons respond.
  await page.click('#btn-speed');
  await page.click('#btn-pause');
  const flags = await page.evaluate(() => ({ s: window.game.speedIndex, p: window.game.paused }));
  ok(flags.s === 1 && flags.p === true, 'speed and pause HUD buttons work');
  await page.click('#btn-pause');

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
