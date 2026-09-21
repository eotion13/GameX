# Knotenpunkt – Regeln

Ein Strategiespiel ohne Würfel, ohne Karten, ohne Zufall. Alle Spieler ziehen
gleichzeitig, deshalb gibt es keinen Startspielervorteil.

**2–6 Spieler · einzeln oder in Teams · 15–30 Minuten**

## Ziel

Kontrolliere die **Mehrheit der Quellen** und halte sie **zwei Runden in Folge**.
Sonst gewinnt nach 15 Runden, wer die meisten Punkte gesammelt hat.

## Das Feld

Ein **Knotenpunkt** in der Mitte, umgeben von drei Ringen aus Feldern. Der
Knotenpunkt und der gesamte innere Ring sind **Quellen** (◆). Jeder Spieler hat
eine **Basis** am äußeren Ring.

Das Feld ist drehsymmetrisch: dreht man es um einen Spielerplatz weiter, liegt
es exakt auf sich selbst. Jede Startposition ist dadurch gleichwertig – bei
jeder Spielerzahl.

| Spieler | Speichen | Felder | Quellen | Mehrheit |
|--------:|---------:|-------:|--------:|---------:|
| 2 | 6 | 19 | 7 | 4 |
| 3 | 6 | 19 | 7 | 4 |
| 4 | 8 | 25 | 9 | 5 |
| 5 | 10 | 31 | 11 | 6 |
| 6 | 12 | 37 | 13 | 7 |

## Einheiten

Drei Typen, Schere-Stein-Papier:

- **Reiter** schlägt **Bogen**
- **Bogen** schlägt **Schild**
- **Schild** schlägt **Reiter**

Auf jedem Feld steht höchstens eine Einheit. Jeder startet mit einem **Schild**
in der Basis und einem **Reiter** davor sowie 2 Energie.

## Eine Runde

1. **Befehlsphase** – verdeckt und gleichzeitig, für jede eigene Einheit:
   - **Halten** – Stellung verteidigen
   - **Bewegen** – auf ein benachbartes Feld
   - **Unterstützen** – ein benachbartes eigenes oder verbündetes Feld verstärken

   Zusätzlich kann man **bauen**: eine neue Einheit in der eigenen Basis für
   2 Energie – nur wenn die Basis frei ist.
2. **Aufdeckungsphase** – alle Befehle werden gleichzeitig sichtbar.
3. **Auswertungsphase** – nach den festen Regeln unten.
4. **Energiephase** – jede kontrollierte Quelle bringt 1 Energie und 1 Punkt.
   Ab Runde 11 bringt jede Quelle 2 Energie.

## Kampf – drei Sätze

1. **Stärke** = 1 + Unterstützungen auf dem eigenen Feld. Sie zählt beim Angriff
   genauso wie bei der Verteidigung.
2. Die **höhere Stärke** gewinnt das Feld. Bei gleicher Stärke entscheidet der **Typ**.
3. Der **Verlierer eines entschiedenen Kampfes fällt**. Nur ein echtes Patt –
   gleiche Stärke, kein Typvorteil – lässt beide unversehrt stehen.

> Ein Angriff ins Blaue kostet die Einheit. Wer angreift, bringt besser
> Unterstützung mit.

## Häufige Fragen

Jede Antwort hier ist in `tests/regelfragen.test.js` gegen die Engine abgesichert.

**Bekomme ich nur Punkte, solange ich auf der Quelle stehe?**
Nein. Einmal betreten, gehört die Quelle dir – und bringt jede Runde weiter
1 Punkt und 1 Energie, auch wenn du längst weitergezogen bist. Sie geht erst
verloren, wenn ein Gegner sie **betritt**; daneben stehen genügt ihm nicht.
Eine Einheit kann also nacheinander mehrere Quellen einsammeln und alle behalten.

**Aber wenn ich weggehe, nimmt der Gegner die Quelle doch einfach?**
Ja – das ist die zentrale Klemme des Spiels. Eine unbesetzte Quelle wechselt
kampflos den Besitzer, sobald ein Gegner sie betritt. Ausbreiten bringt
schnellen Zuwachs, lässt aber alles hinter dir offen. Genau deshalb muss die
Mehrheit **zwei Runden** gehalten werden: Einmal drüberlaufen genügt nicht.

**Was passiert, wenn ich vor einem Angreifer weglaufe?**
Drei Fälle:
- **Zielfeld frei** → du entkommst unverletzt, der Angreifer bekommt nur dein
  altes, leeres Feld. Es wird gar nicht gekämpft.
- **Dort steht ein Stärkerer** → der Zug scheitert, die Einheit fällt.
- **Ein Gegner zieht im selben Zug auf dasselbe Feld** → Wettrennen. Gewinnst
  du es, bist du raus; verlierst du es oder steht es unentschieden, bleibst du
  stehen und der Kampf auf deinem Feld findet ganz normal statt.

Wegrennen ist also eine echte Verteidigung, aber keine Garantie.

**Ist Unterstützen auch beim Verteidigen sinnvoll?**
Ja. Ein gehaltener, unterstützter Verteidiger hat Stärke 2 und schlägt einen
einzelnen Angreifer, **auch wenn dessen Typ ihn schlägt**. Aber: Wird der
Helfer selbst angegriffen, fällt seine Unterstützung weg – auch wenn dieser
Angriff scheitert.

**Was passiert, wenn ich mehrere Einheiten auf dasselbe Feld schicke?**
Nichts – sie blockieren sich gegenseitig, keine kommt an, keine nimmt Schaden.
Das gilt schon bei zweien, und unterschiedliche Typen ändern daran nichts:
unter Verbündeten entscheidet der Typ nicht. Ausnahme: Hat genau eine von ihnen
Unterstützung, setzt diese sich durch. Bei **Gegnern** ist es anders – dort
bekommt der Stärkere das Feld, der andere prallt unverletzt ab.

**Und wenn ich mit mehreren Einheiten eine gegnerische angreife?**
Dasselbe: Der Verteidiger bleibt völlig unbehelligt stehen. Richtig ist
**eine** Einheit mit *Bewegen* auf das Ziel, alle anderen mit *Unterstützen*
auf das Feld **dieser** Einheit – nicht auf das Ziel. Dann zählt ihre Stärke
zusammen und der Verteidiger fällt.

## Feinheiten

- **Unterstützung wird geschnitten**, wenn ein Gegner auf das Feld des
  Unterstützers zieht – auch wenn dieser Angriff scheitert.
- **Ziehen zwei gleich starke Einheiten auf dasselbe Feld**, kommt keine an.
  Beide bleiben unversehrt: sie haben sich blockiert, nicht gekämpft.
- **Dreier-Patt**: Reiter, Bogen und Schild auf dasselbe Feld – niemand setzt
  sich durch, niemand fällt.
- **Platztausch**: Ziehen zwei Einheiten ineinander, gewinnt die stärkere, die
  andere fällt. Bei Gleichstand bleiben beide stehen.
- **Nachrücken**: Zieht eine Einheit weg, darf eine andere im selben Zug
  nachrücken. Ein Ringtausch im Kreis gelingt ebenfalls.
- **Quellen bleiben kontrolliert**, auch wenn die Einheit weiterzieht – bis ein
  Gegner die Quelle betritt.
- **Verbündete** greifen einander nicht an und tauschen keine Plätze.
- **Ausscheiden**: Wer keine Einheiten, keine Quellen und zu wenig Energie zum
  Bauen hat, scheidet aus.

## Sieg

- **Mehrheit** der Quellen zwei Runden in Folge → sofortiger Sieg.
- **Nach 15 Runden** gewinnt die höchste Punktzahl.
  Gleichstand: mehr Einheiten, dann mehr Quellen.
- Im **Team** zählen Quellen und Punkte der Partner zusammen.

## Warum es keinen Zufall gibt

Gleicher Zustand plus gleiche Befehle ergibt immer exakt dasselbe Ergebnis.
Die Spannung entsteht allein daraus, die Absichten der anderen vorherzusehen.
