#!/usr/bin/env bash
# rerender-demos.sh — re-render the four README hero films + refresh artifacts.
#
# Run this after a major engine release to get the README's autoplay GIFs
# and release-asset mp4s up to date with the latest engine.
#
# Usage:
#   ./scripts/rerender-demos.sh           # defaults to latest git tag
#   ./scripts/rerender-demos.sh v2.1.0    # explicit version
#
# Steps per film:
#   1. docent build <slug> --scale 1
#   2. extract 6-sec preview GIF
#   3. upload mp4 to release with --clobber
# Then commit refreshed GIFs to docs/stills/ and push.

set -u
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENGINE="$HOME/.local/share/docent/engine"
VERSION="${1:-$(cd "$REPO_ROOT" && git tag --sort=-v:refname | head -1)}"

if [[ ! -d "$ENGINE" ]]; then
  echo "engine not installed at $ENGINE — run /docent-doctor first" >&2
  exit 1
fi
if [[ -z "$VERSION" ]]; then
  echo "no version tag found — pass one explicitly" >&2
  exit 1
fi

cyan()   { printf '\033[1;36m▶\033[0m %s\n' "$1"; }
green()  { printf '\033[32m✓\033[0m %s\n' "$1"; }
yellow() { printf '\033[33m⚠\033[0m %s\n' "$1"; }

# slug | preview-timestamp | README title
DEMOS=(
  "docent-self|3:00|docent reviewing its own architecture"
  "openclaw-ar|3:00|OpenClaw — one local daemon, twenty-two channels"
  "lethal-trifecta-blog|3:00|The Lethal Trifecta"
  "arxiv-2512-14806|3:30|Let the Barbarians In"
)

cyan "Pulling engine to latest"
( cd "$ENGINE" && GITHUB_TOKEN= git pull --ff-only origin main ) | tail -2
echo

cyan "Re-rendering 4 README demos against engine HEAD"
echo "  engine: $(cd "$ENGINE" && git rev-parse --short HEAD)"
echo "  release asset target: $VERSION"
echo

for row in "${DEMOS[@]}"; do
  IFS='|' read -r slug ts title <<< "$row"
  cyan "▶ $slug — $title"

  spec="$ENGINE/films/$slug.json"
  if [[ ! -f "$spec" ]]; then
    yellow "spec missing on engine: $spec — skipping"
    continue
  fi

  cyan "  rendering at scale 1…"
  (cd "$ENGINE" && docent build "$slug" --scale 1) > "/tmp/rerender-$slug.log" 2>&1
  mp4="$ENGINE/out/$slug.mp4"
  if [[ ! -f "$mp4" ]]; then
    yellow "render did NOT produce $mp4 — see /tmp/rerender-$slug.log"
    continue
  fi
  size=$(ls -l "$mp4" | awk '{print $5}')
  green "rendered $(($size / 1024 / 1024)) MB → $mp4"

  cyan "  extracting 6-sec preview at $ts…"
  ffmpeg -y -ss "$ts" -t 6 -i "$mp4" \
    -vf "fps=15,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" \
    -loop 0 "$REPO_ROOT/docs/stills/$slug-preview.gif" 2>&1 | tail -1 || true
  gif="$REPO_ROOT/docs/stills/$slug-preview.gif"
  gif_size=$(ls -l "$gif" 2>/dev/null | awk '{print $5}')
  green "preview $(($gif_size / 1024)) KB → $gif"

  cyan "  uploading to release $VERSION (--clobber)…"
  ( cd "$REPO_ROOT" && GITHUB_TOKEN= gh release upload "$VERSION" "$mp4" --clobber ) 2>&1 | tail -2
  green "asset live"
  echo
done

cd "$REPO_ROOT"
if [[ -n "$(git status --porcelain docs/stills/)" ]]; then
  cyan "Committing refreshed preview GIFs"
  git add docs/stills/
  GITHUB_TOKEN= git commit -m "docs/stills: refresh preview GIFs against $VERSION renders

All four README hero film GIFs re-extracted from $VERSION renders.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  GITHUB_TOKEN= git push origin main
  green "pushed"
else
  yellow "no GIF changes to commit"
fi

cyan "Done."
