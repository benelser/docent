---
name: docent-pr
description: Render a PR-review film — a pull request reviewed the way a principal engineer would, with the load-bearing 5% surfaced, the trade-off named, and a verdict. Use when the user says "/docent-pr <repo> <pr-number>", asks to "review PR #N", "make a film about this PR", or hands over a GitHub PR URL and expects an artifact. The killer case is the sprawling AI-agent PR no human reads as a wall of text.
---

# docent-pr — the PR-review film

You are running the entire docent cascade in **PR-review mode** against a
pull request the user named: survey → treatment → spec → tts → clips →
render → open. The output is one MP4 that explains the change the way a
principal engineer would: why it exists, whether the design is sound, the
core before → after, what ripples, what could break, and a verdict.

## Arguments

`/docent-pr <repo> <pr-number> [--id X] [--scale S] [--no-open]`

- `<repo>` — a repo path, a GitHub URL (`https://github.com/owner/name`),
  or the bare `owner/name` form.
- `<pr-number>` — the pull-request number to review. Can be `123` or
  `#123`. If the user pasted a full PR URL as `<repo>`, extract both.
- `--id X` — override the auto-derived film id (default: `<repo-name>-pr`).
- `--scale S` — render scale. Default `1`. Pass `0.5` for fast turnarounds.
- `--no-open` — render without opening the result in the system player.

## What to do

1. **Pre-flight.** Confirm `bun`, `ffmpeg`, and the agent CLI (`claude` or
   `codex`) are on PATH. If anything obvious is missing, suggest
   `/docent-doctor` and stop.

2. **Survey** — PR mode:

   ```bash
   docent survey <repo> --mode pr --pr <n> [--id X]
   ```

   The survey lands at `analysis/<id>.md`. Surface the path and the
   load-bearing finding (section 1 of the survey — the triage) before
   moving on. A PR survey's job is **triage**: of the diff, what is the
   load-bearing 5% — that you review with depth — and what is the rest you
   explicitly deprioritized.

3. **Commit to a style.** Before the treatment, decide the visual
   register the film renders in:

   ```bash
   bun packages/engine/cli/docent.ts style recommend <id>
   ```

   For PR films the recommender will almost always return
   **engineering** — code-heavy, the dark console look. Take the
   recommendation unless the survey surfaces something exceptional (an
   exec-level retrospective of a release-blocking PR, for instance, may
   want **executive**). Surface the choice to the user in one line —
   "rendering in **engineering** — the load-bearing 5% is in
   `pkg/scheduler/...`; rationale: file-level code review." — and move
   on. The spec compilation reads this off the survey's "Style
   commitment" section and pins it as the spec's `style: {preset,
   intent, rationale}` field. The depth-review judge fails the
   `style-committed` dimension if the spec ships without it.

3b. **Commit to a scene set.** Same shape as the style commitment, one
   layer down — the cognitive moves the film will make.

   ```bash
   bun packages/engine/cli/docent.ts scene-fit recommend <id>
   ```

   The recommender reads the survey and prints the top scene types with
   rationales tying each to a specific survey finding. PR films almost
   always include `diff` (the change) and `closeup` (the load-bearing
   function annotated); `tension` is also load-bearing for the
   trade-off. If the recommender returns `warningOnDefault: true`, the
   survey collapsed to the default rut
   (`frame`/`structure`/`compare`/`tension`/`recap`) — re-read the
   triage and ask whether the load-bearing 5% actually wants
   `mechanism`, `walkthrough`, `causal-loop`, `timeline`, or something
   more specific. Pin the chosen scene set in the survey's
   "Scene-set commitment" section.

4. **Treatment.**

   ```bash
   docent treatment <id>
   ```

   Writes `treatments/<id>.md`. Print the *Angle* line so the user sees
   the through-line you committed to before the spec is compiled.

5. **Spec — and interrogate it.**

   ```bash
   docent treatment <id> --to-spec
   docent review <id> --max-rounds 2
   ```

   The first compiles the treatment into `films/<id>.json`. The second is
   **mandatory** — `review` runs the adversarial judge → revise →
   re-judge loop bounded to two rounds. On the corpus this reliably
   lifts a first-draft spec by ~7 points / 30 — the difference between
   a PR-review film that passes the depth contract and one that does
   not. Surface the verdict score and the weakest dimension before
   rendering. If `review` exhausts its round budget, stop and ask —
   do not ship a film the judge rejected.

6. **Render.**

   ```bash
   docent build <id> --scale 1
   ```

7. **Open the result** (unless `--no-open`). On macOS: `open out/<id>.mp4`.

8. **Hand back.** Three things to the user:
   - the film id (so they can re-render via `/docent-build <id>`),
   - the verdict score (e.g. `26/30`),
   - one sentence of the verdict — what changes, what the residual risk is.

## Knowing when to stop and ask

Pause and ask the user instead when:

- The survey surfaces two plausible triages — the diff is too large to
  cover and you have to pick what to deprioritize.
- The PR is a refactor with no clear functional verdict; ask if the user
  wants the film to focus on the *design* trade-off rather than a yes/no
  ship decision.
- `review` exhausts its round budget without passing the depth contract.
  Surface the failing dimensions; do not silently ship a film the judge
  rejected.

## Failure modes

- **No GitHub auth** — `survey --mode pr` fetches diff / PR body / review
  threads via `gh`. If `gh auth login` is needed, surface the message and
  stop.
- **Agent CLI missing** — `survey` and `treatment` shell out to `claude`
  or `codex`. If neither is on PATH, suggest `/docent-doctor`.
- **The judge keeps failing the *triage* dimension** — that is a survey
  problem, not a render problem. The survey did not pick a load-bearing
  5%; ask the user to point at the part of the diff that matters.
