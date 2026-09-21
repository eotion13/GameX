// Das Regelwerk. Bewusst in einfacher Sprache: kurze Saetze, konkrete
// Beispiele, Sonderfaelle erst ganz zum Schluss.
//
// Die Antworten unter "Haeufige Fragen" sind in tests/regelfragen.test.js
// gegen die Engine abgesichert. Wer hier etwas aendert, aendert es dort mit.

const ROT = '#e4572e';
const BLAU = '#2e86ab';
const GOLD = '#ffd166';

/** Kleines Feld-Symbol fuer die Legende. */
function knoten({ x = 12, farbe = null, buchstabe = null, eigen = false, quelle = false, ring = null }) {
  const teile = [];
  if (quelle) teile.push(`<circle cx="${x}" cy="12" r="10" fill="${GOLD}" opacity=".18"/>`);
  teile.push(`<circle cx="${x}" cy="12" r="7.5" fill="#222b3f"
    stroke="#3d4a66" stroke-width="1.2"/>`);
  if (ring) {
    teile.push(`<circle cx="${x}" cy="12" r="10" fill="none" stroke="${ring}" stroke-width="1.9"/>`);
  }
  if (quelle) teile.push(`<path d="M ${x} 9 L ${x + 3} 12 L ${x} 15 L ${x - 3} 12 Z" fill="${GOLD}"/>`);
  if (buchstabe) {
    teile.push(`<circle cx="${x}" cy="12" r="6.5" fill="${farbe}"
      stroke="${eigen ? '#fff' : '#0d111b'}" stroke-width="${eigen ? 1.6 : 1.2}"/>`);
    teile.push(`<text x="${x}" y="12" fill="#fff" font-size="8" font-weight="700"
      text-anchor="middle" dominant-baseline="central">${buchstabe}</text>`);
  }
  return teile.join('');
}

function svg(breite, inhalt) {
  const massstab = 1.3; // auf dem Handy sonst zu klein zum Erkennen
  return `<svg class="legende-bild" viewBox="0 0 ${breite} 24"
    width="${Math.round(breite * massstab)}" height="${Math.round(24 * massstab)}"
    xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inhalt}</svg>`;
}

function zeile(bild, titel, text) {
  return `<li><span class="legende-sym">${bild}</span>
    <span class="legende-text"><b>${titel}</b> ${text}</span></li>`;
}

function legendeBrett() {
  const pfeil = svg(56, `
    ${knoten({ x: 10, farbe: ROT, buchstabe: 'R', eigen: true })}
    <line x1="20" y1="12" x2="40" y2="12" stroke="${ROT}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M 46 12 L 38 8 L 38 16 Z" fill="${ROT}"/>
    ${knoten({ x: 50 })}`);
  const stuetze = svg(56, `
    ${knoten({ x: 10, farbe: ROT, buchstabe: 'R', eigen: true })}
    <line x1="20" y1="12" x2="40" y2="12" stroke="${ROT}" stroke-width="2"
      stroke-dasharray="4 3" stroke-linecap="round"/>
    <circle cx="42" cy="12" r="2.6" fill="${ROT}"/>
    ${knoten({ x: 50, farbe: ROT, buchstabe: 'S' })}`);

  return `<ul class="legende">
    ${zeile(svg(24, knoten({ quelle: true })), 'Quelle',
    'Ein goldenes Feld. Nur darum geht es.')}
    ${zeile(svg(24, knoten({ farbe: ROT, buchstabe: 'R', eigen: true })), 'Deine Figur',
    'Der weiße Rand heißt: die gehört dir. Der Buchstabe sagt welcher Typ.')}
    ${zeile(svg(24, knoten({ farbe: BLAU, buchstabe: 'B' })), 'Fremde Figur',
    'Kein weißer Rand. Die Farbe verrät, wem sie gehört.')}
    ${zeile(svg(24, `<rect x="1.5" y="1.5" width="21" height="21" rx="2" fill="none"
      stroke="${BLAU}" stroke-width="1.4" opacity=".6"/>${knoten({})}`), 'Basis',
    'Hier entstehen die neuen Figuren dieses Spielers.')}
    ${zeile(svg(28, knoten({ x: 14, quelle: true, ring: ROT })), 'Farbiger Ring',
    'Diese Quelle <i>gehört</i> gerade diesem Spieler — auch wenn niemand darauf '
    + 'steht. Der Ring bleibt sichtbar, selbst wenn eine Figur darauf steht: '
    + 'Ring und Figur können verschiedene Farben haben.')}
    ${zeile(pfeil, 'Durchgezogener Pfeil', 'Diese Figur geht dorthin.')}
    ${zeile(stuetze, 'Gestrichelte Linie', 'Diese Figur hilft dem Nachbarn. Sie bleibt stehen.')}
    ${zeile(svg(24, `${knoten({ farbe: ROT, buchstabe: 'R', eigen: true })}
      <circle cx="18.5" cy="5.5" r="2.6" fill="${GOLD}"/>`), 'Kleiner goldener Punkt',
    'Dieser Figur hast du schon einen Befehl gegeben.')}
    ${zeile(svg(24, `<circle cx="12" cy="12" r="7.5" fill="#3a3a2a" stroke="${GOLD}" stroke-width="2.2"/>`),
    'Gold umrandetes Feld', 'Ein mögliches Ziel, nachdem du eine Figur angetippt hast.')}
  </ul>`;
}

function legendeKopf() {
  const chip = (t) => `<span class="legende-zahl">${t}</span>`;
  return `<ul class="legende">
    ${zeile(chip('◆ 3'), '3 Quellen', 'gehören dir. <b>Das ist die wichtigste Zahl im Spiel.</b>')}
    ${zeile(chip('◆ 4¹'), 'Die kleine hochgestellte Zahl',
    'zeigt, seit wie vielen Runden du die Mehrheit hältst. Bei <b>²</b> hast du gewonnen.')}
    ${zeile(chip('⬤ 2'), '2 Figuren', 'hast du noch auf dem Brett.')}
    ${zeile(chip('★ 5'), '5 Punkte', 'hast du gesammelt. Die zählen nur, wenn nach 15 Runden niemand gewonnen hat.')}
    ${zeile(chip('⚡ 4'), '4 Energie', 'hast du übrig. Eine neue Figur kostet 2.')}
  </ul>`;
}

export function rulesHtml() {
  return `
  <h1>Knotenpunkt</h1>
  <p class="lead">Ein Strategiespiel ohne Würfel und ohne Glück.
  Alle geben ihre Befehle heimlich ab und decken gleichzeitig auf.</p>

  <h2>Das Ziel</h2>
  <p class="merk">Auf dem Brett liegen <b>goldene Felder</b> — die Quellen.
  Wer <b>mehr als die Hälfte</b> davon besitzt und sie <b>zwei Runden lang
  hält</b>, gewinnt sofort.</p>
  <p>Wie viele du genau brauchst, steht immer oben am Bildschirmrand:
  <b>Sieg: 4/7 ◆</b> heißt „du brauchst 4 der 7 Quellen“. Je mehr Spieler
  mitspielen, desto größer wird das Brett.</p>
  <p>Schafft es niemand, gewinnt nach 15 Runden, wer die meisten Punkte hat.</p>

  <h2>So läuft eine Runde</h2>
  <ol>
    <li>Du gibst jeder deiner Figuren einen Befehl. <b>Niemand sieht es.</b></li>
    <li>Alle Befehle werden gleichzeitig aufgedeckt.</li>
    <li>Es wird ausgerechnet, wer wohin kommt und wer fällt.</li>
    <li>Für jede Quelle, die dir jetzt gehört, bekommst du
      <b>1 Punkt und 1 Energie</b>.</li>
  </ol>
  <p>Weil alle gleichzeitig ziehen, gibt es keinen Vorteil für den, der anfängt.
  Die ganze Spannung ist: <i>Was macht der andere wohl gerade?</i></p>

  <h2>Die Zahlen oben am Rand</h2>
  ${legendeKopf()}

  <h2>Die Symbole auf dem Brett</h2>
  ${legendeBrett()}

  <h2>Deine drei Figuren</h2>
  <p>Schere, Stein, Papier — mehr ist es nicht:</p>
  <ul class="typen">
    <li><b>R</b>eiter schlägt <b>B</b>ogen</li>
    <li><b>B</b>ogen schlägt <b>S</b>child</li>
    <li><b>S</b>child schlägt <b>R</b>eiter</li>
  </ul>

  <h2>Was du befehlen kannst</h2>
  <ul>
    <li><b>Halten</b> — die Figur bleibt stehen und verteidigt.</li>
    <li><b>Bewegen</b> — ein Feld weiter, auf ein Nachbarfeld.</li>
    <li><b>Unterstützen</b> — die Figur bleibt stehen und macht einen
      Nachbarn um 1 stärker.</li>
  </ul>
  <p>Zusätzlich darfst du <b>bauen</b>: für 2 Energie entsteht eine neue Figur
  in deiner Basis — aber nur, wenn dort gerade niemand steht.</p>

  <h2>Kampf</h2>
  <p>Jede Figur hat <b>Stärke 1</b>. Für jeden Nachbarn, der sie unterstützt,
  kommt <b>+1</b> dazu. Beim Angriff wie beim Verteidigen.</p>
  <ul>
    <li>Mehr Stärke gewinnt.</li>
    <li>Gleiche Stärke: der bessere Typ gewinnt.</li>
    <li>Gleiche Stärke, kein Typvorteil: nichts passiert, beide bleiben stehen.</li>
    <li><b>Wer einen Kampf verliert, ist weg.</b></li>
  </ul>
  <p class="merk">Merke dir vor allem das: <b>Allein angreifen ist meistens
  Selbstmord.</b> Wer angreift, bringt besser jemanden zum Unterstützen mit.</p>

  <h2>Häufige Fragen</h2>

  <h3>Bekomme ich nur Punkte, solange ich auf der Quelle stehe?</h3>
  <p><b>Nein.</b> Sobald du eine Quelle einmal betreten hast, gehört sie dir —
  und sie bringt dir <b>jede Runde weiter Punkte und Energie</b>, auch wenn du
  längst weitergezogen bist.</p>
  <p>Sie geht erst verloren, wenn ein <b>Gegner sie betritt</b>. Ein Gegner, der
  nur daneben steht, ändert gar nichts.</p>
  <p class="merk">Deshalb lohnt es sich weiterzuziehen: Eine Figur kann nacheinander
  mehrere Quellen einsammeln und alle behalten.</p>

  <h3>Aber wenn ich weggehe, nimmt der Gegner sie mir doch einfach?</h3>
  <p><b>Ja — genau das ist die Klemme, um die das ganze Spiel gebaut ist.</b></p>
  <p>Eine Quelle, auf der niemand steht, ist für jeden zum Hineinspazieren frei.
  Es gibt also zwei Wege, und beide haben einen Preis:</p>
  <ul>
    <li><b>Stehenbleiben</b> — sicher, aber du kommst nie an mehr Quellen.</li>
    <li><b>Weiterziehen</b> — du sammelst schneller, lässt aber hinter dir
      alles offen.</li>
  </ul>
  <p>Die Mehrheit <i>zwei Runden lang halten</i> zu müssen ist genau deshalb die
  Siegbedingung: Einmal kurz drüberlaufen genügt nicht. Am Ende musst du deine
  Quellen tatsächlich verteidigen.</p>
  <p class="merk">Praktischer Rat: Sammle mit den vorderen Figuren ein und
  <b>baue rechtzeitig nach</b>. Neue Figuren kosten 2 Energie — und die Energie
  kommt von genau den Quellen, die du gerade einsammelst.</p>

  <h3>Was passiert, wenn ich vor einem Angreifer weglaufe?</h3>
  <p>Hängt davon ab, ob dein Fluchtfeld wirklich frei bleibt:</p>
  <ul>
    <li><b>Feld ist frei</b> → du entkommst unverletzt. Der Angreifer läuft ins
      Leere und bekommt nur dein altes, leeres Feld. Es wird gar nicht gekämpft.</li>
    <li><b>Dort steht jemand Stärkeres</b> → du kommst nicht an und stirbst.</li>
    <li><b>Ein Gegner zieht im selben Zug auf dasselbe Fluchtfeld</b> → es wird
      ein Wettrennen. Gewinnst du es, bist du raus. <b>Verlierst du es oder
      steht es unentschieden, bleibst du stehen</b> — und der Kampf auf deinem
      Feld findet ganz normal statt.</li>
  </ul>
  <p class="merk">Wegrennen ist eine echte Verteidigung, aber <b>keine
  Garantie</b>. Am sichersten fliehst du dorthin, wo kein Gegner hinkommt.</p>

  <h3>Was passiert, wenn ich drei Figuren auf dasselbe Feld schicke?</h3>
  <p><b>Gar nichts — alle drei bleiben stehen.</b> Eigene Figuren drängeln sich
  gegenseitig weg. Keine kommt an, keine nimmt Schaden, die Runde ist verschenkt.</p>
  <p><b>Das gilt schon bei zwei.</b> Und verschiedene Typen helfen auch nicht:
  Unter eigenen Figuren entscheidet der Typ nicht, sie blockieren sich einfach.
  Schick immer nur <b>eine</b> Figur auf ein Feld.</p>
  <p><i>Ausnahme:</i> Hat eine der Figuren Unterstützung und die anderen nicht,
  setzt sich die unterstützte durch und die übrigen bleiben stehen.</p>
  <p>Bei <b>Gegnern</b> ist es anders: Ziehen zwei Gegner auf dasselbe leere
  Feld, bekommt es der Stärkere, der andere bleibt unverletzt stehen.</p>

  <h3>Und wenn ich mit drei Figuren eine gegnerische angreife?</h3>
  <p><b>Genau dasselbe: Der Gegner bleibt völlig unbehelligt stehen.</b> Deine
  drei blockieren sich gegenseitig und kommen nie bei ihm an. Sie sterben zwar
  nicht, aber du hast drei Züge verschwendet.</p>
  <p>So geht es richtig:</p>
  <p class="merk"><b>Eine</b> Figur bekommt <b>Bewegen</b> auf den Gegner.
  Die anderen bekommen <b>Unterstützen</b> auf das Feld <i>dieser</i> Figur —
  nicht auf den Gegner.</p>
  <p>Dann hat deine Angreiferin Stärke 3 gegen 1. Der Gegner fällt, dein Feld
  ist erobert, und du hast keine Figur verloren.</p>

  <h3>Ist Unterstützen auch dann gut, wenn ich gar nicht angreife?</h3>
  <p><b>Ja — beim Verteidigen wirkt es genauso.</b> Eine Figur, die gehalten
  <i>und</i> von einem Nachbarn unterstützt wird, hat Stärke 2. Ein einzelner
  Angreifer hat Stärke 1 und fällt, <b>selbst wenn sein Typ deinen schlägt</b>.</p>
  <p>Ohne den Helfer wäre dieselbe Figur gestorben. Unterstützen ist damit
  <b>die beste Art, eine wichtige Quelle zu halten</b>.</p>
  <p><b>Aber nicht blind:</b></p>
  <ul>
    <li>Wird der <b>Helfer selbst angegriffen</b>, fällt seine Hilfe weg — auch
      wenn dieser Angriff scheitert. Dann steht dein Verteidiger plötzlich allein.</li>
    <li>Droht gerade gar nichts, ist Unterstützen ein verschenkter Zug. Dann
      lieber eine neue Quelle holen.</li>
  </ul>

  <h3>Wie werde ich eine Quelle wieder los, die der Gegner hält?</h3>
  <p>Du musst mit einer Figur <b>draufziehen</b>. Steht dort jemand, musst du
  ihn schlagen — mit dem besseren Typ oder mit Unterstützung. Steht dort niemand,
  spazierst du einfach hinein und die Quelle wechselt den Besitzer.</p>

  <h2>Feinheiten (für später)</h2>
  <ul>
    <li><b>Unterstützung wird abgeschnitten</b>, wenn ein Gegner den Helfer
      angreift — auch wenn dieser Angriff scheitert. Wenn zwei Gegner
      zusammenarbeiten, greif also den <i>Helfer</i> an, nicht den Angreifer.</li>
    <li><b>Ziehen zwei Gegner auf dasselbe leere Feld</b>, bekommt es der
      Stärkere. Der andere bleibt stehen, unverletzt — sie haben sich nur um
      den Platz gebalgt, nicht gekämpft.</li>
    <li><b>Platztausch</b>: Ziehen zwei Figuren direkt ineinander, gewinnt die
      stärkere, die andere fällt. Bei Gleichstand bleiben beide stehen.</li>
    <li><b>Nachrücken</b>: Zieht eine Figur weg, darf eine andere im selben Zug
      auf ihr Feld nachrücken. Auch ein Ringtausch im Kreis klappt.</li>
    <li><b>Verbündete</b> greifen einander nie an und tauschen keine Plätze.</li>
    <li><b>Ab Runde 11</b> bringt jede Quelle 2 Energie statt 1 — damit die
      Partie zum Ende kommt.</li>
  </ul>

  <h2>Warum es keinen Zufall gibt</h2>
  <p>Gleiche Lage plus gleiche Befehle ergibt immer exakt dasselbe Ergebnis.
  Niemand hat Pech. Wer verliert, wurde durchschaut.</p>`;
}
