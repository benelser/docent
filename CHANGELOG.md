# Changelog

All notable changes to docent.

The engine version reflects what the grammar covers — minor bumps add or
remove primitives or contracts, patch bumps fix renderers or tooling.

## v2.1.1 — mechanism + venn + landscape, discriminator cleanup

> The three primitives held out of v2.1.0 land. The grammar grows from
> 22 → 25 scene types. The `Novelty` and `Axis` unions widened by venn
> and landscape get cleaned up with `kind` discriminators at the same
> time, so renderers narrow off the field instead of `as` casts.

### Added — scene types

- **`mechanism`** — a working diagram in continuous motion. The author
  names `parts` at normalized positions and one `motion` primitive
  (`cycle` / `oscillate` / `descend` / `iterate`); the engine renders
  the loop procedurally. Per-beat `freezes` pause the motion at a named
  phase so narration can call out what is happening before the motion
  resumes. Depthcheck enforces `mechanism-shown-not-told` (at least one
  beat lets the motion carry the argument — freezes, short narration,
  or visual-state lexical handles like "watch the loop"). Judge adds
  `motion-load-bearing`. Demo film: `films/thermostat.json`.
- **`venn`** — overlap analysis. 2 or 3 named sets rendered as
  overlapping circles; every region (each in/out combination of the
  sets, except the implicit "outside all") is addressable by id so
  beats can reveal/focus regions one at a time. The film argues from
  the INTERSECTION: what lives ONLY in the overlap is the claim.
  Depthcheck enforces `intersection-honest` (the novelty claim must
  name a mechanism, not an evaluation like "dangerous"). Judge adds
  `intersection-named`. Demo film: `films/auth-overlap.json`.
- **`landscape`** — N options plotted on M dimensions in 2-D, the
  quadrant-analysis primitive. Axes are NOT a numeric domain; they are
  trade-offs with a `lowLabel`/`highLabel` phrase at each end. 2-8
  subjects sit at normalized `{x, y} ∈ [0..1]²`. Optional quadrant
  labels pin a phrase to each corner. Depthcheck enforces
  `axis-asymmetric` (the two trade-offs must be different — no
  "simplicity vs simplicity") and `landscape-spread` (at least one
  pair of subjects must be visually distant — max pairwise distance
  ≥ 0.4). Judge adds `quadrant-honest`. Demo film:
  `films/docent-landscape.json`.

### Changed — discriminator cleanup

- `PriorArtNovelty` gains `kind: 'prior-art'` and `VennNovelty` gains
  `kind: 'venn'`. `Scene.novelty` stays the widened
  `PriorArtNovelty | VennNovelty` union; renderers narrow via the
  `kind` switch instead of `as` casts.
- `Axis` (the chart-axis type) gains `kind: 'chart'` and
  `LandscapeAxis` gains `kind: 'landscape'`. `Scene.xAxis`/`yAxis`
  stays the widened `Axis | LandscapeAxis` union; renderers narrow
  via `kind`.
- Validator enforces the discriminator on every prior-art/venn novelty
  and every chart/landscape axis; the schema enforces it as a `const`.
- Scene type union, SCENE_TYPES, and schema enum re-alphabetized —
  22 → 25 entries.
- `Scene.regions` widened to `MapRegion[] | VennRegion[]`; MapScene
  and VennScene each narrow via a typed cast on read. (The
  validator's `regions has no meaning for type X — only map`
  rejection now exempts the venn type.)

### Not in this release

The following items remain deferred to v2.2.0:

- **Renderer migration to `ResolvedStyle`** — scenes still read
  `theme.ts` directly; the resolver lands as parallel infrastructure.
- **Legacy knob removal** (`Scene.palette`, `Scene.treatment`,
  `Scene.register`, `Scene.accent`) — still present in `spec.ts`.
- **README film re-render** — `scripts/rerender-demos.sh v2.1.1` has
  not been run; release-asset mp4s are unchanged.

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

- **`mechanism` / `venn` / `landscape` scene types** + their
  discriminator cleanup — landed in v2.1.1 (the next entry above).
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
