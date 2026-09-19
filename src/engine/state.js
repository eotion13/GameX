// Spielzustand: reine Daten, vollstaendig serialisierbar, kein Zufall.

import { CONFIG, PLAYER_COLORS, PLAYER_NAMES, majorityNeeded } from './rules.js';
import { createBoard, startNodes } from './board.js';

export const STATE_VERSION = 1;

/**
 * @param {object} opts
 *  playerCount: 2..6
 *  teams: optional Array<number> (Teamnummer je Spieler); Standard = jeder fuer sich
 *  players: optional Array<{name, isBot, botLevel}>
 */
export function createGame(opts = {}) {
  const playerCount = opts.playerCount ?? 3;
  const config = { ...CONFIG, ...(opts.config || {}) };
  const board = createBoard(playerCount, config);
  const teams = opts.teams && opts.teams.length === playerCount
    ? opts.teams.slice()
    : Array.from({ length: playerCount }, (_, i) => i);

  const players = [];
  for (let i = 0; i < playerCount; i++) {
    const p = (opts.players && opts.players[i]) || {};
    players.push({
      id: i,
      name: p.name || PLAYER_NAMES[i],
      color: PLAYER_COLORS[i],
      team: teams[i],
      isBot: !!p.isBot,
      botLevel: p.botLevel || 'normal',
      energy: config.startEnergy,
      score: 0,
      eliminated: false,
    });
  }

  const units = {};
  let nextUnitId = 1;
  for (let i = 0; i < playerCount; i++) {
    const [baseNode, frontNode] = startNodes(board, i);
    units[`u${nextUnitId}`] = { id: `u${nextUnitId}`, owner: i, type: 'schild', node: baseNode };
    nextUnitId++;
    units[`u${nextUnitId}`] = { id: `u${nextUnitId}`, owner: i, type: 'reiter', node: frontNode };
    nextUnitId++;
  }

  const control = {};
  for (const id of board.sources) control[id] = null;

  return {
    version: STATE_VERSION,
    config,
    board,
    players,
    units,
    control,
    round: 1,
    majorityStreak: {}, // Team -> Runden in Folge mit Quellen-Mehrheit
    phase: 'orders', // 'orders' | 'finished'
    winner: null,
    nextUnitId,
    history: [], // je Runde: { round, orders, events }
  };
}

export function clone(state) {
  return JSON.parse(JSON.stringify(state));
}

export function unitAt(state, nodeId) {
  for (const id in state.units) {
    if (state.units[id].node === nodeId) return state.units[id];
  }
  return null;
}

export function occupancy(state) {
  const map = {};
  for (const id in state.units) map[state.units[id].node] = state.units[id];
  return map;
}

export function unitsOf(state, playerId) {
  return Object.values(state.units).filter((u) => u.owner === playerId);
}

export function teamOf(state, playerId) {
  return state.players[playerId].team;
}

export function sameTeam(state, a, b) {
  return state.players[a].team === state.players[b].team;
}

/** Anzahl kontrollierter Quellen je Spieler. */
export function sourcesOf(state, playerId) {
  let n = 0;
  for (const id in state.control) if (state.control[id] === playerId) n++;
  return n;
}

/** Anzahl kontrollierter Quellen je Team. */
export function teamSources(state, team) {
  let n = 0;
  for (const id in state.control) {
    const owner = state.control[id];
    if (owner !== null && state.players[owner].team === team) n++;
  }
  return n;
}

export function teamList(state) {
  const seen = [];
  for (const p of state.players) if (!seen.includes(p.team)) seen.push(p.team);
  return seen;
}

export function teamMembers(state, team) {
  return state.players.filter((p) => p.team === team);
}

export function teamScore(state, team) {
  return state.players.filter((p) => p.team === team).reduce((a, p) => a + p.score, 0);
}

export function teamUnits(state, team) {
  return Object.values(state.units).filter((u) => state.players[u.owner].team === team).length;
}

export function baseNodeOf(state, playerId) {
  return state.board.bases[playerId];
}

export function majority(state) {
  return majorityNeeded(state.board.sources.length);
}

/** Zusammenfassung fuer Anzeige und Bots. */
export function standings(state) {
  return teamList(state).map((team) => ({
    team,
    members: teamMembers(state, team).map((p) => p.id),
    sources: teamSources(state, team),
    score: teamScore(state, team),
    units: teamUnits(state, team),
  }));
}
