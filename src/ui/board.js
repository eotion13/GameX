// SVG-Darstellung des Spielfelds.

import { TYPE_INFO } from '../engine/rules.js';
import { occupancy } from '../engine/state.js';

const NODE_R = 0.3;
const HIT_R = 0.46;

/**
 * @param {object} o
 *   state, orders (unitId->order), selection {unitId, mode}, viewerId,
 *   showOrdersOf: null | playerId | 'alle', highlight: string[]
 */
export function boardSvg(o) {
  const { state } = o;
  const board = state.board;
  const occ = occupancy(state);
  const span = (board.radius || board.rings) + 0.8;
  const highlight = new Set(o.highlight || []);
  const parts = [];

  parts.push(`<svg viewBox="${-span} ${-span} ${span * 2} ${span * 2}" class="board" xmlns="http://www.w3.org/2000/svg">`);
  parts.push(`<defs>
    <radialGradient id="quellglanz" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffe9a8" stop-opacity="0.95"/>
      <stop offset="60%" stop-color="#ffd166" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#ffd166" stop-opacity="0"/>
    </radialGradient>
  </defs>`);

  // Kanten
  const drawn = new Set();
  for (const id of board.order) {
    const a = board.nodes[id];
    for (const nb of a.neighbors) {
      const key = id < nb ? `${id}|${nb}` : `${nb}|${id}`;
      if (drawn.has(key)) continue;
      drawn.add(key);
      const b = board.nodes[nb];
      parts.push(`<line class="kante" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
    }
  }

  // Knoten
  for (const id of board.order) {
    const n = board.nodes[id];
    const controller = state.control[id];
    const cls = ['knoten'];
    if (n.isSource) cls.push('quelle');
    if (highlight.has(id)) cls.push('ziel');
    if (n.base !== null) cls.push('basis');

    if (n.isSource) {
      parts.push(`<circle cx="${n.x}" cy="${n.y}" r="${NODE_R + 0.15}" fill="url(#quellglanz)"/>`);
    }
    if (n.base !== null) {
      const col = state.players[n.base].color;
      const s = NODE_R + 0.26;
      parts.push(`<rect x="${n.x - s}" y="${n.y - s}" width="${s * 2}" height="${s * 2}" rx="0.1"
        class="basisrahmen" stroke="${col}"/>`);
    }
    const ctrlColor = controller !== null && controller !== undefined
      ? state.players[controller].color : null;
    parts.push(`<circle class="${cls.join(' ')}" cx="${n.x}" cy="${n.y}" r="${NODE_R}"
      ${ctrlColor ? `stroke="${ctrlColor}"` : ''}/>`);
    if (n.isSource) {
      parts.push(`<path class="quellsymbol" d="M ${n.x} ${n.y - 0.12} L ${n.x + 0.12} ${n.y} L ${n.x} ${n.y + 0.12} L ${n.x - 0.12} ${n.y} Z"/>`);
    }
  }

  // Befehlspfeile
  const orders = o.orders || {};
  for (const unitId in orders) {
    const u = state.units[unitId];
    if (!u) continue;
    if (o.showOrdersOf !== 'alle' && o.showOrdersOf !== u.owner) continue;
    const ord = orders[unitId];
    if (!ord || ord.action === 'halten') continue;
    const a = board.nodes[u.node];
    const b = board.nodes[ord.target];
    if (!b) continue;
    const col = state.players[u.owner].color;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const x1 = a.x + ux * (NODE_R + 0.06), y1 = a.y + uy * (NODE_R + 0.06);
    const x2 = b.x - ux * (NODE_R + 0.14), y2 = b.y - uy * (NODE_R + 0.14);
    if (ord.action === 'bewegen') {
      parts.push(`<line class="pfeil" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}"/>`);
      const hx = x2, hy = y2, w = 0.12;
      parts.push(`<path class="pfeilspitze" fill="${col}" d="M ${hx} ${hy}
        L ${hx - ux * 0.22 - uy * w} ${hy - uy * 0.22 + ux * w}
        L ${hx - ux * 0.22 + uy * w} ${hy - uy * 0.22 - ux * w} Z"/>`);
    } else {
      parts.push(`<line class="stuetze" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}"/>`);
      parts.push(`<circle class="stuetzpunkt" cx="${x2}" cy="${y2}" r="0.1" fill="${col}"/>`);
    }
  }

  // Einheiten
  for (const id of board.order) {
    const u = occ[id];
    if (!u) continue;
    const n = board.nodes[id];
    const col = state.players[u.owner].color;
    const sel = o.selection && o.selection.unitId === u.id;
    const mine = o.viewerId === u.owner;
    parts.push(`<circle class="einheit${sel ? ' gewaehlt' : ''}${mine ? ' eigen' : ''}"
      cx="${n.x}" cy="${n.y}" r="${NODE_R - 0.04}" fill="${col}"/>`);
    parts.push(`<text class="einheitstext" x="${n.x}" y="${n.y}">${TYPE_INFO[u.type].short}</text>`);
    if (o.ordered && o.ordered.has(u.id)) {
      parts.push(`<circle class="befehlspunkt" cx="${n.x + 0.2}" cy="${n.y - 0.2}" r="0.07"/>`);
    }
  }

  // Unsichtbare, grosse Trefferflaechen (Finger statt Mauszeiger)
  for (const id of board.order) {
    parts.push(`<circle class="treffer" data-node="${id}" cx="${board.nodes[id].x}" cy="${board.nodes[id].y}" r="${HIT_R}"/>`);
  }

  parts.push('</svg>');
  return parts.join('\n');
}
