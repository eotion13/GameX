// Knotenpunkt - Oberflaeche und Spielablauf.

import { createGame, occupancy, standings, majority } from '../engine/state.js';
import { resolve } from '../engine/resolver.js';
import { botOrders, mulberry32 } from '../engine/bots.js';
import { TYPES, TYPE_INFO, PLAYER_NAMES } from '../engine/rules.js';
import { boardSvg } from './board.js';
import { describeEvent, nodeName, winnerText } from './text.js';
import { rulesHtml } from './rules-text.js';

const SAVE_KEY = 'knotenpunkt.spielstand.v2';
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
};

// ---------------------------------------------------------------- Speichern
function save() {
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
  return app.game.players[app.queue[app.queueIndex]];
}

function finishTurn() {
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

// ------------------------------------------------------------------ Aktionen
const actions = {
  'neues-spiel': () => { app.screen = 'menu'; render(); },
  'starten': () => { newGame(); },
  'fortsetzen': () => { if (resume()) render(); },
  'regeln': () => { app.previousScreen = app.screen; app.screen = 'regeln'; render(); },
  'zurueck': () => { app.screen = app.previousScreen || 'menu'; render(); },
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
    if (confirm('Partie wirklich beenden?')) {
      app.game = null;
      app.screen = 'menu';
      localStorage.removeItem(SAVE_KEY);
      render();
    }
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

// ------------------------------------------------------------------ Rendern
function render() {
  const html = {
    menu: viewMenu,
    pass: viewPass,
    orders: viewOrders,
    reveal: viewReveal,
    result: viewResult,
    gameover: viewGameOver,
    regeln: viewRules,
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
      <button class="haupt" data-action="starten">Partie starten</button>
      ${hasSave ? '<button class="neben" data-action="fortsetzen">Letzte Partie fortsetzen</button>' : ''}
      <button class="neben" data-action="regeln">Regeln</button>
    </div>
    <p class="fuss">Tipp: Beim Spiel auf einem Gerät wird nach jedem Zug weitergereicht.</p>
  </div>`;
}

function statusBar(viewerId) {
  const g = app.game;
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
          <button class="${!cur ? 'aktiv' : ''}" data-action="halten">Halten</button>
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
    ${statusBar(me)}
    <div class="brett">${board}</div>
    ${panel}
    <div class="aktionen fix">
      <button class="haupt" data-action="befehle-fertig">Befehle abschließen</button>
      <button class="neben klein" data-action="regeln">Regeln</button>
      <button class="neben klein" data-action="aufgeben">Beenden</button>
    </div>
  </div>`;
}

function viewReveal() {
  const g = app.game;
  const merged = mergedOrders();
  const board = boardSvg({ state: g, orders: merged.unitOrders, showOrdersOf: 'alle', viewerId: null });
  const buildRows = g.players
    .filter((p) => merged.builds[p.id])
    .map((p) => `<li><span class="punkt" style="background:${p.color}"></span>${esc(p.name)} baut ${TYPE_INFO[merged.builds[p.id]].name}</li>`)
    .join('');
  return `
  <div class="seite spiel">
    ${statusBar(null)}
    <div class="brett">${board}</div>
    <div class="panel">
      <div class="panel-kopf"><strong>Alle Befehle offen</strong></div>
      <p class="hinweis">Durchgezogen = Bewegung, gestrichelt = Unterstützung.</p>
      ${buildRows ? `<ul class="liste">${buildRows}</ul>` : ''}
    </div>
    <div class="aktionen fix">
      <button class="haupt" data-action="auswerten">Auswerten</button>
    </div>
  </div>`;
}

function viewResult() {
  const g = app.game;
  const r = app.lastResult;
  const board = boardSvg({ state: g, orders: {}, viewerId: null, showOrdersOf: null });
  const items = r.events.map((e) => describeEvent(r.before, e)).filter(Boolean);
  const list = items.length
    ? items.map((i) => `<li><span class="ikon" style="color:${i.owner !== undefined && g.players[i.owner] ? g.players[i.owner].color : 'inherit'}">${i.icon}</span> ${esc(i.text)}</li>`).join('')
    : '<li class="leer">Nichts hat sich bewegt.</li>';
  return `
  <div class="seite spiel">
    ${statusBar(null)}
    <div class="brett">${board}</div>
    <div class="panel scroll">
      <div class="panel-kopf"><strong>Auswertung Runde ${r.before.round}</strong></div>
      <ul class="liste">${list}</ul>
    </div>
    <div class="aktionen fix">
      <button class="haupt" data-action="weiter">${g.phase === 'finished' ? 'Ergebnis' : 'Nächste Runde'}</button>
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
render();
