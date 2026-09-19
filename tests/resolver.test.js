import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from '../src/engine/resolver.js';
import { emptyGame, place, move, support, hold, nodeOf, alive } from './helpers.js';

const run = (s, unitOrders, builds) => resolve(s, { unitOrders, builds: builds || {} });

test('Zug auf freies Feld gelingt', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'reiter', 'r2s0');
  const r = run(s, { [a]: move('r1s0') });
  assert.equal(nodeOf(r.state, a), 'r1s0');
});

test('Zug auf nicht benachbartes Feld wird zu Halten', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'reiter', 'r3s0');
  const r = run(s, { [a]: move('k') });
  assert.equal(nodeOf(r.state, a), 'r3s0');
});

test('Gleiche Typen prallen ab - keine Verluste', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'reiter', 'r2s0');
  const d = place(s, 1, 'reiter', 'r1s0');
  const r = run(s, { [a]: move('r1s0'), [d]: hold() });
  assert.equal(nodeOf(r.state, a), 'r2s0');
  assert.ok(alive(r.state, d));
  assert.equal(nodeOf(r.state, d), 'r1s0');
});

test('Ueberlegener Typ schlaegt den Verteidiger', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'reiter', 'r2s0');   // Reiter schlaegt Bogen
  const d = place(s, 1, 'bogen', 'r1s0');
  const r = run(s, { [a]: move('r1s0'), [d]: hold() });
  assert.equal(nodeOf(r.state, a), 'r1s0');
  assert.ok(!alive(r.state, d), 'Bogen wurde geschlagen');
});

test('Unterlegener Typ faellt beim Angriff', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'bogen', 'r2s0');    // Bogen verliert gegen Reiter
  const d = place(s, 1, 'reiter', 'r1s0');
  const r = run(s, { [a]: move('r1s0'), [d]: hold() });
  assert.ok(!alive(r.state, a), 'der gescheiterte Angreifer faellt');
  assert.ok(alive(r.state, d));
  assert.ok(r.events.some((e) => e.type === 'destroyed' && e.cause === 'angriff-gescheitert'));
});

test('Unterstuetzung entscheidet gegen den Typvorteil', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'bogen', 'r2s0');
  const helper = place(s, 0, 'schild', 'r2s1');
  const d = place(s, 1, 'reiter', 'r1s0');
  // r2s1 ist Nachbar von r2s0 -> unterstuetzt den Angreifer auf seinem Feld
  const r = run(s, { [a]: move('r1s0'), [helper]: support('r2s0'), [d]: hold() });
  assert.equal(nodeOf(r.state, a), 'r1s0', 'Staerke 2 schlaegt Staerke 1');
  assert.ok(!alive(r.state, d));
});

test('Unterstuetzung wird durch feindlichen Angriff geschnitten', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'bogen', 'r2s0');
  const helper = place(s, 0, 'schild', 'r2s1');
  const d = place(s, 1, 'reiter', 'r1s0');
  const cutter = place(s, 1, 'bogen', 'r1s1'); // greift das Feld des Helfers an
  const r = run(s, {
    [a]: move('r1s0'),
    [helper]: support('r2s0'),
    [d]: hold(),
    [cutter]: move('r2s1'),
  });
  assert.ok(!alive(r.state, a), 'ohne Unterstuetzung scheitert der Bogen am Reiter');
  assert.ok(alive(r.state, d));
  assert.ok(r.events.some((e) => e.type === 'supportCut'));
});

test('Verteidiger mit Unterstuetzung schlaegt den Typvorteil des Angreifers', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'reiter', 'r2s0');
  const d = place(s, 1, 'bogen', 'r1s0');
  const helper = place(s, 1, 'bogen', 'r1s1');
  const r = run(s, { [a]: move('r1s0'), [d]: hold(), [helper]: support('r1s0') });
  assert.ok(alive(r.state, d), 'unterstuetzter Verteidiger ueberlebt den Typnachteil');
  assert.ok(!alive(r.state, a), 'Staerke 1 gegen Staerke 2 kostet die Einheit');
});

test('Angreifer im Patt bleibt unversehrt stehen', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'reiter', 'r2s0');
  const d = place(s, 1, 'reiter', 'r1s0');
  const r = run(s, { [a]: move('r1s0'), [d]: hold() });
  assert.ok(alive(r.state, a));
  assert.equal(nodeOf(r.state, a), 'r2s0');
});

test('Blockierende Mitangreifer prallen unversehrt ab', () => {
  // Reiter, Bogen und Schild ziehen aufs selbe Feld: keiner setzt sich durch,
  // also greift auch keiner den Verteidiger an - niemand faellt.
  const s = emptyGame(3);
  const a = place(s, 0, 'reiter', 'r1s0');
  const b = place(s, 1, 'bogen', 'r1s1');
  const c = place(s, 2, 'schild', 'r1s5');
  const d = place(s, 0, 'schild', 'k');
  const r = run(s, { [a]: move('k'), [b]: move('k'), [c]: move('k'), [d]: hold() });
  assert.equal(Object.keys(r.state.units).length, 4, 'niemand faellt im Dreier-Patt');
});

test('Zwei gleich starke Angreifer auf ein freies Feld: Typ entscheidet', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'reiter', 'r1s0');
  const b = place(s, 1, 'bogen', 'r1s1');
  const r = run(s, { [a]: move('k'), [b]: move('k') });
  assert.equal(nodeOf(r.state, a), 'k');
  assert.equal(nodeOf(r.state, b), 'r1s1', 'der Unterlegene prallt ab, stirbt aber nicht');
  assert.ok(alive(r.state, b));
});

test('Dreier-Patt (Reiter/Bogen/Schild): niemand betritt das Feld', () => {
  const s = emptyGame(3);
  const a = place(s, 0, 'reiter', 'r1s0');
  const b = place(s, 1, 'bogen', 'r1s2');
  const c = place(s, 2, 'schild', 'r1s4');
  const r = run(s, { [a]: move('k'), [b]: move('k'), [c]: move('k') });
  assert.equal(nodeOf(r.state, a), 'r1s0');
  assert.equal(nodeOf(r.state, b), 'r1s2');
  assert.equal(nodeOf(r.state, c), 'r1s4');
});

test('Platztausch bei Gleichstand: beide bleiben stehen', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'reiter', 'r1s0');
  const b = place(s, 1, 'reiter', 'k');
  const r = run(s, { [a]: move('k'), [b]: move('r1s0') });
  assert.equal(nodeOf(r.state, a), 'r1s0');
  assert.equal(nodeOf(r.state, b), 'k');
});

test('Platztausch mit Typvorteil: der Staerkere zieht durch', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'reiter', 'r1s0');
  const b = place(s, 1, 'bogen', 'k');
  const r = run(s, { [a]: move('k'), [b]: move('r1s0') });
  assert.equal(nodeOf(r.state, a), 'k');
  assert.ok(!alive(r.state, b), 'der Verlierer des Tauschs faellt');
});

test('Rotation dreier Einheiten gelingt vollstaendig', () => {
  // k, r1s0 und r1s1 bilden ein Dreieck - eine echte Rotation.
  const s = emptyGame(2);
  const a = place(s, 0, 'reiter', 'k');
  const b = place(s, 0, 'bogen', 'r1s0');
  const c = place(s, 0, 'schild', 'r1s1');
  const r = run(s, { [a]: move('r1s0'), [b]: move('r1s1'), [c]: move('k') });
  assert.equal(nodeOf(r.state, a), 'r1s0');
  assert.equal(nodeOf(r.state, b), 'r1s1');
  assert.equal(nodeOf(r.state, c), 'k');
});

test('Rotation gegnerischer Einheiten gelingt ebenfalls', () => {
  const s = emptyGame(3);
  const a = place(s, 0, 'reiter', 'k');
  const b = place(s, 1, 'bogen', 'r1s0');
  const c = place(s, 2, 'schild', 'r1s1');
  const r = run(s, { [a]: move('r1s0'), [b]: move('r1s1'), [c]: move('k') });
  assert.equal(nodeOf(r.state, a), 'r1s0');
  assert.equal(nodeOf(r.state, b), 'r1s1');
  assert.equal(nodeOf(r.state, c), 'k');
  assert.equal(Object.keys(r.state.units).length, 3, 'niemand faellt bei einer Rotation');
});

test('Kette: blockierte Vorderfront blockiert den Nachruecker', () => {
  const s = emptyGame(2);
  const front = place(s, 0, 'reiter', 'r1s0');  // will nach k, prallt im Patt ab
  const back = place(s, 0, 'reiter', 'r2s0');   // will nach r1s0
  const blocker = place(s, 1, 'reiter', 'k');
  const r = run(s, { [front]: move('k'), [back]: move('r1s0'), [blocker]: hold() });
  assert.equal(nodeOf(r.state, front), 'r1s0', 'Reiter prallt am Reiter ab');
  assert.equal(nodeOf(r.state, back), 'r2s0', 'Nachruecker kann nicht auf besetztes Feld');
  assert.ok(alive(r.state, front), 'Verbuendete verdraengen sich nicht');
});

test('Kette: freiwerdendes Feld wird nachbesetzt', () => {
  const s = emptyGame(2);
  const front = place(s, 0, 'reiter', 'r1s0'); // zieht erfolgreich ins Zentrum
  const back = place(s, 0, 'schild', 'r2s0');
  const r = run(s, { [front]: move('k'), [back]: move('r1s0') });
  assert.equal(nodeOf(r.state, front), 'k');
  assert.equal(nodeOf(r.state, back), 'r1s0');
});

test('Verbuendete werden nicht angegriffen und nicht getauscht', () => {
  const s = emptyGame(4, { teams: [0, 0, 1, 1] });
  const a = place(s, 0, 'reiter', 'r1s0');
  const b = place(s, 1, 'bogen', 'k');
  const r = run(s, { [a]: move('k'), [b]: hold() });
  assert.equal(nodeOf(r.state, a), 'r1s0');
  assert.ok(alive(r.state, b), 'Teampartner bleibt unversehrt');
});

test('Unterstuetzung fuer Gegner ist ungueltig und wird zu Halten', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'schild', 'r1s1');
  const enemy = place(s, 1, 'reiter', 'r1s0');
  const attacker = place(s, 0, 'reiter', 'r2s0');
  const r = run(s, { [a]: support('r1s0'), [enemy]: hold(), [attacker]: move('r1s0') });
  // Der Reiter greift den Reiter an: Gleichstand -> prallt ab. Die ungueltige
  // Unterstuetzung darf den Gegner nicht staerken und nicht helfen.
  assert.equal(nodeOf(r.state, attacker), 'r2s0');
  assert.ok(alive(r.state, enemy));
});

test('Unterstuetzung auf leeres Feld ist ungueltig', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'schild', 'r1s1');
  const r = run(s, { [a]: support('r1s2') });
  assert.equal(nodeOf(r.state, a), 'r1s1');
});

test('Zwei Unterstuetzungen schlagen eine', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'bogen', 'r1s1');
  const h1 = place(s, 0, 'bogen', 'r1s2');
  const h2 = place(s, 0, 'bogen', 'r2s1');
  const d = place(s, 1, 'reiter', 'k');
  const dh = place(s, 1, 'reiter', 'r1s0');
  const r = run(s, {
    [a]: move('k'), [h1]: support('r1s1'), [h2]: support('r1s1'),
    [d]: hold(), [dh]: support('k'),
  });
  assert.equal(nodeOf(r.state, a), 'k', 'Staerke 3 schlaegt Staerke 2');
  assert.ok(!alive(r.state, d));
});

test('Determinismus: gleiche Eingabe liefert exakt gleiche Ausgabe', () => {
  const build = () => {
    const s = emptyGame(3);
    place(s, 0, 'reiter', 'r1s0');
    place(s, 1, 'bogen', 'r1s2');
    place(s, 2, 'schild', 'r1s4');
    place(s, 0, 'schild', 'r2s0');
    return s;
  };
  const orders = { u1: move('k'), u2: move('k'), u3: move('r1s3'), u4: support('r1s0') };
  const r1 = resolve(build(), { unitOrders: orders, builds: {} });
  const r2 = resolve(build(), { unitOrders: orders, builds: {} });
  assert.deepEqual(r1.state, r2.state);
  assert.deepEqual(r1.events, r2.events);
});

test('Ausgangszustand wird nicht veraendert (reine Funktion)', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'reiter', 'r2s0');
  const before = JSON.stringify(s);
  resolve(s, { unitOrders: { [a]: move('r1s0') }, builds: {} });
  assert.equal(JSON.stringify(s), before);
});
