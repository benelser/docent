---
name: docent-ar
description: Render an architecture-review film — a whole system, or one named subsystem, at depth: the components, how control and data flow, the idioms, the failure modes, and the trade-offs. Use when the user says "/docent-ar <repo>", asks to "review the architecture of X", "explain how X works as a film", or hands over a repo URL expecting a system-level explainer film.
---

# docent-ar — the architecture-review film

You are running the entire docent cascade in **architecture-review mode**
against a repository the user named: survey → treatment → spec → tts →
clips → render → open. The output is one MP4 that explains the system the
way a distinguished engineer would: the components, the flow, the
idioms, the failure modes, the trade-offs, with a verdict.

## Arguments

`/docent-ar <repo> [--subsystem X] [--id X] [--scale S] [--no-open]`

- `<repo>` — a local repo path, a GitHub URL, or the bare `owner/name`
  form.
- `--subsystem X` — scope the review to one subsystem. The survey
  resolves this to a concrete code boundary (a directory, a package, a
  set of files) before starting.
- `--id X` — override the auto-derived film id (default: `<repo-name>`).
- `--scale S` — render scale. Default `1`. Pass `0.5` for fast
  turnarounds.
- `--no-open` — render without opening the result in the system player.

## What to do

1. **Pre-flight.** Confirm `bun`, `ffmpeg`, and the agent CLI are on
   PATH. If anything obvious is missing, suggest `/docent-doctor` and
   stop.

2. **Survey** — architecture mode:

   ```bash
   bun packages/engine/cli/docent.ts survey <repo> --mode ar [--subsystem X] [--id X]
   ```

   The survey lands at `analysis/<id>.md`. When a subsystem is named,
   section 0 of the survey template resolves it to concrete files first
   — surface that boundary to the user before moving on. The survey's
   job here is to **interrogate** the system: not a tour that admires
   it, but a depth-first reading that names the trade-off and the
   failure mode.

3. **Treatment.**

   ```bash
   bun packages/engine/cli/docent.ts treatment <id>
   ```

   Writes `treatments/<id>.md`. Print the *Angle* line so the user sees
   the through-line you committed to.

4. **Spec — and interrogate it.**

   ```bash
   bun packages/engine/cli/docent.ts treatment <id> --to-spec
   bun packages/engine/cli/docent.ts review <id> --max-rounds 2
   ```

   The first compiles the treatment into `films/<id>.json`. The second
   is **mandatory** — `review` runs the adversarial judge → revise →
   re-judge loop bounded to two rounds. On the corpus this reliably
   lifts a first-draft spec by ~7 points / 30 — the difference between
   an architecture film that passes the depth contract and one that
   does not. Surface the verdict score and the weakest dimension
   (often `trade-off` or `the-numbers` for AR films) before rendering.
   If `review` exhausts its round budget, stop and ask — do not ship a
   film the judge rejected.

5. **Render.**

   ```bash
   bun packages/engine/cli/docent.ts build <id> --scale 1
   ```

6. **Open the result** (unless `--no-open`). On macOS: `open out/<id>.mp4`.

7. **Hand back.** Three things to the user:
   - the film id (so they can re-render via `/docent-build <id>`),
   - the verdict score,
   - one sentence naming the trade-off the film adjudicates.

## Knowing when to stop and ask

Pause and ask the user instead when:

- The repo is too large to cover at depth and no subsystem was named.
  Surface a candidate list of 2–4 subsystems with one-line summaries;
  let the user pick.
- The survey surfaces two equally plausible angles (a control-plane vs.
  data-plane reading, a present vs. historical reading) — let the user
  pick the one the film should commit to.
- `review` exhausts its round budget without passing the depth contract.
  Surface the failing dimensions; do not silently ship a film the judge
  rejected.

## Failure modes

- **Repo not local** — `survey --mode ar` clones the repo when given a
  URL. If the clone fails (auth, network), surface the failure and stop.
- **Agent CLI missing** — `survey` and `treatment` shell out to `claude`
  or `codex`. If neither is on PATH, suggest `/docent-doctor`.
- **The judge keeps failing the *trade-off* dimension** — the survey
  named components and flow but did not name what the system gives up by
  being what it is. Ask the user what the load-bearing trade-off is, or
  drop back to `/docent-survey <repo> --mode ar` and steer the analysis
  directly.
