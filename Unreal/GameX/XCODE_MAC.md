# Xcode / Mac SDK für Unreal GameX

Fehler „Platform Mac is not a valid platform to build“ bedeutet:
Unreal findet **kein vollständiges Xcode-SDK**.

## Einmalig auf dem Mac

1. **Xcode** aus dem App Store installieren (nicht nur Command Line Tools)
2. Xcode einmal öffnen → Lizenz akzeptieren → Zusatzkomponenten installieren lassen
3. Terminal:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
xcodebuild -runFirstLaunch
xcodebuild -downloadComponent MetalToolchain
```

4. Prüfen:

```bash
xcode-select -p
# muss sein: /Applications/Xcode.app/Contents/Developer

xcodebuild -version
xcrun --show-sdk-path
```

5. Zwischencache löschen + neu bauen:

```bash
cd ~/Documents/GameX
git pull
rm -rf Unreal/GameX/Intermediate Unreal/GameX/Binaries
bash Unreal/GameX/Scripts/build-mac.sh
```

## Hinweise

- `bEnableRTTI` ist entfernt (UE 5.5 kennt das so nicht).
- Intel-Mac: UE **5.5**, nicht 5.8.
- Ohne funktionierendes Xcode-SDK baut Unreal **kein** C++-Projekt für Mac.
