#!/usr/bin/env bash
# Manual Unreal rebuild for GameX on macOS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="$ROOT/GameX.uproject"

# Find engine
ENGINE=""
for cand in \
  "/Users/Shared/Epic Games/UE_5.5" \
  "/Users/Shared/Epic Games/UE_5.5.4" \
  "/Users/Shared/Epic Games/UE_5.4" \
  "$HOME/Epic Games/UE_5.5" \
  "$HOME/Epic Games/UE_5.5.4"
do
  if [[ -x "$cand/Engine/Build/BatchFiles/Mac/Build.sh" ]]; then
    ENGINE="$cand"
    break
  fi
done

if [[ -z "$ENGINE" ]]; then
  echo "UE Engine nicht gefunden. Installierte Ordner:"
  ls "/Users/Shared/Epic Games/" 2>/dev/null || true
  echo "Setze ENGINE=/Pfad/zu/UE_5.5 und starte erneut."
  exit 1
fi

echo "Engine: $ENGINE"
echo "Project: $PROJECT"

# Point to full Xcode (needed for Mac platform SDK)
if [[ -d /Applications/Xcode.app/Contents/Developer ]]; then
  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer || true
fi
xcodebuild -license accept 2>/dev/null || true
xcodebuild -runFirstLaunch 2>/dev/null || true

# Wipe invalid Intermediate BuildRules from wrong CLR / previous failures
rm -rf "$ROOT/Intermediate/Build/BuildRules" 2>/dev/null || true

echo "xcode-select: $(xcode-select -p)"
echo "xcodebuild: $(xcodebuild -version 2>&1 | tr '\n' ' ')"

"$ENGINE/Engine/Build/BatchFiles/Mac/Build.sh" GameXEditor Mac Development \
  -Project="$PROJECT" \
  -WaitMutex \
  2>&1 | tee /tmp/gamex-ue-build.log

echo ""
echo "Log: /tmp/gamex-ue-build.log"
echo "Bei Erfolg: open \"$PROJECT\""
