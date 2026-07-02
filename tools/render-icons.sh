#!/usr/bin/env bash
# Regenerate the plugin icons from macOS SF Symbols (white glyph, transparent bg).
# Requires macOS with Swift/AppKit (Xcode or Command Line Tools).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="com.ditto.sonos.sdPlugin/imgs"
render() { swift tools/sfrender.swift "$1" "$2" "$3"; }

render "speaker.wave.3.fill" "$OUT/actions/volume.png"    256
render "speaker.wave.3.fill" "$OUT/actions/volume@2x.png" 512
render "speaker.slash.fill"  "$OUT/actions/muted.png"     256
render "speaker.slash.fill"  "$OUT/actions/muted@2x.png"  512
render "speaker.wave.3.fill" "$OUT/plugin/icon.png"       256
render "speaker.wave.3.fill" "$OUT/plugin/icon@2x.png"    512
echo "Icons regenerated in $OUT"
