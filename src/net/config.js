// Firebase-Zugangsdaten verwalten.
//
// Drei Quellen, in dieser Reihenfolge:
//   1. Der Einladungslink (dann muss ein Gast gar nichts einrichten).
//   2. Was auf diesem Geraet gespeichert wurde.
//   3. Was unten fest eingetragen ist (optional, fuer kurze Links).
//
// Der apiKey einer Firebase-Web-App ist oeffentlich - er steckt in jeder
// Web-App im Quelltext. Geschuetzt wird nicht ueber den Schluessel, sondern
// ueber die Datenbankregeln (siehe firebase-rules.json).

const SPEICHER = 'knotenpunkt.firebase.v1';

/** Optional fest eintragen, dann werden die Einladungslinks kuerzer. */
export const FEST = {
  apiKey: '',
  authDomain: '',
  databaseURL: '',
  projectId: '',
};

function vollstaendig(c) {
  return !!(c && c.apiKey && c.databaseURL && c.projectId);
}

function ergaenze(c) {
  if (!c) return null;
  const out = {
    apiKey: String(c.apiKey || '').trim(),
    databaseURL: String(c.databaseURL || '').trim().replace(/\/+$/, ''),
    projectId: String(c.projectId || '').trim(),
    authDomain: String(c.authDomain || '').trim(),
  };
  if (!out.authDomain && out.projectId) out.authDomain = `${out.projectId}.firebaseapp.com`;
  return vollstaendig(out) ? out : null;
}

// ------------------------------------------------------------ Link-Kodierung

function b64urlEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(text) {
  const norm = String(text).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(norm + '='.repeat((4 - (norm.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Kompakte Form fuer den Einladungslink. */
export function configInLink(c) {
  return b64urlEncode(JSON.stringify({ k: c.apiKey, d: c.databaseURL, p: c.projectId }));
}

export function configAusLink(code) {
  try {
    const o = JSON.parse(b64urlDecode(code));
    return ergaenze({ apiKey: o.k, databaseURL: o.d, projectId: o.p });
  } catch (_) { return null; }
}

// ------------------------------------------------------------ Einfuegen

/**
 * Nimmt entgegen, was Firebase in der Konsole anzeigt - egal ob als
 * JavaScript-Schnipsel oder als JSON. Es muss nichts zurechtgeschnitten
 * werden, der ganze Block darf hinein.
 * @returns {{config:?object, fehler:?string}}
 */
export function parseEingabe(text) {
  const roh = String(text || '').trim();
  if (!roh) return { config: null, fehler: 'Da ist noch nichts eingefügt.' };

  const feld = (name) => {
    const m = roh.match(new RegExp(`["']?${name}["']?\\s*[:=]\\s*["']([^"']+)["']`, 'i'));
    return m ? m[1] : '';
  };
  const c = ergaenze({
    apiKey: feld('apiKey'),
    authDomain: feld('authDomain'),
    databaseURL: feld('databaseURL'),
    projectId: feld('projectId'),
  });

  if (c) return { config: c, fehler: null };
  if (!feld('apiKey')) {
    return { config: null, fehler: 'Darin steht kein apiKey. Bitte den ganzen Block aus Firebase kopieren.' };
  }
  if (!feld('databaseURL')) {
    return {
      config: null,
      fehler: 'Es fehlt die databaseURL. Das heißt meistens: die Realtime Database wurde in Firebase noch nicht angelegt.',
    };
  }
  return { config: null, fehler: 'Die Angaben sind unvollständig.' };
}

// ------------------------------------------------------------ Speicher

export function gespeicherteConfig() {
  try {
    const raw = localStorage.getItem(SPEICHER);
    return raw ? ergaenze(JSON.parse(raw)) : null;
  } catch (_) { return null; }
}

export function speichereConfig(c) {
  try {
    if (!c) localStorage.removeItem(SPEICHER);
    else localStorage.setItem(SPEICHER, JSON.stringify(c));
  } catch (_) { /* privater Modus */ }
}

/** Die Zugangsdaten, mit denen gearbeitet wird. null = noch nicht eingerichtet. */
export function aktiveConfig(ausLink = null) {
  return ergaenze(ausLink) || gespeicherteConfig() || ergaenze(FEST);
}

export function istEingerichtet() {
  return !!aktiveConfig();
}
