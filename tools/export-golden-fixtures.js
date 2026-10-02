/**
 * Exports board/createGame snapshots for C++ regression comparison.
 * Usage: node tools/export-golden-fixtures.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createGame } from '../src/engine/state.js';
import { resolve } from '../src/engine/resolver.js';
import { createBoard } from '../src/engine/board.js';
import { beats, holdRoundsNeeded } from '../src/engine/rules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../native/GameXCore/fixtures');
fs.mkdirSync(outDir, { recursive: true });

const fixtures = [];

for (let p = 2; p <= 6; p++) {
  const board = createBoard(p);
  fixtures.push({
    name: `board-p${p}`,
    kind: 'board',
    playerCount: p,
    spokes: board.spokes,
    nodeCount: board.order.length,
    sourceCount: board.sources.length,
    bases: board.bases,
  });
}

{
  const state = createGame({ playerCount: 3 });
  const { state: next, events } = resolve(state, { unitOrders: {}, builds: {} });
  fixtures.push({
    name: 'resolve-all-hold-p3',
    kind: 'resolve',
    playerCount: 3,
    roundBefore: state.round,
    roundAfter: next.round,
    unitCount: Object.keys(next.units).length,
    eventTypes: events.map((e) => e.type),
    holdRounds: holdRoundsNeeded(3),
    beats_reiter_bogen: beats('reiter', 'bogen'),
  });
}

const file = path.join(outDir, 'golden-smoke.json');
fs.writeFileSync(file, JSON.stringify({ version: 1, fixtures }, null, 2));
console.log('wrote', file, 'fixtures:', fixtures.length);
