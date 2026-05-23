---
name: docent-explain
description: One-shot — turn any subject (a repo, a PR, a file, a URL, an essay) into a rendered, narrated, animated explainer film. The flagship docent skill. Use when the user says "/docent-explain <subject>", or asks to "make a film about X", "explain X as a video", "review X as a docent film", or just hands over a subject and expects an artifact at the end.
---

# docent-explain — the end-to-end docent skill

You are running the entire docent cascade against a subject the user just
named: survey → treatment → spec → tts → clips → render → open. This is the
flagship skill; the other docent skills are sub-steps of this one. Reach for
those only when the user explicitly wants to pause between stages.

## Arguments

`/docent-explain <subject> [--mode pr|ar|ex] [--subsystem X] [--pr N] [--id X] [--scale S] [--no-open]`

- `<subject>` — a repo path, a github URL, a single file, a wiki directory,
  a blog URL, or an essay. The first positional is the subject.
- `--mode` — `pr` (PR review), `ar` (architecture review), `ex`
  (explainer). Inferred from the subject when omitted.
- `--subsystem X` — for `ar`, scope to one subsystem.
- `--pr N` — for `pr`, the pull-request number.
- `--id X` — override the auto-derived film id.
- `--scale S` — render scale. Default `1`. Pass `0.5` for fast turnarounds.
- `--no-open` — render without opening the result in the system player.

## What to do

1. **Pre-flight.** Confirm the environment is ready by checking that the
   agent CLI (`claude` or `codex`), `bun`, and `ffmpeg` are on PATH. If
   anything obvious is missing, suggest `/docent-doctor` and stop. Do not
   run `doctor` here implicitly — it has its own skill.

2. **Survey.**

   ```bash
   docent survey <subject> --mode <pr|ar|ex> [--subsystem X] [--pr N] [--id X]
   ```

   Read the brief and the survey template first (linked in the
   `docent-survey` skill). The survey lands at `analysis/<id>.md`. Surface
   the path and the load-bearing finding before moving on.

3. **Treatment.**

   ```bash
   docent treatment <id>
   ```

   This writes a plain-language outline to `treatments/<id>.md` — the
   human-readable scoping brief. In the one-shot flow you do not pause for
   review; you immediately compile it to a spec. Print the treatment's
   *Angle* line so the user sees the through-line you committed to.

4. **Spec — and interrogate it.**

   ```bash
   docent treatment <id> --to-spec
   docent review <id> --max-rounds 2
   ```

   The first compiles the treatment into `films/<id>.json`. The second is
   **mandatory, not on the failure path** — `review` runs the
   adversarial judge → revise → re-judge loop, bounded to two rounds. On
   the corpus we measured it lifts a first-draft spec by **~7 points on
   a 30-point scale** — the difference between a film that passes the
   depth contract and one that does not. Surface the verdict score and
   the weakest dimension to the user before rendering. If `review`
   exhausts the round budget without passing, stop and ask — do not
   ship a film the judge rejected.

5. **Render.**

   ```bash
   docent build <id> --scale 1
   ```

   Print the resulting `🎬 out/<id>.mp4` line verbatim.

6. **Open the result** (unless `--no-open`). On macOS:

   ```bash
   open out/<id>.mp4
   ```

7. **Hand back.** Tell the user three things:
   - the film id (so they can re-render via `/docent-build <id>`),
   - the verdict score, and
   - one line of the most adjudicated finding — the verdict, the biggest
     residual risk, or the single weak point named in section 5/7 of the
     survey.

## Knowing when to stop and ask

Default is one-shot, all the way through. Pause and ask the user instead
when:

- The survey surfaces a genuine fork in framing (two plausible angles, two
  candidate subsystems, an unresolved triage). Surface the fork; let the
  user steer the treatment before compiling to a spec.
- `review` exhausts its round budget without passing the depth contract.
  Surface the latest verdict and the failing dimensions; do not silently
  ship a film the judge rejected.
- The subject is large enough that rendering will take more than a few
  minutes at scale 1 — ask whether the user wants `--scale 0.5` for a
  faster first pass.

## Failure modes

- **Doctor failures** — anything missing from the cascade (Kokoro, ffmpeg,
  Remotion). Suggest `/docent-doctor` and stop. Do not paper over a
  missing dep by skipping a stage.
- **Agent CLI missing** — `survey` and `treatment` shell out to `claude`
  or `codex`. If neither is on PATH, the cascade cannot author a spec;
  suggest the agent CLI install path printed by doctor.
- **The judge keeps failing the same dimension** — that is a survey
  problem, not a render problem. Drop back to `/docent-survey <subject>`
  and ask the user to steer the analysis directly.
