// Ansichten, die es nur im Online-Modus gibt. Reine Darstellung:
// rein gehen Daten, heraus kommt HTML.

import { PLAYER_COLORS, PLAYER_NAMES } from '../engine/rules.js';
import { sitzeArray, istBot } from '../net/room.js';

export function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function fehlerBox(text) {
  return text ? `<p class="fehler">${esc(text)}</p>` : '';
}

// ------------------------------------------------------------------ Einstieg

export function viewOnlineStart({ eingerichtet, letzterRaum, fehler }) {
  return `
  <div class="seite menue">
    <header class="titel">
      <h1>Online spielen</h1>
      <p>Bis zu sechs Geräte, jeder auf seinem eigenen Handy.</p>
    </header>
    ${fehlerBox(fehler)}
    ${eingerichtet ? `
    <div class="aktionen">
      <button class="haupt" data-action="online-erstellen-form">Neue Partie eröffnen</button>
      <button class="neben" data-action="online-beitreten-form">Mit Code beitreten</button>
      ${letzterRaum ? `<button class="neben" data-action="online-fortsetzen" data-code="${esc(letzterRaum)}">Partie ${esc(letzterRaum)} fortsetzen</button>` : ''}
    </div>
    <p class="fuss">Verbindung eingerichtet. <a href="#" data-action="online-einrichten">Zugangsdaten ändern</a></p>
    ` : `
    <section class="karte">
      <h2>Einmal einrichten</h2>
      <p class="hinweis">Damit sich die Handys finden können, braucht das Spiel
      eine kostenlose Datenbank. Das muss <strong>nur eine Person einmal</strong>
      machen — alle anderen tippen später bloß auf den Einladungslink.</p>
    </section>
    <div class="aktionen">
      <button class="haupt" data-action="online-einrichten">Jetzt einrichten</button>
    </div>`}
    <div class="aktionen">
      <button class="neben klein" data-action="neues-spiel">Zurück</button>
    </div>
  </div>`;
}

// ------------------------------------------------------------- Einrichtung

export function viewOnlineSetup({ fehler, entwurf }) {
  return `
  <div class="seite regeln">
    <div class="aktionen oben">
      <button class="neben" data-action="online">Zurück</button>
    </div>
    <h1>Online einrichten</h1>
    <p class="hinweis">Einmalig, dauert ein paar Minuten. Danach nie wieder.</p>
    ${fehlerBox(fehler)}

    <section class="karte">
      <h2>1. Projekt anlegen</h2>
      <ol class="schritte">
        <li>Gehe auf <strong>console.firebase.google.com</strong> und melde dich mit
            deinem Google-Konto an.</li>
        <li>Tippe auf <strong>Projekt hinzufügen</strong>.</li>
        <li>Gib einen Namen ein, z.&nbsp;B. <em>knotenpunkt</em>, und tippe dich
            mit <strong>Weiter</strong> durch. Google&nbsp;Analytics kannst du
            ausschalten, das braucht das Spiel nicht.</li>
      </ol>
    </section>

    <section class="karte">
      <h2>2. Datenbank anlegen</h2>
      <ol class="schritte">
        <li>Links im Menü auf <strong>Realtime Database</strong>.</li>
        <li><strong>Datenbank erstellen</strong> → Standort auswählen (Europa ist
            gut) → <strong>Im gesperrten Modus starten</strong>.</li>
        <li>Oben auf den Reiter <strong>Regeln</strong>, alles darin löschen und
            stattdessen einfügen, was unten unter <em>Regeln</em> steht.
            Dann <strong>Veröffentlichen</strong>.</li>
      </ol>
    </section>

    <section class="karte">
      <h2>3. Anonyme Anmeldung einschalten</h2>
      <ol class="schritte">
        <li>Links im Menü auf <strong>Authentication</strong> → <strong>Los geht's</strong>.</li>
        <li>In der Liste <strong>Anonym</strong> auswählen, einschalten,
            <strong>Speichern</strong>.</li>
      </ol>
      <p class="hinweis">Dadurch bekommt jedes Handy eine eigene Kennung, ohne dass
      sich jemand anmelden muss. Nur so kann die Datenbank verhindern, dass
      jemand die Befehle der Mitspieler vorher liest.</p>
    </section>

    <section class="karte">
      <h2>4. Zugangsdaten hierher kopieren</h2>
      <ol class="schritte">
        <li>Oben links auf das <strong>Zahnrad</strong> → <strong>Projekteinstellungen</strong>.</li>
        <li>Ganz nach unten scrollen zu <strong>Meine Apps</strong>. Wenn dort noch
            nichts steht: auf das <strong>Web-Symbol &lt;/&gt;</strong> tippen, einen
            Spitznamen eingeben, registrieren.</li>
        <li>Es erscheint ein Block, der mit <code>const firebaseConfig = {</code>
            anfängt. Diesen Block <strong>komplett markieren und kopieren</strong>.</li>
        <li>Hier einfügen — der ganze Block darf hinein, ich suche mir heraus,
            was ich brauche.</li>
      </ol>
      <textarea id="fb-eingabe" class="eingabe gross" rows="7"
        placeholder="const firebaseConfig = { ... };">${esc(entwurf || '')}</textarea>
      <div class="aktionen">
        <button class="haupt" data-action="online-config-speichern">Speichern und prüfen</button>
      </div>
    </section>

    <section class="karte">
      <h2>Regeln</h2>
      <p class="hinweis">Das gehört in Schritt&nbsp;2 in den Reiter <em>Regeln</em>.
      Antippen kopiert es.</p>
      <pre class="regelblock" data-action="regeln-kopieren">${esc(REGELN_TEXT)}</pre>
    </section>
  </div>`;
}

export const REGELN_TEXT = `{
  "rules": {
    "raeume": {
      "$code": {
        "meta": {
          ".read": "auth != null",
          ".write": "auth != null && (!data.exists() || (newData.child('botSeed').val() === data.child('botSeed').val() && newData.child('playerCount').val() === data.child('playerCount').val()))"
        },
        "sitze": {
          ".read": "auth != null",
          "$sitz": {
            ".write": "auth != null && (!data.child('uid').exists() || data.child('uid').val() === auth.uid || newData.child('bot').val() === true)"
          }
        },
        "befehle": {
          "$runde": {
            ".read": "auth != null && data.child(auth.uid).exists()",
            "$uid": {
              ".write": "auth != null && $uid === auth.uid && !data.exists()"
            }
          }
        }
      }
    }
  }
}`;

// ------------------------------------------------------------- Raum anlegen

export function viewOnlineErstellen({ setup, name, fehler, laedt }) {
  const counts = [2, 3, 4, 5, 6].map((n) => `
    <button class="chip ${setup.playerCount === n ? 'aktiv' : ''}" data-action="spielerzahl" data-wert="${n}">${n}</button>`).join('');
  return `
  <div class="seite menue">
    <header class="titel"><h1>Partie eröffnen</h1></header>
    ${fehlerBox(fehler)}
    <section class="karte">
      <h2>Wie viele Spieler insgesamt?</h2>
      <div class="chips">${counts}</div>
      <p class="hinweis">Plätze, die bis zum Start frei bleiben, übernehmen Bots.</p>
      ${setup.playerCount % 2 === 0 ? `
      <h2>Modus</h2>
      <div class="segment">
        <button class="${!setup.teams ? 'aktiv' : ''}" data-action="modus" data-wert="frei">Jeder gegen jeden</button>
        <button class="${setup.teams ? 'aktiv' : ''}" data-action="modus" data-wert="teams">Teams</button>
      </div>` : ''}
      <h2>Dein Name</h2>
      <input id="online-name" class="eingabe" maxlength="14" value="${esc(name || '')}" placeholder="z.B. Abdul">
    </section>
    <div class="aktionen">
      <button class="haupt" ${laedt ? 'disabled' : ''} data-action="online-erstellen">
        ${laedt ? 'Raum wird angelegt…' : 'Raum eröffnen'}</button>
      <button class="neben klein" data-action="online">Zurück</button>
    </div>
  </div>`;
}

export function viewOnlineBeitreten({ code, name, fehler, laedt }) {
  return `
  <div class="seite menue">
    <header class="titel"><h1>Beitreten</h1></header>
    ${fehlerBox(fehler)}
    <section class="karte">
      <h2>Raumcode</h2>
      <input id="online-code" class="eingabe code" maxlength="8" autocapitalize="characters"
        autocomplete="off" spellcheck="false" value="${esc(code || '')}" placeholder="K4MPT9">
      <h2>Dein Name</h2>
      <input id="online-name" class="eingabe" maxlength="14" value="${esc(name || '')}" placeholder="z.B. Mira">
    </section>
    <div class="aktionen">
      <button class="haupt" ${laedt ? 'disabled' : ''} data-action="online-beitreten">
        ${laedt ? 'Verbinde…' : 'Beitreten'}</button>
      <button class="neben klein" data-action="online">Zurück</button>
    </div>
  </div>`;
}

// -------------------------------------------------------------------- Lobby

function sitzZeile(s, opts = {}) {
  const farbe = PLAYER_COLORS[s.seat];
  let zustand;
  if (s.bot) zustand = '<span class="team-tag">Bot</span>';
  else if (s.uid) zustand = opts.ichBin === s.seat ? '<span class="team-tag ich">du</span>' : '<span class="team-tag">bereit</span>';
  else zustand = '<span class="team-tag wartet">frei</span>';
  return `
    <div class="sitz">
      <span class="punkt" style="background:${farbe}"></span>
      <strong>${esc(s.uid || s.bot ? s.name : PLAYER_NAMES[s.seat])}</strong>
      ${zustand}
    </div>`;
}

export function viewLobby({ sitzung, link, teams, kopiert, fehler }) {
  const sitze = sitzeArray(sitzung.raum);
  const ichBin = sitzung.sitz;
  const gastgeber = ichBin === 0;
  const menschen = sitze.filter((s) => s.uid).length;
  return `
  <div class="seite menue">
    <header class="titel">
      <h1>Raum ${esc(sitzung.code)}</h1>
      <p>${menschen} von ${sitze.length} Plätzen besetzt${teams ? ' · Teams' : ''}</p>
    </header>
    ${fehlerBox(fehler || sitzung.fehler)}
    <section class="karte">
      <h2>Mitspieler einladen</h2>
      <p class="hinweis">Link verschicken — wer darauf tippt, ist sofort dabei.
      Ohne Link geht es auch: Code <strong>${esc(sitzung.code)}</strong> ansagen.</p>
      <div class="aktionen">
        <button class="haupt" data-action="online-teilen">${kopiert ? 'Link kopiert ✓' : 'Link teilen'}</button>
      </div>
      <p class="linkfeld">${esc(link)}</p>
    </section>
    <section class="karte">
      <h2>Plätze</h2>
      ${sitze.map((s) => sitzZeile(s, { ichBin })).join('')}
    </section>
    <div class="aktionen">
      ${gastgeber
        ? '<button class="haupt" data-action="online-starten">Partie starten</button>'
        : '<p class="hinweis warte">Warten, bis die Partie gestartet wird…</p>'}
      <button class="neben klein" data-action="online-verlassen">Raum verlassen</button>
    </div>
    ${gastgeber ? '<p class="fuss">Freie Plätze werden beim Start von Bots übernommen.</p>' : ''}
  </div>`;
}

// ------------------------------------------------------------------- Warten

export function viewWarten({ sitzung, statusHtml, brettHtml, wartetSeit }) {
  const sitze = sitzeArray(sitzung.raum);
  const fehlende = sitzung.fehlende
    .filter((seat) => seat !== sitzung.sitz)
    .map((seat) => sitze[seat]);
  const langeGenug = wartetSeit > 45000;

  const liste = fehlende.length
    ? fehlende.map((s) => `
        <li>
          <span class="punkt" style="background:${PLAYER_COLORS[s.seat]}"></span>
          ${esc(s.name)}
          ${langeGenug ? `<button class="mini" data-action="online-bot-uebernahme" data-seat="${s.seat}">Bot übernimmt</button>` : ''}
        </li>`).join('')
    : '<li class="leer">Alle sind fertig — wird gleich ausgewertet.</li>';

  return `
  <div class="seite spiel">
    ${statusHtml}
    <div class="brett">${brettHtml}</div>
    <div class="panel">
      <div class="panel-kopf"><strong>Befehle abgegeben</strong><span class="badge">Runde ${sitzung.spiel.round}</span></div>
      <p class="hinweis">Es fehlen noch:</p>
      <ul class="liste">${liste}</ul>
      ${langeGenug && fehlende.length
        ? '<p class="hinweis">Jemand ist weg? Dann kann ein Bot für ihn weiterspielen.</p>' : ''}
      ${sitzung.fehler ? fehlerBox(sitzung.fehler) : ''}
    </div>
    <div class="aktionen fix">
      <button class="neben klein" data-action="regeln">Regeln</button>
      <button class="neben klein" data-action="online-verlassen">Verlassen</button>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ Zuschauen

export function viewOnlineBot({ sitzung, statusHtml, brettHtml }) {
  return `
  <div class="seite spiel">
    ${statusHtml}
    <div class="brett">${brettHtml}</div>
    <div class="panel">
      <div class="panel-kopf"><strong>Dein Platz wird von einem Bot gespielt</strong></div>
      <p class="hinweis">Du kannst zuschauen, wie die Partie zu Ende geht.</p>
    </div>
    <div class="aktionen fix">
      <button class="neben klein" data-action="online-verlassen">Verlassen</button>
    </div>
  </div>`;
}

export function viewVerbinden({ text }) {
  return `
  <div class="seite menue">
    <header class="titel"><h1>Knotenpunkt</h1><p>${esc(text || 'Verbinde…')}</p></header>
    <div class="aktionen"><button class="neben klein" data-action="neues-spiel">Abbrechen</button></div>
  </div>`;
}
