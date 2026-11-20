# ROADMAP — Neon Grid TD

**1 task = 1 commit.** Fiecare linie din Backlog se ia separat, respectând workflow-ul din
[`../AGENTS.md`](../AGENTS.md): citește `ARCHITECTURE.md` + `BEST_PRACTICES.md` → modificări
chirurgicale → `npm run check` + test Node pe modul → șterge fișierele temporare → actualizează
acest fișier → commit atomic.

---

## Implementat & Verificat

### Remedierea auditului (28 findings → 26 închiși)

Sursa: [`../AUDIT_REPORT.md`](../AUDIT_REPORT.md). Verificat prin `npm run check` și simulări Node.

| Batch | Commit | Conținut |
|---|---|---|
| 1 | `2aaddd6` | **L-01** anti-izolare la plasare + `isReachableFromCore`; **L-02** handling celulă core + watchdog de val; **P-01** `disconnect()` prin `onended` + rate-limit 12 sunete/100 ms; **S-04** cache bump, `PRECACHE` complet, timeout + fallback pe navigare |
| 2 | `2aaddd6` | **S-01** `@capacitor/*` devDeps + binar local; **S-02** DOM API în loc de `innerHTML` + validare hex la culori; **S-07** CSP strictă + registrare SW mutată în `js/boot.js`; **L-05** auto-pauză cu overlay; **L-06** închiderea meniului la game over + gardă de apartenență |
| 3 | `2aaddd6` | **P-03** cache de gradiente în `toon.js`; **P-04** buffer unic de zgomot; **P-05** dirty-check în `updateHUD`; **P-06** sprite-uri de glow în loc de `shadowBlur`; **P-08** rAF idle în meniu/pauză; **P-09** plafon `MAX_PARTICLES` |
| 4 | `d5f593d` | **L-03** armură proporțională cu plafon 10%; **L-04** carry-over la cooldown; **L-07** `WAVES_META` sursă unică; **L-08** `ECONOMY.sellRatio`; **L-09** timer unic de fază; **L-10** retintreare proiectile; **L-11** celulă ocupată de inamic; **L-12** chain skip-and-continue; **P-07** `destroy()` + listeneri numiți; **P-10** viewport culling |
| — | `d5f593d` | **P-02 respins** (balans `save`/`restore` verificat programatic) — a nu se raporta din nou |

**Încă deschise din audit:** **S-03** (persistență cu validare de integritate → Etapa E),
**S-05** (hardening `capacitor.config.json`: `webContentsDebuggingEnabled: false`, `cleartext: false`,
`allowNavigation: []`, `minWebViewVersion`), **S-06** (`preventDefault()` după verificarea stării +
gardă `e.repeat` / focus în input pe `keydown`).

### Etape de feature parcurse

| Etapa | Commit | Conținut |
|---|---|---|
| **A** — Traseu diagonal / serpentin | `51a2ac2` | `PATH_WAYPOINTS` + `buildRoad()` (scări Bresenham 45°, S-curve de la spawn colț stânga-sus la core jos-centru); flow-field restricționat pe celulele lane ⇒ turnurile se pun doar pe platforme, traseul nu poate fi blocat; board panel/lane/platforme pre-randat o dată pe resize (fără gradiente și fără `shadowBlur` per-frame); SW cache v8 |
| **B** — Muzică synthwave + SFX stratificate | `0bce174` | Limiter `DynamicsCompressor` pe master + `musicBus` separat; 16 SFX cu corp stratificat (sub-bass, armonici detunsați, zgomot filtrat din buffer-ul partajat); BGM procedural pe `AudioContext.currentTime` (lookahead 0,35 s, pași de 16-imi), progresie Am-F-C-G în 3 mode (meniu pad 92 BPM, joc arp/bass/kick/hats 104 BPM, boss 116 BPM); sincronizare cu state machine-ul din `main.js`; SW cache v7 |
| **F1** — Tile-builder: CORE central + piese 1–2 celule + portaluri SPAWN dinamice | `f244fdb` | `CORE_CELL` în mijlocul grilei (4,7) + `INITIAL_ROAD` (3 celule nord, o linie cu un singur capăt deschis); `TILE_PIECES` de 1–2 celule cu porturi (indici `DIRS`) și `rotatePiece()` pură; celulele de drum se leagă doar pe porturi reciproce, CORE acceptă orice port; port dangling deasupra unei celule libere = capăt deschis = portal SPAWN (derivat din `Pathfinder.openEnds()`, deci portalurile se mută automat la fiecare extensie; T-junction deschide al doilea portal, spawn round-robin în `main.js`); `canPlaceRoadPiece()/placeRoadPiece()` validează portul reciproc + celule libere + legătura la un capăt deschis ⇒ drumul rămâne mereu o rețea continuă spre CORE (L-01/L-02 prin construcție); board re-cosut la plasare, inamicii re-pathuiți; randare tot pre-randată single-drawImage (fără regressie P-03/P-06); `smoke-test.mjs` actualizat la noua geometrie. Verificat: `npm run check` + teste Node (rotire, plasare 1/2 celule, mutare SPAWN, T→2 portaluri, pathfinding spre CORE, refuz turn pe drum) |
| **F2 (logica)** — coadă de piese + auto-plasare + countdown de val | (acest commit) | `Pathfinder.findRoadPiecePlacement(piece, occupiedKeys)` pur: prima poziție/rotație validă pe un capăt deschis din `openEnds()`, sărind celulele cu inamici vii; `waves.createPieceQueue(rng)` + `makePieceRng(seed)` (mulberry32): mână de 2 piese deterministă, mereu o piesă de 1 celulă + una de 2 celule; în `main.js`: `roadHand` (mâna de 2 piese, refill echilibrat la consum/val nou), `rotateSelectedPiece()` (tasta R / buton ROTATE / a doua atingere a cardului), ceas automat de val `15 s` înainte de Wave 1 și `12 s` între valuri (`updateWaveCountdown()` apelat din `step()`, deci înghețat pe `paused`/tab-switch), bonus `earlyWaveBonus` la start anticipat, iar la expirare sau la `startNextWave()` piesele restante se auto-plasează prin `findRoadPiecePlacement()` (fără a construi sub inamici — L-11). Verificat: `npm run check` + test Node (coadă deterministă și echilibrată, plasare pe capăt deschis, skip celulă ocupată, T→2 portaluri, constante 15/12/2) |

Altele deja în trunchi: peisaj procedural pre-randat (`landscape.js`), artă toon pentru personaje și
turnuri cu siluete pe roluri (`toon.js`), boss-ul de la primul val-5 rebalansat.

---

## Backlog modular (etape mici, 1 task = 1 commit)

### Etapa C — Selecție de hărți multiple / dificultăți (`maps.js`)
- [ ] **C1** Extrage datele de hartă din `config.js` într-un modul `www/js/maps.js` (`MAPS = { id: { waypoints, spawn, core, cols, rows } }`); `ROAD` devine derivat per hartă. Fără schimbări de comportament.
- [ ] **C2** `Pathfinder` și `Renderer` primesc harta activă prin constructor/parametru, nu prin import direct de `ROAD`. Verifică L-01/L-02 pe fiecare hartă.
- [ ] **C3** Al doilea set de `PATH_WAYPOINTS` (hartă „spirală") + validare în Node că flow-field-ul ajunge de la spawn la core.
- [ ] **C4** Strat de dificultate (`ECONOMY` × `{easy, normal, hard}`) în `config.js`, citit de `Game.resetRun()`; fără litereale în `main.js`.
- [ ] **C5** Ecran de selecție meniu (hartă + dificultate) în `ui.js` + `index.html`; **bump `PRECACHE` + versiune SW** (S-04).

### Etapa D — Tipuri noi de turnuri / arbori de upgrade / abilități active
- [ ] **D1** Turn nou refolosind un `kind` existent (ex. `kind: 'projectile'`) — doar `config.TOWERS` + `TOWER_ORDER` + artă în `toon.js` + un `case` SFX.
- [ ] **D2** Arbori de upgrade cu ramificație la nivelul 3 (două variante per turn) în `config.js` + afișare în meniul de turn din `ui.js`.
- [ ] **D3** Abilitate activă cu cooldown (ex. „Orbital Strike") — stare + cooldown în `main.js`, buton în HUD, SFX + particule prin `burst()` (plafon P-09).
- [ ] **D4** Rebalans: verifică în Node DPS/val per turn nou, ajustează `cost`/`upgradeCost`/`damage`.

### Etapa E — Persistență locală + build APK Android
- [ ] **E1** Modul `www/js/save.js`: scriere/citire `localStorage` cu `version`, checksum simplu și validare per câmp cu fallback la default (**S-03**). Fără date sensibile.
- [ ] **E2** Legă `save.js` de `Game`: load la pornire (unlocked maps, best wave, mute), save la game over / victory / `visibilitychange`.
- [ ] **E3** Hardening `capacitor.config.json` (**S-05**) + garda `e.repeat`/focus și mutarea `preventDefault()` după verificarea stării (**S-06**).
- [ ] **E4** `npm run cap:android` (binar local) → `npx cap sync` → `cd android && ./gradlew assembleDebug`; notează pașii și rezultatele aici.
- [ ] **E5** Test pe dispozitiv/emulator WebView: FPS, audio la primul tap, offline după prima pornire, `visibilitychange`.

### Etapa F — Mod tile-builder (continuare)
- [ ] **F2a** Restul UI-ului de selecție a piesei (preview hover mai bogat, feedback de cost); costuri non-zero în `TILE_PIECES` citite din `ECONOMY`.
- [ ] **F3** Limite de rețea (plafon celule de drum / cost per extensie) + ecuație economică: portaluri mai multe = valuri mai grele, validat în Node.

### Igienă continuă (câte un commit, ori de câte ori se ivește prilejul)
- [ ] `npm run check` să acopere și `www/js/toon.js`, `www/js/boot.js`, `www/sw.js` (azi lipsesc din script); orice modul nou se adaugă **și** în `PRECACHE` (S-04).
- [ ] `npm i -D playwright && npx playwright install chromium`, apoi `npm run verify` verde pe mobile 390×844 + desktop 1280×800.
- [ ] Fișiere peste ~450 linii (`toon.js`, `landscape.js`, `main.js`): sparte doar când oricum le atingi, nu în commit de feature.
