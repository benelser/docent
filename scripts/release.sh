#!/usr/bin/env bash
# release.sh — publish a @bjelser/* package from your laptop, gated on the
# same hermetic /tmp smoke as CI.
#
# Usage:
#   ./scripts/release.sh <package> [--dry-run]
#
#   package: kit | core | cli | tts-openai | tts-elevenlabs | tts-compatible | agent
#
# THE INVARIANT (named verbatim):
#
#   "No `npm publish` ever runs without a green `docent ci --local` first."
#
# This script enforces that for the manual-publish path. Bump versions by
# hand, commit, then run this. The gate runs the same /tmp install + matrix
# CI runs — but against your worktree. If it goes green, we publish.

set -euo pipefail

PKG="${1:-}"
DRY_RUN=""
for arg in "$@"; do
  if [ "$arg" = "--dry-run" ]; then
    DRY_RUN="--dry-run"
  fi
done

if [ -z "$PKG" ]; then
  echo "usage: $0 <package> [--dry-run]" >&2
  echo "  package: kit | core | cli | tts-openai | tts-elevenlabs | tts-compatible | agent" >&2
  exit 64
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG_DIR="$REPO_ROOT/packages/$PKG"
if [ ! -d "$PKG_DIR" ]; then
  echo "release: $PKG_DIR not found" >&2
  exit 64
fi

echo ""
echo "▶ release gate — $PKG"
echo "  repo: $REPO_ROOT"
echo ""

# Step 1: the load-bearing hermetic smoke. If this fails, exit non-zero —
# `set -e` will halt before we touch npm.
echo "── 1/2: docent ci --local (worktree overlay) ──"
bun "$REPO_ROOT/packages/cli/src/index.ts" ci --local "$REPO_ROOT"

# Step 2: now (and only now) publish.
echo ""
echo "── 2/2: npm publish ──"
cd "$PKG_DIR"
if [ -n "$DRY_RUN" ]; then
  echo "  (dry-run mode)"
  npm publish --access public --provenance --dry-run
else
  npm publish --access public --provenance
fi

echo ""
echo "✓ released @bjelser/$PKG"
