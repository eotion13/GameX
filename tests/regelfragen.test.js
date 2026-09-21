// Jede Behauptung aus dem Abschnitt "Haeufige Fragen" im Regelheft steht hier
// als Test. Wenn die Engine sich aendert, faellt sofort auf, dass die Regeln
// nachgezogen werden muessen.

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from '../src/engine/resolver.js';
import { emptyGame, place, move, hold, support, alive, nodeOf } from './helpers.js';

const run = (s, unitOrders) => resolve(s, { unitOrders, builds: {} });

// --- "Bekomme ich nur Punkte, solange ich auf der Quelle stehe?" -----------

test('Quelle bringt weiter Punkte, auch wenn die Figur weiterzieht', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'reiter', 'r1s0'); // r1s0 ist eine Quelle
  let st = run(s, { [a]: hold() }).state;
  assert.equal(st.control['r1s0'], 0);
  assert.equal(st.players[0].score, 1);

  st = run(st, { [a]: move('r2s0') }).state; // weggehen
  assert.equal(st.control['r1s0'], 0, 'Quelle bleibt in Besitz');
  assert.equal(st.players[0].score, 2, 'Punkte laufen weiter');

  st = run(st, { [a]: hold() }).state; // eine Runde weit weg bleiben
  assert.equal(st.players[0].score, 3, 'und laufen immer weiter');
});

test('ein Gegner daneben aendert nichts am Besitz der Quelle', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'reiter', 'r1s0');
  let st = run(s, { [a]: hold() }).state;
  const feind = place(st, 1, 'bogen', 'r2s0'); // Nachbar der Quelle
  st = run(st, { [a]: move('k'), [feind]: hold() }).state;
  assert.equal(st.control['r1s0'], 0, 'Danebenstehen genuegt nicht');
});

test('erst das Betreten durch den Gegner nimmt die Quelle weg', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'reiter', 'r1s0');
  let st = run(s, { [a]: hold() }).state;
  const feind = place(st, 1, 'bogen', 'r2s0');
  st = run(st, { [a]: move('k'), [feind]: move('r1s0') }).state;
  assert.equal(st.control['r1s0'], 1);
});

// --- "Was passiert, wenn ich vor einem Angreifer weglaufe?" ----------------

test('Weglaufen rettet die Figur, der Angreifer laeuft ins Leere', () => {
  const s = emptyGame(2);
  const ich = place(s, 0, 'reiter', 'r1s0');
  const jaeger = place(s, 1, 'schild', 'r2s0'); // Schild schlaegt Reiter
  const flucht = s.board.nodes['r1s0'].neighbors.find((n) => n !== 'r2s0');

  const r = run(s, { [ich]: move(flucht), [jaeger]: move('r1s0') });
  assert.ok(alive(r.state, ich), 'ich ueberlebe trotz unterlegenem Typ');
  assert.equal(nodeOf(r.state, ich), flucht, 'und stehe auf dem Fluchtfeld');
  assert.equal(nodeOf(r.state, jaeger), 'r1s0', 'der Jaeger bekommt nur das leere Feld');
  assert.equal(r.events.filter((e) => e.type === 'destroyed').length, 0, 'niemand faellt');
});

test('Flucht auf ein Feld mit einem Staerkeren endet toedlich', () => {
  const s = emptyGame(2);
  const ich = place(s, 0, 'reiter', 'r1s0');
  const jaeger = place(s, 1, 'bogen', 'r2s0');
  const flucht = s.board.nodes['r1s0'].neighbors.find((n) => n !== 'r2s0');
  place(s, 1, 'schild', flucht); // Schild schlaegt Reiter: Fluchtweg versperrt

  const r = run(s, { [ich]: move(flucht), [jaeger]: move('r1s0') });
  assert.equal(alive(r.state, ich), false, 'die Flucht scheitert und kostet die Figur');
});

// --- "Was passiert, wenn ich drei Figuren auf dasselbe Feld schicke?" ------

test('drei eigene Figuren auf dasselbe leere Feld blockieren sich vollstaendig', () => {
  const s = emptyGame(2);
  const von = s.board.nodes['k'].neighbors.slice(0, 3);
  const us = von.map((n) => place(s, 0, 'reiter', n));

  const r = run(s, Object.fromEntries(us.map((u) => [u, move('k')])));
  for (let i = 0; i < us.length; i++) {
    assert.ok(alive(r.state, us[i]), 'niemand nimmt Schaden');
    assert.equal(nodeOf(r.state, us[i]), von[i], 'aber auch niemand kommt vom Fleck');
  }
  assert.equal(Object.values(r.state.units).filter((u) => u.node === 'k').length, 0);
});

test('mit Unterstuetzung setzt sich eine von zweien doch durch', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'reiter', 'r1s0');
  const b = place(s, 0, 'reiter', 'r1s1');
  const helfer = place(s, 0, 'reiter', 'r2s0'); // Nachbar von r1s0

  const r = run(s, { [a]: move('k'), [b]: move('k'), [helfer]: support('r1s0') });
  assert.equal(nodeOf(r.state, a), 'k', 'die unterstuetzte Figur kommt an');
  assert.equal(nodeOf(r.state, b), 'r1s1', 'die andere bleibt stehen');
});

// --- "Und wenn ich mit drei Figuren eine gegnerische angreife?" ------------

test('drei gleichzeitige Angriffe lassen den Verteidiger voellig unbehelligt', () => {
  const s = emptyGame(2);
  const feind = place(s, 1, 'schild', 'k');
  const von = s.board.nodes['k'].neighbors.slice(0, 3);
  const us = von.map((n) => place(s, 0, 'reiter', n));

  const r = run(s, { ...Object.fromEntries(us.map((u) => [u, move('k')])), [feind]: hold() });
  assert.ok(alive(r.state, feind), 'der Verteidiger steht noch');
  assert.equal(nodeOf(r.state, feind), 'k');
  assert.equal(us.filter((u) => !alive(r.state, u)).length, 0, 'gekostet hat es nichts');
  assert.equal(us.filter((u, i) => nodeOf(r.state, u) !== von[i]).length, 0, 'gebracht auch nichts');
});

test('einer greift an, die anderen unterstuetzen: der Verteidiger faellt', () => {
  const s = emptyGame(2);
  const feind = place(s, 1, 'schild', 'k');
  const angreifer = place(s, 0, 'reiter', 'r1s0'); // Schild schlaegt Reiter
  const helfer = place(s, 0, 'reiter', 'r2s0');    // Nachbar des Angreifers

  const r = run(s, {
    [angreifer]: move('k'),
    [helfer]: support('r1s0'),
    [feind]: hold(),
  });
  assert.equal(alive(r.state, feind), false, 'Staerke 2 schlaegt den Typvorteil');
  assert.equal(nodeOf(r.state, angreifer), 'k');
  assert.equal(r.state.control['k'], 0, 'die Quelle wechselt den Besitzer');
});

// --- "Feinheiten" ----------------------------------------------------------

test('zwei Gegner auf dasselbe leere Feld: der bessere Typ bekommt es, beide leben', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'reiter', 'r1s0'); // Reiter schlaegt Bogen
  const b = place(s, 1, 'bogen', 'r1s1');

  const r = run(s, { [a]: move('k'), [b]: move('k') });
  assert.equal(nodeOf(r.state, a), 'k');
  assert.ok(alive(r.state, b), 'der Unterlegene faellt nicht - es war kein Kampf');
  assert.equal(nodeOf(r.state, b), 'r1s1');
});

// --- "Was, wenn ein Gegner auf dasselbe Fluchtfeld zieht?" ----------------

test('Wettrennen ums Fluchtfeld gewonnen: die Flucht gelingt', () => {
  const s = emptyGame(2);
  const ich = place(s, 0, 'reiter', 'r1s0');
  const jaeger = place(s, 1, 'schild', 'r2s0');   // greift mein Feld an
  const rivale = place(s, 1, 'bogen', 'r1s1');    // will auch nach k; Reiter schlaegt Bogen

  const r = run(s, { [ich]: move('k'), [jaeger]: move('r1s0'), [rivale]: move('k') });
  assert.equal(nodeOf(r.state, ich), 'k', 'ich gewinne das Rennen');
  assert.ok(alive(r.state, rivale), 'der Rivale prallt nur ab');
  assert.equal(nodeOf(r.state, rivale), 'r1s1');
});

test('Wettrennen unentschieden: ich bleibe stehen und muss kaempfen', () => {
  const s = emptyGame(2);
  const ich = place(s, 0, 'reiter', 'r1s0');
  const jaeger = place(s, 1, 'schild', 'r2s0');   // Schild schlaegt Reiter
  const rivale = place(s, 1, 'reiter', 'r1s1');   // gleicher Typ wie ich -> Patt um k

  const r = run(s, { [ich]: move('k'), [jaeger]: move('r1s0'), [rivale]: move('k') });
  assert.equal(alive(r.state, ich), false, 'die Flucht scheitert, der Kampf findet statt');
  assert.equal(nodeOf(r.state, jaeger), 'r1s0');
});

// --- "Ist Unterstuetzen auch beim Verteidigen sinnvoll?" ------------------

test('ein unterstuetzter Verteidiger schlaegt den Typvorteil des Angreifers', () => {
  const s = emptyGame(2);
  const verteidiger = place(s, 0, 'reiter', 'r1s0');
  const helfer = place(s, 0, 'bogen', 'k');        // Nachbar von r1s0
  const angreifer = place(s, 1, 'schild', 'r2s0'); // Schild schlaegt Reiter

  const r = run(s, {
    [verteidiger]: hold(), [helfer]: support('r1s0'), [angreifer]: move('r1s0'),
  });
  assert.ok(alive(r.state, verteidiger), 'Staerke 2 gegen 1 gewinnt');
  assert.equal(alive(r.state, angreifer), false, 'der Angreifer faellt');
});

test('ohne den Helfer stirbt derselbe Verteidiger', () => {
  const s = emptyGame(2);
  const verteidiger = place(s, 0, 'reiter', 'r1s0');
  const angreifer = place(s, 1, 'schild', 'r2s0');

  const r = run(s, { [verteidiger]: hold(), [angreifer]: move('r1s0') });
  assert.equal(alive(r.state, verteidiger), false);
});

test('wird der Helfer angegriffen, faellt seine Hilfe weg', () => {
  const s = emptyGame(2);
  const verteidiger = place(s, 0, 'reiter', 'r1s0');
  const helfer = place(s, 0, 'bogen', 'k');
  const angreifer = place(s, 1, 'schild', 'r2s0');
  const stoerer = place(s, 1, 'reiter', 'r1s3');   // Nachbar von k

  const r = run(s, {
    [verteidiger]: hold(), [helfer]: support('r1s0'),
    [angreifer]: move('r1s0'), [stoerer]: move('k'),
  });
  assert.ok(r.events.some((e) => e.type === 'supportCut'), 'die Hilfe wird geschnitten');
  assert.equal(alive(r.state, verteidiger), false, 'und der Verteidiger steht allein da');
});

// --- "Gilt das Blockieren auch fuer zwei?" -------------------------------

test('auch zwei eigene Figuren mit verschiedenen Typen blockieren sich', () => {
  const s = emptyGame(2);
  const a = place(s, 0, 'reiter', 'r1s0');
  const b = place(s, 0, 'bogen', 'r1s1'); // Reiter schlaegt Bogen - unter Eigenen egal

  const r = run(s, { [a]: move('k'), [b]: move('k') });
  assert.equal(nodeOf(r.state, a), 'r1s0');
  assert.equal(nodeOf(r.state, b), 'r1s1');
  assert.equal(Object.values(r.state.units).filter((u) => u.node === 'k').length, 0);
});

// --- "Nimmt der Gegner meine verlassene Quelle einfach?" ------------------

test('eine verlassene Quelle kann der Gegner kampflos uebernehmen', () => {
  const s = emptyGame(2);
  const ich = place(s, 0, 'reiter', 'r1s0');
  let st = run(s, { [ich]: hold() }).state;
  assert.equal(st.control['r1s0'], 0);

  const gegner = place(st, 1, 'bogen', 'r2s0');
  st = run(st, { [ich]: move('k'), [gegner]: move('r1s0') }).state;
  assert.equal(st.control['r1s0'], 1, 'weggehen heisst: die Quelle steht offen');
  assert.ok(alive(st, ich), 'gekaempft wurde dabei nicht');
});

// --- "Reicht es, einmal draufgewesen zu sein?" ----------------------------
// Genauer: es zaehlt, am Rundenende dort zu stehen.

test('ein gescheiterter Angriff auf eine Quelle bringt keinen Besitz', () => {
  const s = emptyGame(2);
  const ich = place(s, 0, 'reiter', 'r2s0');
  const wache = place(s, 1, 'schild', 'r1s0'); // Schild schlaegt Reiter
  let st = run(s, { [wache]: hold(), [ich]: hold() }).state;
  assert.equal(st.control['r1s0'], 1, 'die Wache haelt die Quelle');

  st = run(st, { [ich]: move('r1s0'), [wache]: hold() }).state;
  assert.equal(alive(st, ich), false, 'der Angriff scheitert');
  assert.equal(st.control['r1s0'], 1, 'angreifen allein genuegt nicht - ankommen zaehlt');
});

test('die Quelle bleibt in Besitz, auch wenn die Figur danach faellt', () => {
  const s = emptyGame(2);
  const ich = place(s, 0, 'reiter', 'r1s0');
  let st = run(s, { [ich]: hold() }).state;
  assert.equal(st.control['r1s0'], 0);

  const falle = place(st, 1, 'schild', 'k'); // Schild schlaegt Reiter
  st = run(st, { [ich]: move('k'), [falle]: hold() }).state;
  assert.equal(alive(st, ich), false, 'meine Figur stirbt woanders');
  assert.equal(st.control['r1s0'], 0, 'der Besitz haengt am Feld, nicht an der Figur');
  assert.equal(st.players[0].score, 2, 'die Quelle zahlt weiter');
});

test('ein gescheiterter Angreifer nimmt dem Verteidiger die Quelle nicht', () => {
  const s = emptyGame(2);
  const ich = place(s, 0, 'schild', 'r1s0'); // Schild schlaegt Reiter
  const feind = place(s, 1, 'reiter', 'r2s0');
  let st = run(s, { [ich]: hold(), [feind]: hold() }).state;
  st = run(st, { [ich]: hold(), [feind]: move('r1s0') }).state;
  assert.equal(alive(st, feind), false);
  assert.equal(st.control['r1s0'], 0);
});
