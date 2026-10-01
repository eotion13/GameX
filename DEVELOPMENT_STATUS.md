# Development Status — GameX / Knotenpunkt

Stand: 2026-10-01 · Branch `cursor/ue5-3d-presentation-0467`

## Ziel dieser Phase

Hochwertige **3D-Präsentation** des **unveränderten** bestehenden Spiels.
Keine neuen Regeln, Einheiten, Ressourcen oder Siegbedingungen.

## Analyse (abgeschlossen)

| Bereich | Befund |
|---------|--------|
| Engine | `src/engine/` — rein deterministisch, kein DOM/RNG in `resolve` |
| Brett | Radialer Knotengraph, P-Symmetrie, 2–6 Spieler |
| Einheiten | `reiter` / `bogen` / `schild` (RPS), gleiche Bewegung |
| Befehle | halten · bewegen · unterstützen · bauen (Energie 2) |
| Online | Firebase-Orders + clientseitiges Fold; gleiche Orders ⇒ gleicher State |
| Web-3D | Three.js Feature-Flag (`?view=3d`), Presentation-only, gemergt |
| Tests | **119/119 grün** (`npm test`, Baseline 2026-10-01) |

Source of Truth: JavaScript-Engine in `src/engine/`.

## Architekturentscheidungen

1. **Trennung:** `GameXCore` (reine Logik) ↔ Presentation (Web Three.js / Unreal).
2. **Native Core:** C++-Bibliothek `native/GameXCore` spiegelt die JS-Engine 1:1; Golden Fixtures aus JS sichern Regression.
3. **Unreal Engine 5.5:** Präsentationsziel unter `Unreal/GameX/` (C++ Module + Blueprint für VFX/UI/Level).
4. **Web bleibt spielbar:** bestehende Pages-/SVG-/Three.js-Version wird nicht zerstört.
5. **Assets:** Blender 4.x als zentrale Pipeline; Platzhalter zuerst, Higgsfield erst nach Account-Login.
6. **Kein Gameplay-Drift:** Resolver entscheidet; Animationen lesen nur Events/State.

## Installiert in dieser Cloud-Umgebung

| Tool | Version / Status |
|------|------------------|
| Node.js | v22.14 |
| Clang / CMake / Ninja | 18 / 3.28 / 1.11 |
| Blender | 4.0.2 (apt, offiziell) |
| Git LFS | 3.7.1 |
| Unreal Engine | **nicht installiert** — Epic-Account-Login erforderlich (siehe Blocker) |
| GPU | keine NVIDIA; Cloud-VM headless → UE-Editor hier nicht sinnvoll |

## Fertig

- [x] Repository-Analyse
- [x] Baseline-Tests dokumentiert (119 pass)
- [x] Git-Arbeitsbranch
- [x] `DEVELOPMENT_STATUS.md` / `GAMEPLAY_COMPATIBILITY.md` / `ASSET_PIPELINE.md`
- [x] `native/GameXCore` Gerüst + C++-Port der Core-Regeln
- [x] Golden-Fixture-Exporter
- [x] Unreal-Projektgerüst `Unreal/GameX`
- [x] Blender-Platzhalter-Skript
- [x] `.gitignore` / `.gitattributes` für Native/UE/Assets
- [x] `npm run test:native` grün (Core-Smoke)
- [x] Blender-Platzhalter FBX/Blend erzeugt
- [x] `libstdc++` Dev-Paket für Cloud-Builds

## In Arbeit / als Nächstes

1. Golden Fixtures aus JS-Tests exportieren und C++ vollständig dagegen regressen
2. Epic Games Account / UE 5.5 auf Entwickler-Mac installieren (persönlicher Login)
3. Unreal: Board-Actor, Kamera-Pawn, Unit-Actors an Core anbinden
4. Reveal-/Kampf-VFX aus Resolver-Events
5. Sound-Platzhalterstruktur
6. Higgsfield-Plugin nach Login einrichten

## Bekannte Blocker (nur persönliche Aktion)

1. **Unreal Engine 5.5:** Bitte Epic Games Account einloggen und Engine 5.5 installieren (Mac/Windows mit GPU). Danach `Unreal/GameX/GameX.uproject` öffnen — ich übernehme Kompilierung, Board-Actors und Anbindung an GameXCore.
2. **Higgsfield Blender Plugin:** Account/Login bei Higgsfield erforderlich; bis dahin nutzen wir nur offizielle Blender-Platzhalter (bereits erzeugt).

## Spielbar heute (Web)

- Live: https://eotion13.github.io/GameX/?view=3d  
- Lokal: `npm run serve` → `http://localhost:8000/?view=3d`

Die Web-Version bleibt die spielbare Referenz, bis Unreal lokal lauffähig ist. Regeln sind identisch (`src/engine/`).

