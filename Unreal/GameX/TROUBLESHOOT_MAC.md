# Unreal öffnet kurz und schließt wieder (Mac)

Typische Ursache: C++-Module fehlen / Build scheitert / falsche Engine.

## 1) Richtige Engine wählen

Rechtsklick auf `Unreal/GameX/GameX.uproject` → **Engine-Version umschalten**  
→ deine installierte Version wählen (z. B. 5.5.4).  
Nicht 5.8 auf Intel.

## 2) Über Terminal starten (zeigt den Fehler)

Pfad zur Engine anpassen (`UE_5.5` oder `UE_5.5.4` …):

```bash
cd ~/Documents/GameX

# Welche Engines sind da?
ls "/Users/Shared/Epic Games/" 2>/dev/null
ls ~/Epic\ Games/ 2>/dev/null

# Editor mit Log im Terminal (Beispiel 5.5):
"/Users/Shared/Epic Games/UE_5.5/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" \
  "$(pwd)/Unreal/GameX/GameX.uproject" -log
```

Wenn der Ordner anders heißt (`UE_5.5.4`), diesen Namen verwenden.

## 3) Module einmal bauen

```bash
cd ~/Documents/GameX

ENGINE="/Users/Shared/Epic Games/UE_5.5"   # anpassen!
"$ENGINE/Engine/Build/BatchFiles/Mac/Build.sh" GameXEditor Mac Development \
  -Project="$(pwd)/Unreal/GameX/GameX.uproject" -WaitMutex
```

Danach erneut `open Unreal/GameX/GameX.uproject`.

## 4) Log schicken

Falls es wieder schließt:

```bash
ls -t ~/Documents/GameX/Unreal/GameX/Saved/Logs 2>/dev/null | head
# oder:
ls -t ~/Library/Logs/Unreal\ Engine/ 2>/dev/null | head
```

Die **letzten 40 Zeilen** der neuesten `.log` hier einfügen.
