import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRevealPlan, sampleFrame, sampleMove, phaseAt, createReveal,
  PHASE, DEFAULT_DURATIONS, totalDuration, easeInOut,
} from '../src/ui/reveal.js';
import { emptyGame, place, move } from './helpers.js';
import { resolve } from '../src/engine/resolver.js';

describe('reveal Plan und Fairness', () => {
  it('baut deterministischen Plan: Moves parallel, stabile Sortierung', () => {
    const g = emptyGame(2);
    const a = place(g, 0, 'reiter', g.board.bases[0]);
    const b = place(g, 1, 'bogen', g.board.bases[1]);
    // Nachbarn der Basen
    const aNb = g.board.nodes[g.units[a].node].neighbors[0];
    const bNb = g.board.nodes[g.units[b].node].neighbors[0];
    const orders = {
      [a]: move(aNb),
      [b]: move(bNb),
    };
    const { events, state: after } = resolve(g, { unitOrders: orders, builds: {} });
    const plan = buildRevealPlan(g, orders, events);
    assert.ok(plan.moves.length >= 1);
    const ids = plan.moves.map((m) => m.unitId);
    assert.deepEqual(ids, [...ids].sort());
    assert.ok(DEFAULT_DURATIONS.orders > 0);
    assert.ok(DEFAULT_DURATIONS.moves > 0);
    assert.ok(DEFAULT_DURATIONS.effects > 0);
    void after;
  });

  it('sampleMove: Bounce kehrt zurueck, Move bleibt am Ziel', () => {
    const g = emptyGame(2);
    const from = g.board.bases[0];
    const to = g.board.nodes[from].neighbors[0];
    const board = g.board;
    const endMove = sampleMove({ from, to, bounce: false }, 1, board);
    assert.ok(Math.abs(endMove.x - board.nodes[to].x) < 1e-9);
    assert.ok(Math.abs(endMove.z - board.nodes[to].y) < 1e-9);

    const endBounce = sampleMove({ from, to, bounce: true }, 1, board);
    assert.ok(Math.abs(endBounce.x - board.nodes[from].x) < 1e-9);
    assert.ok(Math.abs(endBounce.z - board.nodes[from].y) < 1e-9);

    const midBounce = sampleMove({ from, to, bounce: true }, 0.5, board);
    // Bei t=0.5 am weitesten raus (nahe Ziel)
    assert.ok(Math.hypot(midBounce.x - board.nodes[to].x, midBounce.z - board.nodes[to].y) < 0.15);
  });

  it('phaseAt: feste Phasengrenzen unabhaengig von Farbe/Sitz', () => {
    assert.equal(phaseAt(0).phase, PHASE.ORDERS);
    assert.equal(phaseAt(DEFAULT_DURATIONS.orders - 1).phase, PHASE.ORDERS);
    assert.equal(phaseAt(DEFAULT_DURATIONS.orders).phase, PHASE.MOVES);
    assert.equal(phaseAt(DEFAULT_DURATIONS.orders + DEFAULT_DURATIONS.moves - 1).phase, PHASE.MOVES);
    assert.equal(phaseAt(DEFAULT_DURATIONS.orders + DEFAULT_DURATIONS.moves).phase, PHASE.EFFECTS);
    assert.equal(phaseAt(totalDuration()).phase, PHASE.DONE);
  });

  it('easeInOut ist monoton und an den Enden 0/1', () => {
    assert.equal(easeInOut(0), 0);
    assert.equal(easeInOut(1), 1);
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const v = easeInOut(i / 20);
      assert.ok(v >= prev);
      prev = v;
    }
  });

  it('sampleFrame ORDERS blendet nur Pfeile ein, bewegt keine Einheiten', () => {
    const g = emptyGame(2);
    const u = place(g, 0, 'schild', g.board.bases[0]);
    const to = g.board.nodes[g.units[u].node].neighbors[0];
    const orders = { [u]: move(to) };
    const { events } = resolve(g, { unitOrders: orders, builds: {} });
    const plan = buildRevealPlan(g, orders, events);
    const frame = sampleFrame(plan, PHASE.ORDERS, 0.5, g);
    assert.ok(frame.orderOpacity > 0.2);
    assert.equal(Object.keys(frame.unitPos).length, 0);
  });

  it('createReveal: Skip springt zum Endframe ohne Zustand zu aendern', async () => {
    const g = emptyGame(2);
    const u = place(g, 0, 'reiter', g.board.bases[0]);
    const to = g.board.nodes[g.units[u].node].neighbors[0];
    const orders = { [u]: move(to) };
    const { events, state: after } = resolve(g, { unitOrders: orders, builds: {} });
    const beforeSnap = JSON.stringify(g);

    let frames = 0;
    const reveal = createReveal(
      { before: g, orders, events, after },
      {
        now: (() => { let t = 0; return () => { t += 50; return t; }; })(),
        raf: (cb) => setTimeout(cb, 0),
        caf: (id) => clearTimeout(id),
        onUpdate: () => { frames += 1; },
      },
    );
    const p = reveal.start();
    reveal.skip();
    const end = await p;
    assert.equal(end.phase, PHASE.DONE);
    assert.equal(reveal.status, 'done');
    assert.equal(JSON.stringify(g), beforeSnap); // before unveraendert
    assert.ok(frames >= 1);
  });

  it('Destroyed-Effekt skaliert Einheit auf 0 im DONE-Frame', () => {
    const g = emptyGame(2);
    // Verteidiger auf Nachbar der Angreifer-Basis
    const atkNode = g.board.bases[0];
    const defNode = g.board.nodes[atkNode].neighbors[0];
    const atk = place(g, 0, 'reiter', atkNode); // schlaegt bogen
    const def = place(g, 1, 'bogen', defNode);
    const orders = { [atk]: move(defNode) };
    const { events } = resolve(g, { unitOrders: orders, builds: {} });
    assert.ok(events.some((e) => e.type === 'destroyed'));
    const plan = buildRevealPlan(g, orders, events);
    const done = sampleFrame(plan, PHASE.DONE, 1, g);
    const fallen = plan.effects.find((e) => e.kind === 'destroyed');
    assert.ok(fallen);
    assert.equal(done.unitScale[fallen.unitId], 0);
    assert.equal(done.unitOpacity[fallen.unitId], 0);
    void def;
  });
});
