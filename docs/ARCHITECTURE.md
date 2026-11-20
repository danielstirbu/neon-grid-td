# ARCHITECTURE — Neon Grid TD

Toate modulele sunt ES native (`<script type="module">`), fără bundler. Graful de import este aciclic și pornesc toate din `main.js`; `config.js` este singura sursă de constante și nu importă nimic.

## Fișiere

| Fișier | Responsabilitate unică | API cheie | Depinde de |
|---|---|---|---|
| `www/js/config.js` | Constante de balans + date tile-builder (piese de drum, porturi, rotații) | `GRID`, `CORE_CELL`, `DIRS`, `rotDir()`, `opposite()`, `INITIAL_ROAD`, `TILE_PIECES`, `rotatePiece()`, `PALETTE`, `ECONOMY`, `TOWERS`, `TOWER_ORDER`, `ENEMIES`, `WAVES_META`, `TARGET_MODES`, `SPEED_OPTIONS`, `towerLevelStats()`, `towerInvested()` | — |
| `www/js/pathfinding.js` | Rețeaua de drum (celule cu porturi) + flow-field BFS spre CORE + validări de plasare (turn și piese de drum) | `Pathfinder`: `recompute()`, `canPlace()`, `place()/remove()`, `isRoad()`, `isCore()`, `hasPort()`, `openEnds()`, `spawnCells()`, `canPlaceRoadPiece()`, `placeRoadPiece()`, `findRoadPiecePlacement()`, `isReachableFromCore()`, `distAt()`, `nextStep()` | `config` (CORE_CELL, DIRS, INITIAL_ROAD, rotatePiece) |
| `www/js/entities.js` | Stare și comportament pe entitate (fără canvas, fără DOM) | `Enemy`, `Tower`, `Projectile`, `Beam`, `Particle`, `FloatingText`, `burst()` (plafon `MAX_PARTICLES`) | `config` |
| `www/js/waves.js` | Generare de valuri (campanie 20 + boss + endless) + coada de piese tile-builder (seeded, echilibrată 1+2 celule) | `waveGroups()`, `waveScale()`, `buildSchedule()`, `makePieceRng()`, `createPieceQueue()` | `config` (WAVES_META, TILE_PIECES) |
| `www/js/audio.js` | Sinteză procedurală Web Audio: 16 SFX + BGM pe 3 mode | singleton `audio`: `unlock()`, `play(name)`, `setEnabled()`, `setMusicMode(mode)` | — |
| `www/js/toon.js` | Artă procedurală (personaje, turnuri, text), cache de gradiente | `drawToonEnemy()`, `drawToonTower()`, `toonText()`, `clearGradCache()`, helpers `rr/roundPoly/bodyPath/eyes/lighten/darken` | `config.PALETTE` |
| `www/js/landscape.js` | Fundal procedural pre-randat o singură dată pe resize | `Landscape.build(w,h,dpr,avoid)`, `.layer` (canvas offscreen) | — |
| `www/js/renderer.js` | Punerea entităților pe canvas; board offscreen (drum + porturi randate din network); sprite-uri de glow | `Renderer`: `setNetwork()`, `resize()`, `_buildBoard()`, `toGrid()`, `sx()/sy()`, `begin()`, `drawGrid/Tower/Enemy/Projectile/Beam/Particle/FloatingText/Range/Selected`, `drawPieceGhost()` (preview fantomă, fill/stroke plate — P-03/P-06) | `config`, `toon`, `landscape` |
| `www/js/ui.js` | HUD, dock de turnuri, dock de piese de drum (2 carduri + ROTATE), meniu contextual, toast/banner, vibrații | `UI`: `updateHUD()` (dirty-check), `refreshPieceDock()`, `toggleTowerSelect()`, `openTowerMenu()/refreshTowerMenu()/closeTowerMenu()`, `showStart/Over/PauseOverlay()`, `toast()`, `vibrate()` | `config`, `audio` |
| `www/js/main.js` | Orchestrare: buclă, state machine, input, combat, economie, mâna de piese + countdown-ul automat de val | `Game`: `begin()`, `retry()`, `toMenu()`, `togglePause/Speed/Sound()`, `startNextWave()`, `tryPlaceTower()`, `placeRoadPiece()`, `selectPiece()`, `rotateSelectedPiece()`, `updateWaveCountdown()`, `repath()/repathAll()`, `fireTower()`, `frame()/step()/render()`, `destroy()` | toate de mai sus |
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

`step(dt)` în ordine: `updateWaveCountdown` (ceasul automat dintre valuri: `15 s` înainte de valul 1, `12 s` între valuri, armat doar între valuri ⇒ `paused` / `visibilitychange` îl îngheață gratuit; la expirare `startNextWave()` își auto-plasează piesele restante cu `findRoadPiecePlacement()`) → `updateWave` (spawn din `schedule`) → `fireTower` per turn → `Enemy.update` → `Projectile.update` → `Beam.update` → colectare kills/leaks (cash, `FloatingText`, `burst`, `audio.play`, `core`) → filtrare liste moarte → `Particle`/`FloatingText`.

`render()` în ordine: `begin()` (landscape + fundal) → `drawGrid` (board pre-randat + hover) → `drawRange` → `drawSelected` → `drawPieceGhost` (preview-ul piesei selectate, cyan valid / roșu invalid) → turnuri → beams → inamici (**cu viewport culling**, P-10) → proiectile → particule → floating text.

## Coordonate și pathfinding

- Grila: `GRID.cols × GRID.rows` (9×14), celule în „unit space"; CORE-ul stă în mijlocul grilei (`CORE_CELL` = 4,7); `GRID.spawn` e doar un fallback, portalul real e unic și dinamic (vezi mai jos).
- Transformare: `Renderer.sx(x)=ox+x*cell`, `sy(y)=oy+y*cell`; invers `Renderer.toGrid(px,py)`. Canvas-ul este dimensionat la `dpr` nativ.
- Tile-builder: rețeaua de drum este o mulțime de celule, fiecare cu un mask de porturi (indici `DIRS` = N,E,S,W). Două celule de drum adiacente se leagă doar dacă ambele expun porturi reciproce; CORE-ul se leagă de orice port cu care se întâlnește. `INITIAL_ROAD` = 3 celule nord de CORE (o linie cu un singur capăt deschis).
- Un port care nu întâlnește o celulă de drum/CORE alăturat e *dangling*: deasupra unei celule libere formează un **capăt deschis**. `Pathfinder.openEnds()` le calculează pe toate, dar **portalul SPAWN este unic**: `spawnCells()` returnează întotdeauna o singură celulă — capătul deschis cu distanța BFS cea mai mare față de CORE (la egalitate câștigă o celulă din piesa tocmai plasată, `placeRoadPiece()` le ține minte). Când jucătorul extinde drumul, portalul se mută automat la noul vârf, iar vechiul capăt rămâne simplă celulă de drum (`TILE_PIECES` de 1–2 celule, rotite cu `rotatePiece()`; plasarea validează legătura reciprocă + celule libere + cel puțin un port pe un capăt deschis).
- `Pathfinder.recompute()` face BFS pornind din CORE, **doar pe muchiile cu porturi reciproce**. Rezultatul e `dist[]` (distanță în pași până la core).
- `nextStep(fx,fy)` alege vecinul cu `dist` mai mică → punct central al celulei. Mono-descrescător, deci nu poate boucla.
- Consecință structurală: turnurile se pot construi **doar pe platforme** (celule care nu sunt drum și nu sunt CORE), iar piesele de drum nu pot suprapune turnuri sau alte celule, deci traseul nu poate fi blocat — L-01/L-02 sunt adevărate prin construcție. Guard-ele `isReachableFromCore()` și `_escapeToReachable()` rămân ca centură de siguranță.
- Spawn-ul în `main.js`: toți inamicii valului se nasc **exclusiv din portalul SPAWN unic** (`path.spawnCells()[0]`, cu `GRID.spawn` doar ca fallback teoretic); după fiecare `placeRoadPiece()` board-ul se re-coace (`renderer._buildBoard()`) și toți inamicii se re-atașează de flow-field (`repathAll()`).

## Flux de input / UI

```
pointerdown (canvas) → audio.unlock() + pointerDown + setPointerCapture
pointermove          → renderer.toGrid() → hoverCell; ui.selectedTowerKey ? hover{col,row,valid} : null
                                                        selectedPiece !== null → _updatePiecePreview()
pointerleave         → hoverCell/hover/piecePreview → null (fantomă vizibilă doar sub cursor)
pointerup            → deplasare ≤ 24px && state==='playing' → Game.handleTap(col,row)
                                                        ├─ selectedPiece       → tryPlaceSelectedPiece()
                                                        ├─ ui.selectedTowerKey → tryPlaceTower()
                                                        ├─ turn at (col,row)   → ui.openTowerMenu()
                                                        └─ altfel              → closeTowerMenu()
keydown (1-4 / space / p / n / r / Escape) → select turn / pause / wave / rotate piece / escape
HUD buttons (ui._bind) → Game.togglePause|toggleSpeed|toggleSound|startNextWave|retry|toMenu
piece dock (ui._buildPieceDock) → card → Game.selectPiece(i) (a 2-a atingere rotește); ROTATE → Game.rotateSelectedPiece()
document.visibilitychange → auto-pauză + overlay de resume
```

`UI` citește din `Game`, nu scrie în el decât prin metode publice. `Game` nu atinge niciodată `innerHTML` — toate nodurile DOM se construiesc prin `document.createElement` și `textContent`.

## Reguli de modularitate (cum adaugi ceva fără cuplaj)

**Turn nou** — 3 atingeri, în mare parte declarative: (1) intrare în `config.TOWERS` (cu `kind: 'projectile' | 'beam' | 'chain'` și câmpurile aferente) + cheie în `TOWER_ORDER`; (2) o funcție de artă nouă în `toon.js`, dispatch-uită din `drawToonTower()` pe cheia de turn; (3) un `case` nou în `audio.play()` pentru SFX-ul de lovitură. Combatul din `Game.fireTower()` dispatch-uiește pe `t.kind`, deci un turn care refolosește un `kind` existent nu cere nicio modificare în `main.js`; nici `ui.js` nu se atinge (dock-ul se construiește din `TOWER_ORDER`).

**Inamic nou** — intrare în `config.ENEMIES` (`hp/speed/reward/armor/shape/color/size/slowResist`), eventual o trăsătură comportamentală în `Enemy.update()`; apare în valuri prin listele din `waves.js`. Randarea merge prin `drawToonEnemy()` pe baza lui `shape`, deci de obicei nu e nevoie de cod grafic nou.

**Piesă de drum nouă** — doar o intrare nouă în `config.TILE_PIECES` (offseturi `cells` + `ports` per celulă, 1–2 celule); validarea, plasarea, flow-field-ul, portalurile și randarea (tab-uri de connector + capace neon pentru porturile dangling) vin gratuit din `Pathfinder` și `Renderer`. Pentru hărți multiple, rețeaua inițială devine un câmp selectabil pe hartă, iar `Pathfinder` primește deja `cols/rows/spawn/core/initialRoad` din constructor — nu introduce `if (mapId === …)` în `pathfinding.js` sau `renderer.js`.

**Sunet nou** — un singur `case` în `audio.play()` (sau un pas nou în `_scheduleStep()` pentru muzică), folosind exclusiv `_tone()`, `_sub()`, `_noise()` și buffer-ul de zgomot partajat. Orice nod creat se auto-deconectează prin `onended`. Numărul de sunete rămâne sub rate-limiter.

**Reguli transversale:** `config.js` nu importă nimic; `entities.js` și `pathfinding.js` nu ating `document`/`canvas`/`window` (ca să fie testabile în Node); `renderer.js` nu conține reguli de gameplay; `ui.js` nu conține fizică sau timing de luptă; niciun fișier nou nu se adaugă fără intrare în `PRECACHE` + bump de versiune în `sw.js` (vezi `BEST_PRACTICES.md`).
