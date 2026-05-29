# The treatment flow

> **The human steers the film without ever opening JSON.**

Docent's author cycle is three steps, not one:

```
analysis/<id>.md   →   treatments/<id>.md   →   films/<id>.json
   survey                  treatment                  spec
```

The survey is the agent's deep notes about the subject. The spec is the renderable artifact. The treatment is the layer in between — a plain-language outline of what the film will *be*. The human reads the treatment, edits the treatment, approves the treatment. The agent compiles the approved treatment to the spec.

The treatment is the steering surface. Without it, the only way for a human to redirect an agent-authored film is to read JSON and edit JSON. That excludes most viewers from the loop and makes the agent's choices invisible. The treatment exposes the agent's choices in language a director can argue with, in three minutes, without learning the schema.

## Why a separate step

A film spec is a closed grammar. A treatment is prose. The two layers serve different reviewers:

- **The spec is for the engine.** It enforces the grammar — every scene declares its schema, every depth rule fires. It says nothing about *intent*, only structure. The reviewer is the engine.
- **The treatment is for the human.** It surfaces the through-line, the proposed scenes, and the choice points. It says nothing about JSON, only about the film. The reviewer is the director.

Conflating the two — asking the human to steer at the JSON layer — is the bug docent's earlier flow had. The agent would write a spec, the human would skim a wall of JSON, and the steering signal that came back was either "render it" or "nope, redo." Neither carries enough resolution to improve the film. The treatment is the layer where the director can say: "the second scene should be a `probe`, not a `compare`; the recap is too generous; drop the third scene entirely."

## The worked example

Say you're authoring a film about Euclid's theorem — the proof that the primes never run out.

### 1. Survey

You (or the agent, via `docent-explain`) write `analysis/euclid-primes.md`. The survey is dense — every load-bearing claim cited to the source, every misconception named, every edge case walked. The mandatory sections force the depth. It's the agent's working notes; nobody renders the survey.

```
analysis/euclid-primes.md
  # Survey — Euclid's Theorem
  ## 0. Content boundary
  ## 1. Triage — load-bearing vs. mechanical
  ## 2. What the idea is / why it exists
  ## 3. The hard parts of the idea
  ## 4. The misconception to kill
  ## 5. Where it breaks
  ## 6. The verdict
```

### 2. Scaffold the treatment

```
bunx docent treatment euclid-primes
```

This reads the survey and writes `treatments/euclid-primes.md`. It is **deterministic** — no LLM call. It walks the survey's section headings, guesses a scene-type for each, and emits a starter treatment with 5–8 scenes:

```
# Survey — Euclid's Theorem

## What this film is about
Euclid's theorem says that primes cannot be finished off by enumeration...

## The through-line
The theorem's real claim is that any finite list of primes can be defeated by one divisibility move.

## Proposed scenes
1. <!-- scene-type: frame -->
   Open the film. State the subject in one breath, name the misconception we are about to kill, and tell the viewer what they will know by the recap.
2. <!-- scene-type: structure -->
   Lay out the parts of "the proof", and how they connect.
3. <!-- scene-type: walkthrough -->
   Take one concrete instance of "the hard parts" and trace it end to end.
4. <!-- scene-type: tension -->
   Name the trade-off in "where it breaks" — what was chosen, what was rejected, and what risk remains.
5. <!-- scene-type: recap -->
   Close with the verdict on "the verdict": the disposition, the biggest residual risk, the line to carry off.

## Notes for the human
- Is the through-line above the *actual* thread, or is it a section heading dressed up?
- Does the scene list reach the trade-off, or does it tour the happy path?
- ...
```

The `<!-- scene-type: X -->` HTML comments are the bridge to the spec. The human reads the prose. The compiler reads the comments. Both layers stay clean.

### 3. Steer

Open `treatments/euclid-primes.md`. Read it. Argue with it. Edit it. This is the entire human-in-the-loop surface:

- **Wrong scene-type?** Edit the HTML comment. `<!-- scene-type: compare -->` becomes `<!-- scene-type: probe -->`. The spec will follow.
- **Wrong order?** Renumber. The compiler walks the numbered list in document order.
- **Missing scene?** Add another numbered item with a `<!-- scene-type: X -->` hint and a sentence of prose.
- **Over-covered?** Delete the item. The spec gets shorter.
- **Through-line is generic?** Rewrite the through-line paragraph in your own words. (This is the place to disagree with the agent.)

The treatment is *editable*. Treat the scaffold as a draft, not a verdict.

### 4. Compile to a spec

```
bunx docent treatment euclid-primes --to-spec
```

This reads the (approved) treatment and emits `films/euclid-primes.json`. Each numbered item becomes a scene object; each `scene-type` hint sets the scene's `type` field. The compiler fills in placeholder strings for every required schema field — id, kicker, heading, beats — so the spec validates structurally.

The spec is **not** finished. It validates, but the placeholders are intentionally generic ("Edit me — the film title", "First part", "what it does"). The next step is to fill them in — drawing on the survey, the human's edits, and the agent's narration craft.

### 5. Validate and build

```
bunx docent validate euclid-primes      # structural validation
bunx docent depthcheck euclid-primes    # the depth bar (will likely fail on placeholders)
bunx docent build euclid-primes         # render to out/euclid-primes.mp4
```

Depthcheck will flag the placeholder fields — that's expected. Fill them in. Re-run. When the spec earns the depth bar, render.

## What the treatment does *not* do

- **It does not invent content.** The treatment is deterministic. If the survey is shallow, the treatment will be shallow.
- **It does not pick the right scene types on its own.** The scaffold's guesses are coarse — heading-keyword heuristics. The human's edits to the `<!-- scene-type: X -->` hints are where the choice actually gets made.
- **It does not write the narration.** Narration lives in the spec's `beats[].narration` field, and is the agent's craft. The treatment summarizes intent; the spec carries voice.

## What lives where

| Layer | File | Reviewer | Editor |
|---|---|---|---|
| Survey | `analysis/<id>.md` | the agent | the agent (or the user, by hand) |
| Treatment | `treatments/<id>.md` | the human | the human |
| Spec | `films/<id>.json` | the engine | the agent (post-treatment) |
| Render | `out/<id>.mp4` | the audience | nobody |

Three files, three distinct moves. Each layer makes one thing easier to argue with.

## Reach for `treatment` when

- You are about to author a film and want the agent's first read to be visible *before* JSON.
- You are reviewing an agent-authored film and the spec is too dense to steer.
- You want to hand a draft to a collaborator who does not write JSON.

Skip `treatment` when:

- You already have a sharp spec and the film is ready to render.
- The subject is small enough to `docent init` and edit the spec by hand.

The treatment is the optional middle layer that pays off when the film is long, the subject is contested, or the author is collaborating with someone who steers in prose.
