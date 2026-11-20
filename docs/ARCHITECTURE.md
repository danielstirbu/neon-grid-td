# ARCHITECTURE — Neon Grid TD

Toate modulele sunt ES native (`<script type="module">`), fără bundler. Graful de import este aciclic și pornesc toate din `main.js`; `config.js` este singura sursă de constante și nu importă nimic.

## Fișiere

| Fișier | Responsabilitate unică | API cheie | Depinde de |
|---|---|---|---|
| `www/js/config.js` | Constante de balans și date statice ale hărții | `GRID`, `PATH_WAYPOINTS`, `buildRoad()`, `ROAD`, `PALETTE`, `ECONOMY`, `TOWERS`, `TOWER_ORDER`, `ENEMIES`, `WAVES_META`, `TARGET_MODES`, `SPEED_OPTIONS`, `towerLevelStats()`, `towerInvested()` | — |
| `www/js/pathfinding.js` | Flow-field BFS pe celulele de tip „lane" + validări de plasare | `Pathfinder`: `recompute()`, `canPlace()`, `place()/remove()`, `isRoad()`, `isReachableFromCore()`, `distAt()`, `nextStep()` | `config.ROAD` |
| `www/js/entities.js` | Stare și comportament pe entitate (fără canvas, fără DOM) | `Enemy`, `Tower`, `Projectile`, `Beam`, `Particle`, `FloatingText`, `burst()` (plafon `MAX_PARTICLES`) | `config` |
| `www/js/waves.js` | Generare de valuri (campanie 20 + boss + endless) | `waveGroups()`, `waveScale()`, `buildSchedule()` | `config.WAVES_META` |
| `www/js/audio.js` | Sinteză procedurală Web Audio: 16 SFX + BGM pe 3 mode | singleton `audio`: `unlock()`, `play(name)`, `setEnabled()`, `setMusicMode(mode)` | — |
| `www/js/toon.js` | Artă procedurală (personaje, turnuri, text), cache de gradiente | `drawToonEnemy()`, `drawToonTower()`, `toonText()`, `clearGradCache()`, helpers `rr/roundPoly/bodyPath/eyes/lighten/darken` | `config.PALETTE` |
| `www/js/landscape.js` | Fundal procedural pre-randat o singură dată pe resize | `Landscape.build(w,h,dpr,avoid)`, `.layer` (canvas offscreen) | — |
| `www/js/renderer.js` | Punerea entităților pe canvas; board offscreen; sprite-uri de glow | `Renderer`: `resize()`, `_buildBoard()`, `toGrid()`, `sx()/sy()`, `begin()`, `drawGrid/Tower/Enemy/Projectile/Beam/Particle/FloatingText/Range/Selected` | `config`, `toon`, `landscape` |
| `www/js/ui.js` | HUD, dock de turnuri, meniu contextual, toast/banner, vibrații | `UI`: `updateHUD()` (dirty-check), `toggleTowerSelect()`, `openTowerMenu()/refreshTowerMenu()/closeTowerMenu()`, `showStart/Over/PauseOverlay()`, `toast()`, `vibrate()` | `config`, `audio` |
| `www/js/main.js` | Orchestrare: buclă, state machine, input, combat, economie | `Game`: `begin()`, `retry()`, `toMenu()`, `togglePause/Speed/Sound()`, `startNextWave()`, `tryPlaceTower()`, `repath()/repathAll()`, `fireTower()`, `frame()/step()/render()`, `destroy()` | toate de mai sus |
| `www/js/boot.js` | Înregistrarea service worker-ului (fișier separat cere CSP `script-src 'self'`) | — | — |
| `www/sw.js` | Cache-first, offline complet; navigare network-first cu fallback | `CACHE` (versiune), `PRECACHE` | — |

## Bucla de joc

```
requestAnimationFrame ──► frame(now)
   │  dt = clamp((now-lastTime)/1000, 0, 0.05)      (anti-tunnelling după tab-switch)
   ├─ state==='playing' && !paused  ─► step(dt) × SPEED_OPTIONS[speedIndex]  (1x / 2x)
   │                                   render()
   │                                   ui.updateHUD(this)      ← dirty-check, nu DOM la 60 Hz
   └─ altfel (menu / paused / over) ─► idle; o singură repaint la requestRender()
```

`step(dt)` în ordine: `updateWave` (spawn din `schedule`) → `fireTower` per turn → `Enemy.update` → `Projectile.update` → `Beam.update` → colectare kills/leaks (cash, `FloatingText`, `burst`, `audio.play`, `core`) → filtrare liste moarte → `Particle`/`FloatingText`.

`render()` în ordine: `begin()` (landscape + fundal) → `drawGrid` (board pre-randat + hover) → `drawRange` → `drawSelected` → turnuri → beams → inamici (**cu viewport culling**, P-10) → proiectile → particule → floating text.

## Coordonate și pathfinding

- Grila: `GRID.cols × GRID.rows` (9×14), celule în „unit space"; nucleul este la `GRID.core`, spawn-ul la `GRID.spawn`.
- Transformare: `Renderer.sx(x)=ox+x*cell`, `sy(y)=oy+y*cell`; invers `Renderer.toGrid(px,py)`. Canvas-ul este dimensionat la `dpr` nativ.
- `ROAD` (din `config.js`) este lista ordonată a celulelor de drum, expandată din `PATH_WAYPOINTS` în scări Bresenham de 45° — deci traseul arată diagonal/serpentin dar rămâne adiacent pe grilă.
- `Pathfinder.recompute()` face BFS pornind din `core`, dar **doar prin celule din `ROAD`**. Rezultatul e `dist[]` (distanță în pași până la core).
- `nextStep(fx,fy)` alege vecinul cu `dist` mai mică → punct central al celulei. Mono-descrescător, deci nu poate boucla.
- Consecință structurală: turnurile se pot construi **doar pe platforme** (celule care nu sunt `ROAD`), deci traseul nu poate fi blocat — L-01/L-02 sunt adevărate prin construcție. Guard-ele `isReachableFromCore()` și `_escapeToReachable()` rămân ca centură de siguranță.

## Flux de input / UI

```
pointerdown (canvas) → audio.unlock() + pointerDown + setPointerCapture
pointermove          → renderer.toGrid() → ui.selectedTowerKey ? hover{col,row,valid} : null
pointerup            → deplasare ≤ 24px && state==='playing' → Game.handleTap(col,row)
                                                        ├─ ui.selectedTowerKey → tryPlaceTower()
                                                        ├─ turn at (col,row)   → ui.openTowerMenu()
                                                        └─ altfel              → closeTowerMenu()
keydown (1-4 / space / p / n / Escape) → select turn / pause / wave / escape
HUD buttons (ui._bind) → Game.togglePause|toggleSpeed|toggleSound|startNextWave|retry|toMenu
document.visibilitychange → auto-pauză + overlay de resume
```

`UI` citește din `Game`, nu scrie în el decât prin metode publice. `Game` nu atinge niciodată `innerHTML` — toate nodurile DOM se construiesc prin `document.createElement` și `textContent`.

## Reguli de modularitate (cum adaugi ceva fără cuplaj)

**Turn nou** — 3 atingeri, în mare parte declarative: (1) intrare în `config.TOWERS` (cu `kind: 'projectile' | 'beam' | 'chain'` și câmpurile aferente) + cheie în `TOWER_ORDER`; (2) o funcție de artă nouă în `toon.js`, dispatch-uită din `drawToonTower()` pe cheia de turn; (3) un `case` nou în `audio.play()` pentru SFX-ul de lovitură. Combatul din `Game.fireTower()` dispatch-uiește pe `t.kind`, deci un turn care refolosește un `kind` existent nu cere nicio modificare în `main.js`; nici `ui.js` nu se atinge (dock-ul se construiește din `TOWER_ORDER`).

**Inamic nou** — intrare în `config.ENEMIES` (`hp/speed/reward/armor/shape/color/size/slowResist`), eventual o trăsătură comportamentală în `Enemy.update()`; apare în valuri prin listele din `waves.js`. Randarea merge prin `drawToonEnemy()` pe baza lui `shape`, deci de obicei nu e nevoie de cod grafic nou.

**Hartă / traseu nou** — se schimbă doar `PATH_WAYPOINTS` (și `GRID.spawn`/`GRID.core`) în `config.js`; `ROAD`, flow-field-ul, board-ul randat și validările se regenerează automat. Pentru hărți multiple, `ROAD` devine un câmp selectabil pe hartă, iar `Pathfinder` primește deja `cols/rows/spawn/core` din constructor — nu introduce `if (mapId === …)` în `pathfinding.js` sau `renderer.js`.

**Sunet nou** — un singur `case` în `audio.play()` (sau un pas nou în `_scheduleStep()` pentru muzică), folosind exclusiv `_tone()`, `_sub()`, `_noise()` și buffer-ul de zgomot partajat. Orice nod creat se auto-deconectează prin `onended`. Numărul de sunete rămâne sub rate-limiter.

**Reguli transversale:** `config.js` nu importă nimic; `entities.js` și `pathfinding.js` nu ating `document`/`canvas`/`window` (ca să fie testabile în Node); `renderer.js` nu conține reguli de gameplay; `ui.js` nu conține fizică sau timing de luptă; niciun fișier nou nu se adaugă fără intrare în `PRECACHE` + bump de versiune în `sw.js` (vezi `BEST_PRACTICES.md`).
