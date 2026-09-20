// Duenne Schicht ueber die REST-Schnittstellen von Firebase.
//
// Bewusst ohne das Firebase-SDK: kein Download vom fremden Server, nichts
// was der Service Worker zwischenspeichern muesste, keine Versionsfrage.
// Die hier benutzten Endpunkte sind die oeffentlich dokumentierten und seit
// Jahren unveraendert.
//
// Aktualisierungen kommen per Abfrage im Takt, nicht per Dauerverbindung.
// Fuer ein rundenbasiertes Spiel reicht das voellig und schont den Akku.

const AUTH_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp';
const TOKEN_URL = 'https://securetoken.googleapis.com/v1/token';
const SITZUNG = 'knotenpunkt.sitzung.v1';

export class NetzFehler extends Error {
  constructor(text, code) {
    super(text);
    this.name = 'NetzFehler';
    this.code = code || null;
  }
}

const HINWEISE = {
  OPERATION_NOT_ALLOWED: 'In Firebase ist die anonyme Anmeldung noch ausgeschaltet. '
    + 'Firebase-Konsole → Authentication → Sign-in method → Anonymous → aktivieren.',
  ADMIN_ONLY_OPERATION: 'In Firebase ist die anonyme Anmeldung noch ausgeschaltet. '
    + 'Firebase-Konsole → Authentication → Sign-in method → Anonymous → aktivieren.',
  CONFIGURATION_NOT_FOUND: 'In diesem Firebase-Projekt ist Authentication noch nicht eingerichtet. '
    + 'Firebase-Konsole → Authentication → Los gehts → Anonymous aktivieren.',
  API_KEY_INVALID: 'Der apiKey stimmt nicht. Bitte die Zugangsdaten noch einmal aus Firebase kopieren.',
};

function sitzungLesen(projectId) {
  try {
    const alle = JSON.parse(localStorage.getItem(SITZUNG) || '{}');
    return alle[projectId] || null;
  } catch (_) { return null; }
}

function sitzungSchreiben(projectId, daten) {
  try {
    const alle = JSON.parse(localStorage.getItem(SITZUNG) || '{}');
    if (daten) alle[projectId] = daten; else delete alle[projectId];
    localStorage.setItem(SITZUNG, JSON.stringify(alle));
  } catch (_) { /* privater Modus: dann eben jedes Mal neu anmelden */ }
}

async function jsonPost(url, body, headers = {}) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body });
  } catch (_) {
    throw new NetzFehler('Keine Verbindung zum Internet.', 'offline');
  }
  const daten = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = daten?.error?.message || daten?.error || `HTTP ${res.status}`;
    const kurz = String(code).split(':')[0].trim();
    throw new NetzFehler(HINWEISE[kurz] || `Firebase meldet: ${code}`, kurz);
  }
  return daten;
}

/**
 * Meldet das Geraet anonym an. Der Wiederanmelde-Schluessel wird lokal
 * behalten, damit dasselbe Geraet nach einem Neustart denselben Sitz
 * zurueckbekommt.
 */
export async function anmelden(config) {
  const alt = sitzungLesen(config.projectId);
  if (alt?.refreshToken) {
    try {
      const d = await jsonPost(
        `${TOKEN_URL}?key=${encodeURIComponent(config.apiKey)}`,
        new URLSearchParams({ grant_type: 'refresh_token', refresh_token: alt.refreshToken }),
        { 'Content-Type': 'application/x-www-form-urlencoded' },
      );
      const sitzung = {
        uid: d.user_id, idToken: d.id_token, refreshToken: d.refresh_token,
        gueltigBis: Date.now() + (Number(d.expires_in) || 3600) * 1000,
      };
      sitzungSchreiben(config.projectId, sitzung);
      return sitzung;
    } catch (e) {
      if (e.code === 'offline') throw e;
      sitzungSchreiben(config.projectId, null); // abgelaufen: neu anmelden
    }
  }

  const d = await jsonPost(
    `${AUTH_URL}?key=${encodeURIComponent(config.apiKey)}`,
    JSON.stringify({ returnSecureToken: true }),
    { 'Content-Type': 'application/json' },
  );
  const sitzung = {
    uid: d.localId, idToken: d.idToken, refreshToken: d.refreshToken,
    gueltigBis: Date.now() + (Number(d.expiresIn) || 3600) * 1000,
  };
  sitzungSchreiben(config.projectId, sitzung);
  return sitzung;
}

/** Verbindung zu einer Realtime Database. */
export class Datenbank {
  constructor(config, sitzung) {
    this.config = config;
    this.sitzung = sitzung;
  }

  get uid() { return this.sitzung.uid; }

  /** Sorgt dafuer, dass der Zugangs-Token noch mindestens eine Minute gilt. */
  async token() {
    if (Date.now() > this.sitzung.gueltigBis - 60000) {
      this.sitzung = await anmelden(this.config);
    }
    return this.sitzung.idToken;
  }

  async url(pfad) {
    const t = await this.token();
    return `${this.config.databaseURL}/${pfad}.json?auth=${encodeURIComponent(t)}`;
  }

  async lesen(pfad) {
    const res = await this.hole(await this.url(pfad), { method: 'GET' });
    return res;
  }

  /** Schreibt nur, wenn dort noch nichts steht. false = war schon belegt. */
  async schreibenWennFrei(pfad, wert) {
    const vorher = await this.lesen(pfad);
    if (vorher !== null && vorher !== undefined) return false;
    await this.schreiben(pfad, wert);
    return true;
  }

  async schreiben(pfad, wert) {
    return this.hole(await this.url(pfad), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(wert),
    });
  }

  async ergaenzen(pfad, wert) {
    return this.hole(await this.url(pfad), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(wert),
    });
  }

  async hole(url, opts) {
    let res;
    try {
      res = await fetch(url, opts);
    } catch (_) {
      throw new NetzFehler('Keine Verbindung zum Internet.', 'offline');
    }
    if (res.status === 401 || res.status === 403) {
      throw new NetzFehler(
        'Die Datenbank verweigert den Zugriff. Meistens fehlen die Sicherheitsregeln '
        + '(Firebase-Konsole → Realtime Database → Regeln).', 'regeln');
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new NetzFehler(`Die Datenbank meldet einen Fehler (${res.status}). ${text}`.trim(), 'db');
    }
    const text = await res.text();
    if (!text || text === 'null') return null;
    try { return JSON.parse(text); } catch (_) { return null; }
  }
}

/** Anmelden und Datenbankverbindung herstellen. */
export async function verbinde(config) {
  const sitzung = await anmelden(config);
  return new Datenbank(config, sitzung);
}
