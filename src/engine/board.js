// Spielfeld-Erzeugung.
//
// Warum kein Hexraster? Ein Hexfeld hat 6-zaehlige Symmetrie. Fuer 4 oder 5
// Spieler laesst sich darauf keine perfekt gleichwertige Startaufstellung
// bauen - irgendjemand sitzt naeher an mehr Quellen. Deshalb ist das Brett ein
// radialer Knotengraph mit genau P-zaehliger Drehsymmetrie: dreht man das
// Brett um 360/P Grad, liegt es exakt auf sich selbst. Damit ist jede
// Startposition beweisbar gleichwertig - fuer 2 bis 6 Spieler.
//
// Aufbau:
//   Ring 0: der Knotenpunkt (1 Knoten, Quelle)
//   Ring 1: K Knoten, alle Quellen, alle mit dem Knotenpunkt verbunden
//   Ring 2: K Knoten, neutrales Vorfeld
//   Ring 3: K Knoten, darunter die P Basen (gleichmaessig verteilt)
// K = max(6, 2*P) -> K ist immer durch P teilbar.

import { CONFIG } from './rules.js';

export function spokesFor(playerCount) {
  return Math.max(6, playerCount * 2);
}

// Darstellungsmasse. Die Ringradien wachsen nicht einfach 1, 2, 3: bei vielen
// Speichen muessen die inneren Ringe weiter aussen liegen, sonst ueberlappen
// sich die Knoten. Auf die Spielregeln hat das keinen Einfluss - nur auf das Bild.
const KNOTEN_R = 0.3;
const MIN_LUFT = 0.16;

export function ringRadius(ring, spokes) {
  if (ring === 0) return 0;
  const noetig = (2 * KNOTEN_R + MIN_LUFT) / (2 * Math.sin(Math.PI / spokes));
  return Math.max(1, noetig) + (ring - 1);
}

export function nodeId(ring, spoke) {
  return ring === 0 ? 'k' : `r${ring}s${spoke}`;
}

/**
 * Erzeugt das Spielfeld fuer eine Spielerzahl.
 * Gibt ein reines Datenobjekt zurueck (JSON-serialisierbar).
 */
export function createBoard(playerCount, config = CONFIG) {
  if (playerCount < 2 || playerCount > 6) {
    throw new Error('Spielerzahl muss zwischen 2 und 6 liegen');
  }
  const rings = config.rings;
  const K = spokesFor(playerCount);
  const nodes = {};
  const order = [];

  const addNode = (ring, spoke) => {
    const id = nodeId(ring, spoke);
    const angle = (spoke / K) * Math.PI * 2 - Math.PI / 2;
    const radius = ringRadius(ring, K);
    nodes[id] = {
      id,
      ring,
      spoke,
      x: round4(Math.cos(angle) * radius),
      y: round4(Math.sin(angle) * radius),
      isSource: ring <= 1,
      base: null,
      neighbors: [],
    };
    order.push(id);
    return id;
  };

  addNode(0, 0);
  for (let r = 1; r <= rings; r++) {
    for (let s = 0; s < K; s++) addNode(r, s);
  }

  const link = (a, b) => {
    if (a === b) return;
    if (!nodes[a].neighbors.includes(b)) nodes[a].neighbors.push(b);
    if (!nodes[b].neighbors.includes(a)) nodes[b].neighbors.push(a);
  };

  for (let s = 0; s < K; s++) link('k', nodeId(1, s));
  for (let r = 1; r <= rings; r++) {
    for (let s = 0; s < K; s++) {
      link(nodeId(r, s), nodeId(r, (s + 1) % K)); // entlang des Rings
      if (r < rings) link(nodeId(r, s), nodeId(r + 1, s)); // nach aussen
    }
  }

  const step = K / playerCount;
  const bases = [];
  for (let p = 0; p < playerCount; p++) {
    const id = nodeId(rings, p * step);
    nodes[id].base = p;
    bases.push(id);
  }

  const sources = order.filter((id) => nodes[id].isSource);

  return {
    playerCount, rings, spokes: K, nodes, order, sources, bases,
    radius: round4(ringRadius(rings, K)), // aeusserster Ring, fuer die Ansicht
  };
}

function round4(v) {
  return Math.round(v * 10000) / 10000;
}

export function neighbors(board, id) {
  return board.nodes[id].neighbors;
}

export function areAdjacent(board, a, b) {
  return board.nodes[a] !== undefined && board.nodes[a].neighbors.includes(b);
}

/** Startfelder eines Spielers: [Basisknoten, Knoten davor (Ring 2)]. */
export function startNodes(board, playerIndex) {
  const step = board.spokes / board.playerCount;
  const spoke = playerIndex * step;
  return [nodeId(board.rings, spoke), nodeId(board.rings - 1, spoke)];
}

/** BFS-Distanzen von einem Knoten zu allen anderen. */
export function distancesFrom(board, from) {
  const dist = { [from]: 0 };
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    for (const nb of board.nodes[cur].neighbors) {
      if (dist[nb] === undefined) {
        dist[nb] = dist[cur] + 1;
        queue.push(nb);
      }
    }
  }
  return dist;
}

/** Alle paarweisen Distanzen (fuer Bots). */
export function allDistances(board) {
  const out = {};
  for (const id of board.order) out[id] = distancesFrom(board, id);
  return out;
}
