import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from '../src/engine/resolver.js';
import { createGame, sourcesOf, majority } from '../src/engine/state.js';
import { emptyGame, place, move, hold, alive } from './helpers.js';

const run = (s, unitOrders, builds) => resolve(s, { unitOrders, builds: builds || {} });

test('Quelle besetzen bringt Kontrolle, Energie und Punkte', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'reiter', 'r2s0');
  const before = s.players[0].energy;
  const r = run(s, { [a]: move('r1s0') });
  assert.equal(r.state.control['r1s0'], 0);
  assert.equal(r.state.players[0].energy, before + 1);
  assert.equal(r.state.players[0].score, 1);
});

test('Kontrolle bleibt bestehen, wenn die Einheit weiterzieht', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'reiter', 'r1s0');
  let st = run(s, { [a]: hold() }).state;
  assert.equal(st.control['r1s0'], 0);
  st = run(st, { [a]: move('r2s0') }).state;
  assert.equal(st.control['r1s0'], 0, 'Quelle bleibt kontrolliert');
  assert.equal(st.players[0].score, 2, 'Punkte laufen weiter');
});

test('Gegner uebernimmt die Quelle durch Besetzen', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'reiter', 'r1s0');
  let st = run(s, { [a]: hold() }).state;
  assert.equal(st.control['r1s0'], 0);
  const b = place(st, 1, 'schild', 'r2s0');
  st = run(st, { [a]: move('k'), [b]: move('r1s0') }).state;
  assert.equal(st.control['r1s0'], 1);
});

test('Bauen kostet Energie und stellt die Einheit in die Basis', () => {
  const s = emptyGame(2);
  s.players[0].energy = 3;
  const r = run(s, {}, { 0: 'bogen' });
  const base = s.board.bases[0];
  const built = Object.values(r.state.units).find((u) => u.node === base);
  assert.ok(built, 'Einheit wurde gebaut');
  assert.equal(built.type, 'bogen');
  assert.equal(r.state.players[0].energy, 1);
});

test('Bauen scheitert bei besetzter Basis - ohne Energieverlust', () => {
  const s = emptyGame(2);
  s.players[0].energy = 5;
  place(s, 0, 'schild', s.board.bases[0]);
  const r = run(s, {}, { 0: 'reiter' });
  assert.equal(Object.keys(r.state.units).length, 1);
  assert.equal(r.state.players[0].energy, 5, 'Energie bleibt erhalten');
  assert.ok(r.events.some((e) => e.type === 'buildFailed' && e.reason === 'basis-besetzt'));
});

test('Bauen scheitert bei zu wenig Energie', () => {
  const s = emptyGame(2);
  s.players[0].energy = 1;
  const r = run(s, {}, { 0: 'reiter' });
  assert.equal(Object.keys(r.state.units).length, 0);
  assert.equal(r.state.players[0].energy, 1);
});

test('Basis wird frei gezogen und im selben Zug bebaut', () => {
  const s = emptyGame(2);
  s.players[0].energy = 2;
  const base = s.board.bases[0];
  const a = place(s, 0, 'schild', base);
  const r = run(s, { [a]: move('r2s0') }, { 0: 'reiter' });
  assert.equal(r.state.units[a].node, 'r2s0');
  const built = Object.values(r.state.units).find((u) => u.node === base);
  assert.ok(built && built.type === 'reiter');
});

test('Energie steigt ab Runde 11 auf 2 pro Quelle', () => {
  const s = emptyGame(2);
  s.round = 11;
  const a = place(s, 0, 'reiter', 'r1s0');
  const before = s.players[0].energy;
  const r = run(s, { [a]: hold() });
  assert.equal(r.state.players[0].energy, before + 2);
});

test('Mehrheit muss zwei Runden gehalten werden', () => {
  const s = emptyGame(2);
  const need = majority(s); // 4 von 7
  const ids = [];
  for (let i = 0; i < need; i++) ids.push(place(s, 0, 'reiter', `r1s${i}`));
  const rival = place(s, 1, 'schild', s.board.bases[1]); // Gegner lebt noch
  const orders = Object.fromEntries([...ids, rival].map((id) => [id, hold()]));

  const first = run(s, orders);
  assert.equal(sourcesOf(first.state, 0), need);
  assert.equal(first.state.phase, 'orders', 'eine Runde Mehrheit reicht nicht');
  assert.equal(first.state.majorityStreak[0], 1);

  const second = run(first.state, orders);
  assert.equal(second.state.phase, 'finished');
  assert.equal(second.state.winner.reason, 'mehrheit');
  assert.deepEqual(second.state.winner.teams, [0]);
});

test('Verlorene Mehrheit setzt die Serie zurueck', () => {
  const s = emptyGame(2);
  const need = majority(s);
  const ids = [];
  for (let i = 0; i < need; i++) ids.push(place(s, 0, 'reiter', `r1s${i}`));
  const thief = place(s, 1, 'schild', 'r2s0'); // Schild schlaegt Reiter
  const hold4 = Object.fromEntries([...ids, thief].map((id) => [id, hold()]));
  let st = run(s, hold4).state;
  assert.equal(st.majorityStreak[0], 1);

  // Gegner nimmt eine Quelle zurueck -> Serie beginnt von vorn
  st = run(st, { ...hold4, [thief]: move('r1s0') }).state;
  assert.equal(st.majorityStreak[0], 0);
  assert.equal(st.phase, 'orders');
});

test('Team-Quellen zaehlen zusammen', () => {
  const s = emptyGame(4, { teams: [0, 0, 1, 1] });
  const a = place(s, 0, 'reiter', 'r1s0');
  const b = place(s, 0, 'reiter', 'r1s1');
  const c = place(s, 1, 'reiter', 'r1s2');
  const d = place(s, 1, 'reiter', 'r1s3');
  const e = place(s, 1, 'reiter', 'r1s4');
  const orders = Object.fromEntries([a, b, c, d, e].map((id) => [id, hold()]));
  // 9 Quellen bei 4 Spielern -> Mehrheit ist 5, zwei Runden zu halten
  assert.equal(majority(s), 5);
  const r = run(run(s, orders).state, orders);
  assert.equal(r.state.phase, 'finished');
  assert.deepEqual(r.state.winner.teams, [0]);
});

test('Nach der letzten Runde entscheiden die Punkte', () => {
  const s = emptyGame(2);
  s.round = s.config.maxRounds;
  s.players[0].score = 10;
  s.players[1].score = 4;
  const r = run(s, {});
  assert.equal(r.state.phase, 'finished');
  assert.equal(r.state.winner.reason, 'punkte');
  assert.deepEqual(r.state.winner.teams, [0]);
});

test('Gleichstand bei Punkten: mehr Einheiten gewinnen', () => {
  const s = emptyGame(2);
  s.round = s.config.maxRounds;
  s.players[0].score = 5;
  s.players[1].score = 5;
  place(s, 1, 'reiter', 'r3s3');
  const r = run(s, {});
  assert.deepEqual(r.state.winner.teams, [1]);
});

test('Letzter uebriger Spieler gewinnt', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'reiter', 'r1s0');
  const victim = place(s, 1, 'bogen', 'k');
  s.players[1].energy = 0;
  const r = run(s, { [a]: move('k'), [victim]: hold() });
  assert.ok(!alive(r.state, victim));
  assert.equal(r.state.phase, 'finished');
  assert.deepEqual(r.state.winner.teams, [0]);
});

test('Vollstaendige Partie endet spaetestens nach maxRounds', () => {
  let st = createGame({ playerCount: 3 });
  let guard = 0;
  while (st.phase !== 'finished' && guard++ < 100) {
    st = resolve(st, { unitOrders: {}, builds: {} }).state;
  }
  assert.equal(st.phase, 'finished');
  assert.ok(st.round <= st.config.maxRounds);
});

test('Startaufstellung ist fuer alle Spieler identisch aufgebaut', () => {
  const st = createGame({ playerCount: 6 });
  const perPlayer = st.players.map((p) =>
    Object.values(st.units).filter((u) => u.owner === p.id).map((u) => u.type).sort().join(','));
  assert.ok(perPlayer.every((x) => x === perPlayer[0]));
  assert.ok(st.players.every((p) => p.energy === st.config.startEnergy));
});
