# BEST_PRACTICES — Neon Grid TD

Reguli obligatorii pentru orice modificare nouă. ID-urile corespund finding-urilor din
[`AUDIT_REPORT.md`](../AUDIT_REPORT.md); ce e marcat ✅ este deja implementat — **nu-l strica**.
Codul nou trebuie să respecte regula și să nu reintroducă modelul care a produs finding-ul.

## 1. Performanță mobilă — obiectiv 60 FPS în Android WebView

| ID | Regulă | Unde se aplică |
|---|---|---|
| **P-03** ✅ | Niciodată `createLinearGradient` / `createRadialGradient` / `createConicGradient` în bucla de randare. Gradienții trăiesc exclusiv în randările offscreen one-shot: board-ul în `Renderer._buildBoard()`, fundalul în `landscape.js`, **texturile de unitate în pass-ul de coacere `sprites.js`/`unitart.js`/`enemyart.js`** (F4 — re-coace la resize). | `renderer.js`, `sprites.js`, `landscape.js` |
| **P-06** ✅ | Fără `shadowBlur` pe entități dinamice (proiectile, beams, particule) — este cel mai scump efect Canvas 2D. Pe traseu dinamic se compun doar sprite-uri pre-randate (`Renderer._glow`, `SpriteBank` glow/core/flash/streak + texturile coapte). `shadowBlur` este permisă doar în randările offscreen unice (board, landscape, coacerea de texturi). | `renderer.js`, `sprites.js` |
| **P-05** ✅ | `UI.updateHUD()` face dirty-check: o semnătură per text + comparare per câmp. Niciun `textContent`/`classList` nu se scrie dacă valoarea nu s-a schimbat. | `ui.js` |
| **P-08** ✅ | Bucla `requestAnimationFrame` nu randează în meniu / pauză / game over. `frame()` rulează `step+render+updateHUD` doar când `state==='playing' && !paused`; în rest doar o repaint la cerere, prin `requestRender()`. | `main.js` |
| **P-09** ✅ | Particulele au plafon hard: `MAX_PARTICLES = 240` în `entities.js`. `burst()` aruncă excesul în loc să crească lista. Orice efect nou de particule trece prin `burst()`, nu împinge direct în listă. | `entities.js`, `main.js` |
| **P-10** ✅ | Inamicii se desenează cu viewport culling: verificare de bounds în coordonate de grilă (marjă 1 celulă) înainte de `drawToonEnemy()`. | `main.js` (`render()`) |
| **P-07** ✅ | Orice listener global se leagă printr-o funcție numită (`this._onResize`, `_onVisibility`, `_onKey`, `_onPointer*`) și se elimină în `Game.destroy()`, care oprește și bucla rAF (`this._running = false`) și eliberează canvas-ul offscreen al landscape-ului. | `main.js`, `ui.js` |

**Obiceiuri de buclă:** `dt` rămâne clamped în `[0, 0.05]`; listele moarte se filtrează o singură dată
per `step()`; nu aloca obiecte noi per entity-per-frame (reutilizează, sau limitează).

## 2. Audio procedural — Web Audio API

| ID | Regulă | Unde se aplică |
|---|---|---|
| **P-01** ✅ | Fiecare nod creat (`GainNode`, `OscillatorNode`, `BufferSource`, `BiquadFilter`) se auto-deconectează: `src.onended = () => { node.disconnect(); src.disconnect(); }`. Niciun nod nu rămâne atașat de `master` după ce sunetul s-a terminat. | `audio.js` (`_env`, `_tone`, `_sub`, `_noise`) |
| **P-04** ✅ | Buffer-ul de zgomot alb (1 s) se generează o singură dată (`_noiseBuffer()`) și se reutilizează prin surse cu `loop = true`. Nu se realocă și nu se completează un buffer nou per sunet. | `audio.js` |
| **Rate-limiter** ✅ | `audio.play()` lasă maxim `MAX_SOUNDS_PER_100MS = 12` sunete pe fereastră de 100 ms; excesul se aruncă. Sunetele noi de tip „spam" (lovituri multiple) se supun aceluiași plafon. | `audio.js` |
| **Limiter pe master** ✅ | Lanțul final este `SFX + musicBus → master → DynamicsCompressor → destination`. Muzica are bus-ul ei (`musicBus`, cu rampă de volum), ca să poată fi oprită/pauzată independent de SFX. | `audio.js` |
| **Deblocare iOS** | `audio.unlock()` se apelează la primul `pointerdown`; `ensure()` este leneș. Nu se creează `AudioContext` la load. | `audio.js`, `main.js` |

## 3. Securitate & Offline (PWA / Capacitor)

| ID | Regulă | Unde se aplică |
|---|---|---|
| **S-01** ✅ | `@capacitor/*` rămân `devDependencies` locale, iar scripturile `cap:*` folosesc binarul local (`node_modules/.bin/capacitor`), **nu** `npx cap` — pachetul `cap` de pe npm este o altă bibliotecă. Nu reintroduce `npx cap`. | `package.json` |
| **S-02** ✅ | Zero `innerHTML`/`insertAdjacentHTML`/`outerHTML` cu date dinamice. DOM-ul dinamic se construiește cu `createElement` + `textContent`; orice culoare venită din date se validează cu regex hex înainte de a ajunge în `style`. | `ui.js` |
| **S-07** ✅ | CSP strictă în `index.html`: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'`. Fără `unsafe-inline` și fără `eval`. Din cauza `script-src 'self'`, **nu se adaugă scripturi inline** — registrarea service worker-ului stă în `js/boot.js`; stilurile inline se mută în clase CSS. | `index.html`, `boot.js` |
| **S-04** ✅ | **Când adaugi un fișier `.js`/`.css`/iconiță nouă:** (1) adaugă-l în `PRECACHE` din `www/sw.js`, (2) bump la versiunea `CACHE` (`neon-grid-td-vN`). Fără amândouă, aplicația nu pornește offline după prima vizită. Nu se pune în cache decât răspunsuri `res.ok` / `status === 200`; navigarea rămâne network-first cu fallback la `index.html` din cache. | `www/sw.js` |
| **S-03** | Persistența (când apare) se validarează la citire: versiune + sanity check pe fiecare câmp, fallback la valorile default la orice eroare de parse sau valoare în afara intervalului. Nu se salvează nimic ce nu e revalidat la load. | `main.js` (Etapa E) |
| **S-05 / S-06** | La configurarea Android: `webContentsDebuggingEnabled: false`, `allowMixedContent: false`, `cleartext: false`, `allowNavigation: []`, `minWebViewVersion`. `preventDefault()` se apelează doar după verificarea stării, iar `keydown` are gardă `e.repeat` / focus în input. | `capacitor.config.json`, `main.js` |

## 4. Anti-blocare și corectitudine de gameplay

| ID | Regulă | Unde se aplică |
|---|---|---|
| **L-01** ✅ | Validarea anti-blocare ia în calcul **și inamicii activi**, nu doar traseul `spawn → core`. Plasarea unui turn care izolează o celulă cu inamic în ea se anulează (rollback) cu toast. | `main.js` (`tryPlaceTower`, `_escapeToReachable`) |
| **L-02** ✅ | `repath()` tratează explicit cazul „inamic pe celula core" și cazul „inamic pe celulă de platformă": dacă `nextStep()` nu poate avansa, inamicul este scos spre cea mai apropiată celulă atingibilă (`_escapeToReachable`), nu lasă valul înghețat. Există watchdog pe val. | `main.js`, `pathfinding.js` |
| **L-11** ✅ | `canPlace()` respinge celula ocupată de un turn **și** celula pe care se află un inamic. | `pathfinding.js`, `main.js` |
| **L-04** ✅ | Cooldown-ul turnurilor se scade cu `dt` (carry-over), nu se suprascrie cu `1/fireRate`. Framerate variabil nu schimbă DPS-ul. | `main.js` (`fireTower`) |
| **L-05** ✅ | `visibilitychange` face auto-pauză **și** marchează `autoPaused`, cu overlay de resume; `startNextWave()` este blocat în pauză. Nu există pauză fantomă fără cale de ieșire. | `main.js`, `ui.js` |
| **L-06** ✅ | La game over / intoarcere în meniu, meniul de turn se închide; `upgrade/sell/cycle` au gardă de apartenență la `this.towers` (fără `menuTower` stale). | `ui.js`, `main.js` |
| **L-03** ✅ | Armura se aplică ca reducere proporțională cu plafon minim (10%), nu `Math.max(1, dmg - armor)`; upgrade-urile de armură rămân lineare și previzibile. | `entities.js` |
| **L-07** ✅ | `WAVES_META` este singura sursă de adevăr pentru `total`, `bossEvery` și balance; `waves.js` și `main.js` citesc din ea. Nu hardcoda `% 5` sau un al doilea `totalWaves`. | `config.js`, `waves.js` |
| **L-08** ✅ | Valoarea de vânzare se calculează din `ECONOMY.sellRatio`, nu dintr-un literal. | `entities.js` |
| **L-09** ✅ | Ciclul de fază al phantom-ului folosește un singur timer (`phaseClock` resetat la `phaseEvery`), deci perioada totală este `phaseEvery`, nu `phaseEvery + phaseTime`. | `entities.js` |
| **L-10** ✅ | Proiectila a cărei ținte a murat **retintrează** (`_retarget`) în loc să dispară fără damage și fără feedback. | `entities.js` |
| **L-12** ✅ | Chain lightning **sare peste** candidații deja loviți și continuă căutarea (range inclusiv), nu face `break` la primul candidat ocupat. | `main.js` |
| **General** | Orice regulă nouă de gameplay se testează în `node` pe funcțiile pure (`config.js`, `pathfinding.js`, `waves.js`) înainte de commit. | — |
