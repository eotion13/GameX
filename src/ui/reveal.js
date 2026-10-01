// Gleichzeitige Aufdeckung - reine Praesentation, aendert keinen Spielzustand.
//
// Input: { before, orders, events, after }
// Phasen (Plan 3.4):
//   A orders   - Befehls-Pfeile gleichzeitig
//   B moves    - parallele Move-Arcs (gleiche Dauer; Bounce = Rueckfederung)
//   C effects  - destroyed / built / sourceCaptured
//   D done     - fertig fuer HUD-Update auf after
//
// Fairness: keine RNG; gleiche Dauer fuer alle Zuege; Skip springt zum Endframe.

export const PHASE = {
  ORDERS: 'orders',
  MOVES: 'moves',
  EFFECTS: 'effects',
  DONE: 'done',
};

/** Feste Dauern in ms - bewusst gleich fuer alle Spieler/Farben. */
export const DEFAULT_DURATIONS = Object.freeze({
  orders: 600,
  moves: 800,
  effects: 600,
});

/**
 * Baut einen deterministischen Animationsplan aus Events + Orders.
 * @param {object} before  Zustand vor resolve
 * @param {object} orders  unitId -> order (oder { unitOrders })
 * @param {object[]} events
 */
export function buildRevealPlan(before, orders, events) {
  const unitOrders = orders?.unitOrders || orders || {};
  const ev = Array.isArray(events) ? events : [];

  const orderEntries = [];
  for (const unitId of Object.keys(unitOrders).sort()) {
    const ord = unitOrders[unitId];
    if (!ord || ord.action === 'halten') continue;
    const u = before.units[unitId];
    if (!u) continue;
    orderEntries.push({
      unitId,
      owner: u.owner,
      action: ord.action,
      from: u.node,
      to: ord.target,
    });
  }

  const moveByUnit = new Map();
  for (const e of ev) {
    if (e.type === 'move') {
      moveByUnit.set(e.unit, { unitId: e.unit, owner: e.owner, from: e.from, to: e.to, bounce: false });
    } else if (e.type === 'bounce') {
      moveByUnit.set(e.unit, { unitId: e.unit, owner: e.owner, from: e.from, to: e.to, bounce: true });
    }
  }
  // Stabile Reihenfolge (wie Engine: unitIds sortiert)
  const moves = [...moveByUnit.values()].sort((a, b) => (a.unitId < b.unitId ? -1 : 1));

  const effects = [];
  for (const e of ev) {
    if (e.type === 'destroyed') {
      effects.push({
        kind: 'destroyed',
        unitId: e.unit,
        owner: e.owner,
        node: e.node,
        unitType: e.unitType,
      });
    } else if (e.type === 'built') {
      effects.push({
        kind: 'built',
        unitId: e.unit,
        owner: e.owner,
        node: e.node,
        unitType: e.unitType,
      });
    } else if (e.type === 'sourceCaptured') {
      effects.push({
        kind: 'sourceCaptured',
        node: e.node,
        owner: e.owner,
        from: e.from,
      });
    } else if (e.type === 'supportCut') {
      effects.push({
        kind: 'supportCut',
        unitId: e.unit,
        owner: e.owner,
        node: e.node,
        target: e.target,
      });
    }
  }

  return { orderEntries, moves, effects };
}

/**
 * Ease-in-out ohne Abhaengigkeit von Spielerfarbe/Startplatz.
 * @param {number} t 0..1
 */
export function easeInOut(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

/**
 * Parabel-Hoehe fuer Move-Arc (kosmetisch, regelneutral).
 * @param {number} t 0..1 entlang des Pfads
 */
export function arcHeight(t, peak = 0.55) {
  return 4 * peak * t * (1 - t);
}

/**
 * Position eines Zuges zum lokalen Phasenfortschritt.
 * Bounce: hinaus und zurueck (gleiche Gesamtdauer wie Move).
 */
export function sampleMove(move, t, board) {
  const a = board.nodes[move.from];
  const b = board.nodes[move.to];
  if (!a || !b) return null;
  const u = easeInOut(Math.max(0, Math.min(1, t)));
  let x;
  let z;
  let y;
  if (move.bounce) {
    // 0..0.5 raus, 0.5..1 zurueck
    const go = u <= 0.5 ? u * 2 : (1 - u) * 2;
    const e = easeInOut(go);
    x = a.x + (b.x - a.x) * e;
    z = a.y + (b.y - a.y) * e;
    y = arcHeight(e, 0.4);
  } else {
    x = a.x + (b.x - a.x) * u;
    z = a.y + (b.y - a.y) * u;
    y = arcHeight(u);
  }
  return { x, y, z };
}

/**
 * Visueller Frame fuer eine Phase - rein, deterministisch.
 * @param {object} plan  aus buildRevealPlan
 * @param {string} phase  PHASE.*
 * @param {number} localT  0..1 innerhalb der Phase
 * @param {object} before
 */
export function sampleFrame(plan, phase, localT, before) {
  const t = Math.max(0, Math.min(1, localT));
  const board = before.board;
  const unitPos = {};
  const unitScale = {};
  const unitOpacity = {};
  const controlFlash = {};
  let orderOpacity = 0;
  let phaseLabel = phase;

  if (phase === PHASE.ORDERS) {
    orderOpacity = easeInOut(t);
  } else if (phase === PHASE.MOVES) {
    orderOpacity = Math.max(0, 1 - t * 1.2);
    for (const m of plan.moves) {
      const p = sampleMove(m, t, board);
      if (p) unitPos[m.unitId] = p;
    }
  } else if (phase === PHASE.EFFECTS) {
    orderOpacity = 0;
    // Moves sind am Ziel (bzw. zurueck bei Bounce)
    for (const m of plan.moves) {
      const p = sampleMove(m, 1, board);
      if (p) unitPos[m.unitId] = p;
    }
    const appear = easeInOut(t);
    for (const e of plan.effects) {
      if (e.kind === 'destroyed') {
        unitScale[e.unitId] = Math.max(0.01, 1 - appear);
        unitOpacity[e.unitId] = 1 - appear;
      } else if (e.kind === 'built') {
        unitScale[e.unitId] = 0.01 + 0.99 * appear;
        unitOpacity[e.unitId] = appear;
        const n = board.nodes[e.node];
        if (n) unitPos[e.unitId] = { x: n.x, y: 0, z: n.y, spawn: true, unitType: e.unitType, owner: e.owner };
      } else if (e.kind === 'sourceCaptured') {
        controlFlash[e.node] = { owner: e.owner, intensity: appear };
      }
    }
  } else {
    // DONE: Endzustand visuell
    orderOpacity = 0;
    for (const m of plan.moves) {
      if (!m.bounce) {
        const n = board.nodes[m.to];
        if (n) unitPos[m.unitId] = { x: n.x, y: 0, z: n.y };
      } else {
        const n = board.nodes[m.from];
        if (n) unitPos[m.unitId] = { x: n.x, y: 0, z: n.y };
      }
    }
    for (const e of plan.effects) {
      if (e.kind === 'destroyed') {
        unitScale[e.unitId] = 0;
        unitOpacity[e.unitId] = 0;
      } else if (e.kind === 'built') {
        unitScale[e.unitId] = 1;
        unitOpacity[e.unitId] = 1;
        const n = board.nodes[e.node];
        if (n) unitPos[e.unitId] = { x: n.x, y: 0, z: n.y, spawn: true, unitType: e.unitType, owner: e.owner };
      } else if (e.kind === 'sourceCaptured') {
        controlFlash[e.node] = { owner: e.owner, intensity: 1 };
      }
    }
    phaseLabel = PHASE.DONE;
  }

  return {
    phase: phaseLabel,
    t,
    orderOpacity,
    unitPos,
    unitScale,
    unitOpacity,
    controlFlash,
  };
}

export function phaseOrder() {
  return [PHASE.ORDERS, PHASE.MOVES, PHASE.EFFECTS, PHASE.DONE];
}

export function totalDuration(durations = DEFAULT_DURATIONS) {
  return durations.orders + durations.moves + durations.effects;
}

/**
 * Globalzeit (ms seit Start) -> { phase, localT }.
 */
export function phaseAt(elapsedMs, durations = DEFAULT_DURATIONS) {
  const d = durations;
  if (elapsedMs < d.orders) {
    return { phase: PHASE.ORDERS, localT: d.orders ? elapsedMs / d.orders : 1 };
  }
  let t = elapsedMs - d.orders;
  if (t < d.moves) {
    return { phase: PHASE.MOVES, localT: d.moves ? t / d.moves : 1 };
  }
  t -= d.moves;
  if (t < d.effects) {
    return { phase: PHASE.EFFECTS, localT: d.effects ? t / d.effects : 1 };
  }
  return { phase: PHASE.DONE, localT: 1 };
}

/**
 * Steuerbare Reveal-Sequenz. Mutiert niemals before/after.
 *
 * @param {{ before, orders, events, after }} payload
 * @param {{
 *   durations?: typeof DEFAULT_DURATIONS,
 *   onUpdate?: (frame) => void,
 *   now?: () => number,
 *   raf?: (cb) => number,
 *   caf?: (id) => void,
 * }} [opts]
 */
export function createReveal(payload, opts = {}) {
  const durations = { ...DEFAULT_DURATIONS, ...(opts.durations || {}) };
  const now = opts.now || (() => performance.now());
  const raf = opts.raf || ((cb) => requestAnimationFrame(cb));
  const caf = opts.caf || ((id) => cancelAnimationFrame(id));
  const onUpdate = opts.onUpdate || (() => {});

  const before = payload.before;
  const orders = payload.orders?.unitOrders ? payload.orders : { unitOrders: payload.orders || {} };
  const plan = buildRevealPlan(before, orders, payload.events || []);

  let status = 'idle'; // idle | playing | paused | done
  let startedAt = 0;
  let pausedElapsed = 0;
  let rafId = 0;
  let resolvePromise = null;
  let promise = null;

  function emit(elapsed) {
    const { phase, localT } = phaseAt(elapsed, durations);
    const frame = sampleFrame(plan, phase, localT, before);
    frame.status = status;
    frame.elapsed = elapsed;
    onUpdate(frame);
    return frame;
  }

  function end() {
    status = 'done';
    if (rafId) { caf(rafId); rafId = 0; }
    const frame = emit(totalDuration(durations));
    if (resolvePromise) {
      const r = resolvePromise;
      resolvePromise = null;
      r(frame);
    }
  }

  function tick() {
    if (status !== 'playing') return;
    const elapsed = now() - startedAt;
    if (elapsed >= totalDuration(durations)) {
      end();
      return;
    }
    emit(elapsed);
    rafId = raf(tick);
  }

  function start() {
    if (status === 'done') {
      return Promise.resolve(emit(totalDuration(durations)));
    }
    if (status === 'playing') return promise;
    status = 'playing';
    startedAt = now() - pausedElapsed;
    promise = new Promise((r) => { resolvePromise = r; });
    // Sofort erster Frame (Pfeile sichtbar), nicht erst nach einem RAF
    emit(pausedElapsed);
    rafId = raf(tick);
    return promise;
  }

  function pause() {
    if (status !== 'playing') return;
    status = 'paused';
    pausedElapsed = now() - startedAt;
    if (rafId) { caf(rafId); rafId = 0; }
    emit(pausedElapsed);
  }

  function resume() {
    if (status !== 'paused') return;
    status = 'playing';
    startedAt = now() - pausedElapsed;
    rafId = raf(tick);
  }

  /** Springt zum Endframe; Zustand after setzt der Aufrufer. */
  function skip() {
    if (status === 'done') {
      emit(totalDuration(durations));
      return;
    }
    pausedElapsed = totalDuration(durations);
    end();
  }

  /** Stoppen ohne End-Callback (Bildschirmwechsel). */
  function cancel() {
    if (rafId) { caf(rafId); rafId = 0; }
    status = 'done';
    resolvePromise = null;
    promise = null;
  }

  return {
    plan,
    durations,
    start,
    pause,
    resume,
    skip,
    cancel,
    get status() { return status; },
    /** Sofortigen Frame erzeugen (Tests / Sync). */
    frameAt(elapsedMs) {
      const { phase, localT } = phaseAt(elapsedMs, durations);
      return sampleFrame(plan, phase, localT, before);
    },
  };
}
