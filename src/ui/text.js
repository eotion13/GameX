// Sprachbausteine fuer die Oberflaeche.

import { TYPE_INFO } from '../engine/rules.js';

export function nodeName(state, id) {
  const n = state.board.nodes[id];
  if (!n) return id;
  if (n.ring === 0) return 'Knotenpunkt';
  const label = `${n.ring}-${n.spoke + 1}`;
  if (n.base !== null) return `Basis ${state.players[n.base].name} (${label})`;
  return n.isSource ? `Quelle ${label}` : `Feld ${label}`;
}

export function unitLabel(u) {
  return TYPE_INFO[u.type].name;
}

/** Ein Ereignis in einen lesbaren Satz uebersetzen. */
export function describeEvent(state, e) {
  const P = (id) => (state.players[id] ? state.players[id].name : '?');
  const N = (id) => nodeName(state, id);
  switch (e.type) {
    case 'move':
      return { icon: '→', text: `${P(e.owner)}: ${TYPE_INFO[e.unitType].name} zieht von ${N(e.from)} nach ${N(e.to)}.`, owner: e.owner };
    case 'bounce':
      return { icon: '⊘', text: `${P(e.owner)}: Zug nach ${N(e.to)} prallt ab (Patt).`, owner: e.owner };
    case 'destroyed': {
      const cause = {
        'verteidiger-geschlagen': `wird auf ${N(e.node)} von ${P(e.byOwner)} (${TYPE_INFO[e.byType].name}) geschlagen`,
        'angriff-gescheitert': `scheitert am Verteidiger ${P(e.byOwner)} (${TYPE_INFO[e.byType].name}) und faellt`,
        'platztausch-verloren': `verliert den Platztausch gegen ${P(e.byOwner)} (${TYPE_INFO[e.byType].name})`,
      }[e.cause] || 'faellt';
      return { icon: '✕', text: `${P(e.owner)}: ${TYPE_INFO[e.unitType].name} ${cause}.`, owner: e.owner };
    }
    case 'supportCut':
      return { icon: '✂', text: `${P(e.owner)}: Unterstützung von ${N(e.node)} wurde geschnitten.`, owner: e.owner };
    case 'built':
      return { icon: '+', text: `${P(e.owner)} baut ${TYPE_INFO[e.unitType].name} in der Basis.`, owner: e.owner };
    case 'buildFailed':
      return { icon: '!', text: `${P(e.owner)} kann nicht bauen (${e.reason === 'energie' ? 'zu wenig Energie' : 'Basis besetzt'}).`, owner: e.owner };
    case 'sourceCaptured':
      return { icon: '◆', text: `${P(e.owner)} kontrolliert ${N(e.node)}${e.from !== null && e.from !== undefined ? ` (zuvor ${P(e.from)})` : ''}.`, owner: e.owner };
    case 'eliminated':
      return { icon: '☠', text: `${P(e.owner)} scheidet aus.`, owner: e.owner };
    case 'gameOver':
      return null;
    default:
      return null;
  }
}

export function winnerText(state) {
  const w = state.winner;
  if (!w) return '';
  const names = w.teams.flatMap((t) => state.players.filter((p) => p.team === t).map((p) => p.name));
  const who = names.join(' & ');
  if (w.teams.length > 1) return `Unentschieden zwischen ${who}.`;
  if (w.reason === 'mehrheit') return `${who} gewinnt: die Mehrheit von ${w.need} Quellen ${w.held} Runden lang gehalten.`;
  if (w.reason === 'punkte') return `${who} gewinnt nach Punkten (${w.score}).`;
  if (w.reason === 'letzter-uebrig') return `${who} gewinnt - alle anderen sind ausgeschieden.`;
  return `${who} gewinnt.`;
}
