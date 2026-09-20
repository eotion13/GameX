# Online mit Freunden spielen

Jeder auf seinem eigenen Handy, bis zu sechs Leute. Du verschickst einen Link,
die anderen tippen drauf — fertig.

**Einrichten muss das nur eine Person, ein einziges Mal.** Alle anderen müssen
gar nichts tun. Wenn du das hier durch hast, ist es für immer erledigt.

Dauer: etwa zehn Minuten. Kostet nichts.

---

## Warum überhaupt etwas einrichten?

Damit zwei Handys sich gegenseitig die Spielzüge schicken können, braucht es
einen Briefkasten im Internet, den beide erreichen. Den gibt es bei Google
kostenlos, er heißt **Firebase**. Du legst ihn einmal an und sagst dem Spiel,
wo er steht.

Es wird dabei **keine Kreditkarte** verlangt. Für ein paar Partien unter Freunden
bleibst du weit unter dem kostenlosen Rahmen.

---

## Schritt 1: Projekt anlegen

1. Gehe auf **console.firebase.google.com**
2. Melde dich mit deinem Google-Konto an
3. Tippe auf **Projekt hinzufügen**
4. Gib einen Namen ein, zum Beispiel `knotenpunkt`
5. Tippe dich mit **Weiter** durch.
   Bei *Google Analytics* wählst du **Deaktivieren** — das braucht das Spiel nicht.
6. Warten, bis *Dein Projekt ist bereit* erscheint → **Weiter**

## Schritt 2: Den Briefkasten anlegen

1. Links im Menü auf **Realtime Database**
   *(nicht „Firestore Database" — das ist etwas anderes)*
2. **Datenbank erstellen**
3. Standort auswählen — nimm einen in Europa
4. **Im gesperrten Modus starten** → **Aktivieren**

## Schritt 3: Die Regeln einsetzen

Ohne diesen Schritt kommt niemand an die Daten heran, auch du nicht.

1. Oben auf den Reiter **Regeln**
2. Alles löschen, was dort steht
3. Stattdessen den Inhalt von [`firebase-rules.json`](firebase-rules.json) einfügen
   *(den Text findest du auch im Spiel selbst unter „Online einrichten" ganz
   unten — dort reicht Antippen zum Kopieren)*
4. **Veröffentlichen**

## Schritt 4: Anonyme Anmeldung einschalten

Dadurch bekommt jedes Handy eine eigene Kennung, ohne dass sich jemand mit
Namen und Passwort anmelden muss. Nur so kann die Datenbank verhindern, dass
jemand die Befehle der Mitspieler vorher liest.

1. Links im Menü auf **Authentication**
2. **Los geht's**
3. In der Liste **Anonym** auswählen
4. Den Schalter auf **Aktivieren** stellen → **Speichern**

## Schritt 5: Die Zugangsdaten ins Spiel kopieren

1. Oben links auf das **Zahnrad** → **Projekteinstellungen**
2. Ganz nach unten scrollen zu **Meine Apps**
3. Steht dort noch nichts? Dann auf das Web-Symbol **`</>`** tippen,
   einen beliebigen Spitznamen eingeben, **App registrieren**
4. Es erscheint ein Block, der so anfängt:

   ```js
   const firebaseConfig = {
     apiKey: "AIza…",
     authDomain: "knotenpunkt-1234.firebaseapp.com",
     databaseURL: "https://knotenpunkt-1234-default-rtdb.europe-west1.firebasedatabase.app",
     …
   };
   ```

5. Diesen Block **komplett markieren und kopieren**
6. Im Spiel: **Online mit Freunden** → **Jetzt einrichten** → ganz nach unten
   scrollen → in das große Feld einfügen → **Speichern und prüfen**

Fertig.

> Steht in dem Block keine Zeile mit `databaseURL`? Dann wurde in Schritt 2 die
> Datenbank noch nicht angelegt. Zurück zu Schritt 2.

---

## Spielen

**Partie eröffnen**

1. **Online mit Freunden** → **Neue Partie eröffnen**
2. Spielerzahl wählen, Namen eintippen → **Raum eröffnen**
3. **Link teilen** → per WhatsApp verschicken
4. Warten, bis alle da sind → **Partie starten**

Plätze, die bis zum Start frei bleiben, übernehmen Bots.

**Beitreten**

Auf den Link tippen. Namen eintippen, **Beitreten**. Mehr nicht.

Ohne Link geht es auch: **Mit Code beitreten** und den sechsstelligen Raumcode
eingeben, den der Gastgeber vorliest.

**Während der Partie**

Alle geben ihre Befehle gleichzeitig ab. Wer fertig ist, sieht, auf wen noch
gewartet wird. Sind alle durch, wird ausgewertet und die nächste Runde beginnt.

Du kannst zwischendurch die App schließen, das Handy weglegen und später
weitermachen — der Spielstand liegt im Netz, nicht auf dem Gerät. Eine Partie
kann sich über Tage ziehen.

Ist jemand nicht mehr da, erscheint nach einer Weile neben seinem Namen
**Bot übernimmt**. Dann spielt ein Bot für ihn weiter und es geht voran.

---

## Wenn etwas nicht klappt

| Meldung | Was zu tun ist |
|---|---|
| *„In Firebase ist die anonyme Anmeldung noch ausgeschaltet"* | Schritt 4 nachholen |
| *„Die Datenbank verweigert den Zugriff"* | Schritt 3 nachholen — die Regeln fehlen |
| *„Es fehlt die databaseURL"* | Schritt 2 nachholen — die Datenbank fehlt |
| *„Es gibt keinen Raum mit dem Code …"* | Vertippt, oder der Gastgeber hat ein anderes Firebase-Projekt |
| *„Diese Partie läuft schon"* | Beitreten geht nur, solange die Lobby offen ist |
| *„Keine Verbindung zum Internet"* | Funkloch. Das Spiel versucht es von selbst weiter |

---

## Wie es funktioniert

Die Datenbank speichert **keinen Spielstand**, sondern nur die Befehle jeder
Runde. Da die Spiellogik streng deterministisch ist, rechnet jedes Gerät aus
denselben Befehlen denselben Spielstand aus.

Das hat drei angenehme Folgen:

- Es gibt keinen Gastgeber, der online bleiben müsste.
- Zwei Geräte können nicht auseinanderlaufen.
- Wer die App schließt, rechnet beim nächsten Start einfach neu durch.

Geschrieben wird pro Spieler und Runde genau ein kleines Objekt.

**Die Befehle bleiben geheim.** Die Regeln aus Schritt 3 geben die Befehle einer
Runde erst frei, wenn man selbst abgegeben hat — und Abgegebenes lässt sich nicht
mehr ändern. Das ist keine Höflichkeitsregel der App, sondern wird vom Server
durchgesetzt. Ein Spieler kann außerdem nur über die eigenen Einheiten
bestimmen; Befehle für fremde Einheiten werden beim Zusammenrechnen verworfen.

Ein Raumcode hat sechs Zeichen aus einem Vorrat von 32 (ohne die leicht
verwechselbaren `I`, `O`, `0`, `1`), also gut eine Milliarde Möglichkeiten.
