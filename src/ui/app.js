// Knotenpunkt - Oberflaeche und Spielablauf.

import { createGame, occupancy, standings, majority } from '../engine/state.js';
import { resolve } from '../engine/resolver.js';
import { botOrders, mulberry32 } from '../engine/bots.js';
import { TYPES, TYPE_INFO, PLAYER_NAMES } from '../engine/rules.js';
import { boardSvg } from './board.js';
import { describeEvent, nodeName, winnerText } from './text.js';
import { rulesHtml } from './rules-text.js';
import {
  viewOnlineStart, viewOnlineSetup, viewOnlineErstellen, viewOnlineBeitreten,
  viewLobby, viewWarten, viewOnlineBot, viewVerbinden, REGELN_TEXT,
} from './online-views.js';
import { OnlineSitzung } from '../net/online.js';
import {
  aktiveConfig, speichereConfig, parseEingabe, configInLink, configAusLink, FEST,
} from '../net/config.js';
import { normalisiereCode } from '../net/room.js';

const SAVE_KEY = 'knotenpunkt.spielstand.v2';
const ONLINE_KEY = 'knotenpunkt.online.v1';
const root = document.getElementById('app');

const app = {
  screen: 'menu',
  game: null,
  setup: {
    playerCount: 3,
    teams: false,
    seats: [
      { human: true, level: 'normal' },
      { human: false, level: 'normal' },
      { human: false, level: 'normal' },
      { human: false, level: 'normal' },
      { human: false, level: 'normal' },
      { human: false, level: 'normal' },
    ],
  },
  pending: {},        // playerId -> {unitOrders, builds}
  queue: [],          // menschliche Spieler dieser Runde
  queueIndex: 0,
  working: null,      // Befehle des gerade aktiven Spielers
  selection: null,    // {unitId, mode}
  lastResult: null,   // {events, orders, before}
  previousScreen: 'menu',

  // Online
  online: null,       // OnlineSitzung, solange eine Netzpartie laeuft
  onlineForm: { name: '', code: '', fehler: null, entwurf: '', laedt: false, kopiert: false },
  gesehenBis: 0,      // bis zu dieser Runde wurde die Auswertung schon angeschaut
  ansicht: null,      // {runde, stufe:'reveal'|'ergebnis'} beim Nachschauen
  wartenSeit: 0,
};

// ---------------------------------------------------------------- Speichern
function save() {
  if (app.online) return; // Online liegt der Spielstand in der Datenbank
  try {
    if (!app.game) { localStorage.removeItem(SAVE_KEY); return; }
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      game: app.game, pending: app.pending, queue: app.queue,
      queueIndex: app.queueIndex, working: app.working, screen: app.screen,
      lastResult: app.lastResult, setup: app.setup,
    }));
  } catch (_) { /* privater Modus: dann eben ohne Speichern */ }
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function resume() {
  const d = loadSaved();
  if (!d || !d.game) return false;
  Object.assign(app, {
    game: d.game, pending: d.pending || {}, queue: d.queue || [],
    queueIndex: d.queueIndex || 0, working: d.working || null,
    screen: d.screen || 'orders', lastResult: d.lastResult || null,
    setup: d.setup || app.setup, selection: null,
  });
  if (app.screen === 'menu') app.screen = 'orders';
  return true;
}

// ------------------------------------------------------------- Spielablauf
function newGame() {
  const s = app.setup;
  const seats = s.seats.slice(0, s.playerCount);
  const teams = s.teams
    ? seats.map((_, i) => i % 2)            // Partner sitzen sich gegenueber
    : seats.map((_, i) => i);
  app.game = createGame({
    playerCount: s.playerCount,
    teams,
    players: seats.map((seat, i) => ({
      name: PLAYER_NAMES[i],
      isBot: !seat.human,
      botLevel: seat.level,
    })),
  });
  app.game.botSeed = Math.floor(Math.random() * 1e9);
  app.pending = {};
  app.lastResult = null;
  startRound();
}

function startRound() {
  app.pending = {};
  app.selection = null;
  app.queue = app.game.players.filter((p) => !p.isBot && !p.eliminated).map((p) => p.id);
  app.queueIndex = 0;
  if (app.queue.length === 0) {
    app.working = null;
    app.screen = 'reveal';
    collectBotOrders();
  } else {
    beginTurn();
  }
  save();
  render();
}

function beginTurn() {
  app.working = { unitOrders: {}, builds: {} };
  app.selection = null;
  // Bei nur einem Menschen gibt es nichts geheim zu halten.
  app.screen = app.queue.length > 1 ? 'pass' : 'orders';
}

function currentPlayer() {
  if (app.online) return app.game.players[app.online.sitz];
  return app.game.players[app.queue[app.queueIndex]];
}

function finishTurn() {
  if (app.online) { sendeOnlineBefehle(); return; }
  app.pending[currentPlayer().id] = app.working;
  app.queueIndex += 1;
  if (app.queueIndex < app.queue.length) {
    beginTurn();
  } else {
    collectBotOrders();
    app.screen = 'reveal';
  }
  save();
  render();
}

function collectBotOrders() {
  const g = app.game;
  for (const p of g.players) {
    if (!p.isBot || p.eliminated) continue;
    const rng = mulberry32((g.botSeed || 1) + g.round * 7919 + p.id * 104729);
    app.pending[p.id] = botOrders(g, p.id, p.botLevel, rng);
  }
}

function mergedOrders() {
  const unitOrders = {};
  const builds = {};
  for (const pid in app.pending) {
    Object.assign(unitOrders, app.pending[pid].unitOrders || {});
    Object.assign(builds, app.pending[pid].builds || {});
  }
  return { unitOrders, builds };
}

function doResolve() {
  const before = app.game;
  const merged = mergedOrders();
  const res = resolve(before, merged);
  app.lastResult = { events: res.events, orders: merged.unitOrders, before };
  app.game = res.state;
  app.screen = 'result';
  save();
  render();
}

function nextRound() {
  if (app.game.phase === 'finished') {
    app.screen = 'gameover';
    save();
    render();
    return;
  }
  startRound();
}

// ------------------------------------------------------------- Befehlslogik
function setOrder(unitId, order) {
  if (!order || order.action === 'halten') delete app.working.unitOrders[unitId];
  else app.working.unitOrders[unitId] = order;
  app.selection = null;
  save();
  render();
}

function handleNodeTap(nodeId) {
  if (app.screen !== 'orders') return;
  const g = app.game;
  const occ = occupancy(g);
  const me = currentPlayer().id;
  const sel = app.selection;

  if (sel && sel.mode) {
    const valid = validTargets(sel.unitId, sel.mode);
    if (valid.includes(nodeId)) {
      setOrder(sel.unitId, { action: sel.mode, target: nodeId });
      return;
    }
  }
  const u = occ[nodeId];
  if (u && u.owner === me) {
    app.selection = { unitId: u.id, mode: null };
  } else {
    app.selection = null;
  }
  render();
}

function validTargets(unitId, mode) {
  const g = app.game;
  const u = g.units[unitId];
  if (!u) return [];
  const occ = occupancy(g);
  const nbs = g.board.nodes[u.node].neighbors;
  if (mode === 'bewegen') return nbs;
  return nbs.filter((nb) => {
    const o = occ[nb];
    return o && g.players[o.owner].team === g.players[u.owner].team;
  });
}

// --------------------------------------------------------------- Online-Teil

function letzterRaum() {
  try { return localStorage.getItem(ONLINE_KEY) || null; } catch (_) { return null; }
}

function merkeRaum(code) {
  try {
    if (code) localStorage.setItem(ONLINE_KEY, code);
    else localStorage.removeItem(ONLINE_KEY);
  } catch (_) { /* privater Modus */ }
}

function einladungsLink(code) {
  const basis = location.origin + location.pathname;
  const festDa = !!(FEST.apiKey && FEST.databaseURL && FEST.projectId);
  const cfg = aktiveConfig();
  const anhang = festDa || !cfg ? '' : `&c=${configInLink(cfg)}`;
  return `${basis}#r=${code}${anhang}`;
}

function verlaufEintrag(runde) {
  return app.online.verlauf.find((v) => v.runde === runde) || null;
}

/** Spielstand direkt nach der genannten Runde. */
function zustandNach(runde) {
  const naechster = app.online.verlauf.find((v) => v.runde === runde + 1);
  return naechster ? naechster.before : app.online.spiel;
}

/** Wird bei jeder Aenderung im Raum aufgerufen. */
function onlineAktualisiert(s) {
  app.online = s;
  if (s.phase === 'lobby') {
    app.screen = 'lobby';
    render();
    return;
  }
  if (!s.spiel) return;
  app.game = s.spiel;
  // Beim Einsteigen in eine laufende Partie nicht alle alten Runden nachspielen.
  if (!app.onlineInit) {
    app.onlineInit = true;
    if (s.verlauf.length) app.gesehenBis = s.verlauf[s.verlauf.length - 1].runde;
  }
  if (app.screen === 'regeln') return; // niemanden aus dem Regelheft werfen
  waehleOnlineBildschirm();
  render();
}

function waehleOnlineBildschirm() {
  const s = app.online;

  // Erst anschauen, was seit dem letzten Mal passiert ist.
  const offen = s.verlauf.find((v) => v.runde > app.gesehenBis);
  if (offen) {
    if (!app.ansicht || app.ansicht.runde !== offen.runde) {
      app.ansicht = { runde: offen.runde, stufe: 'reveal' };
    }
    app.screen = app.ansicht.stufe === 'reveal' ? 'online-reveal' : 'online-result';
    return;
  }
  app.ansicht = null;

  if (s.spiel.phase === 'finished') { app.screen = 'gameover'; return; }
  if (!s.binAmZug()) { app.screen = 'online-bot'; return; }

  // Ausgeschiedene haben nichts zu befehlen, muessen die Runde aber freigeben.
  const ich = s.spiel.players[s.sitz];
  if (ich?.eliminated && !s.habeAbgegeben() && app.autoSendeRunde !== s.spiel.round) {
    app.autoSendeRunde = s.spiel.round;
    sendeOnlineBefehle({ unitOrders: {}, builds: {} });
    app.screen = 'warten';
    return;
  }

  if (s.habeAbgegeben()) {
    if (!app.wartenSeit) app.wartenSeit = Date.now();
    app.screen = 'warten';
    return;
  }

  app.wartenSeit = 0;
  if (app.workingRunde !== s.spiel.round) {
    app.working = { unitOrders: {}, builds: {} };
    app.workingRunde = s.spiel.round;
    app.selection = null;
  }
  app.screen = 'orders';
}

async function sendeOnlineBefehle(orders) {
  try {
    await app.online.sendeBefehle(orders || app.working);
    app.wartenSeit = Date.now();
  } catch (e) {
    app.onlineForm.fehler = e?.message || 'Die Befehle konnten nicht gesendet werden.';
    render();
  }
}

/** Fuehrt eine Netzaktion aus und zeigt Fehler an, statt abzustuerzen. */
async function netz(fn, zurueckAuf) {
  app.onlineForm.laedt = true;
  app.onlineForm.fehler = null;
  render();
  try {
    await fn();
  } catch (e) {
    app.onlineForm.fehler = e?.message || 'Unerwarteter Fehler.';
    if (zurueckAuf) app.screen = zurueckAuf;
    if (app.online) { app.online.stoppe(); app.online = null; }
  } finally {
    app.onlineForm.laedt = false;
    render();
  }
}

function neueSitzung() {
  const cfg = aktiveConfig();
  if (!cfg) throw new Error('Die Zugangsdaten fehlen noch.');
  if (app.online) app.online.stoppe();
  app.onlineInit = false;
  app.gesehenBis = 0;
  app.ansicht = null;
  app.wartenSeit = 0;
  app.workingRunde = null;
  return new OnlineSitzung(cfg, onlineAktualisiert);
}

function verlasseOnline() {
  if (app.online) app.online.stoppe();
  app.online = null;
  app.game = null;
  app.ansicht = null;
  app.onlineInit = false;
  app.wartenSeit = 0;
  app.workingRunde = null;
  app.onlineForm.fehler = null;
  app.screen = 'menu';
  render();
}

async function kopiere(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) { return false; }
}

// ------------------------------------------------------------------ Aktionen
const actions = {
  'neues-spiel': () => {
    if (app.online) { app.online.stoppe(); app.online = null; app.game = null; }
    app.screen = 'menu';
    render();
  },
  'starten': () => { newGame(); },
  'fortsetzen': () => { if (resume()) render(); },
  'regeln': () => { app.previousScreen = app.screen; app.screen = 'regeln'; render(); },
  'zurueck': () => {
    if (app.online?.spiel) waehleOnlineBildschirm();
    else app.screen = app.previousScreen || 'menu';
    render();
  },
  'spielerzahl': (d) => {
    app.setup.playerCount = Number(d.wert);
    if (app.setup.playerCount % 2 !== 0) app.setup.teams = false;
    render();
  },
  'modus': (d) => { app.setup.teams = d.wert === 'teams'; render(); },
  'sitz-typ': (d) => {
    const seat = app.setup.seats[Number(d.index)];
    seat.human = d.wert === 'mensch';
    render();
  },
  'sitz-stufe': (d) => {
    app.setup.seats[Number(d.index)].level = d.wert;
    render();
  },
  'uebernehmen': () => { app.screen = 'orders'; render(); },
  'modus-bewegen': () => { app.selection = { ...app.selection, mode: 'bewegen' }; render(); },
  'modus-stuetzen': () => { app.selection = { ...app.selection, mode: 'unterstuetzen' }; render(); },
  'halten': () => setOrder(app.selection.unitId, { action: 'halten' }),
  'abwaehlen': () => { app.selection = null; render(); },
  'bauen': (d) => {
    const me = currentPlayer().id;
    if (app.working.builds[me] === d.wert) delete app.working.builds[me];
    else app.working.builds[me] = d.wert;
    save();
    render();
  },
  'befehle-fertig': () => finishTurn(),
  'auswerten': () => doResolve(),
  'weiter': () => nextRound(),
  'aufgeben': () => {
    if (app.online) { actions['online-verlassen'](); return; }
    if (confirm('Partie wirklich beenden?')) {
      app.game = null;
      app.screen = 'menu';
      localStorage.removeItem(SAVE_KEY);
      render();
    }
  },

  // ------------------------------------------------------------------ Online
  'online': () => { app.onlineForm.fehler = null; app.screen = 'online'; render(); },
  'online-einrichten': () => {
    app.onlineForm.fehler = null;
    app.screen = 'online-setup';
    render();
  },
  'online-config-speichern': () => {
    const text = document.getElementById('fb-eingabe')?.value || app.onlineForm.entwurf;
    const { config, fehler } = parseEingabe(text);
    if (!config) { app.onlineForm.fehler = fehler; render(); return; }
    speichereConfig(config);
    app.onlineForm.fehler = null;
    app.onlineForm.entwurf = '';
    app.screen = 'online';
    render();
  },
  'regeln-kopieren': async () => {
    const ok = await kopiere(REGELN_TEXT);
    app.onlineForm.fehler = ok ? null : 'Kopieren hat nicht geklappt — bitte von Hand markieren.';
    render();
  },
  'online-erstellen-form': () => { app.onlineForm.fehler = null; app.screen = 'online-erstellen'; render(); },
  'online-beitreten-form': () => { app.onlineForm.fehler = null; app.screen = 'online-beitreten'; render(); },

  'online-erstellen': () => netz(async () => {
    const s = neueSitzung();
    const code = await s.erstelleRaum({
      playerCount: app.setup.playerCount,
      teams: app.setup.teams,
      name: app.onlineForm.name.trim(),
    });
    app.online = s;
    merkeRaum(code);
    app.screen = 'lobby';
  }, 'online-erstellen'),

  'online-beitreten': () => netz(async () => {
    const code = normalisiereCode(app.onlineForm.code);
    if (code.length < 4) throw new Error('Bitte den Raumcode eingeben.');
    const s = neueSitzung();
    await s.betreteRaum(code, app.onlineForm.name.trim());
    app.online = s;
    merkeRaum(code);
  }, 'online-beitreten'),

  'online-fortsetzen': (d) => netz(async () => {
    const s = neueSitzung();
    await s.betreteRaum(normalisiereCode(d.code), app.onlineForm.name.trim());
    app.online = s;
  }, 'online'),

  'online-teilen': async () => {
    const link = einladungsLink(app.online.code);
    const text = `Spiel mit mir Knotenpunkt! Raum ${app.online.code}:`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Knotenpunkt', text, url: link }); return; }
      catch (_) { /* abgebrochen: dann eben kopieren */ }
    }
    app.onlineForm.kopiert = await kopiere(link);
    render();
    setTimeout(() => { app.onlineForm.kopiert = false; if (app.screen === 'lobby') render(); }, 2500);
  },

  'online-starten': () => netz(async () => { await app.online.startePartie(); }),

  'online-bot-uebernahme': (d) => netz(async () => {
    await app.online.uebernimmBot(Number(d.seat));
  }),

  'online-ergebnis': () => { app.ansicht.stufe = 'ergebnis'; app.screen = 'online-result'; render(); },
  'online-weiter': () => {
    app.gesehenBis = app.ansicht.runde;
    app.ansicht = null;
    waehleOnlineBildschirm();
    render();
  },

  'online-verlassen': () => {
    if (confirm('Raum verlassen? Die Partie läuft ohne dich weiter.')) verlasseOnline();
  },
};

root.addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-action]');
  if (btn) {
    const fn = actions[btn.dataset.action];
    if (fn) { ev.preventDefault(); fn(btn.dataset); }
    return;
  }
  const node = ev.target.closest('[data-node]');
  if (node) { ev.preventDefault(); handleNodeTap(node.dataset.node); }
});

// Eingaben mitschreiben, damit sie ein Neuzeichnen ueberleben.
root.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.id === 'online-name') app.onlineForm.name = el.value;
  else if (el.id === 'online-code') app.onlineForm.code = el.value;
  else if (el.id === 'fb-eingabe') app.onlineForm.entwurf = el.value;
});

// ------------------------------------------------------------------ Rendern
function render() {
  const f = app.onlineForm;
  const html = {
    menu: viewMenu,
    pass: viewPass,
    orders: viewOrders,
    reveal: () => viewReveal(app.game, mergedOrders()),
    result: () => viewResult(app.game, app.lastResult),
    gameover: viewGameOver,
    regeln: viewRules,

    verbinden: () => viewVerbinden({ text: f.fehler || 'Verbinde…' }),
    online: () => viewOnlineStart({
      eingerichtet: !!aktiveConfig(), letzterRaum: letzterRaum(), fehler: f.fehler,
    }),
    'online-setup': () => viewOnlineSetup({ fehler: f.fehler, entwurf: f.entwurf }),
    'online-erstellen': () => viewOnlineErstellen({
      setup: app.setup, name: f.name, fehler: f.fehler, laedt: f.laedt,
    }),
    'online-beitreten': () => viewOnlineBeitreten({
      code: f.code, name: f.name, fehler: f.fehler, laedt: f.laedt,
    }),
    lobby: () => viewLobby({
      sitzung: app.online, link: einladungsLink(app.online.code),
      teams: !!app.online.raum.meta?.teams, kopiert: f.kopiert, fehler: f.fehler,
    }),
    warten: () => viewWarten({
      sitzung: app.online,
      statusHtml: statusBar(app.game, app.online.sitz),
      brettHtml: boardSvg({
        state: app.game, orders: app.working?.unitOrders || {},
        viewerId: app.online.sitz, showOrdersOf: app.online.sitz,
      }),
      wartetSeit: app.wartenSeit ? Date.now() - app.wartenSeit : 0,
    }),
    'online-bot': () => viewOnlineBot({
      sitzung: app.online,
      statusHtml: statusBar(app.game, app.online.sitz),
      brettHtml: boardSvg({ state: app.game, orders: {}, viewerId: app.online.sitz, showOrdersOf: null }),
    }),
    'online-reveal': () => {
      const v = verlaufEintrag(app.ansicht.runde);
      return viewReveal(v.before, { unitOrders: v.orders, builds: v.builds }, true);
    },
    'online-result': () => {
      const v = verlaufEintrag(app.ansicht.runde);
      return viewResult(zustandNach(v.runde), { events: v.events, orders: v.orders, before: v.before }, true);
    },
  }[app.screen];
  root.innerHTML = html ? html() : viewMenu();
  root.scrollTop = 0;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function viewMenu() {
  const s = app.setup;
  const hasSave = !!loadSaved();
  const counts = [2, 3, 4, 5, 6].map((n) => `
    <button class="chip ${s.playerCount === n ? 'aktiv' : ''}" data-action="spielerzahl" data-wert="${n}">${n}</button>`).join('');
  const seats = s.seats.slice(0, s.playerCount).map((seat, i) => `
    <div class="sitz">
      <span class="punkt" style="background:${['#e4572e','#2e86ab','#3fa34d','#d9a404','#8e5ea2','#00a6a6'][i]}"></span>
      <strong>${PLAYER_NAMES[i]}</strong>
      ${s.teams ? `<span class="team-tag">Team ${i % 2 + 1}</span>` : ''}
      <div class="segment klein">
        <button class="${seat.human ? 'aktiv' : ''}" data-action="sitz-typ" data-index="${i}" data-wert="mensch">Mensch</button>
        <button class="${!seat.human ? 'aktiv' : ''}" data-action="sitz-typ" data-index="${i}" data-wert="bot">Bot</button>
      </div>
      ${!seat.human ? `<div class="segment klein stufen">
        ${['leicht', 'normal', 'schwer'].map((l) => `<button class="${seat.level === l ? 'aktiv' : ''}" data-action="sitz-stufe" data-index="${i}" data-wert="${l}">${l}</button>`).join('')}
      </div>` : ''}
    </div>`).join('');

  return `
  <div class="seite menue">
    <header class="titel">
      <h1>Knotenpunkt</h1>
      <p>Strategie ohne Zufall. Alle ziehen gleichzeitig.</p>
    </header>
    <section class="karte">
      <h2>Spieler</h2>
      <div class="chips">${counts}</div>
      ${s.playerCount % 2 === 0 ? `
      <h2>Modus</h2>
      <div class="segment">
        <button class="${!s.teams ? 'aktiv' : ''}" data-action="modus" data-wert="frei">Jeder gegen jeden</button>
        <button class="${s.teams ? 'aktiv' : ''}" data-action="modus" data-wert="teams">Teams</button>
      </div>` : ''}
      <h2>Plätze</h2>
      ${seats}
    </section>
    <div class="aktionen">
      <button class="haupt" data-action="starten">Auf diesem Gerät spielen</button>
      <button class="neben" data-action="online">Online mit Freunden</button>
      ${hasSave ? '<button class="neben" data-action="fortsetzen">Letzte Partie fortsetzen</button>' : ''}
      <button class="neben" data-action="regeln">Regeln</button>
    </div>
    <p class="fuss">Auf einem Gerät wird nach jedem Zug weitergereicht. Online spielt jeder auf seinem eigenen Handy.</p>
  </div>`;
}

function statusBar(g, viewerId) {
  const need = majority(g);
  const rows = standings(g).map((t) => {
    const names = t.members.map((id) => g.players[id].name).join(' & ');
    const col = g.players[t.members[0]].color;
    const streak = g.majorityStreak?.[t.team] || 0;
    return `<div class="stand ${viewerId !== null && t.members.includes(viewerId) ? 'ich' : ''}">
      <span class="punkt" style="background:${col}"></span>
      <span class="name">${esc(names)}</span>
      <span class="zahl" title="Quellen">◆ ${t.sources}${streak ? `<sup>${streak}</sup>` : ''}</span>
      <span class="zahl" title="Einheiten">⬤ ${t.units}</span>
      <span class="zahl" title="Punkte">★ ${t.score}</span>
    </div>`;
  }).join('');
  return `
    <div class="kopf">
      <div class="runde">Runde <strong>${g.round}</strong><span class="von">/${g.config.maxRounds}</span></div>
      <div class="ziel">Sieg: ${need}/${g.board.sources.length} ◆ · ${g.config.holdRoundsToWin} Runden halten</div>
    </div>
    <div class="staende">${rows}</div>`;
}

function viewPass() {
  const p = currentPlayer();
  return `
  <div class="seite uebergabe" style="--spieler:${p.color}">
    <div class="uebergabe-inner">
      <span class="punkt gross" style="background:${p.color}"></span>
      <h1>${esc(p.name)}</h1>
      <p>Gerät an <strong>${esc(p.name)}</strong> weitergeben.<br>Die Befehle bleiben geheim, bis alle fertig sind.</p>
      <button class="haupt" data-action="uebernehmen">Ich bin ${esc(p.name)}</button>
      <p class="fuss">Spieler ${app.queueIndex + 1} von ${app.queue.length}</p>
    </div>
  </div>`;
}

function viewOrders() {
  const g = app.game;
  const p = currentPlayer();
  const me = p.id;
  const occ = occupancy(g);
  const myUnits = Object.values(g.units).filter((u) => u.owner === me);
  const ordered = new Set(Object.keys(app.working.unitOrders));
  const sel = app.selection;
  const highlight = sel && sel.mode ? validTargets(sel.unitId, sel.mode) : [];

  const board = boardSvg({
    state: g,
    orders: app.working.unitOrders,
    selection: sel,
    viewerId: me,
    showOrdersOf: me,
    highlight,
    ordered,
  });

  const baseFree = !occ[g.board.bases[me]];
  const canBuild = p.energy >= g.config.buildCost && baseFree;
  const chosenBuild = app.working.builds[me];

  let panel;
  if (sel) {
    const u = g.units[sel.unitId];
    const supportable = validTargets(sel.unitId, 'unterstuetzen').length > 0;
    const cur = app.working.unitOrders[sel.unitId];
    panel = `
      <div class="panel">
        <div class="panel-kopf">
          <strong>${TYPE_INFO[u.type].name}</strong> auf ${esc(nodeName(g, u.node))}
          ${cur ? `<span class="badge">${cur.action === 'bewegen' ? '→' : '⇢'} ${esc(nodeName(g, cur.target))}</span>` : '<span class="badge">hält</span>'}
        </div>
        <div class="knopfreihe">
          <button class="${!cur && !sel.mode ? 'aktiv' : ''}" data-action="halten">Halten</button>
          <button class="${sel.mode === 'bewegen' ? 'aktiv' : ''}" data-action="modus-bewegen">Bewegen</button>
          <button class="${sel.mode === 'unterstuetzen' ? 'aktiv' : ''}" ${supportable ? '' : 'disabled'} data-action="modus-stuetzen">Unterstützen</button>
          <button data-action="abwaehlen">Fertig</button>
        </div>
        ${sel.mode ? `<p class="hinweis">${sel.mode === 'bewegen' ? 'Zielfeld antippen.' : 'Verbündete Einheit antippen, die verstärkt werden soll.'}</p>` : '<p class="hinweis">Aktion wählen oder eine andere Einheit antippen.</p>'}
      </div>`;
  } else {
    panel = `
      <div class="panel">
        <div class="panel-kopf">
          <strong>${esc(p.name)}</strong>
          <span class="badge">⚡ ${p.energy} Energie</span>
          <span class="badge">${ordered.size}/${myUnits.length} Befehle</span>
        </div>
        <div class="bauzeile">
          <span class="bau-label">Bauen (${g.config.buildCost} ⚡)</span>
          <div class="knopfreihe">
            ${TYPES.map((t) => `<button class="${chosenBuild === t ? 'aktiv' : ''}" ${canBuild ? '' : 'disabled'} data-action="bauen" data-wert="${t}">${TYPE_INFO[t].name}</button>`).join('')}
          </div>
        </div>
        ${!baseFree ? '<p class="hinweis">Basis ist besetzt - erst freiziehen, dann bauen.</p>'
          : p.energy < g.config.buildCost ? '<p class="hinweis">Nicht genug Energie zum Bauen.</p>'
          : '<p class="hinweis">Einheit antippen, um ihr einen Befehl zu geben.</p>'}
      </div>`;
  }

  return `
  <div class="seite spiel" style="--spieler:${p.color}">
    ${statusBar(g, me)}
    <div class="brett">${board}</div>
    ${panel}
    <div class="aktionen fix">
      <button class="haupt" data-action="befehle-fertig">Befehle abschließen</button>
      <button class="neben klein" data-action="regeln">Regeln</button>
      <button class="neben klein" data-action="aufgeben">Beenden</button>
    </div>
  </div>`;
}

function viewReveal(g, merged, onlineModus = false) {
  const board = boardSvg({ state: g, orders: merged.unitOrders, showOrdersOf: 'alle', viewerId: null });
  const buildRows = g.players
    .filter((p) => merged.builds[p.id])
    .map((p) => `<li><span class="punkt" style="background:${p.color}"></span>${esc(p.name)} baut ${TYPE_INFO[merged.builds[p.id]].name}</li>`)
    .join('');
  return `
  <div class="seite spiel">
    ${statusBar(g, null)}
    <div class="brett">${board}</div>
    <div class="panel">
      <div class="panel-kopf"><strong>Alle Befehle offen</strong></div>
      <p class="hinweis">Durchgezogen = Bewegung, gestrichelt = Unterstützung.</p>
      ${buildRows ? `<ul class="liste">${buildRows}</ul>` : ''}
    </div>
    <div class="aktionen fix">
      <button class="haupt" data-action="${onlineModus ? 'online-ergebnis' : 'auswerten'}">Auswerten</button>
    </div>
  </div>`;
}

function viewResult(g, r, onlineModus = false) {
  const board = boardSvg({ state: g, orders: {}, viewerId: null, showOrdersOf: null });
  const items = r.events.map((e) => describeEvent(r.before, e)).filter(Boolean);
  const list = items.length
    ? items.map((i) => `<li><span class="ikon" style="color:${i.owner !== undefined && g.players[i.owner] ? g.players[i.owner].color : 'inherit'}">${i.icon}</span> ${esc(i.text)}</li>`).join('')
    : '<li class="leer">Nichts hat sich bewegt.</li>';
  return `
  <div class="seite spiel">
    ${statusBar(g, null)}
    <div class="brett">${board}</div>
    <div class="panel scroll">
      <div class="panel-kopf"><strong>Auswertung Runde ${r.before.round}</strong></div>
      <ul class="liste">${list}</ul>
    </div>
    <div class="aktionen fix">
      <button class="haupt" data-action="${onlineModus ? 'online-weiter' : 'weiter'}">${g.phase === 'finished' ? 'Ergebnis' : 'Nächste Runde'}</button>
    </div>
  </div>`;
}

function viewGameOver() {
  const g = app.game;
  const rows = standings(g)
    .sort((a, b) => b.score - a.score || b.sources - a.sources)
    .map((t, i) => {
      const names = t.members.map((id) => g.players[id].name).join(' & ');
      const col = g.players[t.members[0]].color;
      const won = g.winner.teams.includes(t.team);
      return `<li class="${won ? 'sieger' : ''}">
        <span class="rang">${i + 1}</span>
        <span class="punkt" style="background:${col}"></span>
        <span class="name">${esc(names)}</span>
        <span class="zahl">★ ${t.score}</span>
        <span class="zahl">◆ ${t.sources}</span>
      </li>`;
    }).join('');
  return `
  <div class="seite ende">
    <h1>Partie beendet</h1>
    <p class="ergebnis">${esc(winnerText(g))}</p>
    <ul class="rangliste">${rows}</ul>
    <div class="aktionen">
      <button class="haupt" data-action="neues-spiel">Neue Partie</button>
      <button class="neben" data-action="regeln">Regeln</button>
    </div>
  </div>`;
}

function viewRules() {
  return `
  <div class="seite regeln">
    <div class="aktionen oben">
      <button class="neben" data-action="zurueck">Zurück</button>
    </div>
    ${rulesHtml()}
    <div class="aktionen">
      <button class="haupt" data-action="zurueck">Zurück</button>
    </div>
  </div>`;
}

// ------------------------------------------------------------------- Start

/** Einladungslinks haben die Form  .../#r=K4MPT9&c=<zugangsdaten> */
function starteApp() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const code = params.get('r');
  if (!code) { render(); return; }

  const ausLink = params.get('c') ? configAusLink(params.get('c')) : null;
  if (ausLink) speichereConfig(ausLink);
  history.replaceState(null, '', location.pathname);
  app.onlineForm.code = normalisiereCode(code);

  if (aktiveConfig()) {
    app.screen = 'online-beitreten';
  } else {
    app.onlineForm.fehler = 'In diesem Link stecken keine Zugangsdaten. '
      + 'Bitte den Gastgeber um einen neuen Link bitten.';
    app.screen = 'online';
  }
  render();
}

starteApp();

// Tippt jemand auf einen Einladungslink, waehrend die App schon offen ist,
// aendert sich nur der Anker - die Seite wird nicht neu geladen.
window.addEventListener('hashchange', starteApp);
