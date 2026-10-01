# Gameplay Compatibility — GameX / Knotenpunkt

Dieses Dokument bestätigt: Die 3D-/Native-Arbeit **ändert keine Spielregeln**.

## Source of Truth

| Schicht | Pfad | Rolle |
|---------|------|-------|
| Regeln (Text) | `RULES.md` | Spieler-Dokumentation |
| Engine | `src/engine/*.js` | Autoritative Implementierung |
| Regression | `tests/*.test.js` | Muss grün bleiben |
| Native Spiegel | `native/GameXCore` | Bit-für-Bit gleiche Ergebnisse via Fixtures |
| Presentation | `src/ui/*`, `Unreal/GameX` | Nur Darstellung |

Invariant:

```
State A + Orders B  →  Result C   (JS Engine)
State A + Orders B  →  Result C   (GameXCore C++)
```

Animationen, Kamera, Meshes und Sounds dürfen **C** nicht beeinflussen.

## Geprüfte Regelbereiche

| Thema | Engine | Tests | Status |
|-------|--------|-------|--------|
| Brett / P-Symmetrie | `board.js` | `board.test.js` | unverändert |
| RPS-Typen | `rules.js` `beats` | `resolver.test.js` | unverändert |
| halten / bewegen / unterstützen | `normalizeOrder` | resolver + regelfragen | unverändert |
| Support-Schnitt | `resolve` Step 2 | resolver | unverändert |
| Fixpunkt-Bewegung, Escape, Swap, Ring | Step 3–4 | resolver + regelfragen | unverändert |
| Bauen / Energie | Step 5 + economy | `economy.test.js` | unverändert |
| Quellenkontrolle / Einkommen | Step 6–7 | economy | unverändert |
| Eliminierung | Step 8 | economy | unverändert |
| Mehrheit / Hold-Runden / Punkte-Sieg | `checkVictory` | economy | unverändert |
| Online-Fold | `src/net/room.js` | `online.test.js` | unverändert |
| Reveal-Animation | `src/ui/reveal.js` | `reveal.test.js` | presentation only |

## Fairness (F1–F6)

Dokumentiert in der Strategie (`docs`/Agent-Store). Kurz:

- F1 Determinismus · F2 keine Hidden RNG in resolve · F3 gleiche Startprofile  
- F4 Orders geheim bis Commit · F5 gleiche Reveal-Timing · F6 Engine ≠ View  

## Baseline

- Datum: 2026-10-01  
- Befehl: `npm test`  
- Ergebnis: **119 pass / 0 fail**  

Nach relevanten Änderungen erneut `npm test` und `native/GameXCore` Fixture-Tests ausführen.

## Explizit nicht implementiert (Gameplay)

Neue Einheiten, Karten, Terrainboni, Magie, RNG-Kampf, Helden, Tech-Trees, Items, neue Siegbedingungen — **verboten in dieser Phase**.
