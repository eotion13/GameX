// Online-Kernlogik. Kein Netzwerk, keine Seiteneffekte - nur Rechnen.
//
// Der Trick des ganzen Online-Modus steht in diesem Satz: die Datenbank
// speichert *keinen* Spielstand, sondern nur die Befehle jeder Runde.
// Weil resolve() deterministisch ist, rechnet jedes Geraet aus denselben
// Befehlen denselben Spielstand aus. Daraus folgt:
//
//   - Es gibt keinen Gastgeber, der online bleiben muss.
//   - Zwei Geraete koennen nicht auseinanderlaufen.
//   - Wer die App schliesst, faltet beim naechsten Start einfach neu.
//
// Geschrieben wird pro Runde und Spieler genau einmal, ein kleines Objekt.

import { createGame } from '../engine/state.js';
import { resolve } from '../engine/resolver.js';
import { botOrders, mulberry32 } from '../engine/bots.js';
import { PLAYER_NAMES } from '../engine/rules.js';

export const RAUM_VERSION = 1;

// Ohne I, O, 0, 1 - die verwechselt man beim Abtippen.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Zufallsbytes; im Browser kryptografisch, sonst einfacher Ersatz. */
export function standardZufall(n) {
  const out = new Uint8Array(n);
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (c && c.getRandomValues) c.getRandomValues(out);
  else for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

/** Sechsstelliger Raumcode, z.B. "K4MPT9". */
export function neuerRaumcode(zufall = standardZufall, laenge = 6) {
  const bytes = zufall(laenge);
  let out = '';
  for (let i = 0; i < laenge; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Startwert fuer die Bots dieser Partie. */
export function neuerBotSeed(zufall = standardZufall) {
  const b = zufall(4);
  return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
}

export function normalisiereCode(text) {
  return String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

// ----------------------------------------------------------------- Sitze

/**
 * Die Sitze als dichtes Array, egal wie lueckenhaft sie in der Datenbank
 * liegen (Firebase laesst leere Werte einfach weg).
 * @returns {Array<{seat:number,name:string,uid:?string,bot:boolean,level:string,botAb:number}>}
 */
export function sitzeArray(raum) {
  const n = raum?.meta?.playerCount || 0;
  const roh = raum?.sitze || {};
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = roh[String(i)] || roh[i] || {};
    out.push({
      seat: i,
      name: s.name || PLAYER_NAMES[i],
      uid: s.uid || null,
      bot: !!s.bot,
      level: s.level || 'normal',
      botAb: s.botAb || 1,
    });
  }
  return out;
}

/** Ist dieser Sitz in der genannten Runde von einem Bot besetzt? */
export function istBot(sitz, runde) {
  return !!sitz.bot && runde >= (sitz.botAb || 1);
}

/** Welchen Sitz habe ich? null, wenn ich nur zuschaue. */
export function meinSitz(raum, uid) {
  if (!uid) return null;
  const s = sitzeArray(raum).find((x) => x.uid === uid);
  return s ? s.seat : null;
}

/** Erster Sitz, den noch niemand beansprucht hat. */
export function freierSitz(raum) {
  const s = sitzeArray(raum).find((x) => !x.uid && !x.bot);
  return s ? s.seat : null;
}

/** Menschen, die schon im Raum sitzen. */
export function belegteSitze(raum) {
  return sitzeArray(raum).filter((s) => s.uid);
}

// ------------------------------------------------------- Spielstand falten

/** Startaufstellung aus den Raumdaten. Rein deterministisch. */
export function erzeugeStartSpiel(raum) {
  const m = raum.meta;
  const n = m.playerCount;
  const sitze = sitzeArray(raum);
  const teams = m.teams
    ? Array.from({ length: n }, (_, i) => i % 2)
    : Array.from({ length: n }, (_, i) => i);
  const spiel = createGame({
    playerCount: n,
    teams,
    players: sitze.map((s) => ({
      name: s.name,
      isBot: istBot(s, 1),
      botLevel: s.level,
    })),
  });
  spiel.botSeed = m.botSeed || 1;
  return spiel;
}

/** Befehlspaket eines Bots - gleiche Formel auf jedem Geraet. */
function botPaket(spiel, sitz) {
  const rng = mulberry32((spiel.botSeed || 1) + spiel.round * 7919 + sitz.seat * 104729);
  return botOrders(spiel, sitz.seat, sitz.level, rng);
}

/**
 * Welche Befehle liegen fuer eine Runde vor?
 * @returns {{vollstaendig:boolean, fehlende:number[], proSitz:Object}}
 */
export function befehlsstand(raum, spiel, runde) {
  const roh = (raum.befehle || {})[String(runde)] || {};
  const fehlende = [];
  const proSitz = {};
  for (const sitz of sitzeArray(raum)) {
    if (istBot(sitz, runde)) { proSitz[sitz.seat] = null; continue; }
    const eintrag = sitz.uid ? roh[sitz.uid] : null;
    if (!eintrag) { fehlende.push(sitz.seat); continue; }
    proSitz[sitz.seat] = eintrag;
  }
  return { vollstaendig: fehlende.length === 0, fehlende, proSitz };
}

/**
 * Fuegt die Befehlspakete zusammen. Jeder Sitz darf ausschliesslich ueber
 * die eigenen Einheiten bestimmen - sonst koennte ein Mitspieler von Hand
 * Befehle fuer fremde Einheiten in die Datenbank schreiben.
 */
export function mischeBefehle(raum, spiel, runde, stand) {
  const unitOrders = {};
  const builds = {};
  for (const sitz of sitzeArray(raum)) {
    const eigen = stand.proSitz[sitz.seat];
    const paket = eigen || botPaket(spiel, sitz);
    for (const unitId in paket.unitOrders || {}) {
      const u = spiel.units[unitId];
      if (u && u.owner === sitz.seat) unitOrders[unitId] = paket.unitOrders[unitId];
    }
    const bau = (paket.builds || {})[sitz.seat];
    if (bau) builds[sitz.seat] = bau;
  }
  return { unitOrders, builds };
}

/** Eine Runde auswerten, falls alle Befehle da sind. Sonst null. */
export function rundeAnwenden(raum, spiel, runde) {
  const stand = befehlsstand(raum, spiel, runde);
  if (!stand.vollstaendig) return null;
  const merged = mischeBefehle(raum, spiel, runde, stand);
  const res = resolve(spiel, merged);
  return { state: res.state, events: res.events, orders: merged.unitOrders, builds: merged.builds };
}

/**
 * Faltet alle vorliegenden Runden zum aktuellen Spielstand.
 * Der Cache wird nur erweitert, solange sich Raumdaten nicht rueckwirkend
 * aendern (das passiert nur bei einer Bot-Uebernahme).
 *
 * @returns {{spiel:object, verlauf:Array<{runde,before,events,orders,builds}>, fehlende:number[]}}
 */
export function berechneSpiel(raum, cache = {}) {
  const sig = JSON.stringify([raum?.meta || null, raum?.sitze || null]);
  if (cache.sig !== sig) {
    cache.sig = sig;
    cache.spiel = erzeugeStartSpiel(raum);
    cache.verlauf = [];
  }
  let spiel = cache.spiel;
  while (spiel.phase !== 'finished') {
    const r = rundeAnwenden(raum, spiel, spiel.round);
    if (!r) break;
    cache.verlauf.push({
      runde: spiel.round, before: spiel, events: r.events, orders: r.orders, builds: r.builds,
    });
    spiel = r.state;
  }
  cache.spiel = spiel;
  const stand = spiel.phase === 'finished'
    ? { fehlende: [] }
    : befehlsstand(raum, spiel, spiel.round);
  return { spiel, verlauf: cache.verlauf, fehlende: stand.fehlende };
}

/**
 * Habe ich meine Befehle fuer die laufende Runde schon abgegeben?
 * Firebase loescht leere Objekte, darum traegt jedes Paket ein `fertig`-Feld.
 */
export function habeAbgegeben(raum, uid, runde) {
  return !!((raum.befehle || {})[String(runde)] || {})[uid];
}

/** Paket, wie es in die Datenbank geschrieben wird. */
export function befehlspaket(orders) {
  return {
    fertig: true,
    unitOrders: orders?.unitOrders || {},
    builds: orders?.builds || {},
  };
}
