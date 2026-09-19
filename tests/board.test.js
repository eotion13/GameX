import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, distancesFrom, startNodes, areAdjacent } from '../src/engine/board.js';

test('Brett existiert fuer 2 bis 6 Spieler', () => {
  for (let p = 2; p <= 6; p++) {
    const b = createBoard(p);
    assert.equal(b.bases.length, p);
    assert.equal(b.sources.length, b.spokes + 1);
    assert.equal(b.order.length, 1 + b.spokes * b.rings);
  }
});

test('Ungueltige Spielerzahl wird abgelehnt', () => {
  assert.throws(() => createBoard(1));
  assert.throws(() => createBoard(7));
});

test('Nachbarschaft ist symmetrisch', () => {
  for (let p = 2; p <= 6; p++) {
    const b = createBoard(p);
    for (const id of b.order) {
      for (const nb of b.nodes[id].neighbors) {
        assert.ok(b.nodes[nb].neighbors.includes(id), `${id} <-> ${nb}`);
      }
      assert.ok(!b.nodes[id].neighbors.includes(id), 'keine Selbstkante');
    }
  }
});

test('Brett ist zusammenhaengend', () => {
  for (let p = 2; p <= 6; p++) {
    const b = createBoard(p);
    const d = distancesFrom(b, 'k');
    assert.equal(Object.keys(d).length, b.order.length);
  }
});

// Der Kern des Fairness-Versprechens: jede Startposition ist gleichwertig.
test('Startpositionen sind exakt gleichwertig (gleiche Distanzprofile)', () => {
  for (let p = 2; p <= 6; p++) {
    const b = createBoard(p);
    let reference = null;
    for (let i = 0; i < p; i++) {
      const [baseNode, frontNode] = startNodes(b, i);
      const dBase = distancesFrom(b, baseNode);
      const dFront = distancesFrom(b, frontNode);
      const profile = {
        zentrum: dBase.k,
        zentrumVorne: dFront.k,
        quellen: b.sources.map((q) => dBase[q]).sort((x, y) => x - y).join(','),
        quellenVorne: b.sources.map((q) => dFront[q]).sort((x, y) => x - y).join(','),
        basen: b.bases.map((q) => dBase[q]).sort((x, y) => x - y).join(','),
        grad: b.nodes[baseNode].neighbors.length,
      };
      if (reference === null) reference = profile;
      else assert.deepEqual(profile, reference, `Spieler ${i} bei ${p} Spielern`);
    }
  }
});

test('Basen sind gleichmaessig ueber den Aussenring verteilt', () => {
  for (let p = 2; p <= 6; p++) {
    const b = createBoard(p);
    const spokes = b.bases.map((id) => b.nodes[id].spoke);
    const gaps = spokes.map((sp, i) => ((spokes[(i + 1) % p] - sp) + b.spokes) % b.spokes);
    assert.ok(gaps.every((g) => g === gaps[0]), `gleichmaessige Abstaende bei ${p} Spielern`);
  }
});

test('Starteinheiten stehen auf Basis und Vorfeld, benachbart', () => {
  for (let p = 2; p <= 6; p++) {
    const b = createBoard(p);
    for (let i = 0; i < p; i++) {
      const [baseNode, frontNode] = startNodes(b, i);
      assert.equal(b.nodes[baseNode].base, i);
      assert.ok(areAdjacent(b, baseNode, frontNode));
    }
  }
});

test('Alle Quellen liegen im Zentrum (Ring 0 und 1)', () => {
  const b = createBoard(3);
  for (const id of b.sources) assert.ok(b.nodes[id].ring <= 1);
  assert.equal(b.sources.length, 7, '3 Spieler: 7 Quellen wie im Konzept');
});
