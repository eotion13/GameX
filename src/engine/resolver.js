// resolve(state, orders) -> neuer Zustand.
//
// Rein deterministisch: gleicher Zustand + gleiche Befehle = immer gleiches
// Ergebnis. Keine Zufallsquelle, keine Uhr, keine Reihenfolge-Abhaengigkeit
// von den Spielern.
//
// Kampfregeln in drei Saetzen:
//   1. Staerke einer Einheit = 1 + gueltige Unterstuetzungen auf ihrem Feld.
//   2. Hoechste Staerke gewinnt das Feld. Bei Gleichstand entscheidet der Typ
//      (Reiter>Bogen>Schild>Reiter).
//   3. Der Verlierer eines entschiedenen Kampfes faellt. Nur ein echtes Patt
//      (gleiche Staerke, kein Typvorteil) laesst beide unversehrt stehen.
//
// Punkt 3 ist die Bremse gegen Endlosschleifen: ein Angriff ins Blaue kostet
// die Einheit, ein gut unterstuetzter Angriff raeumt das Feld.

import { beats, incomePerSource, TYPES } from './rules.js';
import { clone, occupancy, majority, teamList, teamSources, teamScore, teamUnits } from './state.js';

export const ORDER_HOLD = 'halten';
export const ORDER_MOVE = 'bewegen';
export const ORDER_SUPPORT = 'unterstuetzen';

const MAX_ITERATIONS = 64;

/**
 * Normalisiert einen Befehl. Ungueltige Befehle werden zu HALTEN.
 * @returns {{action:string, target?:string, invalid?:boolean}}
 */
export function normalizeOrder(state, unit, order) {
  const hold = { action: ORDER_HOLD };
  if (!order || !order.action) return hold;
  const board = state.board;
  const node = board.nodes[unit.node];
  if (order.action === ORDER_MOVE) {
    if (!order.target || !node.neighbors.includes(order.target)) return { ...hold, invalid: true };
    return { action: ORDER_MOVE, target: order.target };
  }
  if (order.action === ORDER_SUPPORT) {
    if (!order.target || !node.neighbors.includes(order.target)) return { ...hold, invalid: true };
    const occ = occupancy(state)[order.target];
    if (!occ) return { ...hold, invalid: true };
    if (state.players[occ.owner].team !== state.players[unit.owner].team) return { ...hold, invalid: true };
    return { action: ORDER_SUPPORT, target: order.target };
  }
  return hold;
}

/** Alle legalen Befehle einer Einheit (fuer UI und Bots). */
export function legalOrders(state, unit) {
  const out = [{ action: ORDER_HOLD }];
  const occ = occupancy(state);
  for (const nb of state.board.nodes[unit.node].neighbors) {
    out.push({ action: ORDER_MOVE, target: nb });
    const other = occ[nb];
    if (other && state.players[other.owner].team === state.players[unit.owner].team) {
      out.push({ action: ORDER_SUPPORT, target: nb });
    }
  }
  return out;
}

/**
 * Hauptfunktion.
 * @param {object} state
 * @param {{unitOrders:Object<string,object>, builds:Object<number,string|null>}} ordersInput
 * @returns {{state:object, events:Array, orders:Object}}
 */
export function resolve(state, ordersInput = {}) {
  const s = clone(state);
  const events = [];
  const board = s.board;
  const byNode = occupancy(s);
  const unitIds = Object.keys(s.units).sort();
  const mates = (a, b) => s.players[a].team === s.players[b].team;

  // --- 1. Befehle normalisieren -------------------------------------------
  const orders = {};
  for (const id of unitIds) {
    orders[id] = normalizeOrder(s, s.units[id], (ordersInput.unitOrders || {})[id]);
  }

  // --- 2. Unterstuetzungen zaehlen (Schnitt durch feindliche Angriffe) ----
  const incoming = {}; // Zielknoten -> Einheiten, die dorthin ziehen wollen
  for (const id of unitIds) {
    const o = orders[id];
    if (o.action === ORDER_MOVE) (incoming[o.target] ||= []).push(s.units[id]);
  }

  const supportCount = {}; // Knoten -> Anzahl gueltiger Unterstuetzungen
  for (const id of unitIds) {
    const o = orders[id];
    if (o.action !== ORDER_SUPPORT) continue;
    const u = s.units[id];
    const attackers = incoming[u.node] || [];
    const cut = attackers.some((a) => !mates(a.owner, u.owner));
    if (cut) {
      events.push({ type: 'supportCut', unit: u.id, owner: u.owner, node: u.node, target: o.target });
    } else {
      supportCount[o.target] = (supportCount[o.target] || 0) + 1;
    }
  }

  const power = (u) => 1 + (supportCount[u.node] || 0);

  /** Gewinnt a gegen b im direkten Vergleich? (Staerke, dann Typ) */
  const winsAgainst = (a, b) => {
    const pa = power(a);
    const pb = power(b);
    if (pa !== pb) return pa > pb;
    return beats(a.type, b.type);
  };

  // --- 3. Bewegungen per Fixpunkt aufloesen -------------------------------
  const movers = unitIds.filter((id) => orders[id].action === ORDER_MOVE).map((id) => s.units[id]);
  const succeeds = {};
  for (const u of movers) succeeds[u.id] = true; // optimistischer Start (erlaubt Rotationen)

  const headToHeadOpponent = (u) => {
    const dest = orders[u.id].target;
    const occ = byNode[dest];
    if (!occ) return null;
    const oo = orders[occ.id];
    return oo.action === ORDER_MOVE && oo.target === u.node ? occ : null;
  };

  /** Setzt sich u gegen die anderen Angreifer auf dasselbe Feld durch? */
  const dominatesRivals = (u) => {
    const dest = orders[u.id].target;
    for (const other of incoming[dest] || []) {
      if (other.id === u.id) continue;
      const po = power(other);
      const pu = power(u);
      if (po > pu) return false;
      if (po === pu) {
        if (mates(other.owner, u.owner)) return false; // Verbuendete blockieren sich
        if (!beats(u.type, other.type)) return false;  // Patt
      }
    }
    return true;
  };

  /** Kommt u am Verteidiger bzw. am Platztausch vorbei? */
  const passesDefense = (u) => {
    const h2h = headToHeadOpponent(u);
    if (h2h) {
      if (mates(h2h.owner, u.owner)) return false; // kein Tausch unter Verbuendeten
      return winsAgainst(u, h2h);
    }
    const dest = orders[u.id].target;
    const occ = byNode[dest];
    if (!occ) return true;
    if (orders[occ.id].action === ORDER_MOVE && succeeds[occ.id]) return true; // Feld wird frei
    if (mates(occ.owner, u.owner)) return false; // Verbuendete werden nicht verdraengt
    return winsAgainst(u, occ);
  };

  const evaluate = (u) => dominatesRivals(u) && passesDefense(u);

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let changed = false;
    for (const u of movers) {
      const val = evaluate(u);
      if (val !== succeeds[u.id]) {
        succeeds[u.id] = val;
        changed = true;
      }
    }
    if (!changed) break;
    if (iter === MAX_ITERATIONS - 1) {
      // Paradoxe Konstellation: alles scheitert. Deterministisch und fair.
      for (const u of movers) succeeds[u.id] = false;
    }
  }

  // --- 4. Ergebnisse anwenden ---------------------------------------------
  // Pro Zielfeld greift hoechstens eine Einheit den Verteidiger wirklich an:
  // die, die sich gegen die anderen Angreifer durchgesetzt hat. Wer sich nur
  // mit anderen Angreifern gegenseitig blockiert, prallt unversehrt ab.
  const destroyed = new Set();
  const leadAttacker = {};
  for (const u of movers) {
    if (dominatesRivals(u)) leadAttacker[orders[u.id].target] = u;
  }

  for (const u of movers) {
    const dest = orders[u.id].target;
    if (succeeds[u.id]) {
      const occ = byNode[dest];
      const vacating = occ && orders[occ.id].action === ORDER_MOVE && succeeds[occ.id];
      if (occ && !vacating) {
        destroyed.add(occ.id);
        events.push({
          type: 'destroyed', unit: occ.id, owner: occ.owner, unitType: occ.type, node: dest,
          by: u.id, byOwner: u.owner, byType: u.type, cause: 'verteidiger-geschlagen',
        });
      }
      events.push({ type: 'move', unit: u.id, owner: u.owner, unitType: u.type, from: u.node, to: dest });
      continue;
    }

    if (leadAttacker[dest] !== u) {
      events.push({ type: 'bounce', unit: u.id, owner: u.owner, from: u.node, to: dest, cause: 'patt' });
      continue;
    }

    const h2h = headToHeadOpponent(u);
    if (h2h && !mates(h2h.owner, u.owner) && winsAgainst(h2h, u)) {
      destroyed.add(u.id);
      events.push({
        type: 'destroyed', unit: u.id, owner: u.owner, unitType: u.type, node: u.node,
        by: h2h.id, byOwner: h2h.owner, byType: h2h.type, cause: 'platztausch-verloren',
      });
      continue;
    }

    const occ = byNode[dest];
    const vacating = occ && orders[occ.id].action === ORDER_MOVE && succeeds[occ.id];
    if (occ && !vacating && !mates(occ.owner, u.owner) && winsAgainst(occ, u)) {
      destroyed.add(u.id);
      events.push({
        type: 'destroyed', unit: u.id, owner: u.owner, unitType: u.type, node: u.node,
        by: occ.id, byOwner: occ.owner, byType: occ.type, cause: 'angriff-gescheitert',
      });
      continue;
    }

    events.push({ type: 'bounce', unit: u.id, owner: u.owner, from: u.node, to: dest, cause: 'patt' });
  }

  for (const u of movers) {
    if (succeeds[u.id] && !destroyed.has(u.id)) s.units[u.id].node = orders[u.id].target;
  }
  for (const id of destroyed) delete s.units[id];

  // --- 5. Bauen ------------------------------------------------------------
  const occAfter = occupancy(s);
  const builds = ordersInput.builds || {};
  for (const p of s.players) {
    const type = builds[p.id];
    if (!type) continue;
    if (!TYPES.includes(type)) {
      events.push({ type: 'buildFailed', owner: p.id, reason: 'unbekannter-typ' });
      continue;
    }
    const baseNode = board.bases[p.id];
    if (p.energy < s.config.buildCost) {
      events.push({ type: 'buildFailed', owner: p.id, reason: 'energie' });
      continue;
    }
    if (occAfter[baseNode]) {
      events.push({ type: 'buildFailed', owner: p.id, reason: 'basis-besetzt' });
      continue;
    }
    const id = `u${s.nextUnitId++}`;
    s.units[id] = { id, owner: p.id, type, node: baseNode };
    occAfter[baseNode] = s.units[id];
    p.energy -= s.config.buildCost;
    events.push({ type: 'built', owner: p.id, unit: id, unitType: type, node: baseNode });
  }

  // --- 6. Quellenkontrolle -------------------------------------------------
  const finalOcc = occupancy(s);
  for (const nodeId of board.sources) {
    const occ = finalOcc[nodeId];
    if (occ && s.control[nodeId] !== occ.owner) {
      const previous = s.control[nodeId];
      s.control[nodeId] = occ.owner;
      events.push({ type: 'sourceCaptured', node: nodeId, owner: occ.owner, from: previous });
    }
  }

  // --- 7. Energie und Punkte ----------------------------------------------
  const rate = incomePerSource(s.round, s.config);
  for (const p of s.players) {
    let n = 0;
    for (const nodeId in s.control) if (s.control[nodeId] === p.id) n++;
    p.energy += n * rate;
    p.score += n;
  }

  // --- 8. Ausscheiden ------------------------------------------------------
  for (const p of s.players) {
    const hasUnits = Object.values(s.units).some((u) => u.owner === p.id);
    let hasSources = false;
    for (const nodeId in s.control) if (s.control[nodeId] === p.id) { hasSources = true; break; }
    if (!hasUnits && !hasSources && p.energy < s.config.buildCost && !p.eliminated) {
      p.eliminated = true;
      events.push({ type: 'eliminated', owner: p.id });
    }
  }

  // --- 9. Mehrheits-Serie fortschreiben ------------------------------------
  // Die Mehrheit gewinnt nicht im Vorbeigehen: sie muss verteidigt werden.
  const need = majority(s);
  s.majorityStreak = s.majorityStreak || {};
  for (const t of teamList(s)) {
    s.majorityStreak[t] = teamSources(s, t) >= need ? (s.majorityStreak[t] || 0) + 1 : 0;
  }

  // --- 10. Siegbedingung ---------------------------------------------------
  s.history.push({ round: s.round, orders, builds, events });
  const outcome = checkVictory(s);
  if (outcome) {
    s.winner = outcome;
    s.phase = 'finished';
    events.push({ type: 'gameOver', ...outcome });
  } else {
    s.round += 1;
  }

  return { state: s, events, orders };
}

/** Prueft die Siegbedingungen am Rundenende. */
export function checkVictory(s) {
  const need = majority(s);
  const hold = s.config.holdRoundsToWin || 1;
  const teams = teamList(s);
  const winners = teams.filter(
    (t) => teamSources(s, t) >= need && (s.majorityStreak?.[t] || 0) >= hold);
  if (winners.length === 1) {
    return { teams: winners, reason: 'mehrheit', need, held: hold };
  }
  const aliveTeams = teams.filter((t) => teamUnits(s, t) > 0 || teamSources(s, t) > 0);
  if (aliveTeams.length === 1 && teams.length > 1) {
    return { teams: aliveTeams, reason: 'letzter-uebrig' };
  }
  if (s.round >= s.config.maxRounds) {
    let best = [];
    let bestKey = null;
    for (const t of teams) {
      const key = [teamScore(s, t), teamUnits(s, t), teamSources(s, t)];
      if (bestKey === null || cmpKey(key, bestKey) > 0) { bestKey = key; best = [t]; }
      else if (cmpKey(key, bestKey) === 0) best.push(t);
    }
    return { teams: best, reason: 'punkte', score: bestKey ? bestKey[0] : 0 };
  }
  return null;
}

function cmpKey(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}
