---
name: docent-doctor
description: Verify the docent environment is ready to render films — checks bun, uv, ffmpeg, Kokoro TTS, Remotion, and the agent CLI. Use when the user says "/docent-doctor", asks to set up docent, hits a missing-dependency error from another docent skill, or wants to confirm the cascade can run end-to-end.
---

# docent-doctor — verify the cascade environment

You are running `docent doctor` to confirm the local environment can execute the
docent render cascade (survey → tts → clips → render → publish). The doctor
groups its checks by cascade stage, so each failure points at the stage it
would break.

## What to do

1. From the `docent` repo root (where `package.json` declares the `docent`
   workspace script), run:

   ```bash
   bun packages/engine/cli/docent.ts doctor
   ```

   If a `docent` binary is on PATH, `docent doctor` works too. Prefer the
   workspace invocation when inside the repo — it always resolves the engine
   in-tree.

2. **Show the user the raw output.** It is already formatted with per-stage
   grouping and a remediation hint on every failure. Do not rephrase passing
   checks.

3. **Walk the failures.** For every `fail` line, the doctor prints a
   `remediation:` hint (`install ffmpeg`, `install uv — https://docs.astral.sh/uv`,
   `run: bun install`, …). For each failure:
   - State what's missing in one sentence.
   - Offer to run the remediation. If it's a system install (`brew install
     ffmpeg`, `curl -LsSf https://astral.sh/uv/install.sh | sh`, `npm i -g bun`,
     installing Claude Code or Codex), describe the command and **ask before
     running** — these touch the user's system.
   - If it's a project-level fix (`run: bun install` to materialize Remotion
     and Manim, or a Python dep via `uv sync`), run it directly without asking.

4. Re-run `docent doctor` after each remediation. Stop when every required
   check is `ok` (warnings on optional checks like `gh` or a hermetic
   container are fine to leave).

## What "ready" means

Required, by cascade stage:

- **system**: `bun`, `git`
- **survey**: at least one of `claude` or `codex` on PATH (the agent that
  authors the spec); `apm` (this package's install channel)
- **tts**: `uv`, and `uv tool run kokoro --help` resolving — the Kokoro
  narration engine
- **render**: `ffmpeg`, `ffprobe`, and Remotion (materialized by `bun
  install` at the repo root)
- **clips** (optional): `manim` for animated inserts; doctor warns rather
  than fails

The first time on a new machine, expect failures across `survey` and `tts` —
the `apm install` step covers the agent layer; `bun install` + a Kokoro
install via `uv tool install kokoro-tts` (or whatever the remediation hint
prints) covers the rest.

## On finish

Print one line summarizing the disposition:

- **Ready** — all required checks pass; the cascade can render.
- **Almost ready** — only optional checks (`manim`, `gh`, hermetic) fail; the
  cascade renders but explainers without animated inserts.
- **Needs work** — at least one required check fails; list the failing checks
  by id so the user can resume mid-setup.

Then suggest the next step: `/docent-explain <subject>` to render a film
end-to-end, or `/docent-survey <subject>` to author just the survey.
