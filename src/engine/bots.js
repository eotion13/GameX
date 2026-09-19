// Bots. Die Regeln bleiben deterministisch - nur die Bots duerfen wuerfeln,
// und auch das nur mit einem gesetzten Startwert, damit Partien reproduzierbar
// bleiben.

import { allDistances } from './board.js';
import { occupancy } from './state.js';
import { resolve, ORDER_HOLD, ORDER_MOVE, ORDER_SUPPORT } from './resolver.js';
import { TYPES, beats } from './rules.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const distCache = new Map();
function distances(board) {
  const key = `${board.playerCount}:${board.rings}:${board.spokes}`;
  if (!distCache.has(key)) distCache.set(key, allDistances(board));
  return distCache.get(key);
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/** Zufallsbot: waehlt aus allen legalen Befehlen. */
export function randomBot(state, playerId, rng) {
  const unitOrders = {};
  const occ = occupancy(state);
  for (const u of Object.values(state.units)) {
    if (u.owner !== playerId) continue;
    const options = [{ action: ORDER_HOLD }];
    for (const nb of state.board.nodes[u.node].neighbors) {
      options.push({ action: ORDER_MOVE, target: nb });
      const other = occ[nb];
      if (other && state.players[other.owner].team === state.players[playerId].team) {
        options.push({ action: ORDER_SUPPORT, target: nb });
      }
    }
    unitOrders[u.id] = pick(rng, options);
  }
  const builds = {};
  const p = state.players[playerId];
  if (p.energy >= state.config.buildCost && !occ[state.board.bases[playerId]] && rng() < 0.8) {
    builds[playerId] = pick(rng, TYPES);
  }
  return { unitOrders, builds };
}

/**
 * Greedy-Bot: haelt eigene Quellen, greift nur mit Aussicht auf Erfolg an
 * (Typvorteil oder Unterstuetzung), nimmt sonst die naechste freie Quelle
 * und baut, sobald er kann.
 */
export function greedyBot(state, playerId, rng) {
  const board = state.board;
  const D = distances(board);
  const occ = occupancy(state);
  const team = state.players[playerId].team;
  const isMate = (owner) => state.players[owner].team === team;
  const myUnits = Object.values(state.units)
    .filter((u) => u.owner === playerId)
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  const unitOrders = {};
  const claimed = new Set();          // Zielfelder, die schon vergeben sind
  const free = () => myUnits.filter((u) => !unitOrders[u.id]);

  const alliesAround = (nodeId, ofOwner) =>
    board.nodes[nodeId].neighbors.filter((nb) => occ[nb] && isSame(occ[nb].owner, ofOwner)).length;
  const isSame = (a, b) => state.players[a].team === state.players[b].team;

  const enemyAdjacent = (nodeId) =>
    board.nodes[nodeId].neighbors.some((nb) => occ[nb] && !isMate(occ[nb].owner));

  /** Geschaetzte Verteidigungsstaerke eines gegnerischen Feldes. */
  const defenderPower = (nodeId) => {
    const def = occ[nodeId];
    if (!def) return 0;
    return 1 + alliesAround(nodeId, def.owner);
  };

  // 1. Eigene bedrohte Quellen besetzt halten.
  for (const u of myUnits) {
    if (board.nodes[u.node].isSource && state.control[u.node] === playerId && enemyAdjacent(u.node)) {
      unitOrders[u.id] = { action: ORDER_HOLD };
      claimed.add(u.node);
    }
  }

  // 2. Bedrohte eigene Felder unterstuetzen.
  for (const u of free()) {
    if (enemyAdjacent(u.node)) continue; // wer selbst bedroht ist, wird geschnitten
    const help = board.nodes[u.node].neighbors.find((nb) => {
      const other = occ[nb];
      return other && isMate(other.owner) && board.nodes[nb].isSource
        && state.control[nb] === playerId && enemyAdjacent(nb);
    });
    if (help) unitOrders[u.id] = { action: ORDER_SUPPORT, target: help };
  }

  // 3. Koordinierte Angriffe auf gegnerisch besetzte Quellen.
  const targets = board.sources
    .filter((q) => occ[q] && !isMate(occ[q].owner))
    .sort((a, b) => defenderPower(a) - defenderPower(b));

  for (const target of targets) {
    if (claimed.has(target)) continue;
    const candidates = free().filter((u) => board.nodes[u.node].neighbors.includes(target));
    if (!candidates.length) continue;
    const def = occ[target];
    // Bester Angreifer: Typvorteil zuerst, dann moeglichst viele Helfer daneben.
    candidates.sort((a, b) => {
      const ta = beats(a.type, def.type) ? 1 : 0;
      const tb = beats(b.type, def.type) ? 1 : 0;
      if (ta !== tb) return tb - ta;
      return 0;
    });
    const attacker = candidates[0];
    const helpers = free().filter((u) =>
      u.id !== attacker.id && board.nodes[u.node].neighbors.includes(attacker.node) && !enemyAdjacent(u.node));
    const myPower = 1 + helpers.length;
    const theirPower = defenderPower(target);
    const wins = myPower > theirPower || (myPower === theirPower && beats(attacker.type, def.type));
    if (!wins) continue;
    unitOrders[attacker.id] = { action: ORDER_MOVE, target };
    claimed.add(target);
    for (const h of helpers) unitOrders[h.id] = { action: ORDER_SUPPORT, target: attacker.node };
  }

  // 4. Ausbreiten: Richtung der attraktivsten noch nicht gesicherten Quelle.
  //    Zwei Durchgaenge, damit Einheiten einem abziehenden Kameraden nachruecken
  //    koennen, statt hinter ihm stecken zu bleiben.
  const movingFrom = new Set(
    myUnits.filter((u) => unitOrders[u.id]?.action === ORDER_MOVE).map((u) => u.node));

  const goalScore = (u, q) => {
    let score = D[u.node][q] * 3;
    if (state.control[q] === playerId) score += 3;       // eigene Quelle lockt weniger
    const there = occ[q];
    if (there) score += isMate(there.owner) ? 5 : 1;     // besetzt: eigene meiden, fremde reizen
    if (claimedGoals.has(q)) score += 4;                 // nicht alle aufs selbe Ziel
    return score;
  };
  const claimedGoals = new Set();

  // Vorderste Einheiten zuerst: dann koennen die hinteren nachruecken,
  // statt in einer Kolonne festzustecken.
  const frontFirst = () => free().sort((a, b) => {
    const da = Math.min(...board.sources.map((q) => D[a.node][q]));
    const db = Math.min(...board.sources.map((q) => D[b.node][q]));
    return da - db || (a.id < b.id ? -1 : 1);
  });

  for (let sweep = 0; sweep < 3; sweep++) {
    for (const u of frontFirst()) {
      let best = null;
      const ties = [];
      for (const q of board.sources) {
        if (D[u.node][q] === 0) continue;
        const sc = goalScore(u, q);
        if (best === null || sc < best) { best = sc; ties.length = 0; ties.push(q); }
        else if (sc === best) ties.push(q);
      }
      const goal = ties.length ? (ties.length === 1 ? ties[0] : pick(rng, ties)) : null;
      if (goal === null) continue;

      const passable = (nb) => {
        if (claimed.has(nb)) return false;
        const other = occ[nb];
        if (!other) return true;
        if (isMate(other.owner)) return movingFrom.has(nb); // nur nachruecken
        return beats(u.type, other.type) && defenderPower(nb) <= 1;
      };
      const nbs = board.nodes[u.node].neighbors;
      let steps = nbs.filter((nb) => D[nb][goal] < D[u.node][goal]).filter(passable);
      if (!steps.length && sweep > 0) {
        // Weg versperrt: seitwaerts ausweichen statt zu erstarren.
        steps = nbs.filter((nb) => D[nb][goal] === D[u.node][goal]).filter(passable);
      }
      if (!steps.length) continue;
      const target = steps.length === 1 ? steps[0] : pick(rng, steps);
      unitOrders[u.id] = { action: ORDER_MOVE, target };
      claimed.add(target);
      claimedGoals.add(goal);
      movingFrom.add(u.node);
    }
  }

  // 5. Wer nichts Besseres vorhat, unterstuetzt einen Kameraden, der auf ein
  //    umkaempftes Feld zieht. Genau das bricht Dauer-Pattsituationen auf.
  for (const u of free()) {
    if (enemyAdjacent(u.node)) continue; // wuerde ohnehin geschnitten
    const mover = board.nodes[u.node].neighbors
      .map((nb) => occ[nb])
      .filter((o) => o && isMate(o.owner) && unitOrders[o.id]?.action === ORDER_MOVE)
      .find((o) => {
        const dest = unitOrders[o.id].target;
        return (occ[dest] && !isMate(occ[dest].owner)) || enemyAdjacent(dest);
      });
    if (mover) unitOrders[u.id] = { action: ORDER_SUPPORT, target: mover.node };
  }

  // 6. Rest haelt die Stellung.
  for (const u of free()) {
    unitOrders[u.id] = { action: ORDER_HOLD };
    claimed.add(u.node);
  }

  // 7. Bauen: den Typ waehlen, der die haeufigsten gegnerischen Einheiten schlaegt.
  const builds = {};
  const p = state.players[playerId];
  if (p.energy >= state.config.buildCost && !occ[board.bases[playerId]]) {
    const counts = {};
    for (const u of Object.values(state.units)) {
      if (!isMate(u.owner)) counts[u.type] = (counts[u.type] || 0) + 1;
    }
    const mine = {};
    for (const u of myUnits) mine[u.type] = (mine[u.type] || 0) + 1;
    let bestType = TYPES[0];
    let bestScore = -Infinity;
    for (const t of TYPES) {
      let score = Object.entries(counts).reduce((a, [ot, n]) => a + (beats(t, ot) ? n : 0), 0);
      score -= (mine[t] || 0) * 0.5; // Truppe gemischt halten
      if (score > bestScore) { bestScore = score; bestType = t; }
    }
    builds[playerId] = bestType;
  }
  return { unitOrders, builds };
}

/** Bewertung einer Stellung aus Sicht eines Teams. */
export function evaluate(state, playerId) {
  const board = state.board;
  const D = distances(board);
  const team = state.players[playerId].team;
  let score = 0;
  for (const q in state.control) {
    const owner = state.control[q];
    if (owner === null) continue;
    score += state.players[owner].team === team ? 12 : -8;
  }
  for (const u of Object.values(state.units)) {
    const mine = state.players[u.owner].team === team;
    score += mine ? 5 : -3;
    if (mine) {
      // Naehe zu noch nicht eigenen Quellen belohnen
      let best = 99;
      for (const q of board.sources) {
        if (state.control[q] !== null && state.players[state.control[q]].team === team) continue;
        best = Math.min(best, D[u.node][q]);
      }
      if (best < 99) score -= best * 0.8;
      if (board.nodes[u.node].isSource) score += 2;
    }
  }
  for (const p of state.players) {
    if (p.team === team) score += p.energy * 0.6 + p.score * 0.4;
  }
  if (state.winner) {
    score += state.winner.teams.includes(team) ? 1000 : -1000;
  }
  return score;
}

/**
 * Monte-Carlo-Bot: probiert viele eigene Befehlssaetze gegen simulierte
 * Gegnerzuege und nimmt den, der im Schnitt am besten abschneidet.
 */
export function monteCarloBot(state, playerId, rng, samples = 40, opponentSamples = 3) {
  let best = null;
  const candidates = [];
  candidates.push(greedyBot(state, playerId, rng));
  for (let i = 0; i < samples; i++) {
    candidates.push(rng() < 0.5 ? greedyBot(state, playerId, rng) : randomBot(state, playerId, rng));
  }
  for (const cand of candidates) {
    let total = 0;
    for (let k = 0; k < opponentSamples; k++) {
      const unitOrders = { ...cand.unitOrders };
      const builds = { ...cand.builds };
      for (const p of state.players) {
        if (p.id === playerId || p.eliminated) continue;
        const opp = k === 0 ? greedyBot(state, p.id, rng) : randomBot(state, p.id, rng);
        Object.assign(unitOrders, opp.unitOrders);
        Object.assign(builds, opp.builds);
      }
      total += evaluate(resolve(state, { unitOrders, builds }).state, playerId);
    }
    const avg = total / opponentSamples;
    if (best === null || avg > best.avg) best = { avg, cand };
  }
  return best.cand;
}

export const BOTS = {
  zufall: randomBot,
  leicht: (s, p, rng) => (rng() < 0.35 ? randomBot(s, p, rng) : greedyBot(s, p, rng)),
  normal: greedyBot,
  schwer: (s, p, rng) => monteCarloBot(s, p, rng, 40, 3),
};

export function botOrders(state, playerId, level, rng) {
  const fn = BOTS[level] || BOTS.normal;
  return fn(state, playerId, rng);
}
