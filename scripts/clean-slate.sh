#!/usr/bin/env bash
# docent clean-slate — wipe every artifact *docent itself* lays down so you
# can re-walk the install path as a fresh user. System tools (bun, uv,
# ffmpeg, brew, git, gh) are NOT touched — those are presence-checked by
# `docent doctor --install --yes` and installed when missing.
#
# Idempotent: every step no-ops if the artifact is already absent.
#
# Usage:
#   ./scripts/clean-slate.sh
#
# What this wipes (every one of these is laid down by docent):
#   repo:
#     node_modules/                       <- bun install
#     .venv/                              <- uv sync
#     out/                                <- rendered films
#     public/audio/<film>/                <- Kokoro narration
#     public/clips/<film>/                <- Manim inserts
#     .remotion/                          <- Remotion's chromium / fonts
#     .manim-cache/                       <- Manim's intermediates
#     apm_modules/, apm.lock.yaml         <- local-path apm install
#     .claude/skills/docent-*             <- installed skills (claude target)
#     .agents/skills/docent-*             <- installed skills (codex target)
#     .cursor/skills/docent-*             <- installed skills (cursor target)
#     .opencode/skills/docent-*           <- installed skills (opencode target)
#   global:
#     ~/.cache/huggingface/hub/models--hexgrad--Kokoro-82M/    <- Kokoro weights
#     `apm uninstall docent-agent --global`                    <- if installed
#
# After this script, the dogfood loop is:
#   1.  bun packages/engine/cli/docent.ts doctor --install --yes
#   2.  apm install benelser/docent/packages/agent
#   3.  inside Claude Code / Codex:  /docent-doctor → /docent-explain <subject>

set -u  # keep going through missing artifacts

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cyan()   { printf '\033[1;36m▶\033[0m %s\n' "$1"; }
green()  { printf '\033[32m✓\033[0m %s\n' "$1"; }
dim()    { printf '\033[2m·\033[0m %s\n' "$1"; }

wipe_path() {
  local p="$1" label="${2:-$1}"
  if [[ -e "$p" ]]; then
    rm -rf "$p"
    green "removed $label"
  else
    dim "$label — already absent"
  fi
}

# ----- repo: bun install / uv sync output -----------------------------------

cyan "Wiping repo-local docent artifacts in $REPO_ROOT"
wipe_path "$REPO_ROOT/node_modules"      "node_modules/"
wipe_path "$REPO_ROOT/.venv"             ".venv/"
wipe_path "$REPO_ROOT/out"               "out/"
wipe_path "$REPO_ROOT/public/audio"      "public/audio/"
wipe_path "$REPO_ROOT/public/clips"      "public/clips/"
wipe_path "$REPO_ROOT/.remotion"         ".remotion/"
wipe_path "$REPO_ROOT/.manim-cache"      ".manim-cache/"

# Re-seed public/audio so the engine has a writable destination on first run.
mkdir -p "$REPO_ROOT/public/audio"

# ----- repo: apm install artifacts ------------------------------------------

cyan "Wiping apm-install artifacts"
wipe_path "$REPO_ROOT/apm_modules"       "apm_modules/"
wipe_path "$REPO_ROOT/apm.lock.yaml"     "apm.lock.yaml"

# ----- repo: installed skill files (every agent target) ---------------------

cyan "Wiping installed docent skills (project scope)"
for target_root in .claude .agents .cursor .opencode .github; do
  d="$REPO_ROOT/$target_root/skills"
  if [[ -d "$d" ]]; then
    # Use a glob so the count is honest in the output.
    matches=( "$d"/docent-* )
    if [[ -e "${matches[0]:-}" ]]; then
      rm -rf "${matches[@]}"
      green "wiped $target_root/skills/docent-* (${#matches[@]} skill(s))"
    fi
  fi
done

# ----- apm CLI uninstall (project + global, both idempotent) ----------------

if command -v apm >/dev/null 2>&1; then
  cyan "apm uninstall docent-agent (project + global)"
  ( cd "$REPO_ROOT" && apm uninstall docent-agent >/dev/null 2>&1 ) \
    && green "uninstalled project: docent-agent" \
    || dim   "apm: docent-agent not in project"
  apm uninstall docent-agent --global >/dev/null 2>&1 \
    && green "uninstalled global: docent-agent" \
    || dim   "apm: docent-agent not global"
else
  dim "apm CLI not present — nothing to uninstall (doctor will install apm)"
fi

# ----- global: Kokoro voice weights ----------------------------------------
#
# Kokoro downloads ~300 MB of weights into the Hugging Face cache the first
# time KPipeline is instantiated. Wiping that forces doctor's kokoro-weights
# step to re-download on the next install pass — the whole point of the
# dogfood loop.

cyan "Wiping Kokoro voice weights (forces re-download on next doctor run)"
HF_HOME_DIR="${HF_HOME:-$HOME/.cache/huggingface}"
wipe_path "$HF_HOME_DIR/hub/models--hexgrad--Kokoro-82M" "hexgrad/Kokoro-82M cache"

# ----- next steps -----------------------------------------------------------

echo
green "clean-slate complete. The repo now looks the way a fresh user sees it."
echo
cat <<'EOF'
Dogfood loop:
  1. Bootstrap the cascade (installs any missing system tools, materialises
     .venv, runs `bun install`, downloads Kokoro weights):
       bun packages/engine/cli/docent.ts doctor --install --yes

  2. Install the agent skills into Claude Code / Codex / Cursor:
       apm install benelser/docent/packages/agent

  3. Inside Claude Code / Codex:
       /docent-doctor
       /docent-explain <subject>
EOF
