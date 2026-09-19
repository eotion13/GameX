import { createGame } from '../src/engine/state.js';

/** Leeres Spiel ohne Starteinheiten - fuer praezise Testaufbauten. */
export function emptyGame(playerCount = 2, opts = {}) {
  const s = createGame({ playerCount, ...opts });
  s.units = {};
  s.nextUnitId = 1;
  return s;
}

export function place(s, owner, type, node) {
  const id = `u${s.nextUnitId++}`;
  s.units[id] = { id, owner, type, node };
  return id;
}

export function move(target) { return { action: 'bewegen', target }; }
export function support(target) { return { action: 'unterstuetzen', target }; }
export function hold() { return { action: 'halten' }; }

export function nodeOf(state, unitId) {
  return state.units[unitId] ? state.units[unitId].node : null;
}

export function alive(state, unitId) {
  return state.units[unitId] !== undefined;
}
