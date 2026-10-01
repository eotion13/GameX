# Knotenpunkt

Ein strategisches Multiplayer-Logikspiel **ohne Zufall** – als Web-App, gebaut
fürs iPhone. Kein Würfel, kein Kartenzug, keine zufälligen Ereignisse. Alle
Spieler geben ihre Befehle verdeckt und gleichzeitig; danach wertet eine feste
Regel-Engine aus.

**2–6 Spieler · einzeln oder in Teams · 15–30 Minuten · offline spielbar**
**Auf einem Gerät reihum oder online mit Freunden**

Die vollständigen Regeln: [RULES.md](RULES.md) – oder in der App unter „Regeln“.

## Aufs iPhone bekommen

**Variante A – GitHub Pages (empfohlen)**

1. **Einmalig von Hand:** *Settings → Pages → Source:* **GitHub Actions**.
   Diesen Schritt kann der Workflow nicht selbst erledigen – das Token einer
   Action darf eine Pages-Site nicht anlegen, das darf nur ein Repo-Admin.
   Solange Pages aus ist, schlägt der Deploy-Workflow mit
   *„Create Pages site failed: Resource not accessible by integration“* fehl.
2. Unter *Actions* den Workflow **Auf GitHub Pages veroeffentlichen** erneut
   starten (oder einfach den nächsten Commit pushen).
3. Die Adresse `https://eotion13.github.io/GameX/` auf dem iPhone in Safari öffnen.
4. **Teilen → Zum Home-Bildschirm.** Die App startet danach ohne Browser-Leiste
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
- **Online, jeder auf seinem Handy:** *Online mit Freunden* → Raum eröffnen →
  Link per WhatsApp verschicken. Wer darauf tippt, ist dabei. Bis zu 6 Geräte.
  Einrichtung: [ONLINE.md](ONLINE.md).

Der Spielstand wird automatisch gesichert – die App darf zwischendurch
geschlossen werden.

### Online kurz erklärt

Die Datenbank speichert *keinen Spielstand*, sondern nur die Befehle jeder
Runde. Weil `resolve` deterministisch ist, rechnet jedes Gerät aus denselben
Befehlen denselben Spielstand aus. Daher braucht es keinen Gastgeber, der online
bleiben muss, Geräte können nicht auseinanderlaufen, und eine Partie darf sich
über Tage ziehen.

Dass die Befehle bis zur eigenen Abgabe verdeckt bleiben, setzt der Server durch
(siehe `firebase-rules.json`), nicht die App: Eine Runde ist erst lesbar, wenn
der eigene Eintrag darin steht, und Abgegebenes lässt sich nicht mehr ändern.

Gebraucht wird ein kostenloses Firebase-Projekt. Das richtet **eine** Person
**einmal** ein; alle anderen tippen nur auf den Link, in dem die Zugangsdaten
mitreisen.

## Entwicklung

```bash
npm test                  # 111 Unit-Tests (Regel-Engine, Regelfragen, Online-Kern)
npm run sim               # Bot-gegen-Bot-Simulation (Balance)
npm run serve             # lokaler Server
node tools/smoke-test.js  # Oberflächentest im echten Browser
node tools/online-smoke.js # Online-Modus gegen eine nachgebaute Firebase
node tools/make-icons.py  # App-Icons neu erzeugen
```

### Aufbau

```
src/engine/    Regeln – reines JavaScript, kein DOM, keine Zufallsquelle
  rules.js       Konstanten, Typ-Überlegenheit, Siegschwellen
  board.js       Spielfeld-Erzeugung und Nachbarschaft
  state.js       Zustandsdarstellung
  resolver.js    resolve(state, orders) -> neuer Zustand
  bots.js        Zufall / Greedy / Monte-Carlo
src/net/       Online-Modus
  room.js        Raumdaten -> Spielstand falten (rein, ohne Netz)
  online.js      Sitzung: Raum anlegen, beitreten, abgleichen
  firebase.js    REST-Zugriff auf Firebase (kein SDK, kein CDN)
  config.js      Zugangsdaten aus Link, Speicher oder Datei
src/ui/        Oberfläche (Vanilla JS, kein Framework)
  board.js       2D-SVG-Brett
  board3d.js     optionale 3D-Ansicht (Three.js, lazy bei ?view=3d)
  figures.js     typunterscheidbare Figuren-Meshes (Reiter/Bogen/Schild)
  reveal.js      gleichzeitige Aufdeckung (pausierbar/skipbar, zustandslos)
  view-flag.js   Feature-Flag ohne Three.js-Import
vendor/three/  gepinnte Three.js r170 (MIT)
tests/         Unit-Tests (node --test)
tools/         Simulation, Server, Oberflächentests, Icon-Erzeugung
```

Die 3D-Ansicht ist reine Präsentation über derselben Engine: Menü **Ansicht → 3D**,
oder URL `?view=3d`. Ohne Flag bleibt das SVG-Brett (Three.js wird dann nicht geladen).
Nach dem Zugbefehl startet in 3D die Aufdeckungs-Sequenz (Pause/Überspringen);
Timing ändert keinen Spielstand. Online nutzt dieselbe View inkl. Warten-Overlay.
**Replay** zeigt vergangene Runden aus dem Verlauf erneut (Spectator/Hotseat), ohne
den aktuellen Spielstand zu verändern.

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

**3. Die Mehrheit muss gehalten werden – im Duell eine Runde länger.** Mit
sofortigem Sieg bei 4 von 7 Quellen waren Zweierpartien nach 3–4 Runden vorbei.
Jetzt zählt die Mehrheit erst, wenn sie überlebt: **zu zweit drei Runden in
Folge, ab drei Spielern zwei**. Warum unterschiedlich, steht unten.

## Balance (gleichstarke Bots)

| Aufstellung | Siege je Startplatz | Erwartet | Größte Abweichung | Ø Runden |
|---|---|---|---|---|
| 2 Spieler (1000) | 47,6 % / 46,9 % (5,5 % unentschieden) | 47,3 % | 0,4 pp (0,2 σ) | 8,7 |
| 3 Spieler (1000) | 34,4 % / 32,5 % / 32,8 % | 33,2 % | 1,2 pp (0,8 σ) | 13,2 |
| 4 Spieler (4000) | 25,3 % / 24,4 % / 25,6 % / 24,1 % | 24,9 % | 0,8 pp (1,1 σ) | 14,9 |

Kein Startplatz ist messbar im Vorteil – alle Abweichungen liegen im
statistischen Rauschen. Der Erwartungswert ist um die Unentschieden bereinigt.

Dass **Strategie** und nicht Zufall entscheidet, zeigt der Vergleich der
Bot-Stufen:

| Begegnung | Ergebnis |
|---|---|
| schwer vs. normal | 94,5 % : 5,5 % |
| normal vs. leicht | 73,8 % : 26,3 % |
| normal vs. zufall | 98,8 % : 1,3 % |

Alle drei Einheitstypen werden regelmäßig gebaut und gewinnen Kämpfe; kein Typ
dominiert.

### Der Bot schätzte den Verteidiger doppelt so stark, wie er war

Lange lieferte der `normal`-Bot 0,90 Kämpfe pro Partie – ein Gegner, der
praktisch nie angriff. Die Ursache stand in einer Zeile: Er schätzte die
Verteidigungsstärke eines Feldes als *1 + jeder benachbarte Verbündete*.

Gemessen an 188.156 echten Stellungen schätzte er damit **2,53**, während die
tatsächliche Stärke bei **1,17** lag – eine Überschätzung um 117 %. In
Wirklichkeit steht ein Verteidiger in **83,6 %** der Fälle völlig allein, denn
Unterstützung ist ein Befehl, den ein Nachbar auch erteilen muss. Der Bot ließ
dadurch 99,3 % aller Angriffsgelegenheiten aus.

Die Korrektur zählt nur Verbündete, die **nicht selbst angegriffen werden
können** – eine bedrohte Unterstützung wird ohnehin geschnitten. Von fünf
geprüften Formeln war diese mit Abstand die genaueste (mittlerer Fehler 0,095
statt 1,367). Im direkten Duell über 8.675 entschiedene Partien gewinnt die
reparierte Fassung **67,4 %** (32,5 σ), bei 4 und 6 Spielern sogar 74 %.

Für das Spielgefühl ist das der größte Unterschied: **4,58 Kämpfe je Partie
statt 0,90**, und bei zwei Spielern enden jetzt **85 %** der Partien durch
Eroberung statt durch Punkteauszählen.

### Warum das Duell eine Runde mehr braucht

Die Regel „die Mehrheit muss überleben" schafft ein Fenster: Wer sie erreicht,
muss eine Runde lang aushalten, und die anderen brauchen genau **eine** Quelle,
um ihn zu stoppen. Gemessen wurde, wie oft das gelingt – mit dem starken Bot auf
allen Plätzen, je 200–500 Partien:

| Spieler | Anläufer : alle Gegner zusammen | Anlauf gebrochen | Ø Runden |
|---|---|---|---|
| 2 | 3,42 : 3,15 (1,0×) | **14,2 %** | 5,2 |
| 3 | 3,62 : 5,29 (1,5×) | 39,9 % | 8,5 |
| 4 | 3,94 : 7,50 (1,9×) | 50,2 % | 12,8 |

Die Bruchquote folgt dem Kräfteverhältnis, nicht der Erreichbarkeit – angreifbar
sind überall ähnlich viele Quellen (2,96 / 3,25 / 3,90). Im Duell steht der
Anläufer bei Gleichstand, sein einziger Gegner müsste einen fairen Kampf
gewinnen. Ab drei Gegnern kann der Führende nicht mehr alles decken.

Eine zweite Verteidigungsrunde repariert genau das – und nur dort:

| Spieler | hold | Ø Runden | gebrochen | Ende durch Mehrheit | nach Punkten |
|---|---|---|---|---|---|
| 2 | 2 | 5,2 | 14,2 % | 100 % | 0 % |
| **2** | **3** | **6,7** | **29,3 %** | **100 %** | **0 %** |
| 4 | 2 | 12,8 | 50,2 % | 49,5 % | 50,5 % |
| 4 | 3 | 13,9 | 62,3 % | 30,5 % | **69,5 %** |

Zu zweit verdoppelt sich die Chance, einen Sieganlauf zu brechen, die Partie
wird anderthalb Runden länger, und es bleibt bei **100 %** Eroberungssiegen. Bei
vier Spielern richtet dieselbe Änderung Schaden an: Die Eroberungssiege fallen
von 49,5 % auf 30,5 %, der Rest endet am Rundenlimit mit Punktezählen. Deshalb
hängt `holdRoundsToWin` an der Spielerzahl.

Wer einen Anlauf bricht, gewinnt danach meistens auch: zu zweit in 78 % der
Fälle, bei drei Spielern ist die Partie wieder offen (je ~33 %). Bei vier
Spielern bleibt der Gebremste dagegen Favorit (58,9 %) – dort ist das Fenster
eine Bremse, keine Wende.

### Ehrliche Einschränkungen

- Ab 4 Spielern endet fast jede Bot-Partie nach Punkten statt durch Mehrheit:
  5 von 9 bzw. 7 von 13 Quellen sind gegen mehrere Gegner schwer zu halten. Unter
  Menschen mit Bündnissen dürfte das anders aussehen, aber belegt ist es nicht.
- Die Zahlen stammen aus Bot-Partien. Sie belegen, dass das Feld symmetrisch und
  kein Typ kaputt ist – sie ersetzen kein Spieltest mit Menschen.
- Der „schwer“-Bot rechnet pro Zug einige hundert Stellungen durch. Auf dem
  iPhone ist das spürbar, aber unter einer Sekunde.
- Der Online-Modus braucht ein eigenes, kostenloses Firebase-Projekt. Es gibt
  keinen Server, den man einfach benutzen kann – das ist der Preis dafür, dass
  hier niemand Betriebskosten trägt.
- Online ist gegen Mitspieler abgesichert, nicht gegen den Gastgeber: Wer das
  Firebase-Projekt besitzt, kann in der Konsole alles mitlesen. Für eine Partie
  unter Freunden ist das in Ordnung, für ein Turnier nicht.
- Der Online-Modus wurde gegen eine nachgebaute Firebase getestet
  (`tools/online-smoke.js`), die sich wie die REST-Schnittstelle verhält und die
  Leseregel nachbildet. Gegen ein echtes Projekt ist er nicht automatisiert
  geprüft – die Regeln in `firebase-rules.json` wertet nur der echte Server aus.
- Aktualisierungen kommen per Abfrage alle 2,5 bis 6 Sekunden, nicht über eine
  Dauerverbindung. Für ein rundenbasiertes Spiel reicht das; ein Echtzeitspiel
  wäre so nicht zu bauen.

## Lizenz

MIT
