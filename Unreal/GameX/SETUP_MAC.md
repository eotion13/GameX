# Mac Setup — Unreal GameX

## Wichtig

Nutze **dieses** Projekt aus dem Git-Repo:

`Unreal/GameX/GameX.uproject`

Nicht ein leeres „New Project“ aus dem Launcher (außer zum Testen, dass der Editor startet).

## Einmalig

1. Unreal Engine **5.5** (Intel-Mac) installiert und startbar
2. Xcode + Metal Toolchain:
   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   xcodebuild -downloadComponent MetalToolchain
   ```
3. Repo holen / Branch aktualisieren:
   ```bash
   cd ~/Documents   # oder dein Ordner
   git clone https://github.com/eotion13/GameX.git
   cd GameX
   git checkout cursor/ue5-3d-presentation-0467
   git pull
   ```

## Projekt öffnen

1. Doppelklick `Unreal/GameX/GameX.uproject`
2. Falls gefragt: **Yes** (Modules neu bauen) / Engine-Version zuordnen
3. Erstes Mal: Shader-Compile kann lange dauern — warten
4. Scalability auf **Low/Medium** (Intel-Mac)

## Was du danach siehst / tun sollst

- Editor offen → kurz Bescheid: „Editor offen“ + welche UE-Version (z. B. 5.5.4)
- Ich verdrahte dann Brett, Einheiten-Platzhalter, Kamera und Reveal über GameXCore

## Optional: Blender-Platzhalter importieren

`assets/blender/characters/*.fbx` und `assets/blender/sources/*.fbx`  
per Drag&Drop nach `Content/Characters` bzw. `Content/Sources`.

## Spielregeln

Unverändert. Presentation only. Web-Referenz: `npm run serve` → `?view=3d`
