# PROMPT.md — Neon Grid TD (Android & iOS Mobile-First Tower Defense)

## 1. Rol, Obiectiv și Reguli de Execuție

Ești un Senior Game & Mobile Web Engineer. Construiește de la zero **Neon Grid TD**, un joc Tower Defense complet, fluid, cu estetică cyberpunk/neon, proiectat **Mobile-First (Portrait 9:16 / 9:20)** pentru **Android** și **iOS** (PWA instalabil + arhitectură pregătită pentru Capacitor `.apk` / `.ipa`), dar complet jucabil și pe desktop (mouse + touch).

### Reguli critice pentru fluxul de lucru (anti-timeout & modularitate):
1. **ZERO dependințe externe la runtime:** Nu folosi CDN-uri, fonturi externe, imagini externe sau fișiere `.mp3`/`.wav`. Totul (grafică Canvas 2D, iconițe PWA SVG/PNG generate local, efecte sonore Web Audio API) trebuie să fie 100% local și offline-ready.
2. **Scriere modulară (fișiere sub ~350–450 linii fiecare):** Nu genera un singur fișier gigant de 3.000 de linii într-un singur tool call. Împarte codul în module ES curat decuplate în directorul `www/js/` (fără bundler necesar, încărcate nativ cu `<script type="module" src="js/main.js"></script>`).
3. **Director web dedicat (`www/`):** Toate fișierele aplicației web/PWA (`index.html`, `style.css`, `manifest.json`, `sw.js`, `icons/`, `js/`) stau în `www/`, astfel încât atât un server HTTP static, cât și **Capacitor** (`webDir: "www"`) să le poată împacheta direct pentru Android și iOS.
4. **Automatizare Git & Validare:** După implementare, rulează obligatoriu suitele de verificare automată (sintaxă JS + Playwright smoke-test pe viewport mobil `390x844` și desktop `1280x800`), pornește serverul HTTP pe portul `8002` și fă `git push -u origin main` în repository-ul `danielstirbu/neon-grid-td`.

---

## 2. Structura Exactă a Proiectului

```text
neon-grid-td/
├── PROMPT.md                  # Acest document de specificații
├── README.md                  # Documentație, instrucțiuni Android/iOS PWA & Capacitor
├── DECISIONS.md               # Decizii tehnice (pathfinding, combat, mobile UX, audio)
├── package.json               # Metadata proiect + scripturi test/capacitor
├── capacitor.config.json      # Configurare gata pentru `npx cap add android` / `ios`
├── tools/
│   └── smoke-test.mjs         # Test automat Playwright (mobile touch + desktop + zero erori)
└── www/
    ├── index.html             # Structură HTML5 semantică, viewport-fit=cover, overlay-uri
    ├── style.css              # Layout Mobile-First flex/grid, safe-area-inset, neon theme
    ├── manifest.json          # Web App Manifest (standalone, portrait, icons)
    ├── sw.js                  # Service Worker (cache-first pentru funcționare 100% offline)
    ├── icons/
    │   ├── icon-192.svg       # Iconiță vectorială neon 192x192
    │   ├── icon-512.svg       # Iconiță vectorială neon 512x512
    │   └── icon-180.png       # Iconiță PNG apple-touch-icon pentru iOS (generată local)
    └── js/
        ├── config.js          # Constante echilibrare: turnuri, inamici, valuri, culori, upgrade-uri
        ├── audio.js           # Sinteză procedurală Web Audio API + deblocare iOS la primul tap
        ├── pathfinding.js     # Algoritm BFS/A* dinamic + validare anti-blocare traseu
        ├── entities.js        # Clase: Tower, Enemy, Projectile, Beam, Particle, FloatingText
        ├── waves.js           # Generator valuri (20 valuri + Boss la fiecare 5 valuri + Endless mode)
        ├── renderer.js        # Randare Canvas 2D la DPR nativ (retina), grid, range preview, VFX
        ├── ui.js              # Controller HUD, dock turnuri, meniu contextual upgrade/sell, vibrații
        └── main.js            # Game loop cu fixed/clamped `dt`, input Pointer Events, state machine
