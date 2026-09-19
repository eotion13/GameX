import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, occupancy } from '../src/engine/state.js';
import { resolve, normalizeOrder, legalOrders } from '../src/engine/resolver.js';
import { botOrders, mulberry32, randomBot } from '../src/engine/bots.js';
import { TYPES } from '../src/engine/rules.js';
import { emptyGame, place, move, support, hold, alive, nodeOf } from './helpers.js';

const run = (s, unitOrders, builds) => resolve(s, { unitOrders, builds: builds || {} });

test('Unbekannter Bautyp wird abgelehnt', () => {
  const s = emptyGame(2);
  s.players[0].energy = 9;
  const r = run(s, {}, { 0: 'drache' });
  assert.equal(Object.keys(r.state.units).length, 0);
  assert.equal(r.state.players[0].energy, 9);
  assert.ok(r.events.some((e) => e.type === 'buildFailed' && e.reason === 'unbekannter-typ'));
});

test('Unterstuetzung wirkt am Ursprungsfeld, also auch beim Angriff', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'schild', 'r1s1');   // Schild verliert gegen Bogen
  const helper = place(s, 0, 'reiter', 'r2s1');
  const d = place(s, 1, 'bogen', 'k');
  const r = run(s, { [a]: move('k'), [helper]: support('r1s1'), [d]: hold() });
  assert.equal(nodeOf(r.state, a), 'k', 'Staerke 2 schlaegt Staerke 1 trotz Typnachteil');
  assert.ok(!alive(r.state, d));
});

test('Verbuendeter Angriff schneidet keine Unterstuetzung', () => {
  const s = emptyGame(4, { teams: [0, 0, 1, 1] });
  const a = place(s, 0, 'bogen', 'r1s1');
  const helper = place(s, 0, 'bogen', 'r1s2');
  const mate = place(s, 1, 'reiter', 'r2s2');   // Partner zieht auf das Helferfeld
  const d = place(s, 2, 'reiter', 'k');
  const r = run(s, {
    [a]: move('k'), [helper]: support('r1s1'), [mate]: move('r1s2'), [d]: hold(),
  });
  assert.equal(nodeOf(r.state, a), 'k', 'Unterstuetzung bleibt bestehen');
  assert.ok(!r.events.some((e) => e.type === 'supportCut'));
});

test('Wer erfolgreich wegzieht, kann nicht mehr geschlagen werden', () => {
  const s = emptyGame(2);
  const flieht = place(s, 0, 'bogen', 'r1s0');  // Bogen verliert gegen Reiter
  const jaeger = place(s, 1, 'reiter', 'r2s0');
  const r = run(s, { [flieht]: move('r1s1'), [jaeger]: move('r1s0') });
  assert.ok(alive(r.state, flieht), 'rechtzeitig ausgewichen');
  assert.equal(nodeOf(r.state, flieht), 'r1s1');
  assert.equal(nodeOf(r.state, jaeger), 'r1s0');
});

test('Staerkster von mehreren Angreifern schlaegt den Verteidiger', () => {
  const s = emptyGame(3);
  const stark = place(s, 0, 'reiter', 'r1s0');
  const helper = place(s, 0, 'reiter', 'r1s1');
  const schwach = place(s, 1, 'schild', 'r1s3');
  const d = place(s, 2, 'reiter', 'k');
  const r = run(s, {
    [stark]: move('k'), [helper]: support('r1s0'), [schwach]: move('k'), [d]: hold(),
  });
  assert.equal(nodeOf(r.state, stark), 'k');
  assert.ok(!alive(r.state, d), 'Verteidiger faellt');
  assert.ok(alive(r.state, schwach), 'blockierter Mitangreifer ueberlebt');
  assert.equal(nodeOf(r.state, schwach), 'r1s3');
});

test('Niemals zwei Einheiten auf demselben Feld (1000 Zufallsrunden)', () => {
  for (let g = 0; g < 40; g++) {
    let st = createGame({ playerCount: 2 + (g % 5) });
    const rng = mulberry32(g + 1);
    for (let r = 0; r < 25 && st.phase !== 'finished'; r++) {
      const unitOrders = {};
      const builds = {};
      for (const p of st.players) {
        const o = randomBot(st, p.id, rng);
        Object.assign(unitOrders, o.unitOrders);
        Object.assign(builds, o.builds);
      }
      st = resolve(st, { unitOrders, builds }).state;
      const belegt = new Set();
      for (const u of Object.values(st.units)) {
        assert.ok(!belegt.has(u.node), `zwei Einheiten auf ${u.node}`);
        belegt.add(u.node);
        assert.ok(st.board.nodes[u.node], 'Einheit steht auf einem echten Feld');
        assert.ok(TYPES.includes(u.type), 'gueltiger Einheitstyp');
      }
    }
  }
});

test('Energie wird nie negativ und Punkte wachsen monoton', () => {
  let st = createGame({ playerCount: 4 });
  const rng = mulberry32(99);
  let letzte = st.players.map((p) => p.score);
  while (st.phase !== 'finished') {
    const unitOrders = {};
    const builds = {};
    for (const p of st.players) {
      const o = botOrders(st, p.id, 'normal', rng);
      Object.assign(unitOrders, o.unitOrders);
      Object.assign(builds, o.builds);
    }
    st = resolve(st, { unitOrders, builds }).state;
    for (const p of st.players) {
      assert.ok(p.energy >= 0, 'Energie bleibt >= 0');
      assert.ok(p.score >= letzte[p.id], 'Punkte sinken nie');
    }
    letzte = st.players.map((p) => p.score);
  }
});

test('Bots erteilen ausschliesslich legale Befehle', () => {
  for (const stufe of ['leicht', 'normal', 'schwer', 'zufall']) {
    let st = createGame({ playerCount: 3 });
    const rng = mulberry32(7);
    for (let r = 0; r < 6 && st.phase !== 'finished'; r++) {
      const unitOrders = {};
      const builds = {};
      for (const p of st.players) {
        const o = botOrders(st, p.id, stufe, rng);
        for (const uid in o.unitOrders) {
          const u = st.units[uid];
          assert.ok(u, `${stufe}: Befehl fuer existierende Einheit`);
          assert.equal(u.owner, p.id, `${stufe}: nur eigene Einheiten`);
          const norm = normalizeOrder(st, u, o.unitOrders[uid]);
          assert.ok(!norm.invalid, `${stufe}: legaler Befehl (${JSON.stringify(o.unitOrders[uid])})`);
        }
        for (const pid in o.builds) {
          assert.equal(Number(pid), p.id, `${stufe}: baut nur fuer sich selbst`);
          assert.ok(TYPES.includes(o.builds[pid]), `${stufe}: gueltiger Bautyp`);
        }
        Object.assign(unitOrders, o.unitOrders);
        Object.assign(builds, o.builds);
      }
      st = resolve(st, { unitOrders, builds }).state;
    }
  }
});

test('Gleicher Startwert liefert dieselbe Bot-Partie', () => {
  const spiele = () => {
    let st = createGame({ playerCount: 3 });
    const rng = mulberry32(4242);
    while (st.phase !== 'finished') {
      const unitOrders = {};
      const builds = {};
      for (const p of st.players) {
        const o = botOrders(st, p.id, 'normal', rng);
        Object.assign(unitOrders, o.unitOrders);
        Object.assign(builds, o.builds);
      }
      st = resolve(st, { unitOrders, builds }).state;
    }
    return st;
  };
  assert.deepEqual(spiele(), spiele());
});

test('legalOrders enthaelt Halten und alle Nachbarfelder', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'reiter', 'r1s0');
  const optionen = legalOrders(s, s.units[a]);
  const nachbarn = s.board.nodes['r1s0'].neighbors;
  assert.ok(optionen.some((o) => o.action === 'halten'));
  for (const nb of nachbarn) {
    assert.ok(optionen.some((o) => o.action === 'bewegen' && o.target === nb), `Zug nach ${nb}`);
  }
  assert.ok(!optionen.some((o) => o.action === 'unterstuetzen'), 'ohne Kameraden keine Unterstuetzung');
});

test('Befehl fuer eine gefallene Einheit stoert die Auswertung nicht', () => {
  const s = emptyGame(2);
  const opfer = place(s, 0, 'bogen', 'r1s0');
  const jaeger = place(s, 1, 'reiter', 'r2s0');
  const st = run(s, { [opfer]: hold(), [jaeger]: move('r1s0') }).state;
  assert.ok(!alive(st, opfer));
  const r2 = resolve(st, { unitOrders: { [opfer]: move('k') }, builds: {} });
  assert.equal(r2.state.phase, st.phase === 'finished' ? 'finished' : r2.state.phase);
  assert.ok(true, 'kein Absturz');
});

test('Unterstuetzung eines Feldes ohne Bewegung verteidigt es', () => {
  const s = emptyGame(2);
  const d = place(s, 0, 'bogen', 'r1s0');
  const h = place(s, 0, 'bogen', 'r1s1');
  const a = place(s, 1, 'reiter', 'r2s0');
  const r = run(s, { [d]: hold(), [h]: support('r1s0'), [a]: move('r1s0') });
  assert.ok(alive(r.state, d));
  assert.ok(!alive(r.state, a), 'Angreifer faellt an der Uebermacht');
});
