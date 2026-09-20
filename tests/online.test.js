import test from 'node:test';
import assert from 'node:assert/strict';
import {
  neuerRaumcode, neuerBotSeed, normalisiereCode, sitzeArray, istBot, meinSitz,
  freierSitz, erzeugeStartSpiel, befehlsstand, mischeBefehle, berechneSpiel,
  habeAbgegeben, befehlspaket,
} from '../src/net/room.js';
import { botOrders, mulberry32 } from '../src/engine/bots.js';
import { parseEingabe, configInLink, configAusLink } from '../src/net/config.js';
import { REGELN_TEXT } from '../src/ui/online-views.js';
import { readFileSync } from 'node:fs';

// --- Hilfen ---------------------------------------------------------------

function raumMitMenschen(playerCount, opts = {}) {
  const sitze = {};
  for (let i = 0; i < playerCount; i++) {
    sitze[String(i)] = opts.bots?.includes(i)
      ? { name: `Bot${i}`, bot: true, level: 'normal', botAb: 1 }
      : { name: `Spieler${i}`, uid: `uid-${i}` };
  }
  return {
    meta: { version: 1, playerCount, teams: !!opts.teams, botSeed: 4242, status: 'laeuft' },
    sitze,
    befehle: {},
  };
}

/** Befehle, wie sie ein Mensch abschicken wuerde - inklusive JSON-Rundreise. */
function menschlicheBefehle(spiel, seat, salz = 0) {
  const rng = mulberry32(1000 + seat * 31 + spiel.round * 7 + salz);
  const orders = botOrders(spiel, seat, 'normal', rng);
  return JSON.parse(JSON.stringify(befehlspaket(orders)));
}

/** Laesst alle menschlichen Sitze die Runde abgeben. */
function alleGebenAb(raum, spiel) {
  const runde = String(spiel.round);
  raum.befehle[runde] = raum.befehle[runde] || {};
  for (const s of sitzeArray(raum)) {
    if (istBot(s, spiel.round) || !s.uid) continue;
    raum.befehle[runde][s.uid] = menschlicheBefehle(spiel, s.seat);
  }
}

// --- Raumcode -------------------------------------------------------------

test('Raumcode hat feste Laenge und meidet verwechselbare Zeichen', () => {
  for (let i = 0; i < 200; i++) {
    const code = neuerRaumcode();
    assert.equal(code.length, 6);
    assert.match(code, /^[A-HJ-NP-Z2-9]+$/, `unerwarteter Code ${code}`);
  }
});

test('Raumcode nutzt den uebergebenen Zufall', () => {
  const code = neuerRaumcode(() => new Uint8Array([0, 0, 0, 0, 0, 0]));
  assert.equal(code, 'AAAAAA');
});

test('normalisiereCode raeumt Tippfehler auf', () => {
  assert.equal(normalisiereCode(' k4m-pt9 '), 'K4MPT9');
  assert.equal(normalisiereCode('abc123'), 'ABC123');
});

test('Bot-Startwert ist eine nichtnegative Ganzzahl', () => {
  for (let i = 0; i < 50; i++) {
    const s = neuerBotSeed();
    assert.ok(Number.isInteger(s) && s >= 0, `unerwarteter Startwert ${s}`);
  }
});

// --- Sitze ----------------------------------------------------------------

test('sitzeArray fuellt Luecken, die Firebase weggelassen hat', () => {
  const raum = { meta: { playerCount: 4 }, sitze: { 0: { name: 'A', uid: 'u0' }, 2: { bot: true } } };
  const sitze = sitzeArray(raum);
  assert.equal(sitze.length, 4);
  assert.equal(sitze[0].uid, 'u0');
  assert.equal(sitze[1].uid, null);
  assert.equal(sitze[2].bot, true);
  assert.equal(sitze[3].name, 'Gold', 'Standardname fuer leere Plaetze');
});

test('meinSitz und freierSitz finden die richtigen Plaetze', () => {
  const raum = { meta: { playerCount: 3 }, sitze: { 0: { uid: 'a' }, 1: { uid: 'b' } } };
  assert.equal(meinSitz(raum, 'b'), 1);
  assert.equal(meinSitz(raum, 'fremd'), null);
  assert.equal(meinSitz(raum, null), null);
  assert.equal(freierSitz(raum), 2);
});

test('istBot beachtet ab welcher Runde uebernommen wurde', () => {
  const sitz = { bot: true, botAb: 5 };
  assert.equal(istBot(sitz, 4), false);
  assert.equal(istBot(sitz, 5), true);
  assert.equal(istBot(sitz, 9), true);
  assert.equal(istBot({ bot: false, botAb: 1 }, 9), false);
});

// --- Startaufstellung -----------------------------------------------------

test('Startaufstellung ist aus denselben Raumdaten identisch', () => {
  const raum = raumMitMenschen(4);
  const a = erzeugeStartSpiel(raum);
  const b = erzeugeStartSpiel(raum);
  assert.deepEqual(a, b);
  assert.equal(a.botSeed, 4242);
  assert.equal(a.players.length, 4);
  assert.equal(a.players[2].name, 'Spieler2');
});

test('Teams setzen abwechselnde Teamnummern', () => {
  const frei = erzeugeStartSpiel(raumMitMenschen(4));
  assert.deepEqual(frei.players.map((p) => p.team), [0, 1, 2, 3]);
  const teams = erzeugeStartSpiel(raumMitMenschen(4, { teams: true }));
  assert.deepEqual(teams.players.map((p) => p.team), [0, 1, 0, 1]);
});

// --- Befehlsstand ---------------------------------------------------------

test('Runde ist erst vollstaendig, wenn alle Menschen abgegeben haben', () => {
  const raum = raumMitMenschen(3);
  const spiel = erzeugeStartSpiel(raum);
  let stand = befehlsstand(raum, spiel, 1);
  assert.equal(stand.vollstaendig, false);
  assert.deepEqual(stand.fehlende, [0, 1, 2]);

  raum.befehle['1'] = { 'uid-0': menschlicheBefehle(spiel, 0) };
  stand = befehlsstand(raum, spiel, 1);
  assert.deepEqual(stand.fehlende, [1, 2]);

  alleGebenAb(raum, spiel);
  stand = befehlsstand(raum, spiel, 1);
  assert.equal(stand.vollstaendig, true);
  assert.deepEqual(stand.fehlende, []);
});

test('Bot-Plaetze muessen nichts abgeben', () => {
  const raum = raumMitMenschen(3, { bots: [1, 2] });
  const spiel = erzeugeStartSpiel(raum);
  raum.befehle['1'] = { 'uid-0': menschlicheBefehle(spiel, 0) };
  assert.equal(befehlsstand(raum, spiel, 1).vollstaendig, true);
});

test('leere Befehle zaehlen trotzdem als abgegeben', () => {
  const raum = raumMitMenschen(2);
  const spiel = erzeugeStartSpiel(raum);
  const paket = JSON.parse(JSON.stringify(befehlspaket({ unitOrders: {}, builds: {} })));
  assert.equal(paket.fertig, true, 'Firebase wuerde ein leeres Objekt sonst verwerfen');
  raum.befehle['1'] = { 'uid-0': paket, 'uid-1': paket };
  assert.equal(befehlsstand(raum, spiel, 1).vollstaendig, true);
  assert.equal(habeAbgegeben(raum, 'uid-0', 1), true);
  assert.equal(habeAbgegeben(raum, 'uid-1', 2), false);
});

// --- Schutz gegen fremde Befehle -----------------------------------------

test('ein Sitz kann keine fremden Einheiten befehligen', () => {
  const raum = raumMitMenschen(2);
  const spiel = erzeugeStartSpiel(raum);
  const meine = Object.values(spiel.units).filter((u) => u.owner === 0);
  const fremde = Object.values(spiel.units).filter((u) => u.owner === 1);
  const ziel = spiel.board.nodes[fremde[0].node].neighbors[0];

  raum.befehle['1'] = {
    'uid-0': {
      fertig: true,
      unitOrders: {
        [meine[0].id]: { action: 'halten' },
        [fremde[0].id]: { action: 'bewegen', target: ziel }, // geschummelt
      },
      builds: { 0: 'reiter', 1: 'bogen' },                    // fremder Bau
    },
    'uid-1': { fertig: true, unitOrders: {}, builds: {} },
  };

  const stand = befehlsstand(raum, spiel, 1);
  const merged = mischeBefehle(raum, spiel, 1, stand);
  assert.ok(merged.unitOrders[meine[0].id], 'eigener Befehl bleibt');
  assert.equal(merged.unitOrders[fremde[0].id], undefined, 'fremder Befehl wird verworfen');
  assert.equal(merged.builds[0], 'reiter');
  assert.equal(merged.builds[1], undefined, 'fremder Bauauftrag wird verworfen');
});

test('Bauauftraege ueberstehen die Rundreise durch JSON', () => {
  const raum = raumMitMenschen(2);
  const spiel = erzeugeStartSpiel(raum);
  spiel.players[0].energy = 10;
  // Firebase macht aus dem Zahlenschluessel 0 die Zeichenkette "0".
  raum.befehle['1'] = {
    'uid-0': { fertig: true, unitOrders: {}, builds: { '0': 'schild' } },
    'uid-1': { fertig: true, unitOrders: {}, builds: {} },
  };
  const stand = befehlsstand(raum, spiel, 1);
  assert.equal(mischeBefehle(raum, spiel, 1, stand).builds[0], 'schild');
});

// --- Falten ---------------------------------------------------------------

test('unvollstaendige Runde laesst den Spielstand stehen', () => {
  const raum = raumMitMenschen(3);
  const a = berechneSpiel(raum, {});
  assert.equal(a.spiel.round, 1);
  assert.deepEqual(a.fehlende, [0, 1, 2]);
  assert.equal(a.verlauf.length, 0);

  raum.befehle['1'] = { 'uid-0': menschlicheBefehle(a.spiel, 0) };
  const b = berechneSpiel(raum, {});
  assert.equal(b.spiel.round, 1, 'noch keine Auswertung');
  assert.deepEqual(b.fehlende, [1, 2]);
});

test('vollstaendige Runde schiebt den Spielstand weiter', () => {
  const raum = raumMitMenschen(3);
  const start = berechneSpiel(raum, {}).spiel;
  alleGebenAb(raum, start);
  const nach = berechneSpiel(raum, {});
  assert.equal(nach.spiel.round, 2);
  assert.equal(nach.verlauf.length, 1);
  assert.equal(nach.verlauf[0].runde, 1);
  assert.ok(Array.isArray(nach.verlauf[0].events));
});

test('zwei Geraete berechnen aus denselben Befehlen denselben Spielstand', () => {
  const raum = raumMitMenschen(4);
  const cacheA = {};
  const cacheB = {};
  for (let i = 0; i < 8; i++) {
    const spiel = berechneSpiel(raum, cacheA).spiel;
    if (spiel.phase === 'finished') break;
    alleGebenAb(raum, spiel);
  }
  const a = berechneSpiel(raum, cacheA);
  const b = berechneSpiel(raum, cacheB); // frisch, ohne Zwischenschritte
  assert.deepEqual(a.spiel, b.spiel);
  assert.equal(a.verlauf.length, b.verlauf.length);
});

test('schrittweises Falten ist so schnell wie das Falten von vorn', () => {
  const raum = raumMitMenschen(3);
  const cache = {};
  let runden = 0;
  for (let i = 0; i < 30; i++) {
    const spiel = berechneSpiel(raum, cache).spiel;
    if (spiel.phase === 'finished') break;
    alleGebenAb(raum, spiel);
    runden++;
  }
  assert.ok(runden > 2, 'die Partie soll mehrere Runden laufen');
  assert.equal(berechneSpiel(raum, cache).verlauf.length, runden);
});

test('eine ganze Partie laeuft bis zum Ende durch', () => {
  const raum = raumMitMenschen(3);
  const cache = {};
  for (let i = 0; i < 40; i++) {
    const spiel = berechneSpiel(raum, cache).spiel;
    if (spiel.phase === 'finished') break;
    alleGebenAb(raum, spiel);
  }
  const ende = berechneSpiel(raum, cache).spiel;
  assert.equal(ende.phase, 'finished');
  assert.ok(ende.winner, 'es gibt ein Ergebnis');
  assert.ok(ende.round <= ende.config.maxRounds);
});

// --- Bot-Uebernahme -------------------------------------------------------

test('Bot-Uebernahme laesst frueher gespielte Runden unveraendert', () => {
  const raum = raumMitMenschen(3);
  const cache = {};
  for (let i = 0; i < 3; i++) alleGebenAb(raum, berechneSpiel(raum, cache).spiel);
  const vorher = berechneSpiel(raum, cache);
  const abRunde = vorher.spiel.round;
  const verlaufVorher = JSON.parse(JSON.stringify(vorher.verlauf.map((v) => v.events)));

  raum.sitze['2'] = { ...raum.sitze['2'], bot: true, level: 'normal', botAb: abRunde };
  const nachher = berechneSpiel(raum, cache);

  assert.equal(nachher.spiel.round, abRunde, 'die laufende Runde bleibt stehen');
  assert.deepEqual(
    nachher.verlauf.map((v) => v.events), verlaufVorher,
    'die Vergangenheit wird nicht umgeschrieben');
  assert.deepEqual(nachher.fehlende, [0, 1], 'Sitz 2 wird nicht mehr erwartet');
});

test('nach der Uebernahme laeuft die Partie ohne den Abwesenden weiter', () => {
  const raum = raumMitMenschen(2);
  const cache = {};
  const spiel = berechneSpiel(raum, cache).spiel;
  raum.sitze['1'] = { ...raum.sitze['1'], bot: true, level: 'normal', botAb: spiel.round };
  raum.befehle[String(spiel.round)] = { 'uid-0': menschlicheBefehle(spiel, 0) };
  const nach = berechneSpiel(raum, cache);
  assert.equal(nach.spiel.round, spiel.round + 1);
});

// --- Zugangsdaten ---------------------------------------------------------

test('der Firebase-Block aus der Konsole wird verstanden', () => {
  const { config, fehler } = parseEingabe(`
    const firebaseConfig = {
      apiKey: "AIzaSyTestSchluessel123",
      authDomain: "knotenpunkt-demo.firebaseapp.com",
      databaseURL: "https://knotenpunkt-demo-default-rtdb.europe-west1.firebasedatabase.app",
      projectId: "knotenpunkt-demo",
      storageBucket: "knotenpunkt-demo.appspot.com",
      messagingSenderId: "123456789",
      appId: "1:123:web:abc"
    };`);
  assert.equal(fehler, null);
  assert.equal(config.apiKey, 'AIzaSyTestSchluessel123');
  assert.equal(config.projectId, 'knotenpunkt-demo');
  assert.equal(config.databaseURL, 'https://knotenpunkt-demo-default-rtdb.europe-west1.firebasedatabase.app');
});

test('auch reines JSON wird verstanden', () => {
  const { config } = parseEingabe(JSON.stringify({
    apiKey: 'K', databaseURL: 'https://d.firebaseio.com', projectId: 'p',
  }));
  assert.equal(config.projectId, 'p');
  assert.equal(config.authDomain, 'p.firebaseapp.com', 'authDomain wird ergaenzt');
});

test('fehlende databaseURL wird klar benannt', () => {
  const { config, fehler } = parseEingabe('{ "apiKey": "K", "projectId": "p" }');
  assert.equal(config, null);
  assert.match(fehler, /databaseURL/);
  assert.match(fehler, /Realtime Database/);
});

test('leere Eingabe meldet sich verstaendlich', () => {
  assert.match(parseEingabe('   ').fehler, /nichts/);
  assert.match(parseEingabe('Guten Tag').fehler, /apiKey/);
});

test('Zugangsdaten ueberstehen die Reise durch den Einladungslink', () => {
  const c = {
    apiKey: 'AIza-abc_123', databaseURL: 'https://x-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'x', authDomain: 'x.firebaseapp.com',
  };
  const code = configInLink(c);
  assert.ok(!/[+/=]/.test(code), 'muss ohne Sonderzeichen in eine URL passen');
  assert.deepEqual(configAusLink(code), c);
});

test('kaputter Link-Anhang wirft nicht, sondern gibt null', () => {
  assert.equal(configAusLink('###kein-base64###'), null);
  assert.equal(configAusLink(''), null);
});

// --- Sicherheitsregeln ----------------------------------------------------

test('die Regeln in der App und in firebase-rules.json sind identisch', () => {
  const datei = readFileSync(new URL('../firebase-rules.json', import.meta.url), 'utf8');
  assert.equal(JSON.stringify(JSON.parse(datei)), JSON.stringify(JSON.parse(REGELN_TEXT)));
});

test('die Regeln sperren fremde Befehle bis zur eigenen Abgabe', () => {
  const r = JSON.parse(readFileSync(new URL('../firebase-rules.json', import.meta.url), 'utf8'));
  const runde = r.rules.raeume.$code.befehle.$runde;
  assert.match(runde['.read'], /data\.child\(auth\.uid\)\.exists\(\)/);
  assert.match(runde.$uid['.write'], /\$uid === auth\.uid/);
  assert.match(runde.$uid['.write'], /!data\.exists\(\)/, 'einmal geschrieben ist endgueltig');
});
