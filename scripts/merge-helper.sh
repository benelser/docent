#!/usr/bin/env bash
# merge-helper.sh — surface what every active worktree changed in shared files.
#
# Usage:  ./scripts/merge-helper.sh [shared-file]
#
# With no arg, summarises ALL the shared-file edits across every worktree.
# With a file path arg, shows side-by-side diffs of just that file from every
# worktree that touched it. The intended use is during a multi-worktree merge:
# you call it on each shared file (spec.ts, validate.ts, judge.ts, etc.) to
# see every parallel agent's intended change in one place before you write
# the integrated version on main.
#
# Touches no source code; safe to run anytime.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

SHARED_FILES=(
  "packages/engine/src/engine/spec.ts"
  "packages/engine/src/Film.tsx"
  "packages/engine/schema/film.schema.json"
  "packages/engine/cli/validate.ts"
  "packages/engine/cli/depthcheck.ts"
  "packages/engine/cli/judge.ts"
  "packages/agent/agents/depth-review.md"
  "packages/agent/prompts/survey-template.md"
  "packages/agent/prompts/survey-explainer.md"
  "packages/agent/prompts/treatment.md"
)

cyan()   { printf '\033[1;36m▶\033[0m %s\n' "$1"; }
green()  { printf '\033[32m✓\033[0m %s\n' "$1"; }
dim()    { printf '\033[2m·\033[0m %s\n' "$1"; }
yellow() { printf '\033[33m⚠\033[0m %s\n' "$1"; }

# ----- per-worktree summary -------------------------------------------------

if [[ "${1:-}" == "" ]]; then
  cyan "Active worktrees that diff against main on a shared file"
  echo
  for wt in .claude/worktrees/*/; do
    name=$(basename "$wt")
    short="${name#agent-}"
    short="${short:0:10}"

    # Skip worktrees with no commits beyond main
    if ! git -C "$wt" rev-parse HEAD >/dev/null 2>&1; then continue; fi
    head=$(git -C "$wt" rev-parse HEAD 2>/dev/null)
    main_head=$(git rev-parse main)
    [[ "$head" == "$main_head" ]] && continue

    # Identify what new scenes / files exist (a fingerprint for which sprint)
    fingerprint=""
    for scene in VennScene LandscapeScene MechanismScene TimelineScene TreeScene MapScene JourneyMapScene CausalLoopScene; do
      [[ -f "$wt/packages/engine/src/scenes/$scene.tsx" ]] && fingerprint+="$scene "
    done
    [[ -d "$wt/packages/engine/src/style" ]] && fingerprint+="STYLE-PIPELINE "
    [[ -z "$fingerprint" ]] && fingerprint="(no new scene)"

    # Count modified lines per shared file
    touched=""
    for f in "${SHARED_FILES[@]}"; do
      n=$(git -C "$wt" diff main -- "$f" 2>/dev/null | grep -c '^[+-][^+-]' || true)
      if [[ "$n" -gt 0 ]]; then touched+="$(basename "$f")=$n "; fi
    done
    [[ -z "$touched" ]] && touched="(no shared-file edits)"

    printf "  \033[1m%s\033[0m  %s\n" "$short" "$fingerprint"
    printf "    %s\n" "$touched"
  done
  echo
  cyan "Run with a file path to see all worktree diffs against that file"
  dim  "  e.g.  ./scripts/merge-helper.sh packages/engine/cli/validate.ts"
  exit 0
fi

# ----- per-file: every worktree's diff of one shared file -------------------

TARGET="$1"
if [[ ! -f "$TARGET" ]]; then
  yellow "no such file on main: $TARGET"
  exit 1
fi

cyan "Worktrees that changed $TARGET"
echo

main_sha=$(git rev-parse main:"$TARGET" 2>/dev/null)
[[ -z "$main_sha" ]] && main_sha="(untracked)"
echo "  main HEAD blob: $main_sha"
echo

for wt in .claude/worktrees/*/; do
  name=$(basename "$wt")
  short="${name#agent-}"
  short="${short:0:10}"
  [[ ! -f "$wt/$TARGET" ]] && continue
  diff_size=$(git -C "$wt" diff main -- "$TARGET" 2>/dev/null | wc -l | tr -d ' ')
  [[ "$diff_size" -eq 0 ]] && continue

  # Identify the sprint
  fingerprint=""
  for scene in Venn Landscape Mechanism Timeline Tree Map JourneyMap CausalLoop; do
    [[ -f "$wt/packages/engine/src/scenes/${scene}Scene.tsx" ]] && fingerprint="${scene,,}"
  done
  [[ -d "$wt/packages/engine/src/style" ]] && fingerprint="styling-pipeline"
  [[ -z "$fingerprint" ]] && fingerprint="(unknown sprint)"

  printf "  \033[1m── %s · %s · %s lines ──\033[0m\n" "$short" "$fingerprint" "$diff_size"
  git -C "$wt" diff main -- "$TARGET" | sed 's/^/      /'
  echo
done
