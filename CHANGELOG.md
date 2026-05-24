# Changelog

All notable changes to docent.

The engine version reflects what the grammar covers — minor bumps add or
remove primitives or contracts, patch bumps fix renderers or tooling.

## v2.1.0 — Sprint A: visualization-primitive coverage

> The grammar grows from 17 → 22 scene types. Five new primitives close
> gaps in the cognitive-representation taxonomy that the original 17 did
> not reach. WCAG AA enforced at style-resolve time. Audio rhythm tuned.

### Added

- **`timeline`** — events on a real date axis where the *gaps* between
  dates carry argumentative weight. Distinct from `progression` (ordinal,
  cadence-only).
- **`tree`** — rooted hierarchy where *parent-child* and *level depth*
  are the load-bearing structure (not the relations themselves).
- **`map`** — regions in space with markers, connections, and topology.
  For arguments where *where* something is matters: geography, region
  layout, proximity, multi-region database topology.
- **`journey-map`** — stages × emotion across a human experience. For
  arguments about how a *person* moves through something (onboarding,
  failure recovery, debugging session).
- **`causal-loop`** — variables influencing each other in a closed cycle
  where the dynamics come from *reinforcement or balancing*, not motion.
  Distinct from `mechanism` (working motion) and `walkthrough` (sequence).

### Added — styling pipeline

- **`StylePreset`** vocabulary: six presets — `neutral`, `engineering`,
  `editorial`, `paper`, `executive`, `analytical` — each with locked
  tokens, accents, and visualization-block defaults.
- **`StyleIntent`** vocabulary: `tone`, `audience`, `medium`, `density`,
  `theme`, `emphasis` — author-facing knobs that resolve to tokens
  through a data-driven mapper, never through renderer branching.
- **`ResolvedStyle`** — the single output of the resolver, validated for
  WCAG AA contrast (4.5:1 body, 3:1 large text) at resolve time.
- **Schema-driven styling**: presets are *data*, not renderer branches.
  Raw agent instructions and freeform CSS-like overrides cannot reach
  the renderer.

### Added — audio

- **Per-beat silence trim** controlled by the beat's `pace` knob
  (`brisk` / `normal` / `settle` / `hold`). Average ~70% reduction in
  Kokoro silence padding without sacrificing rhythm.

### Changed

- Grammar is now self-documenting: `docs/grammar.md` is the chooser; the
  survey template and explainer survey each restate the relevant subset
  for their mode.
- Discriminator fields added: `novelty.kind` and `axis.kind` discriminate
  the unions Sprint A introduced (prior-art vs venn novelty; chart vs
  landscape axis). No more `as` casts at narrow time.

### Removed (migration cliff)

- `Scene.palette`, `Scene.treatment`, `Scene.register`, `Scene.accent` —
  the legacy per-scene knob set is gone from `spec.ts` and
  `film.schema.json`. The validator hard-fails any spec carrying one of
  the removed fields with a structured migration message pointing at
  the new vocabulary (`style.preset` or `style.intent.tone`).
- Every scene renderer now consumes `ResolvedStyle` (passed through from
  `Film.tsx`) instead of reading `theme.ts` directly. Six presets,
  one resolver, no parallel APIs.
- The gallery film JSONs and the four README hero films are
  re-authored with `scripts/migrate-films.ts`. Manual review confirms
  preset selection produces equivalent styling tokens.

### Re-render

The four README hero films (`docent-self`, `openclaw-ar`,
`lethal-trifecta-blog`, `arxiv-2512-14806`) are re-rendered against
v2.1.0 with `scripts/rerender-demos.sh v2.1.0`. Release-asset mp4s
clobber-in-place; preview GIFs refresh in `docs/stills/`.

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
