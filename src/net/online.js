// Online-Sitzung: haelt die Verbindung, den Raum und den daraus berechneten
// Spielstand zusammen und meldet der Oberflaeche jede Aenderung.

import { verbinde, NetzFehler } from './firebase.js';
import {
  RAUM_VERSION, neuerRaumcode, neuerBotSeed, berechneSpiel, sitzeArray,
  meinSitz, freierSitz, habeAbgegeben, befehlspaket, istBot,
} from './room.js';
import { PLAYER_NAMES } from '../engine/rules.js';

const TAKT_LOBBY = 2500;
const TAKT_WARTEN = 2500;
const TAKT_RUHE = 6000;
const SITZE_ALLE_N_TAKTE = 4;

export class OnlineSitzung {
  constructor(config, onChange) {
    this.config = config;
    this.onChange = onChange || (() => {});
    this.db = null;
    this.code = null;
    this.raum = { meta: null, sitze: {}, befehle: {} };
    this.cache = {};
    this.spiel = null;
    this.verlauf = [];
    this.fehlende = [];
    this.fehler = null;
    this.phase = 'verbinden'; // verbinden | lobby | laeuft | fehler
    this.timer = null;
    this.takte = 0;
    this.laeuft = false;
    this.onSichtbar = () => { if (!document.hidden) this.sofort(); };
  }

  get uid() { return this.db ? this.db.uid : null; }
  get sitz() { return meinSitz(this.raum, this.uid); }

  async verbinden() {
    this.db = await verbinde(this.config);
  }

  // ------------------------------------------------------------ Raum anlegen

  async erstelleRaum({ playerCount, teams, name }) {
    if (!this.db) await this.verbinden();
    const meta = {
      version: RAUM_VERSION,
      erstellt: Date.now(),
      playerCount,
      teams: !!teams,
      botSeed: neuerBotSeed(),
      status: 'lobby',
    };
    for (let versuch = 0; versuch < 5; versuch++) {
      const code = neuerRaumcode();
      if (await this.db.schreibenWennFrei(`raeume/${code}/meta`, meta)) {
        this.code = code;
        await this.db.schreiben(`raeume/${code}/sitze/0`, {
          name: name || PLAYER_NAMES[0], uid: this.uid,
        });
        this.raum = { meta, sitze: { 0: { name: name || PLAYER_NAMES[0], uid: this.uid } }, befehle: {} };
        this.phase = 'lobby';
        this.starteTakt();
        return code;
      }
    }
    throw new NetzFehler('Es ließ sich kein freier Raumcode finden. Bitte noch einmal versuchen.', 'code');
  }

  // ------------------------------------------------------------ Raum betreten

  async betreteRaum(code, name) {
    if (!this.db) await this.verbinden();
    this.code = code;
    const meta = await this.db.lesen(`raeume/${code}/meta`);
    if (!meta) throw new NetzFehler(`Es gibt keinen Raum mit dem Code ${code}.`, 'unbekannt');
    const sitze = (await this.db.lesen(`raeume/${code}/sitze`)) || {};
    this.raum = { meta, sitze, befehle: {} };

    if (this.sitz === null) {
      if (meta.status !== 'lobby') {
        throw new NetzFehler('Diese Partie läuft schon und ist nicht mehr offen.', 'laeuft');
      }
      const platz = freierSitz(this.raum);
      if (platz === null) throw new NetzFehler('Dieser Raum ist voll.', 'voll');
      const eintrag = { name: name || PLAYER_NAMES[platz], uid: this.uid };
      if (!(await this.db.schreibenWennFrei(`raeume/${code}/sitze/${platz}`, eintrag))) {
        return this.betreteRaum(code, name); // jemand war schneller
      }
      this.raum.sitze[platz] = eintrag;
    }

    this.phase = meta.status === 'lobby' ? 'lobby' : 'laeuft';
    await this.aktualisiere();
    this.starteTakt();
    return this.sitz;
  }

  // ------------------------------------------------------------ Partie fuehren

  /** Freie Plaetze werden Bots, dann laeuft die Partie. */
  async startePartie() {
    for (const s of sitzeArray(this.raum)) {
      if (s.uid || s.bot) continue;
      const eintrag = { name: PLAYER_NAMES[s.seat], bot: true, level: 'normal', botAb: 1 };
      await this.db.schreiben(`raeume/${this.code}/sitze/${s.seat}`, eintrag);
      this.raum.sitze[s.seat] = eintrag;
    }
    await this.db.ergaenzen(`raeume/${this.code}/meta`, { status: 'laeuft' });
    this.raum.meta = { ...this.raum.meta, status: 'laeuft' };
    this.phase = 'laeuft';
    await this.aktualisiere();
    this.neuTakten();
  }

  async sendeBefehle(orders) {
    const runde = this.spiel.round;
    await this.db.schreiben(
      `raeume/${this.code}/befehle/${runde}/${this.uid}`, befehlspaket(orders));
    await this.aktualisiere();
    this.neuTakten();
  }

  /** Einen abwesenden Mitspieler ab dieser Runde von einem Bot spielen lassen. */
  async uebernimmBot(seat) {
    await this.db.ergaenzen(`raeume/${this.code}/sitze/${seat}`, {
      bot: true, level: 'normal', botAb: this.spiel.round,
    });
    await this.aktualisiere();
    this.neuTakten();
  }

  habeAbgegeben() {
    return this.spiel ? habeAbgegeben(this.raum, this.uid, this.spiel.round) : false;
  }

  /** Bin ich in dieser Runde ueberhaupt am Zug? */
  binAmZug() {
    if (!this.spiel || this.spiel.phase === 'finished') return false;
    const s = sitzeArray(this.raum).find((x) => x.seat === this.sitz);
    return !!s && !istBot(s, this.spiel.round);
  }

  // ------------------------------------------------------------ Abgleich

  /**
   * Immer nur ein Abgleich gleichzeitig. Sonst wuerden sich zwei Laeufe den
   * Faltungs-Cache teilen und koennten einander die Zwischenstaende ueberschreiben.
   */
  async aktualisiere() {
    if (this.imGange) { this.nochmal = true; return; }
    this.imGange = true;
    try {
      await this.abgleichen();
    } finally {
      this.imGange = false;
    }
    if (this.nochmal) { this.nochmal = false; await this.aktualisiere(); }
  }

  async abgleichen() {
    if (!this.db || !this.code) return;
    const basis = `raeume/${this.code}`;

    if (this.phase === 'lobby' || this.takte % SITZE_ALLE_N_TAKTE === 0) {
      const meta = await this.db.lesen(`${basis}/meta`);
      if (meta) this.raum.meta = meta;
      const sitze = await this.db.lesen(`${basis}/sitze`);
      if (sitze) this.raum.sitze = sitze;
      if (this.raum.meta?.status === 'laeuft' && this.phase === 'lobby') this.phase = 'laeuft';
    }

    if (this.phase !== 'laeuft') { this.melde(); return; }

    // Runden nachladen, bis eine fehlt. Fehlt sie, weil wir unsere eigenen
    // Befehle noch nicht abgegeben haben, sperrt die Datenbank den Zugriff -
    // das ist gewollt und hier kein Fehler.
    for (let schutz = 0; schutz < 64; schutz++) {
      const fold = berechneSpiel(this.raum, this.cache);
      this.spiel = fold.spiel;
      this.verlauf = fold.verlauf;
      this.fehlende = fold.fehlende;
      if (this.spiel.phase === 'finished') break;
      const runde = String(this.spiel.round);
      const frisch = await this.leseRundeOptional(`${basis}/befehle/${runde}`);
      const vorher = JSON.stringify(this.raum.befehle[runde] || null);
      if (JSON.stringify(frisch || null) === vorher) break;
      this.raum.befehle[runde] = frisch || {};
    }
    this.melde();
  }

  /** Liest eine Runde; gesperrter Zugriff bedeutet schlicht "noch nichts fuer mich". */
  async leseRundeOptional(pfad) {
    try {
      return await this.db.lesen(pfad);
    } catch (e) {
      if (e instanceof NetzFehler && e.code === 'regeln') return null;
      throw e;
    }
  }

  melde() {
    this.fehler = null;
    this.onChange(this);
  }

  // ------------------------------------------------------------ Taktgeber

  starteTakt() {
    if (this.laeuft) return;
    this.laeuft = true;
    document.addEventListener('visibilitychange', this.onSichtbar);
    this.plane(0);
  }

  stoppe() {
    this.laeuft = false;
    clearTimeout(this.timer);
    document.removeEventListener('visibilitychange', this.onSichtbar);
  }

  sofort() {
    if (!this.laeuft) return;
    this.plane(0);
  }

  /** Nach einer eigenen Aktion neu takten - sonst bliebe der alte, traege Takt stehen. */
  neuTakten() {
    if (this.laeuft) this.plane(this.intervall());
  }

  intervall() {
    if (this.phase === 'lobby') return TAKT_LOBBY;
    if (this.spiel && this.spiel.phase !== 'finished' && this.habeAbgegeben()) return TAKT_WARTEN;
    return TAKT_RUHE;
  }

  plane(ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      if (!this.laeuft) return;
      if (typeof document !== 'undefined' && document.hidden) { this.plane(2000); return; }
      this.takte += 1;
      try {
        await this.aktualisiere();
      } catch (e) {
        this.fehler = e instanceof NetzFehler ? e.message : 'Unerwarteter Fehler beim Abgleich.';
        this.onChange(this);
      }
      this.plane(this.intervall());
    }, ms);
  }
}
