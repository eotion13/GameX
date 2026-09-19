// Balance-Test: laesst Bots gegeneinander spielen und wertet aus, ob
// Startplatz oder Einheitstyp einen Vorteil bringen.
//
//   node tools/simulate.js [Partien] [Spielerzahl] [Bot-Level...]
//   node tools/simulate.js 500 3 normal normal normal

import { createGame, teamSources } from '../src/engine/state.js';
import { resolve } from '../src/engine/resolver.js';
import { botOrders, mulberry32 } from '../src/engine/bots.js';

const games = Number(process.argv[2] || 200);
const playerCount = Number(process.argv[3] || 3);
const levels = process.argv.slice(4);
const botLevels = Array.from({ length: playerCount }, (_, i) => levels[i] || 'normal');

const wins = Array(playerCount).fill(0);
const byLevel = {};
let draws = 0;
let totalRounds = 0;
const reasons = {};
const typeBuilt = {};
const typeKills = {};

for (let g = 0; g < games; g++) {
  // Jeder Bot bekommt einen eigenen Zufallsstrom. Sonst spiegeln identische
  // Bots auf dem symmetrischen Brett einander exakt und jede Partie endet
  // unentschieden - ein huebscher Symmetriebeweis, aber kein Balance-Test.
  const rngs = Array.from({ length: playerCount }, (_, i) => mulberry32(g * 7919 + i * 104729 + 13));
  let state = createGame({
    playerCount,
    players: botLevels.map((lvl, i) => ({ isBot: true, botLevel: lvl, name: `P${i}` })),
  });
  let guard = 0;
  while (state.phase !== 'finished' && guard++ < 60) {
    const unitOrders = {};
    const builds = {};
    for (const p of state.players) {
      if (p.eliminated) continue;
      const o = botOrders(state, p.id, botLevels[p.id], rngs[p.id]);
      Object.assign(unitOrders, o.unitOrders);
      Object.assign(builds, o.builds);
    }
    const res = resolve(state, { unitOrders, builds });
    for (const e of res.events) {
      if (e.type === 'built') typeBuilt[e.unitType] = (typeBuilt[e.unitType] || 0) + 1;
      if (e.type === 'destroyed') typeKills[e.byType] = (typeKills[e.byType] || 0) + 1;
    }
    state = res.state;
  }
  totalRounds += state.round;
  const w = state.winner;
  reasons[w.reason] = (reasons[w.reason] || 0) + 1;
  if (w.teams.length === 1) {
    wins[w.teams[0]] += 1;
    const lvl = botLevels[w.teams[0]];
    byLevel[lvl] = (byLevel[lvl] || 0) + 1;
  } else {
    draws++;
  }
}

const pct = (n) => `${((n / games) * 100).toFixed(1)}%`;
console.log(`\n${games} Partien, ${playerCount} Spieler (${botLevels.join(', ')})`);
console.log('-'.repeat(52));
wins.forEach((n, i) => console.log(`  Startplatz ${i} (${botLevels[i].padEnd(7)}): ${String(n).padStart(4)}  ${pct(n)}`));
console.log(`  Unentschieden          : ${String(draws).padStart(4)}  ${pct(draws)}`);
console.log(`  Erwartet je Startplatz : ${(100 / playerCount).toFixed(1)}%`);
const expected = games / playerCount;
const maxDev = Math.max(...wins.map((n) => Math.abs(n - expected))) / games * 100;
console.log(`  Groesste Abweichung    : ${maxDev.toFixed(1)} Prozentpunkte`);
console.log(`\n  Siegarten: ${JSON.stringify(reasons)}`);
console.log(`  Durchschnittliche Rundenzahl: ${(totalRounds / games).toFixed(1)}`);
console.log(`  Gebaute Typen: ${JSON.stringify(typeBuilt)}`);
console.log(`  Siege im Kampf nach Typ: ${JSON.stringify(typeKills)}`);
if (Object.keys(byLevel).length > 1) console.log(`  Siege je Bot-Stufe: ${JSON.stringify(byLevel)}`);
console.log('');
