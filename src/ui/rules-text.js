// Das komplette Regelwerk - bewusst kurz gehalten.

export function rulesHtml() {
  return `
  <h1>Knotenpunkt</h1>
  <p class="lead">Ein Strategiespiel ohne Würfel, ohne Karten, ohne Zufall.
  Alle Spieler ziehen gleichzeitig, deshalb gibt es keinen Startspielervorteil.</p>

  <h2>Ziel</h2>
  <p>Kontrolliere die <strong>Mehrheit der Quellen</strong> und halte sie
  <strong>zwei Runden in Folge</strong>. Sonst gewinnt nach 15 Runden, wer die
  meisten Punkte gesammelt hat.</p>

  <h2>Das Feld</h2>
  <p>Ein Knotenpunkt in der Mitte, umgeben von drei Ringen. Der Knotenpunkt und
  der innere Ring sind <strong>Quellen</strong> (◆). Jeder Spieler hat eine
  <strong>Basis</strong> am äußeren Ring. Das Feld ist drehsymmetrisch: dreht man
  es um einen Spielerplatz weiter, liegt es exakt auf sich selbst. Jede
  Startposition ist dadurch gleichwertig.</p>

  <h2>Einheiten</h2>
  <p>Drei Typen, Schere-Stein-Papier:</p>
  <ul class="typen">
    <li><b>Reiter</b> schlägt <b>Bogen</b></li>
    <li><b>Bogen</b> schlägt <b>Schild</b></li>
    <li><b>Schild</b> schlägt <b>Reiter</b></li>
  </ul>
  <p>Auf jedem Feld steht höchstens eine Einheit.</p>

  <h2>Eine Runde</h2>
  <ol>
    <li><b>Befehle geben</b> – verdeckt, gleichzeitig, für jede eigene Einheit:
      <ul>
        <li><b>Halten</b> – Stellung verteidigen</li>
        <li><b>Bewegen</b> – auf ein benachbartes Feld</li>
        <li><b>Unterstützen</b> – ein benachbartes eigenes Feld verstärken</li>
      </ul>
      Zusätzlich kann man <b>bauen</b>: eine neue Einheit in der eigenen Basis
      für ${'2'} Energie – nur wenn die Basis frei ist.</li>
    <li><b>Aufdecken</b> – alle Befehle werden gleichzeitig sichtbar.</li>
    <li><b>Auswerten</b> – nach festen Regeln (siehe unten).</li>
    <li><b>Energie</b> – jede kontrollierte Quelle bringt 1 Energie und 1 Punkt.
      Ab Runde 11 bringt jede Quelle 2 Energie.</li>
  </ol>

  <h2>Kampf – drei Sätze</h2>
  <ol class="kampf">
    <li><b>Stärke</b> = 1 + Unterstützungen auf dem eigenen Feld. Sie zählt beim
      Angriff wie bei der Verteidigung.</li>
    <li>Die <b>höhere Stärke</b> gewinnt das Feld. Bei gleicher Stärke entscheidet
      der <b>Typ</b>.</li>
    <li>Der <b>Verlierer eines entschiedenen Kampfes fällt</b>. Nur ein echtes Patt
      – gleiche Stärke, kein Typvorteil – lässt beide unversehrt stehen.</li>
  </ol>
  <p class="merk">Das heißt: Ein Angriff ins Blaue kostet die Einheit. Wer angreift,
  bringt besser Unterstützung mit.</p>

  <h2>Feinheiten</h2>
  <ul>
    <li><b>Unterstützung wird geschnitten</b>, wenn ein Gegner auf das Feld des
      Unterstützers zieht – auch wenn dieser Angriff scheitert.</li>
    <li><b>Ziehen zwei gleich starke Einheiten auf dasselbe Feld</b>, kommt keine an.
      Beide bleiben unversehrt: sie haben sich gegenseitig blockiert, nicht gekämpft.</li>
    <li><b>Platztausch</b>: Ziehen zwei Einheiten ineinander, gewinnt die stärkere;
      die andere fällt. Bei Gleichstand bleiben beide stehen.</li>
    <li><b>Nachrücken</b>: Zieht eine Einheit weg, darf eine andere im selben Zug
      nachrücken. Ringtausch im Kreis funktioniert ebenfalls.</li>
    <li><b>Quellen bleiben kontrolliert</b>, auch wenn die Einheit weiterzieht –
      bis ein Gegner die Quelle betritt.</li>
    <li><b>Verbündete</b> greifen einander nicht an und tauschen keine Plätze.</li>
  </ul>

  <h2>Sieg</h2>
  <ul>
    <li><b>Mehrheit</b> der Quellen zwei Runden in Folge – sofortiger Sieg.</li>
    <li><b>Nach 15 Runden</b> gewinnt die höchste Punktzahl.
      Gleichstand: mehr Einheiten. Dann: mehr Quellen.</li>
    <li>Im Team zählen die Quellen und Punkte der Partner zusammen.</li>
  </ul>

  <h2>Warum es keinen Zufall gibt</h2>
  <p>Gleicher Zustand plus gleiche Befehle ergibt immer exakt dasselbe Ergebnis.
  Die Spannung entsteht allein daraus, die Absichten der anderen vorherzusehen.</p>`;
}
