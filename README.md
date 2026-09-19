# Knotenpunkt

Ein strategisches Multiplayer-Logikspiel **ohne Zufall** – als Web-App, gebaut
fürs iPhone. Kein Würfel, kein Kartenzug, keine zufälligen Ereignisse. Alle
Spieler geben ihre Befehle verdeckt und gleichzeitig; danach wertet eine feste
Regel-Engine aus.

**2–6 Spieler · einzeln oder in Teams · 15–30 Minuten · offline spielbar**

Die vollständigen Regeln: [RULES.md](RULES.md) – oder in der App unter „Regeln“.

## Aufs iPhone bekommen

**Variante A – GitHub Pages (empfohlen)**

1. Der Workflow `.github/workflows/pages.yml` läuft bei jedem Push und schaltet
   Pages beim ersten Mal selbst ein. Falls das an fehlenden Rechten scheitert:
   *Settings → Pages → Source:* **GitHub Actions** setzen und den Workflow unter
   *Actions* erneut starten.
2. Die Adresse `https://eotion13.github.io/GameX/` auf dem iPhone in Safari öffnen.
3. **Teilen → Zum Home-Bildschirm.** Die App startet danach ohne Browser-Leiste
   im Vollbild und läuft dank Service Worker auch offline.

**Variante B – lokal im WLAN**

```bash
npm run serve            # startet auf http://localhost:8000
```

Dann am iPhone `http://<IP-des-Rechners>:8000` öffnen (gleiches WLAN).

Es gibt keinen Build-Schritt und keine Abhängigkeiten – die App besteht aus
statischen Dateien mit ES-Modulen.

## Spielen

- **Allein gegen Bots:** Spielerzahl wählen, Plätze auf *Bot* stellen, Stufe
  *leicht / normal / schwer*.
- **Zu mehreren an einem Gerät:** mehrere Plätze auf *Mensch* stellen. Vor jedem
  Zug erscheint ein Übergabe-Schirm; die Befehle der anderen bleiben verdeckt,
  bis alle fertig sind.
- **Teams:** bei gerader Spielerzahl. Partner sitzen sich gegenüber, ihre Quellen
  und Punkte zählen zusammen.

Der Spielstand wird automatisch gesichert – die App darf zwischendurch
geschlossen werden.

## Entwicklung

```bash
npm test                 # 60 Unit-Tests der Regel-Engine
npm run sim              # Bot-gegen-Bot-Simulation (Balance)
npm run serve            # lokaler Server
node tools/smoke-test.js # Oberflächentest im echten Browser
node tools/make-icons.py # App-Icons neu erzeugen
```

### Aufbau

```
src/engine/    Regeln – reines JavaScript, kein DOM, keine Zufallsquelle
  rules.js       Konstanten, Typ-Überlegenheit, Siegschwellen
  board.js       Spielfeld-Erzeugung und Nachbarschaft
  state.js       Zustandsdarstellung
  resolver.js    resolve(state, orders) -> neuer Zustand
  bots.js        Zufall / Greedy / Monte-Carlo
src/ui/        Oberfläche (Vanilla JS, kein Framework)
tests/         Unit-Tests (node --test)
tools/         Simulation, Server, Oberflächentest, Icon-Erzeugung
```

Der Kern ist eine reine Funktion:

```js
resolve(state, { unitOrders, builds }) -> { state, events, orders }
```

Gleicher Zustand plus gleiche Befehle ergeben immer exakt dasselbe Ergebnis.
Der Ausgangszustand wird nie verändert. Genau deshalb ist alles testbar.

## Drei Entwurfsentscheidungen

**1. Knotengraph statt Hexraster.** Ein Hexfeld hat sechszählige Symmetrie. Für
4 oder 5 Spieler lässt sich darauf keine gleichwertige Startaufstellung bauen –
jemand sitzt immer näher an mehr Quellen. Das Feld ist deshalb ein radialer
Knotengraph mit genau *P*-zähliger Drehsymmetrie. Ein Test prüft für jede
Spielerzahl, dass alle Startpositionen identische Distanzprofile zu Zentrum,
Quellen und gegnerischen Basen haben.

**2. Der Verlierer eines Kampfes fällt.** In der ersten Fassung prallte ein
gescheiterter Angreifer nur ab – ein Angriff kostete also nichts. Die Simulation
zeigte die Folge sofort: Bots stocherten endlos herum, jede Partie endete
unentschieden, kein einziger Kampf in 300 Partien. Seit ein verlorener Kampf die
Einheit kostet, sind Angriffe eine echte Entscheidung und Unterstützung wird zur
zentralen Ressource.

**3. Die Mehrheit muss gehalten werden.** Mit sofortigem Sieg bei 4 von 7 Quellen
waren Zweierpartien nach 3–4 Runden vorbei. Jetzt zählt die Mehrheit erst, wenn
sie eine weitere Runde überlebt. Das verlängert die Partie und macht aus dem
Sieg eine Verteidigungsaufgabe.

## Balance (1000 Partien je Aufstellung, gleichstarke Bots)

| Aufstellung | Siege je Startplatz | Erwartet | Größte Abweichung | Ø Runden |
|---|---|---|---|---|
| 2 Spieler | 48,1 % / 44,9 % (7,0 % unentschieden) | 50 % | 5,1 pp (≈1,0 σ) | 7,9 |
| 3 Spieler | 32,6 % / 31,3 % / 33,8 % | 33,3 % | 2,0 pp (≈1,3 σ) | 14,2 |
| 4 Spieler | 24,1 % / 23,4 % / 23,0 % / 26,1 % | 25 % | 2,0 pp (≈1,5 σ) | 15,0 |

Kein Startplatz ist messbar im Vorteil – alle Abweichungen liegen im
statistischen Rauschen.

Dass **Strategie** und nicht Zufall entscheidet, zeigt der Vergleich der
Bot-Stufen über je 200 Partien:

| Begegnung | Ergebnis |
|---|---|
| schwer vs. normal | 88,5 % : 11,5 % |
| normal vs. leicht | 76,0 % : 24,0 % |
| normal vs. zufall | 98,0 % : 2,0 % |

Alle drei Einheitstypen werden regelmäßig gebaut und gewinnen Kämpfe; kein Typ
dominiert.

### Ehrliche Einschränkungen

- Ab 4 Spielern endet fast jede Bot-Partie nach Punkten statt durch Mehrheit:
  5 von 9 bzw. 7 von 13 Quellen sind gegen mehrere Gegner schwer zu halten. Unter
  Menschen mit Bündnissen dürfte das anders aussehen, aber belegt ist es nicht.
- Die Zahlen stammen aus Bot-Partien. Sie belegen, dass das Feld symmetrisch und
  kein Typ kaputt ist – sie ersetzen kein Spieltest mit Menschen.
- Der „schwer“-Bot rechnet pro Zug einige hundert Stellungen durch. Auf dem
  iPhone ist das spürbar, aber unter einer Sekunde.
- Es gibt kein Online-Spiel über mehrere Geräte. Mehrspieler läuft über
  Weiterreichen an einem Gerät.

## Lizenz

MIT
