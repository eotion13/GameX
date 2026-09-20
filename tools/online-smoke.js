// End-to-End-Test des Online-Modus.
//
//   node tools/online-smoke.js [--shots=verzeichnis]
//
// Firebase wird im Browser nachgebaut: ein kleiner Speicher, der sich wie die
// REST-Schnittstelle der Realtime Database verhaelt - inklusive der Leseregel,
// die die Befehle der Mitspieler verdeckt haelt, bis man selbst abgegeben hat.
// Damit laeuft der ganze Weg vom Einrichten bis zur zweiten Runde durch, ohne
// dass ein echtes Firebase-Projekt noetig waere.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as warte } from 'node:timers/promises';

const shotsArg = process.argv.find((a) => a.startsWith('--shots='));
const SHOTS = shotsArg ? shotsArg.slice(8) : null;
const PORT = 8124;
const DEBUG_PORT = 9224;

function findeChromium() {
  if (process.env.CHROME && existsSync(process.env.CHROME)) return process.env.CHROME;
  return [
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  ].find((p) => existsSync(p)) || null;
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.warten = new Map(); this.ereignisse = []; }
  static async verbinde(url) {
    const ws = new WebSocket(url);
    await new Promise((ok, fehler) => { ws.onopen = ok; ws.onerror = () => fehler(new Error('WS-Fehler')); });
    const cdp = new CDP(ws);
    ws.onmessage = (m) => {
      const n = JSON.parse(m.data);
      if (n.id && cdp.warten.has(n.id)) {
        const { ok, fehler } = cdp.warten.get(n.id);
        cdp.warten.delete(n.id);
        n.error ? fehler(new Error(n.error.message)) : ok(n.result);
      } else if (n.method) cdp.ereignisse.push(n);
    };
    return cdp;
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, fehler) => {
      this.warten.set(id, { ok, fehler });
      setTimeout(() => { if (this.warten.delete(id)) fehler(new Error(`Zeitlimit: ${method}`)); }, 15000);
    });
  }
  async js(ausdruck) {
    const r = await this.send('Runtime.evaluate', {
      expression: ausdruck, returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(`JS: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description || ''}`);
    }
    return r.result.value;
  }
}

// --------------------------------------------------------- Firebase-Attrappe

const ATTRAPPE = `
(() => {
  const db = { raeume: {} };
  const NUTZER = { uid: 'uid-ich' };
  window.__fake = { db, nutzer: NUTZER, aufrufe: [], verweigert: 0 };

  const teile = (p) => p.split('/').filter(Boolean);
  const lies = (pfad) => teile(pfad).reduce((o, k) => (o == null ? null : o[k] ?? null), db);
  const schreib = (pfad, wert) => {
    const t = teile(pfad);
    let o = db;
    for (const k of t.slice(0, -1)) o = (o[k] = o[k] || {});
    if (wert === null) delete o[t[t.length - 1]]; else o[t[t.length - 1]] = wert;
  };
  const merge = (pfad, wert) => {
    const alt = lies(pfad) || {};
    schreib(pfad, { ...alt, ...wert });
  };

  // Die Leseregel aus firebase-rules.json, nachgebildet.
  const darfLesen = (pfad, uid) => {
    const t = teile(pfad);
    const i = t.indexOf('befehle');
    if (i === -1 || t.length < i + 2) return true;
    const runde = lies(t.slice(0, i + 2).join('/'));
    return !!(runde && runde[uid]);
  };

  const antwort = (daten, status = 200) => new Response(
    daten === undefined ? 'null' : JSON.stringify(daten),
    { status, headers: { 'Content-Type': 'application/json' } });

  const echterFetch = window.fetch.bind(window);
  window.fetch = async (eingabe, opts = {}) => {
    const url = typeof eingabe === 'string' ? eingabe : eingabe.url;

    if (url.includes('identitytoolkit') || url.includes('securetoken')) {
      window.__fake.aufrufe.push('auth');
      return antwort({
        localId: NUTZER.uid, user_id: NUTZER.uid,
        idToken: 'token', id_token: 'token',
        refreshToken: 'refresh', refresh_token: 'refresh',
        expiresIn: '3600', expires_in: '3600',
      });
    }

    if (url.startsWith('https://fake-db.example.com')) {
      const pfad = new URL(url).pathname.replace(/^\\//, '').replace(/\\.json$/, '');
      const methode = (opts.method || 'GET').toUpperCase();
      window.__fake.aufrufe.push(methode + ' ' + pfad);
      if (methode === 'GET') {
        if (!darfLesen(pfad, NUTZER.uid)) {
          window.__fake.verweigert++;
          return antwort({ error: 'Permission denied' }, 401);
        }
        return antwort(lies(pfad));
      }
      const koerper = opts.body ? JSON.parse(opts.body) : null;
      if (methode === 'PATCH') merge(pfad, koerper); else schreib(pfad, koerper);
      return antwort(koerper);
    }

    return echterFetch(eingabe, opts);
  };

  // Hilfen fuer den Test
  window.__fake.raumCode = () => Object.keys(db.raeume)[0] || null;
  window.__fake.mitspielerTrittBei = (sitz, name, uid) => {
    schreib('raeume/' + window.__fake.raumCode() + '/sitze/' + sitz, { name, uid });
  };
  window.__fake.mitspielerGibtAb = (runde, uid) => {
    schreib('raeume/' + window.__fake.raumCode() + '/befehle/' + runde + '/' + uid,
      { fertig: true, unitOrders: {}, builds: {} });
  };
})();
`;

const CONFIG_TEXT = JSON.stringify({
  apiKey: 'AIzaFakeKey',
  authDomain: 'fake.firebaseapp.com',
  databaseURL: 'https://fake-db.example.com',
  projectId: 'fake-db',
});

// ------------------------------------------------------------------- Ablauf

const chromium = findeChromium();
if (!chromium) {
  console.log('Kein Chromium gefunden - Online-Test uebersprungen.');
  process.exit(0);
}

const server = spawn(process.execPath, ['tools/serve.js'], {
  env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore',
});
const browser = spawn(chromium, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${DEBUG_PORT}`, '--user-data-dir=/tmp/knotenpunkt-online',
  'about:blank',
], { stdio: 'ignore' });

process.on('exit', () => { server.kill(); browser.kill(); });

let fehlerZahl = 0;
const meldung = (ok, text) => {
  if (!ok) fehlerZahl++;
  console.log(`${ok ? '  ok  ' : ' FEHL '} ${text}`);
};

try {
  await warte(1500);
  let ziel = null;
  for (let i = 0; i < 25 && !ziel; i++) {
    try {
      const liste = await (await fetch(
        `http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
      ziel = liste.webSocketDebuggerUrl;
    } catch { await warte(400); }
  }
  if (!ziel) throw new Error('Chromium nicht erreichbar');

  const cdp = await CDP.verbinde(ziel);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: ATTRAPPE });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await warte(1400);

  const schuss = async (name) => {
    if (!SHOTS) return;
    mkdirSync(SHOTS, { recursive: true });
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(r.data, 'base64'));
  };
  const klick = async (sel) => {
    const ok = await cdp.js(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
      if (!e) return false; e.dispatchEvent(new MouseEvent('click', {bubbles:true})); return true; })()`);
    if (!ok) throw new Error(`Element nicht gefunden: ${sel}`);
    await warte(260);
  };
  const tippe = async (sel, text) => {
    await cdp.js(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
      e.value = ${JSON.stringify(text)};
      e.dispatchEvent(new Event('input', {bubbles:true})); })()`);
    await warte(120);
  };
  const text = () => cdp.js('document.body.innerText');
  const da = (sel) => cdp.js(`!!document.querySelector(${JSON.stringify(sel)})`);

  // --- Einrichtung ---------------------------------------------------------
  await klick('[data-action="online"]');
  meldung(await da('[data-action="online-einrichten"]'),
    'Ohne Zugangsdaten wird zum Einrichten geleitet');
  await klick('[data-action="online-einrichten"]');
  const anleitung = await text();
  meldung(/Realtime Database/.test(anleitung) && /Anonym/.test(anleitung),
    'Einrichtungsanleitung nennt Datenbank und anonyme Anmeldung');
  meldung(/"raeume"/.test(anleitung), 'Sicherheitsregeln stehen zum Kopieren bereit');
  await schuss('01-einrichten');

  await tippe('#fb-eingabe', CONFIG_TEXT);
  await klick('[data-action="online-config-speichern"]');
  meldung(await da('[data-action="online-erstellen-form"]'),
    'Zugangsdaten angenommen, Online-Menue erscheint');

  // --- Raum eroeffnen ------------------------------------------------------
  await klick('[data-action="online-erstellen-form"]');
  await klick('[data-action="spielerzahl"][data-wert="3"]');
  await tippe('#online-name', 'Abdul');
  await klick('[data-action="online-erstellen"]');
  await warte(700);

  const code = await cdp.js('window.__fake.raumCode()');
  meldung(!!code && code.length === 6, `Raum angelegt (${code})`);
  const lobby = await text();
  const einladung = (lobby.match(/#r=\S+/) || [null])[0];
  meldung(lobby.includes(code), 'Lobby zeigt den Raumcode');
  meldung(/#r=/.test(lobby), 'Einladungslink wird angezeigt');
  meldung(/c=/.test(lobby), 'Einladungslink enthaelt die Zugangsdaten');
  meldung(/1 von 3/.test(lobby), 'Lobby zaehlt die belegten Plaetze');
  await schuss('02-lobby');

  // --- Zweiter Spieler tritt bei -------------------------------------------
  await cdp.js(`window.__fake.mitspielerTrittBei(1, 'Mira', 'uid-mira')`);
  await warte(3200);
  meldung(/Mira/.test(await text()), 'Beitritt des Mitspielers erscheint in der Lobby');
  meldung(/2 von 3/.test(await text()), 'Platzzaehler wurde aktualisiert');

  // --- Partie starten ------------------------------------------------------
  await klick('[data-action="online-starten"]');
  await warte(900);
  meldung(await da('[data-action="befehle-fertig"]'), 'Partie laeuft, Befehlsphase erreicht');
  const sitz3 = await cdp.js(`window.__fake.db.raeume['${code}'].sitze['2'].bot`);
  meldung(sitz3 === true, 'Freier Platz wurde von einem Bot uebernommen');
  meldung(!/Gerät an/.test(await text()), 'Kein Weiterreichen des Geraets im Online-Modus');
  await schuss('03-befehle');

  // --- Befehle abgeben -----------------------------------------------------
  const vorher = await cdp.js('window.__fake.verweigert');
  meldung(vorher > 0, 'Fremde Befehle sind vor der eigenen Abgabe gesperrt');

  await klick('[data-action="befehle-fertig"]');
  await warte(800);
  const warten = await text();
  meldung(/Es fehlen noch/.test(warten), 'Wartebildschirm nach der Abgabe');
  meldung(/Mira/.test(warten), 'Es wird angezeigt, auf wen gewartet wird');
  const meins = await cdp.js(`!!window.__fake.db.raeume['${code}'].befehle['1']['uid-ich']`);
  meldung(meins, 'Eigene Befehle liegen in der Datenbank');
  await schuss('04-warten');

  // --- Mitspieler gibt ab, Runde wird ausgewertet --------------------------
  await cdp.js(`window.__fake.mitspielerGibtAb(1, 'uid-mira')`);
  await warte(3400);
  if (process.env.DEBUG) {
    console.log('--- Bildschirm ---\n', await text());
    console.log('--- Datenbankaufrufe ---\n', (await cdp.js('window.__fake.aufrufe')).slice(-12));
  }
  meldung(await da('[data-action="online-ergebnis"]'), 'Runde wurde ausgewertet, Befehle liegen offen');
  await schuss('05-aufdeckung');

  await klick('[data-action="online-ergebnis"]');
  meldung(/Auswertung Runde 1/.test(await text()), 'Auswertung der ersten Runde');
  await klick('[data-action="online-weiter"]');
  await warte(500);
  meldung(await da('[data-action="befehle-fertig"]'), 'Zweite Runde hat begonnen');
  meldung(/Runde\s*2/.test(await text()), 'Rundenzaehler steht auf 2');
  await schuss('06-runde2');

  // --- Einladungslink bei bereits geoeffneter App --------------------------
  meldung(!!einladung, 'Einladungslink aus der Lobby gelesen');
  await cdp.js(`location.hash = ${JSON.stringify(einladung || `#r=${code}`)}`);
  await warte(600);
  meldung(await da('[data-action="online-beitreten"]'),
    'Link wirkt auch, wenn die App schon offen ist');

  // --- Einladungslink beim frischen Start ----------------------------------
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await warte(400);
  await cdp.send('Page.navigate', {
    url: `http://127.0.0.1:${PORT}/index.html${einladung || `#r=${code}`}`,
  });
  await warte(1500);
  meldung(await da('[data-action="online-beitreten"]'), 'Einladungslink fuehrt direkt zum Beitreten');
  const vorbelegt = await cdp.js(`document.querySelector('#online-code')?.value`);
  meldung(vorbelegt === code, 'Raumcode ist aus dem Link vorbelegt');
  meldung(!/#r=/.test(await cdp.js('location.href')),
    'Der Anker wird aus der Adresse entfernt');
  await schuss('07-einladung');

  // --- Konsole -------------------------------------------------------------
  const konsolenFehler = cdp.ereignisse.filter((e) =>
    (e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
    || (e.method === 'Runtime.exceptionThrown'));
  meldung(konsolenFehler.length === 0, `Keine Fehler in der Browser-Konsole (${konsolenFehler.length})`);
  for (const f of konsolenFehler.slice(0, 5)) {
    console.log('   ', JSON.stringify(f.params).slice(0, 300));
  }
} catch (e) {
  fehlerZahl++;
  console.log(' FEHL  Abbruch:', e.message);
}

console.log(fehlerZahl === 0 ? '\nOnline-Test bestanden.' : `\n${fehlerZahl} Problem(e).`);
process.exit(fehlerZahl === 0 ? 0 : 1);
