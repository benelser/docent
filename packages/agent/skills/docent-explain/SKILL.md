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

2. **Find the right surface, then survey.** The fetcher behind `docent
   survey` does one thing — fetch the URL you give it and report what came
   back. It does **not** know that arXiv's `/abs/` is a stub or that a
   paper's full text lives at `/html/` or `/pdf/`. That intelligence is
   yours — you are the agent. Walk the surfaces deliberately:

   - If the user passed a URL that looks like an *abstract*, *stub*, or
     *landing page* (arxiv.org/abs/, a paper's homepage, a wiki article's
     "main" page), assume there is a richer surface and try it first.
     Common patterns worth trying in order:
       - `arxiv.org/abs/<id>` → try `arxiv.org/html/<id>` (rendered LaTeX,
         ~40k chars) then `arxiv.org/pdf/<id>` (PDF via pdftotext).
       - `biorxiv.org/content/<doi>` → try the same URL with `.full`
         appended.
       - A paper homepage → look for a "PDF" or "Full text" link and use
         that URL.
   - **Always do an exploratory fetch first.**
     ```bash
     docent survey <url> --mode ex --id <slug>
     ```
     The fetcher writes `analysis/<id>.source.md` and logs a character
     count. If the count is below ~5 000 chars and you have an alternative
     surface, **stop the in-progress survey**, swap the URL, and re-run.
     Surveying a stub returns a film about a stub.
   - **PDFs work natively.** Pass `https://…/whatever.pdf` directly; the
     engine pipes it through `pdftotext`. No special invocation.
   - **When you've exhausted surfaces and the source is still thin**,
     don't paper over it — say so in the survey explicitly and narrow the
     film's claim to what the text actually supports.

   When the survey lands at `analysis/<id>.md`, surface the source's
   final URL + character count + the load-bearing finding before moving
   on to treatment.

3. **Commit to a style.** Before the treatment, decide the visual
   register the film renders in — a `{preset, intent, rationale}` block
   that the spec author will pin to `films/<id>.json`.

   ```bash
   bun packages/engine/cli/docent.ts style recommend <id>
   ```

   The recommender reads `analysis/<id>.md` and prints a rules-based
   suggestion (engineering / editorial / paper / executive / analytical /
   neutral) plus a one-line rationale. For most subjects, take the
   recommendation; override only when you can name a specific survey
   finding the recommender missed. Surface the choice to the user in one
   line ("rendering in **paper** — peer-reviewed arXiv preprint with
   load-bearing figure/table; rationale: ...") before moving on.

   The spec compilation step (next) reads this block off the survey's
   "Style commitment" section and pins it as the spec's `style: {preset,
   intent, rationale}` field. The depth-review judge will fail the
   `style-committed` dimension if the spec ships with the empty default.

3b. **Commit to a scene set.** Same shape as the style commitment, one
   layer down — the cognitive moves the film will make.

   ```bash
   bun packages/engine/cli/docent.ts scene-fit recommend <id>
   ```

   The recommender reads the survey and prints the top scene types
   with rationales tying each to a specific survey finding. Explainer
   films vary the most by subject — a `passage` for prose, a
   `causal-loop` for a feedback dynamic, a `landscape` for a
   trade-off plane, a `venn` for a set-intersection argument, a
   `mechanism` for a working motion, an `epigraph` + `objection` for
   a contested topic. If the recommender returns
   `warningOnDefault: true`, the survey collapsed to the suspected
   rut (`frame`/`structure`/`compare`/`tension`/`recap`) — re-read
   the survey and ask whether the load-bearing idea is genuinely
   about *components × trade-offs* or about something more specific.
   The fix is almost always in the survey (a missing finding), not
   the spec. Pin the chosen scene set in the survey's
   "Scene-set commitment" section.

4. **Treatment.**

   ```bash
   bun packages/engine/cli/docent.ts treatment <id>
   ```

   This writes a plain-language outline to `treatments/<id>.md` — the
   human-readable scoping brief. In the one-shot flow you do not pause for
   review; you immediately compile it to a spec. Print the treatment's
   *Angle* line so the user sees the through-line you committed to.

5. **Spec — and interrogate it.**

   ```bash
   bun packages/engine/cli/docent.ts treatment <id> --to-spec
   bun packages/engine/cli/docent.ts review <id> --max-rounds 2
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

   **Surface the Big Idea to the user *before* rendering.** For explainer
   films (`ex` mode), the spec carries a `big-idea` scene immediately
   before the recap — that single sentence is what the film commits to.
   Read it out of `films/<id>.json` (the `statement` field of the
   `big-idea` scene) and print it back to the user verbatim. If the user
   wants to edit the takeaway, they edit it now — TTS is the next stage
   and the sentence is the most expensive thing to change after that. If
   no `big-idea` scene is present in an explainer spec, `review` will
   have failed the contract; do not proceed.

6. **Render.**

   ```bash
   bun packages/engine/cli/docent.ts build <id> --scale 1
   ```

   Print the resulting `🎬 out/<id>.mp4` line verbatim.

7. **Open the result** (unless `--no-open`). On macOS:

   ```bash
   open out/<id>.mp4
   ```

8. **Hand back.** Tell the user three things:
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
