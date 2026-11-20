// ui.js — HUD bindings, tower dock, road-piece dock + rotate, contextual menu, toasts, haptics.
import { TOWERS, TOWER_ORDER, ECONOMY, TILE_PIECES } from './config.js';
import { audio } from './audio.js';

const $ = (id) => document.getElementById(id);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function safeColor(value) {
  return HEX_COLOR.test(String(value)) ? value : 'inherit';
}

export class UI {
  constructor(game) {
    this.game = game;
    this.els = {
      wave: $('hud-wave'), cash: $('hud-cash'), core: $('hud-core'),
      coreStat: $('stat-core'),
      btnPause: $('btn-pause'), btnSpeed: $('btn-speed'), btnSound: $('btn-sound'),
      dock: $('tower-dock'), nextWave: $('btn-next-wave'),
      pieceCards: $('piece-cards'), btnRotate: $('btn-rotate'),
      menu: $('tower-menu'), tmTitle: $('tm-title'), tmStats: $('tm-stats'),
      tmUpgrade: $('tm-upgrade'), tmUpCost: $('tm-up-cost'), tmSell: $('tm-sell'),
      tmSellVal: $('tm-sell-val'), tmTarget: $('tm-target'), tmClose: $('tm-close'),
      screenStart: $('screen-start'), screenOver: $('screen-over'),
      pauseOverlay: $('screen-pause'), btnResume: $('btn-resume'),
      btnPlay: $('btn-play'), btnEndless: $('btn-endless'),
      overTitle: $('over-title'), overDetail: $('over-detail'),
      btnRetry: $('btn-retry'), btnMenu: $('btn-menu'),
      toast: $('toast'), banner: $('wave-banner'),
    };
    this.selectedTowerKey = null;
    this.toastTimer = 0;
    this._buildDock();
    this._buildPieceDock();
    this._bind();
  }

  vibrate(ms) {
    if (navigator.vibrate) {
      try { navigator.vibrate(ms); } catch { /* unsupported */ }
    }
  }

  _buildDock() {
    this.dockCards = {};
    for (const key of TOWER_ORDER) {
      const t = TOWERS[key];
      const card = document.createElement('button');
      card.className = 'tower-card';
      // Build nodes via the DOM API: no HTML string interpolation, so a hostile
      // name/glyph cannot inject markup and a hostile color cannot inject CSS.
      const glyph = document.createElement('span');
      glyph.className = 'glyph';
      glyph.textContent = t.glyph;
      glyph.style.color = safeColor(t.color);
      const label = document.createElement('span');
      label.textContent = t.name.split(' ')[0].toUpperCase();
      const cost = document.createElement('span');
      cost.className = 'cost';
      cost.textContent = `¤${t.cost}`;
      card.append(glyph, label, cost);
      card.title = `${t.name} — ${t.desc}`;
      card.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.toggleTowerSelect(key);
      });
      this.els.dock.appendChild(card);
      this.dockCards[key] = card;
    }
  }

  _buildPieceDock() {
    // Two queued-piece cards + a rotate button; built once, refreshed on change.
    this.pieceCards = [];
    for (let i = 0; i < ECONOMY.pieceHandSize; i++) {
      const card = document.createElement('button');
      card.className = 'piece-card';
      const glyph = document.createElement('span');
      glyph.className = 'glyph';
      const label = document.createElement('span');
      const rot = document.createElement('span');
      rot.className = 'rot-hint';
      card.append(glyph, label, rot);
      card.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.game.selectPiece(i);
      });
      this.els.pieceCards.appendChild(card);
      this.pieceCards.push({ card, glyph, label, rot, key: null });
    }
  }

  refreshPieceDock(game) {
    for (let i = 0; i < this.pieceCards.length; i++) {
      const entry = this.pieceCards[i];
      const key = game.roadHand ? game.roadHand[i] : null;
      const piece = key ? TILE_PIECES[key] : null;
      if (entry.key !== key) {
        entry.key = key;
        entry.glyph.textContent = piece ? piece.glyph : '·';
        entry.label.textContent = piece ? piece.name.toUpperCase() : 'EMPTY';
      }
      const selected = game.selectedPiece === i;
      entry.card.classList.toggle('selected', selected);
      entry.card.classList.toggle('disabled', !piece);
      const rotTxt = selected ? `↻ ${game.pieceRotation}×90°` : (piece ? `${piece.size} CEL` : '');
      if (entry.rot.textContent !== rotTxt) entry.rot.textContent = rotTxt;
    }
    if (this.els.btnRotate) {
      this.els.btnRotate.disabled = game.selectedPiece === null;
    }
  }

  _bind() {
    const { els } = this;
    els.nextWave.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      audio.unlock();
      this.game.startNextWave(true); // early start → small cash bonus
    });
    els.btnRotate?.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      audio.unlock();
      this.game.rotateSelectedPiece();
    });
    els.btnPause.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      audio.unlock();
      this.game.togglePause();
    });
    els.btnSpeed.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      audio.unlock();
      this.game.toggleSpeed();
    });
    els.btnSound.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.game.toggleSound();
    });
    els.tmClose.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.closeTowerMenu();
    });
    els.btnResume?.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      audio.unlock();
      this.game.togglePause();
    });
    els.tmUpgrade.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.game.upgradeSelected();
    });
    els.tmSell.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.game.sellSelected();
    });
    els.tmTarget.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.game.cycleSelectedTarget();
    });
    els.btnPlay.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      audio.unlock();
      this.game.begin(false);
    });
    els.btnEndless.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      audio.unlock();
      this.game.begin(true);
    });
    els.btnRetry.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.game.retry();
    });
    els.btnMenu.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.game.toMenu();
    });
  }

  toggleTowerSelect(key) {
    audio.unlock();
    audio.play('tap');
    this.vibrate(8);
    this.selectedTowerKey = this.selectedTowerKey === key ? null : key;
    for (const [k, card] of Object.entries(this.dockCards)) {
      card.classList.toggle('selected', k === this.selectedTowerKey);
    }
    if (this.selectedTowerKey) {
      this.game.clearSelectedTower();
      this.game.clearPieceSelect();
    }
    this.game.requestRender();
  }

  clearTowerSelect() {
    this.selectedTowerKey = null;
    for (const card of Object.values(this.dockCards)) card.classList.remove('selected');
  }

  openTowerMenu(tower) {
    const { els } = this;
    this.menuTower = tower;
    els.menu.classList.remove('hidden');
    this.refreshTowerMenu();
  }

  refreshTowerMenu() {
    const t = this.menuTower;
    if (!t) return;
    const { els } = this;
    const s = t.stats;
    els.tmTitle.textContent = `${t.def.glyph} ${t.def.name}`;
    els.tmStats.textContent = `Lv.${t.level} · DMG ${s.damage} · RNG ${s.range.toFixed(1)} · ROF ${s.fireRate.toFixed(2)}/s`;
    if (t.canUpgrade) {
      els.tmUpgrade.disabled = this.game.cash < t.upgradeCost;
      els.tmUpCost.textContent = `¤${t.upgradeCost}`;
    } else {
      els.tmUpgrade.disabled = true;
      els.tmUpCost.textContent = 'MAX';
    }
    els.tmSellVal.textContent = `¤${t.sellValue}`;
    els.tmTarget.textContent = `TARGET: ${t.targetModeName}`;
  }

  closeTowerMenu() {
    this.menuTower = null;
    this.els.menu.classList.add('hidden');
    this.game.clearSelectedTower();
    this.game.requestRender();
  }

  updateHUD(game) {
    // P-05: write the DOM only when something actually changed (was 60 Hz).
    const { els } = this;
    const cd = game.waveCountdown !== undefined && !game.waveActive ? Math.ceil(game.waveCountdown) : -1;
    const hand = game.roadHand ? game.roadHand.join(',') : '';
    const sig = `${game.wave}|${game.cash}|${game.core}|${game.endless}|${game.waveActive}|` +
      `${game.state}|${game.paused}|${game.speedIndex}|${audio.enabled}|${game.totalWaves}|${cd}|${hand}` +
      `|${game.selectedPiece}|${game.pieceRotation}` +
      (this.menuTower ? `|${this.menuTower.level}${this.menuTower.targetMode}` : '');
    if (sig === this._hudSig) return;
    this._hudSig = sig;
    this.refreshPieceDock(game);

    const waveTxt = game.endless ? `∞ ${game.wave}` : `${game.wave}/${game.totalWaves}`;
    if (waveTxt !== this._waveTxt) { els.wave.textContent = waveTxt; this._waveTxt = waveTxt; }
    if (this._cash !== game.cash) {
      els.cash.textContent = game.cash;
      this._cash = game.cash;
      for (const key of TOWER_ORDER) {
        this.dockCards[key].classList.toggle('unaffordable', game.cash < TOWERS[key].cost);
      }
    }
    if (this._core !== game.core) {
      els.core.textContent = game.core;
      els.coreStat.classList.toggle('low', game.core <= 5);
      this._core = game.core;
    }
    const disabled = game.waveActive || game.state !== 'playing';
    if (this._nextDisabled !== disabled) { els.nextWave.disabled = disabled; this._nextDisabled = disabled; }
    let nextTxt;
    if (game.wave === 0) nextTxt = 'START WAVE ▸';
    else if (game.wave >= game.totalWaves && !game.endless) nextTxt = 'FINAL ▸';
    else nextTxt = `WAVE ${game.wave + 1} ▸`;
    // Countdown label: the auto-wave clock is armed between waves.
    if (!disabled && game.countdownArmed) {
      nextTxt = `NEXT WAVE IN ${Math.max(1, Math.ceil(game.waveCountdown))}s ▸`;
    }
    if (nextTxt !== this._nextTxt) { els.nextWave.textContent = nextTxt; this._nextTxt = nextTxt; }
    const pauseTxt = game.paused ? '▶' : '❚❚';
    if (pauseTxt !== this._pauseTxt) { els.btnPause.textContent = pauseTxt; this._pauseTxt = pauseTxt; }
    const hot = game.speedIndex > 0;
    if (this._hot !== hot) {
      els.btnSpeed.textContent = hot ? '▶▶' : '▶';
      els.btnSpeed.classList.toggle('hot', hot);
      this._hot = hot;
    }
    const muted = !audio.enabled;
    if (this._muted !== muted) { els.btnSound.classList.toggle('off', muted); this._muted = muted; }
    if (this.menuTower) this.refreshTowerMenu();
  }

  showBanner(text) {
    const b = this.els.banner;
    b.textContent = text;
    b.classList.remove('hidden');
    // restart animation
    b.style.animation = 'none';
    void b.offsetWidth;
    b.style.animation = '';
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => b.classList.add('hidden'), 1650);
  }

  toast(msg) {
    const t = this.els.toast;
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.add('hidden'), 1400);
  }

  showStart() {
    this.els.screenStart.classList.remove('hidden');
    this.els.screenOver.classList.add('hidden');
    this.closeTowerMenuSilent();
  }

  hideStart() {
    this.els.screenStart.classList.add('hidden');
  }

  showOver(title, detail) {
    this.els.overTitle.textContent = title;
    this.els.overDetail.textContent = detail;
    this.els.screenOver.classList.remove('hidden');
    this.closeTowerMenuSilent();
    this.hidePauseOverlay();
  }

  hideOver() {
    this.els.screenOver.classList.add('hidden');
  }

  showPauseOverlay() {
    if (!this.els.pauseOverlay) return;
    this.els.pauseOverlay.classList.remove('hidden');
  }

  hidePauseOverlay() {
    if (!this.els.pauseOverlay) return;
    this.els.pauseOverlay.classList.add('hidden');
  }

  closeTowerMenuSilent() {
    this.menuTower = null;
    this.els.menu.classList.add('hidden');
  }

  // Keep ECONOMY import meaningful for external tuning consumers.
  static sellRatio = ECONOMY.sellRatio;
}
