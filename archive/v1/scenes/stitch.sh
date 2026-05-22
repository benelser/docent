#!/usr/bin/env bash
# Stitch the six rendered Codex scenes into one film.
# Usage:  bash scenes/stitch.sh
set -euo pipefail

cd "$(dirname "$0")/.."
V="media/videos"
OUT="media/codex_architecture_review.mp4"

SCENES=(
  "$V/01_title/720p30/CodexTitle.mp4"
  "$V/02_overview/720p30/CodexOverview.mp4"
  "$V/03_surfaces/720p30/CodexSurfaces.mp4"
  "$V/04_core/720p30/CodexCore.mp4"
  "$V/05_sandbox/720p30/CodexSandbox.mp4"
  "$V/06_turn/720p30/CodexTurn.mp4"
)

for f in "${SCENES[@]}"; do
  [ -f "$f" ] || { echo "missing: $f" >&2; exit 1; }
done

LIST="$(mktemp)"
for f in "${SCENES[@]}"; do
  echo "file '$(pwd)/$f'" >> "$LIST"
done

# Re-encode on concat so scenes with and without audio tracks line up cleanly.
ffmpeg -y -loglevel error -f concat -safe 0 -i "$LIST" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart "$OUT"

rm -f "$LIST"
echo "wrote $OUT"
