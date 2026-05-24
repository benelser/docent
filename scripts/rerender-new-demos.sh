#!/usr/bin/env bash
# rerender-new-demos.sh — render the 5 new Sprint A demo films + extract
# preview GIFs + upload mp4s to a release. These films *use* the new
# primitives, so the README's "New in v2.1.0" section can show them off.
#
# Usage:
#   ./scripts/rerender-new-demos.sh           # defaults to latest tag
#   ./scripts/rerender-new-demos.sh v2.1.0    # explicit
#
# Same shape as rerender-demos.sh, but for the new films, with preview
# GIFs written to docs/stills/new-<slug>-preview.gif to make the README
# section clearly distinct from the four hero films.

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

# slug | preview-timestamp | new-primitive | README title
DEMOS=(
  "ai-lab-race|0:30|timeline|AI lab race"
  "ai-agent-stack|0:30|tree|Modern AI agent stack"
  "multi-region-db|0:30|map|Multi-region database — topology IS the trade-off"
  "onboarding-first-30-minutes|0:45|journey-map|A developer's first 30 minutes"
  "causal-loop-primer|1:00|causal-loop|Causal loops — reinforcing or balancing"
)

cyan "Re-rendering 5 new Sprint A demos against engine HEAD"
echo "  engine: $(cd "$ENGINE" && git rev-parse --short HEAD)"
echo "  release asset target: $VERSION"
echo

for row in "${DEMOS[@]}"; do
  IFS='|' read -r slug ts primitive title <<< "$row"
  cyan "▶ $slug — $title  (${primitive})"

  spec="$ENGINE/films/$slug.json"
  if [[ ! -f "$spec" ]]; then
    yellow "spec missing: $spec — skipping"
    continue
  fi

  cyan "  rendering at scale 1…"
  (cd "$ENGINE" && docent build "$slug" --scale 1) > "/tmp/new-demo-$slug.log" 2>&1
  mp4="$ENGINE/out/$slug.mp4"
  if [[ ! -f "$mp4" ]]; then
    yellow "render did NOT produce $mp4 — see /tmp/new-demo-$slug.log"
    continue
  fi
  size=$(ls -l "$mp4" | awk '{print $5}')
  green "rendered $((size / 1024 / 1024)) MB → $mp4"

  cyan "  extracting 6-sec preview at ${ts}…"
  ffmpeg -y -ss "$ts" -t 6 -i "$mp4" \
    -vf "fps=15,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" \
    -loop 0 "$REPO_ROOT/docs/stills/new-${slug}-preview.gif" 2>&1 | tail -1 || true
  gif="$REPO_ROOT/docs/stills/new-${slug}-preview.gif"
  if [[ -f "$gif" ]]; then
    gif_size=$(ls -l "$gif" | awk '{print $5}')
    green "preview $((gif_size / 1024)) KB → $gif"
  fi

  cyan "  uploading to release $VERSION (--clobber)…"
  ( cd "$REPO_ROOT" && GITHUB_TOKEN= gh release upload "$VERSION" "$mp4" --clobber ) 2>&1 | tail -2
  green "asset live"
  echo
done

cd "$REPO_ROOT"
if [[ -n "$(git status --porcelain docs/stills/)" ]]; then
  cyan "New GIFs ready to commit"
  git status --short docs/stills/
else
  yellow "no GIF changes — extracts may have been identical to prior"
fi

cyan "Done. Commit + README edit happen separately."
