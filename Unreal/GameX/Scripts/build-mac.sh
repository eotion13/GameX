#!/usr/bin/env bash
# Manual Unreal rebuild for GameX on macOS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="$ROOT/Unreal/GameX/GameX.uproject"

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

# Ensure Xcode CLT selected
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer 2>/dev/null || true

"$ENGINE/Engine/Build/BatchFiles/Mac/Build.sh" GameXEditor Mac Development \
  -Project="$PROJECT" \
  -WaitMutex \
  2>&1 | tee /tmp/gamex-ue-build.log

echo ""
echo "Log: /tmp/gamex-ue-build.log"
echo "Bei Erfolg: open \"$PROJECT\""
