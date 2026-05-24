# Changelog

All notable changes to docent.

The engine version reflects what the grammar covers — minor bumps add or
remove primitives or contracts, patch bumps fix renderers or tooling.

## v2.1.0 — Sprint A: visualization-primitive coverage

> The grammar grows from 17 → 22 scene types. Five new primitives close
> gaps in the cognitive-representation taxonomy that the original 17 did
> not reach. Style-resolver infrastructure (WCAG AA validated) lands as
> a parallel module. Audio rhythm tuned.

### Added — scene types

- **`timeline`** — events on a real date axis where the *gaps* between
  dates carry argumentative weight. Distinct from `progression` (ordinal,
  cadence-only). Validator hard-fails placeholder dates ("early 2024",
  "during the war"); depthcheck enforces parseable dates.
- **`tree`** — rooted hierarchy where *parent-child* and *level depth*
  are the load-bearing structure (not the relations themselves). Max 5
  levels / ~30 nodes. Depthcheck flags degenerate (chain-shaped) trees.
- **`map`** — regions in space with markers, connections, and topology.
  For arguments where *where* something is matters: geography, region
  layout, proximity, multi-region database topology. Depthcheck enforces
  ≥30% annotated regions ("position-meaningful").
- **`journey-map`** — stages × emotion across a human experience. For
  arguments about how a *person* moves through something (onboarding,
  failure recovery, debugging session). Depthcheck enforces a real arc
  (one stage ≥0.7 AND one ≤0.3) and ≥50% of stages annotated with
  touchpoints/painPoints.
- **`causal-loop`** — variables influencing each other in a closed cycle
  where the dynamics come from *reinforcement or balancing*, not motion.
  Validator enforces R/B labelling parity against polarity count;
  depthcheck enforces closed (wrap-around) loops.

Demo films land for each: `ai-lab-race` (timeline), `ai-agent-stack`
(tree), `multi-region-db` (map), `onboarding-first-30-minutes`
(journey-map), `causal-loop-primer` (causal-loop).

### Added — styling pipeline (resolver only)

- **`StylePreset`** vocabulary: six presets — `neutral`, `engineering`,
  `editorial`, `paper`, `executive`, `analytical` — each with locked
  tokens, accents, and visualization-block defaults.
- **`StyleIntent`** vocabulary: `tone`, `audience`, `medium`, `density`,
  `theme`, `emphasis` — author-facing knobs that resolve to tokens
  through a data-driven mapper, never through renderer branching.
- **`ResolvedStyle`** — the single output of the resolver, validated for
  WCAG AA contrast (4.5:1 body, 3:1 large text) at resolve time.
- **`style-honest`** depth dimension added to the judge rubric.

> Renderer migration to consume `ResolvedStyle` is staged but not yet
> landed — scene renderers still read `theme.ts` directly; the pipeline
> ships as infrastructure ahead of the renderer migration sprint.

### Added — audio

- **Per-beat silence trim** controlled by the beat's `pace` knob
  (`brisk` / `normal` / `settle` / `hold`) via Kokoro silence-padding
  trim in `packages/engine/pipeline/tts.py`.

### Changed

- Scene-type union sorted alphabetically across `spec.ts`, `validate.ts`,
  and `schema/film.schema.json`. 22 entries total.
- New per-scene-typed field names — `journeyStages`, `causalEdges`,
  `variables`, `loops`, `root` (tree), `regions`/`markers`/`connections`
  (map), `events`/`spans`/`axis` (timeline) — keep unions narrow at the
  renderer boundary.

### Not in this release

The following items appeared in earlier draft notes but did NOT land in
v2.1.0; they are deferred to subsequent releases:

- **`mechanism` / `venn` / `landscape` scene types** — built but not
  merged this pass; remain on their feature branches.
- **Discriminator cleanup** for `Novelty` / `Axis` unions — depends on
  the venn/landscape merges above.
- **Renderer migration to `ResolvedStyle`** — scenes still read
  `theme.ts` directly; the resolver lands as parallel infrastructure.
- **Legacy knob removal** (`Scene.palette`, `Scene.treatment`,
  `Scene.register`, `Scene.accent`) — still present in `spec.ts`.
- **README film re-render** — `scripts/rerender-demos.sh v2.1.0` has not
  been run; release-asset mp4s are unchanged.

## v2.0.0 — closed-grammar foundation

> The thesis crystallized: docent is a visualization rendering engine,
> not an argument engine. The grammar is closed. Renderers do not take
> freeform style instructions.

17 scene primitives: `frame`, `structure`, `walkthrough`, `progression`,
`diff`, `compare`, `quantities`, `chart`, `prior-art`, `tension`,
`closeup`, `passage`, `figure`, `demonstrate`, `big-idea`, `recap`,
plus `mechanism`, `venn`, `landscape` added late in the v2.0 cycle.

Hermetic gallery: `linear-algebra`, `kubernetes-pr`, `euclid-primes`,
`stopping-by-woods` — these are *test fixtures* for the grammar, not
constraints on it.
