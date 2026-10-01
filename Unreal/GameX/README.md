# GameX Unreal Project

## Zweck

Präsentationsschicht für das **unveränderte** Knotenpunkt-Regelwerk.
Logik liegt in `native/GameXCore` (und parallel in `src/engine/` als Source of Truth).

## Voraussetzung

- Unreal Engine **5.5** (oder kompatibel 5.4+)
- Epic Games Account (Installation)
- C++ Toolchain (Xcode auf macOS / VS auf Windows)

Dieses Cloud-Environment hat **keinen** UE-Editor und keine GPU; das Projekt wird lokal geöffnet.

## Öffnen

1. Epic Launcher → Engine 5.5 installieren  
2. `GameX.uproject` doppelklicken / generieren  
3. Modul `GameX` kompiliert und linkt gegen `GameXCore`

## Module

| Modul | Typ | Aufgabe |
|-------|-----|---------|
| GameXCore | Runtime | Deterministischer Resolver (C++) |
| GameX | Runtime | Actors, Kamera, UI, VFX-Anbindung |

## Presentation-Regeln

- `AGameXGameMode` hält eine `FGameXMatch` Instanz (Core-State)
- Befehle sammeln → erst bei Reveal `Resolve()` → Events abspielen
- Kamera: isometrisch, Pan/Zoom/leichte Rotation, kein Gameplay-Block

## Web-Referenz

Die spielbare Web-3D-Version bleibt unter dem Repo-Root (`?view=3d`).
