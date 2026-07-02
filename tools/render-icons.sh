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

# paused: SF Symbols has no speaker+pause glyph, so composite the speaker from
# the volume icon with drawn pause bars (must run after the volume renders)
swift tools/render-paused.swift "$OUT/actions/volume@2x.png" "$OUT/actions/paused@2x.png"
sips -z 256 256 "$OUT/actions/paused@2x.png" --out "$OUT/actions/paused.png" >/dev/null
echo "Icons regenerated in $OUT"
