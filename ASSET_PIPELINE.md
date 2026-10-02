# Asset Pipeline — Blender → Unreal (GameX)

## Ziel

Glaubwürdiges mittelalterliches Strategie-Diorama: taktisches Brett von oben, hochwertige Figuren beim Zoomen. **Keine Gameplay-Wirkung** von Assets.

## Tools

| Tool | Verwendung |
|------|------------|
| Blender 4.x | Modellierung, Rigging, Animation, Export |
| Unreal Engine 5.5 | Import, Materialien, LODs, Sequencer/VFX |
| Higgsfield (optional) | Generative Hilfe in Blender — **nur nach persönlichem Login** |

Offizielles Higgsfield-Addon erst installieren, wenn der Account freigeschaltet ist. Keine Drittanbieter-Forks ohne Prüfung.

## Maßstab

| Einheit | Maß |
|---------|-----|
| Unreal | 1 uu = 1 cm |
| Charakter (Schild/Bogen) | ≈ 180 cm Höhe |
| Reiter (inkl. Pferd) | ≈ 220–240 cm |
| Knoten-Abstand | aus Engine-Layout (`node.x/y`) × Welt-Skalierung `WorldScale` (Default 400 uu pro Layout-Einheit) |

Skeleton: ein gemeinsames Humanoid-Skeleton für Schild/Bogen; separates Horse+Rider-Skeleton für Reiter. Platzhalter dürfen ungeriggt sein.

## Ordner

```
assets/blender/
  characters/   # schild, bogen, reiter
  environment/  # terrain, paths
  sources/      # brunnen/monument
  props/        # banner, schilde, bögen
  animations/   # idle, walk, ride, attack, die
Unreal/GameX/Content/
  Characters/ Environment/ Sources/ UI/ VFX/ Audio/ Maps/
```

## Naming

```
SM_Schild_Placeholder
SM_Bogen_Placeholder
SM_Reiter_Placeholder
SM_Source_Well
MI_PlayerAccent_01..06   # Stoff/Banner-Akzente, nicht Vollkörperfärbung
A_Walk_Schild
A_Ride_Reiter
```

## Export / Import

1. Blender: Apply Scale, Origin am Bodenmittelfuß / Hufplatte  
2. Export FBX: Forward `-Y`, Up `Z`, Embed Textures optional  
3. Unreal Import: generate LODs (automatisch oder manuell 3 Stufen)  
4. Materialien: Master Material + Player-Color-Parameter (Banner/Schild/Cape)  
5. Animationen: als Animation Sequences, Montage nur für kurze Combat-Clips  

## Texturen

- Farb/ORM wo sinnvoll; max 2K für Charaktere, 1K für Props, Atlas für Umgebung  
- Keine urheberrechtlich problematischen Texturen  

## Animation → Presentation Contract

Resolver-Events steuern Clips:

| Event | Visual |
|-------|--------|
| `move` | Walk/Ride von `from` → `to` |
| `bounce` | Anlauf + Rückkehr |
| `destroyed` | kurze Defeat-Pose + Despawn |
| `supportCut` | Linienbruch-VFX |
| `sourceCaptured` | Bannerwechsel |
| `built` | Spawn an Basis |

**Treffer-Frames entscheiden keinen Kampf.**

## Platzhalter erzeugen

```bash
blender --background --python assets/blender/scripts/generate_placeholders.py
```

Erzeugt einfache FBX/Blend-Platzhalter unter `assets/blender/characters/`.

## Sound-Struktur (Platzhalter)

Unter `Unreal/GameX/Content/Audio/`: UI, Select, Move, Footsteps, Horse, Shield, Bow, SourceCapture, Reveal, Victory, Defeat — zunächst stumme MetaSound-/Cue-Slots.
