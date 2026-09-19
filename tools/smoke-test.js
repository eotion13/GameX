// End-to-End-Test der Oberflaeche: startet Server und Chromium, spielt eine
// Runde durch und meldet jeden Fehler in der Konsole.
//
//   node tools/smoke-test.js [--shots=verzeichnis]
//
// Braucht Chromium (CHROME oder /opt/pw-browsers/...). Ohne Browser wird der
// Test uebersprungen, damit er in beliebigen Umgebungen nicht falsch alarmiert.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as warte } from 'node:timers/promises';

const shotsArg = process.argv.find((a) => a.startsWith('--shots='));
const SHOTS = shotsArg ? shotsArg.slice(8) : null;
const PORT = 8123;
const DEBUG_PORT = 9223;

function findeChromium() {
  if (process.env.CHROME && existsSync(process.env.CHROME)) return process.env.CHROME;
  const kandidaten = [
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  ];
  return kandidaten.find((p) => existsSync(p)) || null;
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
    const r = await this.send('Runtime.evaluate', { expression: ausdruck, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`JS: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description || ''}`);
    return r.result.value;
  }
}

const chromium = findeChromium();
if (!chromium) {
  console.log('Kein Chromium gefunden - Oberflaechentest uebersprungen.');
  process.exit(0);
}

const server = spawn(process.execPath, ['tools/serve.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const browser = spawn(chromium, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${DEBUG_PORT}`, '--user-data-dir=/tmp/knotenpunkt-smoke',
  'about:blank',
], { stdio: 'ignore' });

const aufraeumen = () => { server.kill(); browser.kill(); };
process.on('exit', aufraeumen);

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
      const liste = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?http://127.0.0.1:${PORT}/index.html`, { method: 'PUT' })).json();
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
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await warte(1200);

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
    await warte(220);
  };

  // --- Menue ---------------------------------------------------------------
  meldung(await cdp.js(`!!document.querySelector('[data-action="starten"]')`), 'Menue wird angezeigt');
  await schuss('1-menue');

  await klick('[data-action="regeln"]');
  meldung(await cdp.js(`document.body.innerText.includes('Kampf')`), 'Regelseite erreichbar');
  await schuss('2-regeln');
  await klick('[data-action="zurueck"]');

  // --- Partie starten (1 Mensch, 2 Bots) -----------------------------------
  await klick('[data-action="starten"]');
  meldung(await cdp.js(`!!document.querySelector('.board')`), 'Spielfeld wird gezeichnet');
  meldung(await cdp.js(`document.querySelectorAll('.einheit').length === 6`), 'Sechs Einheiten auf dem Feld');
  meldung(await cdp.js(`!!document.querySelector('[data-action="befehle-fertig"]')`), 'Befehlsphase aktiv (kein Weiterreichen noetig)');
  await schuss('3-befehle');

  // --- Einer Einheit einen Zug geben ---------------------------------------
  const meinFeld = await cdp.js(`(() => {
    const g = window.__knoten;
    return null; })()`);
  // Einheit ueber das DOM finden: eigene Einheiten haben die Klasse "eigen"
  const eigenerKnoten = await cdp.js(`(() => {
    const kreise = [...document.querySelectorAll('.einheit.eigen')];
    if (!kreise.length) return null;
    const cx = kreise[0].getAttribute('cx'), cy = kreise[0].getAttribute('cy');
    const treffer = [...document.querySelectorAll('[data-node]')]
      .find(t => t.getAttribute('cx') === cx && t.getAttribute('cy') === cy);
    return treffer ? treffer.dataset.node : null; })()`);
  meldung(!!eigenerKnoten, `Eigene Einheit gefunden (${eigenerKnoten})`);

  await klick(`[data-node="${eigenerKnoten}"]`);
  meldung(await cdp.js(`!!document.querySelector('[data-action="modus-bewegen"]')`), 'Einheit angetippt: Aktionen erscheinen');
  await schuss('4-einheit-gewaehlt');

  await klick('[data-action="modus-bewegen"]');
  const zielZahl = await cdp.js(`document.querySelectorAll('.knoten.ziel').length`);
  meldung(zielZahl > 0, `Zielfelder hervorgehoben (${zielZahl})`);
  await schuss('5-ziele');

  const ziel2 = await cdp.js(`(() => {
    const z = document.querySelector('.knoten.ziel');
    const cx = z.getAttribute('cx'), cy = z.getAttribute('cy');
    const t = [...document.querySelectorAll('[data-node]')]
      .find(t => t.getAttribute('cx') === cx && t.getAttribute('cy') === cy);
    return t.dataset.node; })()`);
  await klick(`[data-node="${ziel2}"]`);
  meldung(await cdp.js(`document.querySelectorAll('.pfeil').length === 1`), 'Befehlspfeil wird angezeigt');
  await schuss('6-befehl-gesetzt');

  // --- Runde auswerten -----------------------------------------------------
  await klick('[data-action="befehle-fertig"]');
  meldung(await cdp.js(`!!document.querySelector('[data-action="auswerten"]')`), 'Aufdeckungsphase erreicht');
  meldung(await cdp.js(`document.querySelectorAll('.pfeil, .stuetze').length >= 3`), 'Befehle aller Spieler sichtbar');
  await schuss('7-aufdecken');

  await klick('[data-action="auswerten"]');
  meldung(await cdp.js(`document.body.innerText.includes('Auswertung Runde 1')`), 'Auswertung wird angezeigt');
  meldung(await cdp.js(`document.querySelectorAll('.liste li').length > 0`), 'Ereignisse werden protokolliert');
  await schuss('8-auswertung');

  await klick('[data-action="weiter"]');
  meldung(await cdp.js(`document.body.innerText.includes('Runde') && !!document.querySelector('.board')`), 'Runde 2 beginnt');

  // --- Mehrere Runden am Stueck --------------------------------------------
  for (let r = 0; r < 6; r++) {
    if (await cdp.js(`!!document.querySelector('[data-action="befehle-fertig"]')`)) await klick('[data-action="befehle-fertig"]');
    if (await cdp.js(`!!document.querySelector('[data-action="auswerten"]')`)) await klick('[data-action="auswerten"]');
    if (await cdp.js(`!!document.querySelector('[data-action="weiter"]')`)) await klick('[data-action="weiter"]');
  }
  meldung(await cdp.js(`!!document.querySelector('.board') || !!document.querySelector('.rangliste')`), 'Mehrere Runden laufen stabil');
  await schuss('9-spaeter');

  // --- Speicherung ---------------------------------------------------------
  meldung(await cdp.js(`!!localStorage.getItem('knotenpunkt.spielstand.v2')`), 'Spielstand wird gesichert');

  // --- Hot-Seat: zwei Menschen am selben Geraet ----------------------------
  await cdp.js(`localStorage.clear()`);
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` });
  await warte(900);
  await klick('[data-action="spielerzahl"][data-wert="2"]');
  await klick('[data-action="sitz-typ"][data-index="1"][data-wert="mensch"]');
  await klick('[data-action="starten"]');
  meldung(await cdp.js(`document.body.innerText.includes('Ich bin')`), 'Hot-Seat: Uebergabeschirm fuer Spieler 1');
  await schuss('10-uebergabe');
  await klick('[data-action="uebernehmen"]');
  meldung(await cdp.js(`!!document.querySelector('[data-action="befehle-fertig"]')`), 'Hot-Seat: Spieler 1 gibt Befehle');
  await klick('[data-action="befehle-fertig"]');
  meldung(await cdp.js(`document.body.innerText.includes('Ich bin')`), 'Hot-Seat: Weitergabe an Spieler 2');
  const geheim = await cdp.js(`document.querySelectorAll('.pfeil, .stuetze').length`);
  meldung(geheim === 0, 'Hot-Seat: Befehle von Spieler 1 bleiben verdeckt');
  await klick('[data-action="uebernehmen"]');
  await klick('[data-action="befehle-fertig"]');
  meldung(await cdp.js(`!!document.querySelector('[data-action="auswerten"]')`), 'Hot-Seat: beide fertig, Befehle werden aufgedeckt');
  await klick('[data-action="auswerten"]');
  meldung(await cdp.js(`document.body.innerText.includes('Auswertung')`), 'Hot-Seat: Runde ausgewertet');
  await schuss('11-hotseat-auswertung');

  // --- Konsole sauber? -----------------------------------------------------
  const probleme = cdp.ereignisse.filter((e) =>
    (e.method === 'Runtime.exceptionThrown') ||
    (e.method === 'Log.entryAdded' && e.params.entry.level === 'error' && !String(e.params.entry.text).includes('favicon')) ||
    (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'));
  for (const p of probleme) {
    console.log('    ' + JSON.stringify(p.params).slice(0, 220));
  }
  meldung(probleme.length === 0, `Keine Fehler in der Browser-Konsole (${probleme.length})`);
} catch (e) {
  fehlerZahl++;
  console.log(` FEHL  ${e.message}`);
} finally {
  aufraeumen();
}

console.log(fehlerZahl === 0 ? '\nOberflaechentest bestanden.\n' : `\n${fehlerZahl} Problem(e).\n`);
process.exit(fehlerZahl === 0 ? 0 : 1);
