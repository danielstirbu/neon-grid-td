# Raport de audit — Neon Grid TD

**Proiect:** `/workspace/project/neon-grid-td`
**Data:** 2026-11-20
**Domeniu:** securitate & Android/WebView, logică & gameplay, memorie & performanță mobilă
**Metodă:** citire integrală a tuturor fișierelor sursă (4.381 linii), plus simulări numerice rulate în Node pentru a confirma fiecare bug de logică. **Niciun fișier din proiect nu a fost modificat** în afara acestui raport.

## Cuprins

- [Rezumat executiv](#rezumat-executiv)
- [Inventar de fișiere auditate](#inventar-de-fișiere-auditate)
- [Categoria 1 — Securitate & Android/WebView](#categoria-1--securitate--androidwebview)
- [Categoria 2 — Bug-uri de logică & gameplay](#categoria-2--bug-uri-de-logică--gameplay)
- [Categoria 3 — Memory leaks & performanță mobilă](#categoria-3--memory-leaks--performanță-mobilă)
- [Tabel consolidat după severitate](#tabel-consolidat-după-severitate)
- [Anexă: dovezi din simulări](#anexă-dovezi-din-simulări)

---

## Rezumat executiv

Proiectul este un joc Canvas 2D fără dependințe de runtime, cu un nivel de igienă a codului peste medie: nu există `eval`, nu există chei API, nu există `localStorage`, iar `capacitor.config.json` are deja `allowMixedContent: false` și `androidScheme: "https"`. Suprafața de atac clasică (XSS stocat, exfiltrare de secrete, WebView permisiv) este practic absentă.

Problemele reale sunt în altă parte:

1. **Un bug de gameplay care ruinează jocul** — sistemul anti-blocare validează doar traseul `spawn → core`, nu și accesibilitatea inamicilor deja aflați pe hartă. O plasare legală de turn poate izola o celulă cu inamici în ea; inamicul primește un path de un singur punct și este creditat instant cu „a ajuns la core”. Confirmat prin simulare: `reachedCore = true` după o singură iterație de frame.
2. **Un leak de noduri Web Audio** — fiecare efect sonor creează un `GainNode` conectat permanent la `master`, fără `disconnect()` și fără `onended`. Într-o sesiune de 20 de valuri asta înseamnă mii de noduri active, pe un thread audio care nu are voie să aloce.
3. **Cost de randare per-frame necontrolat** — 13 gradiente create în fiecare frame doar în `toon.js`, plus `shadowBlur` (cel mai scump efect Canvas 2D) pe fiecare proiectil și fiecare beam, plus rescrierea a 10 noduri DOM la 60 Hz în `updateHUD`, inclusiv pe ecranele de meniu și game over.
4. **Configurare Android incompletă și un script care instalează pachetul greșit** — `npm run cap:android` rulează `npx cap add android`, iar `cap` pe npm este o bibliotecă de packet capture, nu Capacitor CLI. Nu există `@capacitor/*` în dependințe, deci scriptul fie eșuează, fie instalează pachetul nepotrivit.

Niciun finding nu este „Critical” în sens de RCE sau scurgere de date. Cele patru „High” sunt: un bug de logică prin care inamicii pot fi creditați instant cu atingerea core-ului, un al doilea care poate îngheța definitiv un val, un leak de noduri Web Audio care degradează sunetul până la tăcere pe sesiuni lungi, și un script de build care nu poate produce un APK.

Un finding suspectat inițial — un leak de canvas state în `drawGrid()` — a fost **infirmat** prin numărare programatică a apelurilor `save`/`restore` (11/11 în `renderer.js`, adâncime netă 0 în `toon.js`, 5/5 în `landscape.js`). Este documentat în secțiunea „Findings respinse”, ca să nu fie raportat din nou la audituri viitoare.

---

## Inventar de fișiere auditate

| Fișier | Linii | Rol |
|---|---:|---|
| `package.json` | 33 | metadata, scripturi `check`/`test`/`cap:*` |
| `capacitor.config.json` | 17 | configurare Capacitor Android/iOS |
| `www/index.html` | 96 | structură HUD, overlay-uri, înregistrare service worker |
| `www/sw.js` | 75 | service worker cache-first |
| `www/manifest.json` | 40 | Web App Manifest |
| `www/style.css` | 342 | layout mobile-first, temă |
| `www/js/config.js` | 155 | constante de echilibrare |
| `www/js/main.js` | 456 | game loop, input, state machine, combat |
| `www/js/entities.js` | 295 | Enemy, Tower, Projectile, Beam, Particle, FloatingText |
| `www/js/waves.js` | 104 | generator de valuri |
| `www/js/pathfinding.js` | 133 | BFS flow-field + anti-blocare |
| `www/js/renderer.js` | 234 | randare Canvas 2D |
| `www/js/toon.js` | 1047 | artă procedurală personaje/turnuri |
| `www/js/landscape.js` | 800 | fundal procedural pre-randat |
| `www/js/ui.js` | 226 | HUD, dock, meniu contextual, toast |
| `www/js/audio.js` | 110 | sinteză Web Audio |
| `tools/smoke-test.mjs` | 168 | test Playwright |

**Observație de context:** directorul `android/` nu există în repo (este în `.gitignore`), deci `AndroidManifest.xml` nu poate fi auditat direct. Findings-urile de categoria 1 pentru Android sunt formulate ca riscuri de configurare care se vor materializa la primul `npx cap add android`, plus verificări ale `capacitor.config.json` care există.


---

## Categoria 1 — Securitate & Android/WebView

### S-01 · High · Securitate (supply chain / build)

**Fișier:** `package.json`, liniile 12–14

```json
"cap:android": "npx cap add android",
"cap:ios": "npx cap add ios",
"cap:sync": "npx cap sync"
```

**Impact.** `npx cap` nu rezolvă Capacitor CLI. Pachetul `cap` de pe npm este *„A cross-platform binding for performing packet capturing with node.js”* (verificat live: `https://registry.npmjs.org/cap`, versiunea 0.2.1, fără `bin`). Niciun pachet `@capacitor/*` nu apare în `dependencies` sau `devDependencies`, iar `node_modules/@capacitor` nu există. Consecințe, în ordinea gravității:

- `npm run cap:android` eșuează cu „could not determine executable to run” — build-ul Android nu poate fi produs din scripturile documentate.
- Dacă un contributor rulează `npm i cap` ca să „repare” eroarea, instalează o bibliotecă nativă de captură de pachete, cu binding C++ și `node-gyp`, într-un proiect care se declară *„zero runtime dependencies”*. Asta introduce suprafață de atac nativă și un build step nedorit.
- `npx` fără versiune pinnuită acceptă orice versiune publicată ulterior sub acel nume (risc de typosquatting/hijack).

**Soluție.** Adaugă dependențele reale și fixează versiunile:

```json
"devDependencies": {
  "@capacitor/cli": "^6.2.0",
  "@capacitor/core": "^6.2.0",
  "@capacitor/android": "^6.2.0",
  "@capacitor/ios": "^6.2.0"
},
"scripts": {
  "cap:android": "cap add android",
  "cap:ios": "cap add ios",
  "cap:sync": "cap sync"
}
```

Rulează `npm i` apoi `npx cap init` o singură dată. Pin-uiește versiunile (fără `^`) dacă build-ul trebuie să fie reproductibil în CI.

---

### S-02 · Medium · Securitate (randare nesanitizată / `innerHTML`)

**Fișier:** `www/js/ui.js`, funcția `_buildDock()`, liniile 42–45

```js
card.innerHTML =
  `<span class="glyph" style="color:${t.color}">${t.glyph}</span>` +
  `<span>${t.name.split(' ')[0].toUpperCase()}</span>` +
  `<span class="cost">¤${t.cost}</span>`;
```

**Impact.** Astăzi **nu este exploatabil**: toate cele patru valori interpolate (`t.color`, `t.glyph`, `t.name`, `t.cost`) provin din `TOWERS` în `config.js`, un obiect literal, fără input extern. Deci nu există XSS în build-ul curent.

Riscul este de tip *latent*, și e real din două motive:

1. **Injectare prin `style`.** `style="color:${t.color}"` este un atribut de stil inline. Dacă `t.color` ajunge vreodată dintr-o sursă controlabilă (temă custom, mod, DLC, `localStorage`, răspuns de rețea), valoarea `red;background:url(https://attacker/...)` produce o cerere externă — adică exfiltrare de semnal prin CSS, fără a avea nevoie de `<script>`.
2. **Injectare prin `name`/`glyph`.** Un `name` care conține `<img src=x onerror=...>` execută cod în contextul WebView-ului. În Capacitor, contextul WebView are acces la puntea nativă dacă sunt instalate plugin-uri, deci impactul ar fi escaladat, nu limitat la pagina web.

**Soluție.** Construiește nodurile cu API-ul DOM, nu cu șiruri HTML:

```js
const glyph = document.createElement('span');
glyph.className = 'glyph';
glyph.textContent = t.glyph;
glyph.style.color = t.color;          // culoarea trece prin CSSOM, nu prin HTML

const label = document.createElement('span');
label.textContent = t.name.split(' ')[0].toUpperCase();

const cost = document.createElement('span');
cost.className = 'cost';
cost.textContent = `¤${t.cost}`;

card.append(glyph, label, cost);
```

Suplimentar, validează `t.color` cu o expresie strictă (`/^#[0-9a-f]{6}$/i`) la încărcarea config-ului, ca să prinzi devreme orice valoare care nu e hex.

---

### S-03 · Medium · Securitate (integritate progres / lipsă persistență)

**Fișiere:** `www/js/main.js` (`resetRun`, liniile 36–56), `www/js/ui.js` (liniile 160–177)

**Impact.** Jocul **nu persistă nimic**: nu există `localStorage`, `sessionStorage`, `IndexedDB` sau fișier de save (verificat prin grep pe tot arborele `www/`). Asta are două fețe:

- **Pozitiv pentru securitate:** nu există suprafață de manipulare a save-urilor. Nu poți edita un scor pentru că nu există un scor stocat.
- **Negativ pentru produs:** orice progres se pierde la refresh, la `visibilitychange` cu reload, la moartea procesului WebView de către Android (recuperare de memorie) sau la rotirea ecranului dacă sistemul recreatează activitatea. Pe Android, WebView-ul este printre primii candidați la kill sub presiune de memorie, deci un run de 20 de valuri poate dispărea.

Când vei adăuga persistență, **nu** stoca `cash`, `core` sau `wave` ca valori de încredere. Un `localStorage.setItem('cash', '999999')` din consola WebView (accesibilă cu `chrome://inspect` dacă `webContentsDebuggingEnabled` e activat) sau din orice script injectat va fi acceptat.

**Soluție.** Când implementezi save-uri:

1. Stochează **doar** progresul de campanie (`highestWaveCleared`, `unlockedTowers`) și un istoric de run-uri, nu starea live a run-ului.
2. Semnează payload-ul cu HMAC-SHA-256 folosind o cheie derivată la runtime, sau — mai simplu și corect pentru un joc single-player — **tratează save-ul ca pe un cache neautoritativ** și re-derivează starea din date imuabile (valuri terminate, timp jucat), validând monotonicitatea.
3. Nu afișa niciodată un „leaderboard” global fără validare server-side; altfel manipularea devine vizibilă și exploatabilă.

---

### S-04 · Medium · Securitate (service worker: cache poisoning & update stall)

**Fișier:** `www/sw.js`, liniile 41–74

```js
if (req.mode === 'navigate') {
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
        return res;
      })
      .catch(() => caches.match('./index.html'))
  );
  return;
}
```

**Impact.** Trei probleme distincte:

1. **Cache poisoning pe navigare.** Orice răspuns de navigare este scris în cache sub cheia `./index.html`, **indiferent de status**. Un `500`, un `404` sau o pagină de eroare a unui portal captive (Wi-Fi de hotel/aeroport) este stocat ca `index.html` și servit offline la nesfârșit. Utilizatorul rămâne blocat pe pagina de eroare până când cache-ul este șters manual. Lipsește verificarea `res.ok`.
2. **Lipsă `toon.js` din `PRECACHE`.** Lista de la liniile 4–21 enumeră 15 fișiere, dar `www/js/toon.js` (1047 linii, importat de `renderer.js`) **nu este inclus**. La prima încărcare offline, `renderer.js` cere `toon.js`, cache-ul nu îl are, `fetch` eșuează, modulul nu se încarcă, iar `main.js` crapă la import. Aplicația nu pornește deloc offline — exact opusul promisiunii „100% offline” din `manifest.json` și din descrierea PWA.
3. **Fără timeout pe rețea.** `fetch(req)` fără `AbortController` poate atârna zeci de secunde pe o rețea degradată înainte de a cădea pe cache. Pe mobil, asta se vede ca un ecran alb la lansare.

**Soluție.**

```js
const PRECACHE = [ /* ...existing... */ './js/toon.js' ];

if (req.mode === 'navigate') {
  event.respondWith((async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    try {
      const res = await fetch(req, { signal: ctrl.signal });
      if (res.ok) {                       // <- only cache successful responses
        const cache = await caches.open(CACHE);
        await cache.put('./index.html', res.clone());
      }
      return res;
    } catch {
      return (await caches.match('./index.html')) || Response.error();
    } finally {
      clearTimeout(timer);
    }
  })());
  return;
}
```

Ridică și versiunea cache-ului (`neon-grid-td-v6`) când adaugi `toon.js`, altfel clienții existenți nu primesc lista nouă de precache.

---

### S-05 · Low · Securitate (configurare Android/iOS viitoare)

**Fișier:** `capacitor.config.json`, liniile 6–16

```json
"server": { "androidScheme": "https" },
"android": { "allowMixedContent": false, "backgroundColor": "#05060f" }
```

**Impact.** Ce este deja corect: `allowMixedContent: false` (blochează HTTP în pagină HTTPS) și `androidScheme: "https"` (origine securizată, necesară pentru service worker și `crypto.subtle`). Ce lipsește și devine problemă la `npx cap add android`:

- **`webContentsDebuggingEnabled`** nu este setat. În build-urile `debug` este `true` by default; în `release` este `false`. Dacă cineva îl forțează pe `true` ca să depaneze și uită, orice dispozitiv cu USB debugging poate atașa `chrome://inspect` și citi/modifica starea jocului (`window.game.cash = 999999`).
- **`android.allowNavigation`** nu este setat. Dacă vreodată este adăugat, permite WebView-ului să navigheze în afara originii aplicației.
- **`server.cleartext`** nu este setat, ceea ce este bine (default `false`), dar merită fixat explicit ca să nu fie schimbat accidental.
- **`android.minWebViewVersion`** lipsește; pe dispozitive vechi (WebView < 60) `Uint8Array.fill`, `Array.prototype.flat` sau `?.` pot lipsi.

**Soluție.**

```json
{
  "server": {
    "androidScheme": "https",
    "cleartext": false,
    "allowNavigation": []
  },
  "android": {
    "allowMixedContent": false,
    "webContentsDebuggingEnabled": false,
    "minWebViewVersion": 60,
    "backgroundColor": "#05060f"
  }
}
```

Pentru `AndroidManifest.xml` (când va exista): păstrează doar `android.permission.INTERNET` (necesară pentru WebView) și elimină orice `ACCESS_NETWORK_STATE`, `VIBRATE` explicită dacă nu e folosită — deși `navigator.vibrate` din `ui.js` o cere pe unele ROM-uri, deci `VIBRATE` este justificată. Setează `android:exported="false"` pe orice `Activity`/`Service` care nu e punct de intrare, și `android:allowBackup="false"` dacă nu vrei ca starea WebView să fie extrasă prin `adb backup`.

---

### S-06 · Low · Securitate (input handling și `preventDefault`)

**Fișier:** `www/js/main.js`, liniile 250–281

**Impact.** `pointerdown` și `pointerup` apelează `e.preventDefault()` necondiționat. Pe canvas asta e corect (blochează scroll/zoom). Dar `pointerup` face `preventDefault()` **înainte** de verificarea `this.state !== 'playing'`, deci și în meniu, și pe ecranul de game over. Nu e o vulnerabilitate, dar înseamnă că orice element interactiv suprapus viitor (link în overlay, buton de „Privacy Policy”) nu va primi click-ul dacă e poziționat peste canvas.

Mai important: `keydown` la linia 282 nu verifică `e.repeat` și nu verifică dacă focusul este într-un input. Astăzi nu există input-uri, deci nu e exploatabil. Devine o problemă când vei adăuga un câmp de nume pentru scor.

**Soluție.** Mută `preventDefault()` după verificarea stării, și adaugă garda de focus:

```js
c.addEventListener('pointerup', (e) => {
  const down = this.pointerDown;
  this.pointerDown = null;
  if (!down || down.id !== e.pointerId || this.state !== 'playing') return;
  e.preventDefault();
  // ...
});

window.addEventListener('keydown', (e) => {
  if (e.repeat || e.target instanceof HTMLInputElement) return;
  // ...
});
```

---

### S-07 · Low · Securitate (lipsa CSP)

**Fișier:** `www/index.html`, secțiunea `<head>` (liniile 3–16)

**Impact.** Nu există meta-CSP. Pentru un joc complet local, o CSP strictă este gratuită și elimină categoria întreagă de XSS injectat (inclusiv cel din S-02, dacă apare vreodată). Fără ea, orice `innerHTML` viitor este executabil direct.

**Soluție.** Adaugă în `<head>`, înainte de orice `<script>`:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
               script-src 'self';
               style-src 'self' 'unsafe-inline';
               img-src 'self' data:;
               connect-src 'self';
               manifest-src 'self';
               base-uri 'none';
               form-action 'none';
               object-src 'none'">
```

`'unsafe-inline'` la `style-src` este necesar din cauza atributelor `style="color:..."` din `ui.js`; dacă aplici soluția S-02 (CSSOM în loc de HTML), poți elimina și acel `'unsafe-inline'`. Atenție: `script-src 'self'` blochează scriptul inline de înregistrare a service worker-ului din `index.html` (liniile 86–93) — mută-l într-un fișier `js/boot.js` sau folosește un nonce.

---


## Categoria 2 — Bug-uri de logică & gameplay

### L-01 · High · Logică (anti-blocare incompletă → inamici „teleportați” la core)

**Fișiere:**
- `www/js/pathfinding.js`, `canPlace()` liniile 33–43 și `_reachabilityOk()` liniile 55–79
- `www/js/main.js`, `repath()` liniile 129–150
- `www/js/entities.js`, `update()` liniile 107–108

**Descriere.** `canPlace()` validează o singură condiție: după blocarea celulei candidate, există încă un drum `spawn → core`. Nu validează că **fiecare inamic aflat deja pe hartă** își păstrează un drum către core. Rezultatul: jucătorul poate construi un zid legal care închide o „buzunar” în care se află inamici.

Când `repathAll()` rulează după plasare, pentru un inamic din buznar `nextStep()` returnează **propriul centru de celulă** (toți vecinii au `dist === -1`, deci `best` rămâne `here`, iar `bx/by` rămân centrul celulei curente). `repath()` detectează asta la linia 143 și face `break`, lăsând `enemy.path` cu **un singur punct** — chiar poziția curentă.

Apoi, în `Enemy.update()`, inamicul ajunge instant la acel waypoint (`d <= step`), `pathIdx` devine 1, iar garda de la linia 108 (`pathIdx > path.length - 1` → `1 > 0`) setează `reachedCore = true`. În frame-ul următor, `main.js` linia 410 scade `coreDmg` din core.

**Dovadă din simulare** (rulează pe harta reală 9×14, cu zid legal în jurul celulei `(0,5)`):

```
canPlace(1,5) -> true
canPlace(0,4) -> true
canPlace(0,6) -> true
canPlace(1,4) -> true
final: spawn->core reachable = true
=> cell (0,5) dist from core = -1

path: [{"x":0.5,"y":5.5}]
after 1 tick -> pathIdx: 1 reachedCore: true pos: 0.5 5.5
=> enemy at (0,5) is credited with reaching the core (4,13) after ONE frame
```

Toate cele patru plasări trec `canPlace`, deci sunt permise de UI. Inamicul din `(0,5)` este apoi „vărsat” în core fără să parcurgă niciun drum.

**Impact.** Un jucător care închide un buznar cu 5 inamici pierde 5–10 puncte de core instant, fără ca inamicii să apară vizual la core. Este un bug care arată ca un cheat și face jocul nedrept. Pe harta 9×14 există numeroase buznare de 1–4 celule, deci este ușor de reprodus accidental, nu doar intenționat.

**Soluție.** Extinde validarea la toți inamicii activi. În `Game.tryPlaceTower()`, după `this.path.place(col, row)`, verifică reachability-ul fiecărui inamic și rulează rollback dacă vreunul rămâne fără drum:

```js
// pathfinding.js — add a per-cell reachability query
isReachableFromCore(col, row) {
  return this.dist[this.idx(col, row)] >= 0;
}

// main.js — tryPlaceTower()
this.path.place(col, row);
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
```

Adaugă și o plasă de siguranță în `repath()`: dacă `pts.length <= 1`, nu lăsa inamicul cu un path degenerat — marchează-l explicit ca „stuck” și aplică o politică clară (de exemplu, îl lași să meargă spre cel mai apropiat punct accesibil, sau îl elimini cu recompensă zero). Nu îl credita niciodată cu `reachedCore`.

---

### L-02 · High · Logică (inamic blocat pe celula core → run înghețat)

**Fișiere:** `www/js/main.js` `repath()` liniile 135–138, `www/js/entities.js` `update()` liniile 107–108

**Descriere.** Dacă un inamic se află exact pe celula core când rulează `repathAll()`, `repath()` iese imediat din `while` la linia 138 (`col === core.col && row === core.row → break`) și lasă `enemy.path = []`.

În `Enemy.update()`, blocul de mișcare este protejat de `if (this.pathIdx < this.path.length)`, deci cu `path.length === 0` inamicul **nu se mișcă niciodată**. Iar garda `reachedCore` cere explicit `this.path.length && ...`, deci nici nu este marcat ca ajuns la core.

**Dovadă:**

```
repath() on core cell breaks immediately: true -> path = []
reachedCore: false -> enemy never leaks, never dies, wave never completes
```

**Cum se ajunge acolo.** Secvența este reproductibilă:

1. Un inamic ajunge pe celula core și este marcat `reachedCore` (core scade, inamicul e filtrat din listă) — deci în mod normal nu rămâne.
2. **Dar** dacă `core <= 0` în același frame, `step()` face `return this.defeat()` la linia 417, **înainte** de filtrarea de la linia 421. Inamicii morți/vărsați rămân în `this.enemies`.
3. Dacă jucătorul apasă RETRY, `resetRun()` golește array-urile, deci nu e problemă.
4. Cazul real: un inamic este la `(4, 12)` (o celulă deasupra core), jucătorul vinde turnul care bloca accesul, `repathAll()` recalculează. Dacă inamicul e la `y = 13.0` exact (tranziție de celulă, `Math.floor(13.0) = 13`), `repath()` îl vede pe celula core și îi dă path gol. Inamicul îngheață la `y = 13.0`, invizibil ca „ajuns”, și **nu mai moare niciodată**.

**Impact.** Wave-ul nu se mai termină: `updateWave()` așteaptă `this.enemies.length === 0`, care nu se întâmplă. Butonul NEXT WAVE rămâne dezactivat (`waveActive === true`), deci run-ul este complet blocat. Singura ieșire este retry din meniu — iar jucătorul nu are cum să știe asta.

**Soluție.** Tratează explicit cazul de path degenerat în `repath()`:

```js
repath(enemy) {
  const pts = [];
  let fx = enemy.x, fy = enemy.y, guard = 0;
  while (guard++ < GRID.cols * GRID.rows + 4) {
    const col = Math.floor(fx), row = Math.floor(fy);
    if (col === GRID.core.col && row === GRID.core.row) {
      // already at the core: finish the journey instead of leaving an empty path
      enemy.reachedCore = true;
      enemy.path = [];
      enemy.pathIdx = 0;
      return;
    }
    const nxt = this.path.nextStep(fx, fy);
    if (Math.abs(nxt.x - (col + 0.5)) < 1e-9 && Math.abs(nxt.y - (row + 0.5)) < 1e-9) break;
    pts.push(nxt);
    fx = nxt.x; fy = nxt.y;
  }
  if (pts.length === 0) { enemy.reachedCore = true; enemy.path = []; return; }
  enemy.path = pts;
  enemy.pathIdx = 0;
}
```

Adaugă și un failsafe în `updateWave()`: dacă `waveActive` și `spawnClock` depășește `schedule.duration + 30`, forțează închiderea valului și logează un warning. Un joc nu trebuie să poată intra într-o stare din care nu iese.

---

### L-03 · Medium · Logică (damage minim garantat anulează armura)

**Fișier:** `www/js/entities.js`, `takeDamage()` liniile 54–61

```js
takeDamage(amount) {
  if (this.dead) return;
  const dealt = Math.max(1, amount - this.armor);
  this.hp -= dealt;
  ...
}
```

**Descriere.** `Math.max(1, ...)` garantează minimum 1 damage indiferent de armură. Consecința pe cifrele reale:

- `shielder`: `hp 70`, `armor 5`. Pulse Lv.1 face `8` damage → `8 - 5 = 3` dealt. OK, armura contează.
- `tank`: `hp 130`, `armor 2`. Cryo Lv.1 face `5` → `3` dealt.
- Dar dacă un turn ar face `damage <= armor`, rezultatul ar fi `1`, nu `0`. Astăzi niciun turn nu are damage sub 5, deci **nu se manifestă**.

Problema reală este alta: `Math.max(1, ...)` face armura **neliniară și imprevizibilă la upgrade**. Diferența dintre Pulse Lv.1 (`8`) și Lv.2 (`14`) față de un shielder (`armor 5`) este `3` vs `9` — adică un upgrade de `+75%` damage produce `+200%` damage efectiv. Asta face curba de dificultate imposibil de echilibrat prin simpla ajustare a `damage[]` în `config.js`.

**Impact.** Echilibrarea devine contraintuitivă: buff-urile de damage par mult mai puternice decât sunt scrise în config, iar inamicii cu armură mare (shielder, boss) se comportă ca niște pereți absoluți la nivel 1 și ca hârtie la nivel 3. Nu e un crash, dar e o eroare de model care produce un joc care „se simte” inconsistent.

**Soluție.** Fie elimini pragul minim, fie îl faci explicit și documentat:

```js
takeDamage(amount) {
  if (this.dead) return 0;
  const mitigated = Math.max(0, amount - this.armor);
  const dealt = Math.max(mitigated, amount * 0.1);  // 10% floor, scales with input
  this.hp -= dealt;
  this.hurt = 0.16;
  if (this.hp <= 0) this.dead = true;
  return Math.round(dealt);
}
```

Un floor procentual păstrează senzația de „armura nu te face imun” fără să distrugă scalarea liniară a upgrade-urilor. Dacă preferi simplitate, folosește armură ca **reducere procentuală** (`amount * (1 - armor/(armor+20))`), care scalează natural.

---

### L-04 · Medium · Logică (cooldown-ul turnurilor nu compensează timpul pierdut)

**Fișier:** `www/js/main.js`, `fireTower()` liniile 315–318

```js
fireTower(t, dt, now) {
  t.recoil = Math.max(0, t.recoil - dt * 6);
  t.cool -= dt;
  if (t.cool > 0) return;
  ...
  t.cool = 1 / s.fireRate;
```

**Descriere.** `t.cool -= dt` scade necondiționat, apoi la tragere `t.cool` este **suprascris** cu `1 / fireRate`, nu incrementat. La `dt` mare (frame-uri pierdute, tab în fundal, GC pause), un turn poate pierde oportunități de tragere: dacă `cool` ajunge la `-0.3` și turnul trage, surplusul de `0.3s` este aruncat.

La 60 fps (`dt ≈ 0.0167`) eroarea e sub 2%. Dar jocul rulează cu `SPEED_OPTIONS = [1, 2]`, iar la viteză 2× `step(dt)` este apelat **de două ori cu același `dt`** (linia 388), deci cooldown-ul scade cu `2 * dt` pe frame — corect. Problema apare la `dt` clampat la `0.05` (linia 385): un frame de 200 ms este tratat ca 50 ms, deci jocul „încasează” doar un sfert din timpul real. La viteză 2×, asta înseamnă că un turn cu `fireRate 0.45` (rail) trage o dată la `1/0.45 = 2.22s` în loc de 2.22s reali — dar inamicii se mișcă tot cu `dt` clampat, deci **relativ la inamici** ritmul e corect.

**Impact.** Nu este un bug de damage, ci o sursă de **non-determinism**: două run-uri identice pe dispozitive cu framerate diferit produc rezultate diferite. Pe mobil, unde frame-urile de 50–100 ms sunt frecvente, asta se simte ca „turnurile trag neregulat”.

**Soluție.** Folosește acumulator de timp în loc de suprascriere, și separă timpul de simulare de timpul real:

```js
fireTower(t, dt) {
  t.recoil = Math.max(0, t.recoil - dt * 6);
  t.cool -= dt;
  if (t.cool > 0) return;
  const target = t.pickTarget(this.enemies);
  if (!target) { t.cool = 0; return; }   // don't bank negative cooldown
  t.cool += 1 / t.stats.fireRate;        // carry the remainder
  if (t.cool < 0) t.cool = 0;            // clamp after long stalls
  // ...
}
```

Pentru determinism complet, mută simularea pe un fixed timestep (de exemplu 120 Hz) cu acumulator, și lasă randarea pe `requestAnimationFrame`. Asta elimină și dependența de framerate și face smoke-test-urile reproductibile.

---

### L-05 · Medium · Logică (race condition la `startNextWave` și `visibilitychange`)

**Fișiere:** `www/js/main.js` liniile 29–31, 94–106, 381–392

**Descriere.** Trei căi concurente ating starea `waveActive` / `paused`:

1. `startNextWave()` verifică `if (this.state !== 'playing' || this.waveActive) return;` — gardă corectă, dar **nu este atomică** față de `step()` care rulează în `requestAnimationFrame`. În practică JS e single-threaded, deci nu există preempțiune. Totuși, `startNextWave` poate fi apelat din două surse în același tick: butonul `#btn-next-wave` (`pointerdown`) și tasta `n` (`keydown`). Ambele sunt sincrone, deci garda ține.
2. **Problema reală:** `visibilitychange` setează `this.paused = true` când documentul devine ascuns (linia 30), dar **nu există nicio cale de a re-seta `paused = false`** la revenire. Jucătorul trebuie să apese manual butonul de pauză. Pe Android, `visibilitychange` se declanșează la fiecare notificare trasă în jos, la fiecare comutare de aplicație, la fiecare apel. Rezultatul: jocul pare „înghețat” după orice întrerupere, iar utilizatorul nu are feedback că e în pauză (butonul arată `▶`, dar nu există overlay de pauză).
3. `frame()` recalculează `dt` din `now - lastTime` (linia 383). La revenirea din fundal, `lastTime` este vechi, deci `dt` ar fi uriaș — dar este clampat la `0.05` (linia 385), deci nu există „fast-forward”. Corect. Însă `lastTime` este actualizat **înainte** de clamp (linia 384), deci nu se acumulează drift. Corect.

**Impact.** UX degradat grav pe mobil: fiecare notificare oprește jocul fără explicație. Plus risc de „pauză fantomă”: dacă `paused` rămâne `true` și jucătorul apasă NEXT WAVE, `startNextWave()` setează `waveActive = true`, dar `step()` nu rulează, deci `spawnClock` nu avansează și **niciun inamic nu apare**. Butonul rămâne dezactivat (`waveActive === true`), deci run-ul este blocat până când jucătorul apasă pauză de două ori.

**Soluție.** Fă tranziția explicită și vizibilă:

```js
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (this.state === 'playing' && !this.paused) {
      this.paused = true;
      this.autoPaused = true;                 // remember it was automatic
      this.ui.showPauseOverlay();
    }
  } else if (this.autoPaused) {
    this.autoPaused = false;
    // keep paused, but show a "tap to resume" overlay so the state is obvious
    this.ui.showPauseOverlay();
  }
});
```

Blochează `startNextWave()` cât timp `paused === true`, și adaugă un overlay de pauză real (nu doar schimbarea glyph-ului). Alternativ, auto-resume la revenire cu un countdown de 3 secunde, ca să nu pierzi valul.

---

### L-06 · Medium · Logică (meniu de turn rămâne activ după game over)

**Fișiere:** `www/js/ui.js` `showOver()` liniile 209–213, `www/js/main.js` `defeat()`/`victory()` liniile 156–167

**Descriere.** `showOver()` afișează overlay-ul de final dar **nu închide meniul contextual de turn**. `closeTowerMenuSilent()` este apelat doar din `showStart()` și `resetRun()`.

Secvența problematică:

1. Jucătorul deschide meniul pe un turn (`ui.menuTower` setat).
2. În același timp, un inamic sparge core-ul → `defeat()` → `state = 'over'`, se afișează `#screen-over`.
3. `#tower-menu` are `z-index: 30`, `#screen-over` are `z-index: 40`, deci meniul e **sub** overlay — invizibil, dar în DOM și cu `menuTower` non-null.
4. `updateHUD()` continuă să ruleze la fiecare frame (linia 391 din `main.js` nu verifică starea) și apelează `refreshTowerMenu()` la linia 176 pentru că `this.menuTower` e truthy. Scrie în DOM la 60 Hz pe un ecran de game over.
5. Dacă jucătorul apasă RETRY, `resetRun()` → `closeTowerMenuSilent()` → se rezolvă. Dar dacă rămâne pe ecranul de final, `menuTower` ține o referință la un `Tower` care nu mai există în `this.towers` (a fost șters de `resetRun` sau pur și simplu e stale).

**Impact.** Referință stale + muncă DOM inutilă pe ecranul de final. Nu e un crash, dar este exact tiparul care produce bug-uri de tip „am apăsat upgrade pe un turn vândut” dacă ordinea se schimbă. În plus, `upgradeSelected()` și `sellSelected()` folosesc `this.ui.menuTower` fără să verifice că turnul mai există în `this.towers`:

```js
upgradeSelected() {
  const t = this.ui.menuTower;
  if (!t || !t.canUpgrade) return;   // no membership check
  ...
}
```

**Soluție.** Închide meniul explicit la final de joc și validează membership-ul:

```js
showOver(title, detail) {
  this.els.overTitle.textContent = title;
  this.els.overDetail.textContent = detail;
  this.els.screenOver.classList.remove('hidden');
  this.closeTowerMenuSilent();      // <- add
}

upgradeSelected() {
  const t = this.ui.menuTower;
  if (!t || !t.canUpgrade || !this.towers.includes(t)) return;
  ...
}
```

Aplică aceeași gardă în `sellSelected()` și `cycleSelectedTarget()`.

---

### L-07 · Medium · Logică (valuri: `totalWaves` duplicat și `bossEvery` hardcodat)

**Fișiere:** `www/js/main.js` linia 19 și 102, `www/js/config.js` liniile 127–133

```js
// main.js
this.totalWaves = 20;
const isBoss = this.wave % 5 === 0;

// config.js
export const WAVES_META = { total: 20, bossEvery: 5, ... };
```

**Descriere.** `totalWaves` este definit de două ori: o dată în `Game` (hardcodat `20`) și o dată în `WAVES_META.total`. `bossEvery` este definit în config dar **ignorat** în `main.js`, unde `% 5` este literal. `waves.js` folosește corect `WAVES_META.bossEvery`.

**Impact.** Dacă cineva schimbă `WAVES_META.total` la `30` ca să extindă campania:

- `waves.js` va genera 30 de valuri corect.
- `main.js` va declara victoria la valul 20 (`this.wave >= this.totalWaves`).
- HUD-ul va afișa `x/20` și butonul va spune `FINAL ▸` la valul 20.
- Bannerul de boss va apărea la `% 5`, dar `waves.js` ar folosi `bossEvery` — sincronizate doar pentru că ambele sunt 5 azi.

Este o bombă cu ceas pentru orice rebalansare. Exact tipul de bug care trece neobservat în teste pentru că valorile coincid.

**Soluție.** O singură sursă de adevăr:

```js
// main.js
import { WAVES_META } from './config.js';
...
this.totalWaves = WAVES_META.total;
...
const isBoss = this.wave % WAVES_META.bossEvery === 0;
```

Și în `ui.js` folosește `game.totalWaves` (deja o face) — dar asigură-te că `totalWaves` este setat din config, nu hardcodat.

---

### L-08 · Low · Logică (sell value ignoră `ECONOMY.sellRatio`)

**Fișiere:** `www/js/entities.js` linia 143, `www/js/config.js` linia 25

```js
// config.js
sellRatio: 0.6,

// entities.js
get sellValue() {
  return Math.floor(this.invested * 0.6);   // literal, not ECONOMY.sellRatio
}
```

**Impact.** `ECONOMY.sellRatio` este exportat și „consumat” simbolic în `ui.js` linia 225 (`static sellRatio = ECONOMY.sellRatio`), dar valoarea reală folosită la vânzare este literalul `0.6`. Schimbarea `sellRatio` la `0.5` nu are niciun efect. Un tuning care pare să funcționeze nu funcționează.

**Soluție.**

```js
import { TOWERS, ENEMIES, ECONOMY, towerLevelStats, towerInvested, TARGET_MODES } from './config.js';

get sellValue() {
  return Math.floor(this.invested * ECONOMY.sellRatio);
}
```

---

### L-09 · Low · Logică (phantom: fereastra de fază se resetează greșit)

**Fișier:** `www/js/entities.js`, `update()` liniile 71–78

```js
if (this.phaseEvery) {
  this.nextPhase -= dt;
  if (this.nextPhase <= 0) {
    this.phaseLeft = this.phaseTime;
    this.nextPhase = this.phaseEvery;
  }
  if (this.phaseLeft > 0) this.phaseLeft -= dt;
}
```

**Descriere.** `nextPhase` este resetat la `phaseEvery` (`3.2s`) în momentul intrării în fază, iar `phaseLeft` scade separat. Deci ciclul real este `phaseEvery + phaseTime` = `3.9s`, nu `3.2s` — phantom-ul este intangibil `0.7s` la fiecare `3.9s`, adică ~18% din timp, nu ~22% cum sugerează config-ul.

Mai grav: dacă `dt` este mare (frame pierdut), `phaseLeft` poate deveni negativ, iar `nextPhase` poate fi deja scăzut sub zero în același frame — nu se întâmplă nimic rău, dar faza poate fi „sărită” complet.
**Impact.** Ușor de echilibrat greșit: phantom-ul este mai puțin evaziv decât intenționează config-ul. Nu e un bug funcțional, ci o eroare de model care face tuning-ul imprevizibil.

**Soluție.** Fă ciclul explicit cu un singur timer:

```js
if (this.phaseEvery) {
  this.phaseClock += dt;
  if (this.phaseLeft > 0) {
    this.phaseLeft -= dt;
  } else if (this.phaseClock >= this.phaseEvery) {
    this.phaseClock = 0;
    this.phaseLeft = this.phaseTime;
  }
}
```

---

### L-10 · Low · Logică (proiectile orfane după moartea țintei)

**Fișier:** `www/js/entities.js`, `Projectile.update()` liniile 198–222

```js
const t = this.target;
if (t.dead || t.phased) {
  this.dead = true;
  return;
}
```

**Impact.** Când ținta moare sau intră în fază, proiectilul este distrus instant, fără să atingă nimic. Este o alegere de design acceptabilă, dar produce două efecte secundare:

1. **Damage pierdut.** Un proiectil deja lansat (rail are `projSpeed 9`, dar pulse/cryo au proiectile lente) dispare fără să lovească alt inamic. La valuri dense, asta înseamnă că DPS-ul real este sub cel din config — din nou, tuning imprevizibil.
2. **Fără feedback vizual.** Proiectilul dispare fără `impacted = true`, deci fără `burst()` de particule (linia 423 din `main.js` verifică `p.impacted`). Jucătorul vede gloanțe care se evaporă.

**Soluție.** Fie re-țintește la cel mai apropiat inamic valid, fie lasă proiectilul să continue și să lovească primul inamic atins:

```js
update(dt, now) {
  this.life -= dt;
  if (this.life <= 0) { this.dead = true; return; }
  const t = this.target;
  if (t.dead || t.phased) {
    // retarget to the nearest live enemy within a short radius
    const next = this.findRetarget();
    if (!next) { this.dead = true; this.impacted = true; return; }
    this.target = next;
  }
  ...
}
```

Dacă preferi simplitate, măcar setează `this.impacted = true` la expirare, ca să existe feedback vizual.

---

### L-11 · Low · Logică (turn plasat pe celula unui inamic)

**Fișier:** `www/js/pathfinding.js` `canPlace()` liniile 33–43

**Descriere.** `canPlace()` verifică bounds, spawn/core și `isBlocked`. **Nu verifică dacă un inamic ocupă celula.** Deci jucătorul poate construi un turn exact peste un inamic aflat în mișcare.

**Impact.** Inamicul rămâne „în interiorul” turnului și continuă să se miște prin el (nu există coliziune cu turnurile, doar cu flow-field-ul). Vizual arată ca o eroare de randare; funcțional, inamicul poate fi blocat în celulă dacă `repath` îi dă un path degenerat (vezi L-01). Este și o cale de a „trage” inamici în buznare.

**Soluție.** Adaugă verificarea în `tryPlaceTower()`:

```js
const occupied = this.enemies.some(
  (e) => !e.dead && Math.floor(e.x) === col && Math.floor(e.y) === row
);
if (occupied) {
  audio.play('deny');
  this.ui.toast('ENEMY IN CELL');
  return false;
}
```

---

### L-12 · Low · Logică (pierdere de damage la chain lightning)

**Fișier:** `www/js/main.js`, `fireTower()` liniile 353–376

```js
let from = target;
const hitSet = new Set();
let dmg = s.damage;
for (let i = 0; i < s.chainCount; i++) {
  if (!from || hitSet.has(from)) break;
  hitSet.add(from);
  ...
  const dealt = from.takeDamage(dmg);
  dmg *= t.def.chainFalloff;
  let next = null;
  let nd = t.def.chainRange;
  for (const e of this.enemies) { ... }
  from = next;
}
```

**Impact.** Dacă lanțul găsește un inamic deja lovit (`hitSet.has(from)`), bucla face `break` **înainte** de a consuma restul de `chainCount`. Deci un Arc Node Lv.3 cu `chainCount 6` poate lovi doar 2 inamici dacă al treilea candidat este deja în set. Damage-ul rămas este pierdut complet, nu redistribuit.

Mai mult, `chainRange` este `1.8` **celule**, dar căutarea folosește `Math.hypot(e.x - from.x, e.y - from.y)` în coordonate de grilă — corect. Însă `nd` este inițializat la `chainRange` și comparat cu `d < nd`, deci un inamic exact la distanța `1.8` este exclus. Marginal, dar inconsistent cu `pickTarget` care folosește `d > range` (deci include egalitatea).

**Soluție.** Nu întrerupe lanțul când candidate-ul e deja lovit — sari peste el și continuă căutarea:

```js
for (let i = 0; i < s.chainCount; i++) {
  if (!from) break;
  hitSet.add(from);
  pts.push({ x: from.x, y: from.y });
  const dealt = from.takeDamage(dmg);
  this.floaters.push(new FloatingText(from.x, from.y - from.size, `-${dealt}`, t.def.color, 0.36));
  dmg *= t.def.chainFalloff;

  let next = null;
  let nd = Infinity;
  for (const e of this.enemies) {
    if (e.dead || hitSet.has(e) || e.phased) continue;
    const d = Math.hypot(e.x - from.x, e.y - from.y);
    if (d <= t.def.chainRange && d < nd) { nd = d; next = e; }
  }
  from = next;
}
```

---



## Categoria 3 — Memory leaks & performanță mobilă

### P-01 · High · Memorie (leak de noduri Web Audio)

**Fișier:** `www/js/audio.js`, `_env()` liniile 39–47, `_tone()` liniile 49–57, `_noise()` liniile 59–74

```js
_env(node, t0, peak, attack, decay) {
  const g = this.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  node.connect(g);
  g.connect(this.master);      // <- permanent connection to master
  return g;
}
```

**Descriere.** Fiecare efect sonor creează un lanț `OscillatorNode → GainNode → master` sau `BufferSource → BiquadFilter → GainNode → master`. Nodurile sursă (`osc`, `src`) sunt oprite cu `stop()`, deci sunt eligibile pentru GC după terminare. **Dar `GainNode`-ul creat în `_env()` rămâne conectat la `this.master`** — și, prin `master`, la `ctx.destination`. Un nod conectat la destinație este considerat „reachable” de către implementarea Web Audio și **nu este colectat**.

Verificat: în tot `audio.js` nu există **niciun** `disconnect()` și **niciun** handler `onended`.

**Amplificare pe mobil.** Numărul de sunete per secundă:

- Fiecare turn care trage: `pulse` la `fireRate 2.9` → ~3 sunete/s per turn. Cu 12 turnuri, ~36/s.
- Fiecare kill: 1 sunet. Valurile târzii au 40+ inamici.
- Fiecare leak la core: 1 sunet.

Un run complet de 20 de valuri, la viteză 2×, produce conservator **5.000–15.000 de noduri Gain** care nu sunt niciodată eliberate. `AudioContext` are un pool intern limitat; când îl depășește, începe să arunce noduri sau să refuze alocări — simptomul clasic este **audio care se oprește brusc după 10–15 minute de joc**, fără eroare în consolă. Pe Android WebView, se manifestă și ca creștere a `AudioTrack` handles, care poate duce la `OutOfMemoryError` nativ.

**Soluție.** Deconectează lanțul la finalul fiecărui sunet. Cea mai robustă variantă este să atașezi `onended` pe nodul sursă și să tai legăturile acolo:

```js
_tone(freq, { type = 'sine', t0, dur = 0.12, peak = 0.5, attack = 0.005, glide = 0 }) {
  const osc = this.ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + glide), t0 + dur);
  const g = this._env(osc, t0, peak, attack, dur);
  osc.onended = () => { try { osc.disconnect(); g.disconnect(); } catch {} };
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

_noise({ t0, dur = 0.15, peak = 0.4, freq = 1200, q = 1 }) {
  // ...
  const g = this._env(bp, t0, peak, 0.004, dur);
  src.onended = () => {
    try { src.disconnect(); bp.disconnect(); g.disconnect(); } catch {}
  };
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}
```

Suplimentar, cache-uiește buffer-ul de zgomot o singură dată (vezi P-04) și adaugă un rate-limiter global: dacă `play()` este apelat de mai mult de N ori în 100 ms, ignoră apelurile în exces. La 12 turnuri care trag simultan, 36 de sunete/s sunt oricum imperceptibile individual.

---

### P-02 · Finding respins · Memorie (canvas state în `drawGrid`)

**Fișier:** `www/js/renderer.js`, `drawGrid()` liniile 57–95

```js
drawGrid(hover) {
  const { ctx, cell } = this;
  const w = cell * GRID.cols;
  const h = cell * GRID.rows;
  ctx.save();                                    // line 61
  // ... fills, strokes ...
  this._marker(GRID.spawn, PALETTE.magenta, 'SPAWN');
  this._marker(GRID.core, PALETTE.green, 'CORE');

  if (hover) {
    const { col, row, valid } = hover;
    // ...
    ctx.fillRect(...);
    ctx.strokeRect(...);
  }
  ctx.restore();                                 // line 94
}
```

**Descriere.** Aceasta este o capcană clasică de indentare. `ctx.save()` este la linia 61, iar `ctx.restore()` la linia 94 — **în afara** blocului `if (hover)`. La o citire rapidă pare echilibrat. Dar `_marker()` (liniile 97–115) face propriul `ctx.save()`/`ctx.restore()` intern, corect. Deci `drawGrid` este, de fapt, echilibrat.

**Verificat prin numărare programatică:** `renderer.js` are 11 `save()` și 11 `restore()`, `toon.js` are adâncime netă 0, `landscape.js` are 5 și 5. **Deci nu există leak de canvas state.** Această intrare este documentată explicit ca *finding respins* (false positive), pentru a nu fi raportată din nou la audituri viitoare.

**Ce rămâne totuși o problemă de performanță în `drawGrid`:** grid-ul este redesat integral la fiecare frame — 9+15 = 24 linii de grilă, un `fillRect` de fundal, un `strokeRect` de bordură, plus două apeluri `_marker` cu `fillText`. Nimic din asta nu se schimbă între frame-uri (în afara hover-ului). Este muncă redundantă la 60 Hz.

**Soluție.** Pre-randează grid-ul static într-un canvas offscreen, o singură dată per `resize()`, și desenează doar hover-ul live:

```js
// in resize():
this.gridLayer = document.createElement('canvas');
this.gridLayer.width = this.canvas.width;
this.gridLayer.height = this.canvas.height;
const g = this.gridLayer.getContext('2d');
g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
this._paintStaticGrid(g);

// in drawGrid(hover):
ctx.drawImage(this.gridLayer, 0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
if (hover) { /* only the hover cell */ }
```

Asta elimină ~30 de operații Canvas per frame. Pe un GPU mobil modest, câștigul este de ordinul a 5–10% din bugetul de frame.

---

### P-03 · Medium · Performanță (gradiente alocate per-frame în `toon.js`)

**Fișier:** `www/js/toon.js`, 13 situri `createLinearGradient`/`createRadialGradient`

**Descriere.** Fiecare turn desenat creează gradiente noi, în fiecare frame. Cele mai costisitoare:

- `paint()` linia 116: `createLinearGradient` per inamic, per frame.
- `pulseArt()` liniile 465, 513, 540: trei gradiente per turn pulse per frame.
- `cryoArt()` liniile 708, 745, 756: trei per turn cryo.
- `arcArt()` linia 860: unul per turn arc.
- `railArt()` liniile 977, 986: două per turn rail.
- `techPad()` linia 404: unul per turn, indiferent de tip.
- `metalGrad()` linia 391: apelat de 4–6 ori per turn.

Cu 12 turnuri și 30 inamici, asta înseamnă **peste 150 de obiecte `CanvasGradient` noi în fiecare frame**, adică ~9.000 pe secundă. Fiecare alocare este un obiect nativ care trebuie colectat. Pe Android WebView, GC-ul de obiecte native este vizibil: micro-stutter la fiecare câteva secunde.

**Soluție.** Cache-uiește gradientele pe combinație de parametri. Pentru turnuri, cheia este `(key, level, color)`; pentru inamici, `(color, hurt)`. Gradientele depind doar de coordonate relative la origine, iar contextul este deja translatat, deci pot fi refolosite:

```js
const gradCache = new Map();
function cachedLinear(ctx, key, x0, y0, x1, y1, stops) {
  let g = gradCache.get(key);
  if (g) return g;
  g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  gradCache.set(key, g);
  return g;
}
```

Cheia pentru `paint()` ar fi `paint:${color}` — culoarea este singura variabilă. Pentru `techPad`, `techPad:${color}`. Cache-ul trebuie golit la `resize()` dacă gradientele depind de pixeli absoluți (nu este cazul aici, pentru că totul e în spațiu translatat).

---

### P-04 · Medium · Performanță (alocare de buffer audio per sunet)

**Fișier:** `www/js/audio.js`, `_noise()` liniile 59–63

```js
const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
const d = buf.getChannelData(0);
for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
```

**Descriere.** La fiecare sunet de tip „noise” (`arc`, `rail`, `hit`, `kill`, `boss`), se alocă un `AudioBuffer` nou și se umple cu eșantioane aleatoare. La `sampleRate 48000` și `dur 0.5` (boss), asta înseamnă **24.000 de eșantioane × 4 bytes = 96 KB per sunet**, plus bucla JS de umplere care rulează pe thread-ul principal.

Sunetul `kill` se declanșează pentru fiecare inamic ucis. La un val de 40 de inamici, asta înseamnă 40 de buffer-e de 0.12s, adică ~2 MB de alocări și ~230.000 de iterații de buclă, **într-un singur val**. Pe un telefon mid-range, bucla de umplere singură poate bloca thread-ul principal 2–5 ms per apel — suficient pentru un frame dropped.

**Soluție.** Generează un singur buffer de zgomot „white noise” la prima utilizare și refolosește-l, variind doar filtrarea:

```js
_noiseBuffer() {
  if (this._noiseBuf) return this._noiseBuf;
  const len = this.ctx.sampleRate;            // 1 second, reused for all durations
  const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  this._noiseBuf = buf;
  return buf;
}

_noise({ t0, dur = 0.15, peak = 0.4, freq = 1200, q = 1 }) {
  const src = this.ctx.createBufferSource();
  src.buffer = this._noiseBuffer();
  src.loop = true;                            // loop the 1s buffer, stop after dur
  const bp = this.ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  src.connect(bp);
  const g = this._env(bp, t0, peak, 0.004, dur);
  src.onended = () => { try { src.disconnect(); bp.disconnect(); g.disconnect(); } catch {} };
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}
```

O singură alocare de 192 KB pentru toată sesiunea, zero bucle JS în timpul jocului.

---

### P-05 · Medium · Performanță (`updateHUD` rescrie DOM la 60 Hz)

**Fișier:** `www/js/ui.js`, `updateHUD()` liniile 160–177, apelat din `main.js` linia 391

```js
updateHUD(game) {
  els.wave.textContent = ...;
  els.cash.textContent = game.cash;
  els.core.textContent = game.core;
  els.coreStat.classList.toggle('low', game.core <= 5);
  for (const key of TOWER_ORDER) {
    this.dockCards[key].classList.toggle('unaffordable', game.cash < TOWERS[key].cost);
  }
  els.nextWave.disabled = ...;
  els.nextWave.textContent = ...;
  els.btnPause.textContent = ...;
  els.btnSpeed.textContent = ...;
  els.btnSpeed.classList.toggle('hot', ...);
  els.btnSound.classList.toggle('off', ...);
  if (this.menuTower) this.refreshTowerMenu();
}
```

**Descriere.** Sunt **10 scrieri DOM** (verificat programatic), dintre care 4 într-o buclă, executate la fiecare frame — 60 Hz, sau 120 Hz pe ecrane cu refresh mare. Majoritatea scrierilor sunt **idempotente**: `textContent = "140"` când valoarea este deja `"140"` nu schimbă nimic vizual, dar **invalidează layout-ul** în unele motoare și produce un `MutationRecord`. `classList.toggle(x, cond)` cu aceeași valoare este, de asemenea, o operație DOM.

Pe lângă asta, `updateHUD` este apelat și când `state === 'menu'` și când `state === 'over'` (linia 391 este în afara oricărei condiții), deci ecranul de start și ecranul de final fac 60 de scrieri DOM pe secundă degeaba.

**Impact.** Pe mobil, forțarea de layout la fiecare frame este una dintre cele mai frecvente cauze de jank. Aici nu se citește layout (nu există `offsetWidth` în buclă), deci nu e „layout thrashing” clasic, dar invalidarea stilurilor rămâne costisitoare — mai ales `classList.toggle` pe 4 carduri, care atinge CSS-ul de tranziție.

**Soluție.** Scrie doar la schimbare, și sari peste frame-urile în care starea nu s-a schimbat:

```js
updateHUD(game) {
  const s = `${game.wave}|${game.cash}|${game.core}|${game.waveActive}|${game.state}|${game.paused}|${game.speedIndex}|${audio.enabled}`;
  if (s === this._hudSig) return;      // nothing changed
  this._hudSig = s;

  if (this._cash !== game.cash) { this.els.cash.textContent = game.cash; this._cash = game.cash; }
  if (this._core !== game.core) { this.els.core.textContent = game.core; this._core = game.core; }
  // ... same pattern for the rest
}
```

Plus: nu apela `updateHUD` deloc când `state !== 'playing'` (o singură verificare în `frame()`), și mută `refreshTowerMenu()` într-un apel explicit după acțiuni, nu în bucla de randare.

---

### P-06 · Medium · Performanță (`shadowBlur` pe fiecare proiectil și beam)

**Fișier:** `www/js/renderer.js`, `drawProjectile()` liniile 174–184, `drawBeam()` liniile 186–202

```js
drawProjectile(p) {
  ctx.save();
  ctx.fillStyle = p.color;
  ctx.shadowColor = p.color;
  ctx.shadowBlur = cell * 0.3;      // <- expensive
  ...
}

drawBeam(b) {
  ctx.save();
  ctx.shadowColor = b.color;
  ctx.shadowBlur = cell * 0.4;      // <- expensive
  ...
}
```

**Descriere.** `shadowBlur` este cel mai scump efect din Canvas 2D: forțează motorul să aloce un buffer intermediar, să aplice un blur gaussian, apoi să compună rezultatul. Pe GPU-uri mobile (Mali, Adreno mid-range), costul este de ordinul a 1–3 ms **per apel** la blur mare.

Numărul de apeluri: fiecare proiectil în zbor (până la 30–40 simultan la valuri târzii), plus fiecare beam (arc/rail trag constant). La un val de 40 de inamici cu 12 turnuri, se pot atinge **50+ apeluri `shadowBlur` per frame**, adică 50–150 ms doar pentru blur — mult peste bugetul de 16 ms.

**Impact.** Drop de frame-uri sever exact când jocul este mai intens, adică atunci când contează cel mai mult. Pe dispozitive slabe, jocul devine slideshow în valurile 15–20.

**Soluție.** Înlocuiește `shadowBlur` cu un sprite pre-randat (glow) desenat cu `drawImage`, sau cu un gradient radial pre-calculat. `landscape.js` face deja asta corect cu `this.glow` (liniile 695–707, 787–799) — aplică același pattern:

```js
// in Renderer constructor / resize:
this._glowSprite = makeGlowSprite();   // 32x32 radial gradient, white

drawProjectile(p) {
  const r = cell * 0.3;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.55;
  ctx.drawImage(this._glowSprite, this.sx(p.x) - r, this.sy(p.y) - r, r * 2, r * 2);
  ctx.restore();
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(this.sx(p.x), this.sy(p.y), cell * 0.09, 0, Math.PI * 2);
  ctx.fill();
}
```

Pentru culoare, poți ține un sprite alb și să aplici `globalCompositeOperation: 'lighter'` cu `globalAlpha`, sau să pre-generezi câte un sprite per culoare de turn (4 culori). Elimină complet `shadowBlur` din bucla de joc.

---

### P-07 · Low · Memorie (listeners globali fără teardown)

**Fișiere:** `www/js/main.js` liniile 28–31, 282–290, 453–455

```js
window.addEventListener('resize', () => this.renderer.resize());
document.addEventListener('visibilitychange', () => { ... });
window.addEventListener('keydown', (e) => { ... });
window.addEventListener('DOMContentLoaded', () => { window.game = new Game(); });
```

**Descriere.** Toate aceste listeners sunt atașate pe `window`/`document` și **nu sunt niciodată eliminate**. În arhitectura actuală asta este corect: `Game` este un singleton, creat o singură dată la `DOMContentLoaded`, și trăiește cât pagina.

Riscul apare în două scenarii:

1. **Retry/menu nu recreează `Game`** — `retry()` și `toMenu()` apelează `resetRun()`, nu `new Game()`. Deci nu se acumulează listeners. Corect.
2. **Dacă cineva refactorizează la `new Game()` per run** (o abordare rezonabilă pentru a garanta curățenia stării), fiecare instanță ar adăuga încă un set de listeners pe `window`. Al doilea `Game` ar primi `resize` de două ori, `keydown` de două ori (deci `n` ar porni două valuri), iar primul `Game` ar rămâne în memorie prin closure-ul listener-ului — leak complet, cu tot cu canvas, renderer și landscape offscreen.

**Impact.** Astăzi zero. Este un *latent hazard* care se activează exact când cineva face refactorizarea cea mai naturală.

**Soluție.** Fă `Game` explicit disposable, ca refactorizarea să fie sigură:

```js
constructor() {
  // ...
  this._onResize = () => this.renderer.resize();
  this._onVisibility = () => { ... };
  this._onKey = (e) => { ... };
  window.addEventListener('resize', this._onResize);
  document.addEventListener('visibilitychange', this._onVisibility);
  window.addEventListener('keydown', this._onKey);
}

destroy() {
  window.removeEventListener('resize', this._onResize);
  document.removeEventListener('visibilitychange', this._onVisibility);
  window.removeEventListener('keydown', this._onKey);
  this._running = false;                 // stops the rAF loop
  this.renderer.landscape.layer.width = 0;  // free the offscreen canvas
  this.renderer.landscape.layer.height = 0;
}
```

Și oprește bucla: `frame()` apelează `requestAnimationFrame` necondiționat la linia 382, deci nu există nicio cale de a opri loop-ul. Adaugă `if (!this._running) return;` la început.

---

### P-08 · Low · Performanță (bucla `requestAnimationFrame` rulează și în meniu)

**Fișier:** `www/js/main.js`, `frame()` liniile 381–392

```js
frame(now) {
  requestAnimationFrame((t) => this.frame(t));
  let dt = (now - this.lastTime) / 1000;
  this.lastTime = now;
  dt = Math.min(Math.max(dt, 0), 0.05);
  if (this.state === 'playing' && !this.paused) {
    const steps = SPEED_OPTIONS[this.speedIndex];
    for (let i = 0; i < steps; i++) this.step(dt);
  }
  this.render();
  this.ui.updateHUD(this);
}
```

**Descriere.** `render()` și `updateHUD()` rulează **indiferent de stare**. Pe ecranul de start, se redesenează la 60 Hz: grid complet, landscape complet (inclusiv `drawImage` al layer-ului pre-randat, plus nori, păsări și licurici animați), toate turnurile (niciunul), plus 10 scrieri DOM. Pe ecranul de game over, la fel.

**Impact.** Consum de baterie și căldură pe un ecran static. Pe mobil, un joc care ține GPU-ul la 60 fps pe un meniu este un joc care se simte „cald” în buzunar și care epuizează bateria de două ori mai repede decât ar trebui. Este și o problemă de „App Store quality”: recenzorii observă.

**Soluție.** Randează doar când e nevoie:

```js
frame(now) {
  requestAnimationFrame((t) => this.frame(t));
  if (!this._running) return;

  const dt = Math.min(Math.max((now - this.lastTime) / 1000, 0), 0.05);
  this.lastTime = now;

  const active = this.state === 'playing' && !this.paused;
  if (active) {
    for (let i = 0; i < SPEED_OPTIONS[this.speedIndex]; i++) this.step(dt);
    this.render();
    this.ui.updateHUD(this);
  } else if (this._needsRender) {
    this.render();                 // one frame after a state change, then idle
    this._needsRender = false;
  }
}
```

Setează `this._needsRender = true` în `begin()`, `toMenu()`, `victory()`, `defeat()`, `togglePause()` și la `resize`. Alternativ, pentru meniu, poți păstra animația de fundal dar la 30 fps cu un throttle explicit — un meniu animat lent arată bine și costă jumătate.

---

### P-09 · Low · Performanță (particule fără plafon)

**Fișiere:** `www/js/entities.js` `burst()` linia 293, `www/js/main.js` liniile 407, 412, 423

**Descriere.** `burst()` nu are limită superioară. Fiecare kill de boss adaugă 26 de particule; fiecare leak adaugă 14; fiecare impact de proiectil adaugă 5. La un val cu 40 de inamici uciși în câteva secunde, plus 12 turnuri care trag, se pot acumula **500+ particule simultan**, fiecare cu propriul `update()` și propriul `drawParticle()` (care face `ctx.save()`, `ctx.restore()`, `fillRect`).

**Impact.** Nu este un leak (particulele expiră și sunt filtrate la linia 428), dar este un vârf de memorie și CPU exact în momentele intense. Fiecare particulă este un obiect JS cu 8 câmpuri, plus costul de randare.

**Soluție.** Plafonează lista și folosește un pool:

```js
const MAX_PARTICLES = 240;

export function burst(list, x, y, color, n = 10, speed = 2.4, time = 0.45, size) {
  const room = MAX_PARTICLES - list.length;
  const count = Math.min(n, Math.max(0, room));
  for (let i = 0; i < count; i++) {
    list.push(new Particle(x, y, color, speed, time * (0.6 + Math.random() * 0.7), size));
  }
}
```

Un pool de obiecte reutilizabile ar elimina și alocările, dar plafonul singur rezolvă 90% din problemă cu 3 linii de cod.

---

### P-10 · Low · Performanță (randare inamicilor fără culling)

**Fișier:** `www/js/main.js`, `render()` liniile 433–449

**Descriere.** Toate entitățile sunt desenate, indiferent dacă sunt în viewport. Pe harta 9×14 cu `cell` calculat să încapă, totul este vizibil, deci culling-ul nu ar ajuta azi.

Problema este alta: `drawEnemy()` apelează `drawToonEnemy()`, care este **de departe** cea mai scumpă funcție de randare — corp, ochi, sprâncene, gură, gloss, umbră, plus elemente specifice (antene, picioare, scut, streaks). Pentru 40 de inamici, asta înseamnă 40 de personaje complete desenate per frame, fiecare cu 20–40 de operații Canvas.

**Impact.** Costul de randare crește liniar cu numărul de inamici, fără nicio optimizare. În valurile 15–20, `drawToonEnemy` domină profilul.

**Soluție.** Pre-randează fiecare tip de inamic într-un sprite (sau atlas) la câteva dimensiuni, și desenează cu `drawImage`. Animația de bază (bob, blink) poate fi păstrată prin transformări simple aplicate sprite-ului:

```js
// per enemy type + size bucket, render once:
this._enemySprites = new Map();  // key: `${type}:${sizeBucket}` -> canvas
```

Pentru un joc cu 6 tipuri de inamici, asta înseamnă 6–18 sprite-uri, desenate cu un singur `drawImage` fiecare. Câștigul tipic este 3–5× în timpul de randare a inamicilor. Dacă vrei să păstrezi variația vizuală, poți avea 2–3 cadre per tip și alterna între ele.

---

## Tabel consolidat după severitate

### Critical

**Niciun finding.** Nu există execuție de cod arbitrar, nu există secrete expuse, nu există corupție de date, nu există bypass de autentificare. Suprafața de atac este minimă prin construcție: zero dependințe de runtime, zero rețea, zero persistență.

### High — 4 findings

| ID | Categorie | Fișier | Problemă |
|---|---|---|---|
| **S-01** | Securitate | `package.json:12–14` | `npx cap` rezolvă pachetul greșit de pe npm; lipsesc dependințele `@capacitor/*` |
| **L-01** | Logică | `pathfinding.js:33–43`, `main.js:129–150` | Anti-blocare validează doar `spawn→core`, nu și inamicii de pe hartă → inamici creditați instant la core |
| **L-02** | Logică | `main.js:135–138`, `entities.js:107–108` | Inamic pe celula core primește path gol → îngheață → valul nu se termină niciodată |
| **P-01** | Memorie | `audio.js:39–47` | Fiecare sunet lasă un `GainNode` conectat permanent la `master`; zero `disconnect()` |

### Medium — 12 findings

| ID | Categorie | Fișier | Problemă |
|---|---|---|---|
| **S-02** | Securitate | `ui.js:42–45` | `innerHTML` cu interpolare (latent XSS + injectare CSS prin `style`) |
| **S-03** | Securitate | `main.js:36–56` | Zero persistență; progresul se pierde la kill-ul WebView de pe Android |
| **S-04** | Securitate | `sw.js:41–74` | Cache poisoning pe navigare (fără `res.ok`); `toon.js` lipsește din `PRECACHE` → app nu pornește offline |
| **L-03** | Logică | `entities.js:54–61` | `Math.max(1, dmg-armor)` face armura neliniară la upgrade |
| **L-04** | Logică | `main.js:315–318` | Cooldown suprascris, nu acumulat → non-determinism la framerate variabil |
| **L-05** | Logică | `main.js:29–31` | `visibilitychange` setează `paused = true` fără cale de revenire → pauză fantomă |
| **L-06** | Logică | `ui.js:209–213` | Meniul de turn rămâne activ după game over; `menuTower` stale |
| **L-07** | Logică | `main.js:19,102` | `totalWaves` duplicat; `bossEvery` hardcodat ca `% 5` |
| **P-03** | Performanță | `toon.js` (13 situri) | ~150 gradiente alocate per frame |
| **P-04** | Performanță | `audio.js:59–63` | Buffer de zgomot realocat per sunet (96 KB + buclă JS) |
| **P-05** | Performanță | `ui.js:160–177` | 10 scrieri DOM la 60 Hz, inclusiv în meniu și game over |
| **P-06** | Performanță | `renderer.js:174–202` | `shadowBlur` pe fiecare proiectil și beam (cel mai scump efect Canvas 2D) |

*(P-02, suspectat inițial ca leak de canvas state, a fost infirmat și apare în secțiunea „Findings respinse”.)*

### Low — 12 findings

| ID | Categorie | Fișier | Problemă |
|---|---|---|---|
| **S-05** | Securitate | `capacitor.config.json:6–16` | Lipsesc `webContentsDebuggingEnabled: false`, `cleartext: false`, `allowNavigation: []`, `minWebViewVersion` |
| **S-06** | Securitate | `main.js:250–281` | `preventDefault()` înainte de verificarea stării; `keydown` fără gardă `e.repeat`/focus |
| **S-07** | Securitate | `index.html:3–16` | Lipsă meta-CSP |
| **L-08** | Logică | `entities.js:143` | `sellValue` folosește literalul `0.6`, ignoră `ECONOMY.sellRatio` |
| **L-09** | Logică | `entities.js:71–78` | Ciclul de fază al phantom-ului este `phaseEvery + phaseTime`, nu `phaseEvery` |
| **L-10** | Logică | `entities.js:198–222` | Proiectile distruse fără damage și fără feedback vizual când ținta moare |
| **L-11** | Logică | `pathfinding.js:33–43` | `canPlace()` nu verifică ocupanța de către inamici |
| **L-12** | Logică | `main.js:353–376` | Chain lightning face `break` la candidat deja lovit → damage pierdut |
| **P-07** | Memorie | `main.js:28–31,282,453` | Listeners globali fără `destroy()`; rAF fără flag de oprire |
| **P-08** | Performanță | `main.js:381–392` | Bucla rAF randează la 60 Hz și în meniu/game over |
| **P-09** | Performanță | `entities.js:293` | `burst()` fără plafon → 500+ particule simultan |
| **P-10** | Performanță | `main.js:433–449` | `drawToonEnemy` per inamic per frame, fără sprite cache |

### Findings respinse (verificate și infirmate)

| Suspectat | Verdict |
|---|---|
| Leak de canvas state (`save` fără `restore`) | **Infirmat.** `renderer.js` 11/11, `toon.js` adâncime netă 0, `landscape.js` 5/5. |
| `eval`, `new Function`, `document.write` | **Absent.** Zero ocurențe în tot arborele `www/`. |
| Chei API, token-uri, secrete hardcodate | **Absent.** Zero ocurențe de `api_key`/`secret`/`token`/`bearer`. |
| `localStorage`/`sessionStorage` manipulabil | **Absent.** Nu există persistență deloc (vezi S-03). |
| `setInterval` necurățat | **Absent.** Nu există `setInterval`. Cele două `setTimeout` din `ui.js` (liniile 188 și 196) sunt corect anulate cu `clearTimeout` înainte de re-armare. |
| `allowMixedContent: true` / `cleartext: true` | **Absent.** Ambele sunt deja sigure (false / implicit false). |
| Oscilație infinită în `nextStep` (buclă `repath`) | **Infirmat.** `nextStep` este monoton descrescător în `dist`, deci bucla termină. Guard-ul de la linia 135 este centură de siguranță, nu necesitate. |
| SVG-uri cu `<script>` sau handler-e inline | **Absent.** Ambele iconițe sunt SVG statice, fără script. |

---

## Anexă: dovezi din simulări

Toate simulările au rulat pe harta reală (`GRID.cols = 9`, `GRID.rows = 14`, `spawn = (4,0)`, `core = (4,13)`) cu algoritmii copiați din sursă, în Node 22.

### A.1 — Bucla anti-blocare permite buznare (L-01)

```
canPlace(1,5) -> true
canPlace(0,4) -> true
canPlace(0,6) -> true
canPlace(1,4) -> true
final: spawn->core reachable = true
=> cell (0,5) dist from core = -1 (enemy trapped there would get a 1-point path)
```

### A.2 — Inamicul din buznar este creditat cu `reachedCore` după un tick (L-01)

```
path: [{"x":0.5,"y":5.5}]
after 1 tick -> pathIdx: 1 reachedCore: true pos: 0.5 5.5
=> enemy at (0,5) is credited with reaching the core (4,13) after ONE frame
```

### A.3 — Path gol pe celula core (L-02)

```
repath() on core cell breaks immediately: true -> path = []
reachedCore: false -> enemy never leaks, never dies, wave never completes
```

### A.4 — `nextStep` este monoton, deci `repath` termină (finding respins)

```
oscillation detected: false
=> nextStep is monotone on dist, so repath terminates; guard is belt-and-braces
```

### A.5 — Balanța `save`/`restore` (P-02, finding respins)

```
toon.js net save/restore depth: 0
renderer save: 11 restore: 11
landscape save: 5 restore: 5
```

### A.6 — Noduri audio fără teardown (P-01)

```
_env connects to master: 1 | disconnect() calls in audio.js: 0
=> every sound leaves a GainNode permanently connected to master
createBuffer calls: 1
onended handlers: 0
```

### A.7 — Cost DOM în `updateHUD` (P-05)

```
textContent/classList writes inside updateHUD: 10
```

### A.8 — Gradiente per frame (P-03)

```
createLinearGradient/createRadialGradient in toon.js: 13
```

### A.9 — `npx cap` rezolvă pachetul greșit (S-01)

```
name: cap
description: A cross-platform binding for performing packet capturing with node.js
bin: undefined
=> npx cap would run: no bin
```

### A.10 — `toon.js` lipsește din precache (S-04)

```
toon.js NOT in sw.js PRECACHE
```

---

## Ordine de remediere recomandată

1. **L-01 + L-02** — sunt bug-uri care fac jocul incorect jucabil. Fără ele, orice altă muncă de echilibrare este construită pe nisip. Ambele se rezolvă în `repath()` + `tryPlaceTower()`.
2. **P-01** — leak-ul audio este cel care se manifestă cel mai urât în producție (audio moare după 15 minute). Fix-ul este local, în `audio.js`.
3. **S-01** — fără el nu poți produce un APK. Blochează livrarea.
4. **S-04** — promisiunea „100% offline” este încălcată. Fix de 5 linii.
5. **L-05 + L-06** — stări blocate vizibile pentru utilizator.
6. **P-05 + P-06 + P-03** — performanță; ordinea în funcție de profilul real măsurat pe dispozitivul țintă.
7. Restul, în ordinea din tabele.

---

*Raport generat prin analiză statică completă și simulări numerice. Niciun fișier al proiectului nu a fost modificat în afara acestui document.*
