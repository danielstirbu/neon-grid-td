# AGENTS.md — Neon Grid TD

## Rolul proiectului

`neon-grid-td` este un joc **Tower Defense** cu **Canvas 2D** și **Web Audio API**, **zero dependențe la runtime**, mobile-first (portrait), PWA 100% offline și pregătit pentru împachetare **Android/iOS prin Capacitor** (`webDir: "www"`, `androidScheme: "https"`). Toată grafica, arta și sunetul sunt procedurale și locale — fără CDN, fără fonturi externe, fără fișiere audio.

Structura web livește integral în `www/`; JavaScript-ul este ES modules native, fără bundler, fișiere sub ~450 linii (excepții actuale: `toon.js`, `landscape.js`, `main.js`).

## Workflow obligatoriu: dezvoltare pe bucăți (chunked development)

**Regula de aur: un task = o funcționalitate = un subsistem = un commit.**

1. **O singură funcționalitate / un singur subsistem per task.**
   Nu amesteca niciodată modificări mari de hartă sau logică de gameplay cu audio sau UI în același pas. Schimbi traseul? Nu atingi `audio.js` în același commit.
2. **Modificări chirurgicale.** Citește fișierul înainte, editează doar blocurile necesare. Nu rescrie fișiere întregi dacă nu e strict necesar. Gândește și răspunde scurt, concentrat pe diff.
3. **Înainte de codare** — citește obligatoriu:
   - [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — responsabilități pe fișier, bucla de joc, reguli de modularitate;
   - [`docs/BEST_PRACTICES.md`](docs/BEST_PRACTICES.md) — regulile de performanță mobilă, audio, securitate și anti-blocare pe care orice modificare nouă trebuie să le respecte.
4. **După codare** — obligatoriu, în această ordine:
   - `npm run check` (node --check pe toate modulele `www/js/`) trebuie să treacă;
   - un test scurt în `node` pe modulul atins (importă-l direct și verifică funcțiile pure — `config.js`, `pathfinding.js`, `waves.js` rulează fără DOM);
   - **șterge orice fișier temporar** creat pentru verificări (`/tmp`, `*.mjs` de probă, screenshot-uri);
   - actualizează `docs/ROADMAP.md` (mută taskul din Backlog în „Implementat & Verificat") și `docs/ARCHITECTURE.md` (dacă ai adăugat fișier, export sau regulă nouă);
   - **commit atomic** pe git, cu mesaj `type(scope): rezumat` (ex. `feat(audio): ...`, `fix(pathfinding): ...`).
5. **Testul Playwright** (`npm run test`) rulează doar dacă `playwright` este instalat (`npm i -D playwright && npx playwright install chromium`). Lipsa lui nu blochează un commit — `npm run check` + testul Node pe modul rămân obligatorii.

## Index documentație

| Fișier | Conținut |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Fiecare fișier din `www/js/` + `sw.js`: responsabilitate, API, dependențe; diagrama buclei `frame() → step() → render() → updateHUD()`, sistemul de coordonate/flow-field, fluxul de input/UI; reguli de modularitate (turn/inamic/hartă/sunet noi) |
| [`docs/BEST_PRACTICES.md`](docs/BEST_PRACTICES.md) | Regulile P-03…P-10 (performanță 60 FPS), P-01/P-04 (audio Web Audio), S-01/S-02/S-04/S-07 (securitate & PWA offline), L-01…L-12 (anti-blocare & corectitudine gameplay) |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Ce este implementat și verificat (audit 28 findings + etape) și backlog-ul modular pe etapele A–E, 1 task = 1 commit |
| [`AUDIT_REPORT.md`](AUDIT_REPORT.md) | Raportul complet de audit (sursele regulilor din `BEST_PRACTICES.md`) |
| [`PROMPT.md`](PROMPT.md) | Specificația originală a jocului |

## Comenzi

```bash
npm run serve        # server HTTP static pe 8002 (www/)
npm run check        # node --check pe toate modulele — RULEAZĂ DUPĂ ORICE MODIFICARE
npm run test         # smoke-test Playwright (necesită playwright instalat)
npm run verify       # check + test
npm run cap:android  # adaugă platforma Android (binarul local @capacitor/cli)
```
