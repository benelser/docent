# Changelog

All notable changes to docent.

The engine version reflects what the grammar covers — minor bumps add or
remove primitives or contracts, patch bumps fix renderers or tooling.


## v2.4.0 — legacy knob removal: the migration cliff that v2.2 actually owed

> v2.2.0's release notes promised "Removed (migration cliff)" but only
> rewired the renderers — the `palette`, `treatment`, `accent`, and
> `register` fields kept living on `Scene` and `Meta` as ignored cruft.
> Every gallery film still set them. v2.4.0 closes the loop: the fields
> are gone from the type, gone from the schema, hard-fail at the
> validator, and stripped from every film. The styling pipeline
> (`FilmSpec.style: {preset, intent}`) is now the only authoring surface
> for visual register.

### Removed (migration cliff)

- **`Scene.palette`** — `'cool' | 'warm' | 'signal' | 'mono'`. Removed from
  `spec.ts`, removed from `schema/film.schema.json`, stripped from every
  film under `films/`. The `paletteSceneHex` / `paletteAccentKey` /
  `paletteGlowScale` helpers in `engine/knobs.ts` survive with their
  signatures intact (they now take `PaletteName | undefined` instead of
  `Scene['palette']`); every renderer callsite now passes `undefined`.
- **`Scene.treatment`** — `'crisp' | 'sketch' | 'whiteboard'`. Removed from
  spec, schema, films. The cross-treatment skin swap (structure-as-sketch,
  tension-as-whiteboard) retired with the knob: `Film.tsx` now welds
  `tension → TensionScene` and `structure → StructureScene` by type. The
  in-renderer branches in `BigIdeaScene`, `LandscapeScene`, `TimelineScene`,
  `VennScene`, `TensionScene` that read `scene.treatment` are pinned to
  their default (`isWhiteboard = false`, `isSketch = false`) — the
  branches stay so a future style-driven re-introduction does not
  re-restructure the scenes.
- **`Scene.accent`** — the per-scene accent KEY into the resolved-style
  accent table. Removed from spec, schema, films. Every renderer that used
  to call `accentOf(style, scene.accent)` now calls `accentOf(style,
  undefined)` and resolves to the universal default (`'blue'`, which every
  preset defines). Per-element accent overrides (`Node.accent`,
  `Stage.accent`, `LandscapeSubject.accent`, `Metric.accent`,
  `Series.accent`, `TreeNode.accent`) are unchanged — those are the
  legitimate way for an author to highlight one element against the
  preset's defaults.
- **`Meta.register`** — `'grave' | 'neutral' | 'calm' | 'urgent' |
  'playful'`. Removed from spec, schema, films. The film-mood-to-pace/cut
  mapping (`registerDefaults`) is gone; `DEFAULT_PACE = 'normal'` and
  `DEFAULT_CUT = 'dissolve'` are the new global defaults, overridable per
  beat (`Beat.pace`) and per scene (`Scene.cut`). Mood is now part of
  `FilmSpec.style.intent.tone`.

### Validator — a single hard-fail rule

- The four old per-knob enum checks in `cli/validate.ts` collapse into one
  rule that emits a structured migration message when any spec carries
  one of the removed fields:

  ```
  scenes[i].palette: removed in v2.4. Use FilmSpec.style {preset, intent}
  — see packages/engine/src/style/ and `docent style list`.
  ```

  The renderer-side ignored these fields end-to-end after v2.2.0; this
  rule prevents them from being authored going forward.

### Migrated films (19/19)

The full gallery now ships with no legacy knobs. `scripts/migrate-films.ts`
extended to preserve existing `style` blocks (the four README films had
already committed to presets in v2.2.0) and to strip `meta.register`.
Per-film preset commitments (heuristic, then manually reviewed):

- `arxiv-2512-14806`, `docent-self`, `lethal-trifecta-blog`,
  `openclaw-ar` — existing preset preserved (paper / engineering /
  editorial / engineering).
- `euclid-primes` → `paper` (mathematical proof in explainer mode).
- `linear-algebra` → `paper` (mathematical primitives explainer).
- `stopping-by-woods` → `editorial` (lyric poem close-reading).
- `kubernetes-pr` → `engineering` (PR review on a Go codebase).
- `ai-lab-race` → `editorial` (warm palette mapped through the migrator).
- `causal-loop-primer`, `docent-landscape`, `thermostat` → `analytical`
  (sketch register mapped to the math/proof preset).
- Remaining 7 films → `neutral` (no legacy knobs to anchor a different
  choice; the migrator falls back to neutral, the byte-stable default).

### Verified

- `bunx tsc --noEmit` clean across `packages/engine`.
- 19/19 films pass `validateSpec`.
- Depthcheck unchanged on every film: the {ok, warn, fail, total}
  tuple matches pre-migration exactly.
- Hermetic gallery: 4/4 GREEN at `--scale 0.5` (linear-algebra,
  kubernetes-pr, euclid-primes, stopping-by-woods).

## v2.3.0 — Connector + truncateForSlot

See git log `77b4604` for details — the Connector helper and
`truncateForSlot` killed text-clobbering on edge labels.

## v2.2.0 — renderer migration: styling pipeline reaches the pixels

> The styling pipeline shipped as inert infrastructure in v2.1.0. v2.2.0
> plumbs it through every scene renderer and threads it from a film
> spec's `style: {preset, intent, rationale}` commitment all the way to
> a token read in a `<text>` element. The four README hero films now
> commit to presets — and finally render visibly different.

### Changed — renderer migration end-to-end

- Every scene renderer and every chrome component (`Card`, `SceneFrame`,
  `Connector`, `Pulse`, `Narration`, `NodeRepr`) now accepts
  `style: ResolvedStyle` as a prop. `Film.tsx` calls `resolveStyle(film.style)`
  once per render and threads the result through the `common` props.
- All direct `theme.ts` reads inside renderers (`theme.bg.*`, `theme.ink.*`)
  replaced with token reads off `style.tokens.{bg,ink,typography,accent}`.
  `theme.ts` stays as the resolver's default — the renderer surface no
  longer talks to it directly.
- 30 scene-renderer files (24 scenes + 6 chrome components) touched
  by the three parallel migration agents (M1 chrome, M2 diagrammatic,
  M3 narrative+motion).

### Added — preset commitments on the four README films

- `films/docent-self.json` — `{preset: "engineering", intent: ..., rationale: ...}`
- `films/openclaw-ar.json` — engineering
- `films/lethal-trifecta-blog.json` — editorial
- `films/arxiv-2512-14806.json` — paper

The films are now tracked in archcast (previously ephemeral in the
engine clone). The render artifacts on v2.2.0's release page reflect
the preset selections.

### Verified

- `bunx tsc --noEmit` clean across `packages/engine`.
- Hermetic gallery 4/4 GREEN (linear-algebra, kubernetes-pr,
  euclid-primes, stopping-by-woods).
- Every existing demo depthchecks at v2.1.1 baseline.

### Coming in v2.2.1

- Text quality audit (FittedText helper + per-scene long-text strategies)
  — already complete on branch `text-quality-pass`, lands next as a
  focused merge.

> NOTE (added in v2.4.0): the v2.2.0 release notes implied "legacy knob
> removal" had landed, but only the renderer-side migration did. The
> `Scene.palette`, `Scene.treatment`, `Scene.accent`, and `Meta.register`
> fields kept living on the spec types as ignored cruft. v2.4.0 is the
> actual removal — see its entry above.

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
