# Migration sprint — legacy knobs out, ResolvedStyle in

> Queued. Dispatches after the styling pipeline (Task #72) and Sprint A
> (Task #71) both merge to main. Designed as 3 parallel agents — chrome,
> diagrammatic, motion. Each owns a renderer family.

---

## The architectural commitment

Backward compatibility is a tax we keep reaching for when we should commit
to the cleaner design. **There are no parallel APIs.** The styling pipeline
is the styling system. Legacy knobs (`palette`, `treatment`, `register`,
`accent`) are removed from the spec. The corpus is a test fixture, not a
constraint — gallery films get re-authored.

After this sprint:
- `Scene.palette`, `Scene.treatment`, `Scene.register`, `Scene.accent` no
  longer exist in `spec.ts`.
- Every scene renderer reads from `ResolvedStyle` (props), not from
  `theme.ts` directly.
- The 9 gallery film JSONs use the new `style: {preset, intent, overrides}`
  vocabulary.
- The four README demo films are re-rendered against the new system.
- Discriminator fields (`novelty.kind`, `axis.kind`) replace the union casts
  Sprint A introduced.

## Three parallel agents

### Agent M1 — Chrome family

Owns: `SceneFrame.tsx`, `Card.tsx`, `Connector.tsx`, `Pulse.tsx`,
`Narration.tsx`, `NodeRepr.tsx`.

For each component:
- Add `style: ResolvedStyle` prop.
- Replace every `theme.bg.*`, `theme.ink.*`, `accent(scene.accent)` reference
  with a read from the prop's tokens.
- Delete imports of `theme.ts` (the file stays as the resolver's default).
- The `transparentBackdrop` prop on SceneFrame stays — it predates this
  sprint and is orthogonal.

### Agent M2 — Diagrammatic family

Owns: `StructureScene`, `TensionScene`, `WalkthroughScene`, `CompareScene`,
`QuantitiesScene`, `ChartScene`, `PriorArtScene`, `VennScene`,
`LandscapeScene`, `TreeScene`, `MapScene`, `JourneyMapScene`,
`CausalLoopScene`.

For each scene component:
- Accept `style: ResolvedStyle` (passed through from `Film.tsx`).
- Replace every direct `theme.*` access with the corresponding token read.
- Replace every `accent(scene.accent)` with a `style.accents[scene.accent]`
  lookup (the resolver provides the accent table).
- Honor the visualization style block (e.g., `style.visualization.chart.grid`
  controls whether ChartScene renders grid lines).

### Agent M3 — Narrative + motion family

Owns: `FrameScene`, `PassageScene`, `RecapScene`, `BigIdeaScene`,
`MechanismScene`, `FigureScene`, `CloseupScene`, `DemonstrateScene`,
`DiffScene`, `TimelineScene` (if not already in M2 — split however the
parallel agents prefer).

Same migration pattern. Note that `FrameScene` already auto-fits title /
tagline / footnote; preserve those behaviors but source the fontFamily
and ink colors from `style.tokens.typography`.

## Spec + schema deletions

After all 3 agents land in main (NOT during their work — one merge-time
edit owns this):

- Remove `palette`, `treatment`, `register`, `accent` from the `Scene` type
  in `spec.ts`.
- Remove the same fields from `film.schema.json`.
- Remove the per-knob validators in `validate.ts`.
- Add a single validator rule that hard-fails any spec carrying one of the
  removed fields, with a structured migration message:
  ```
  scenes[i].palette: removed in v2.1. Use `style.preset` (one of:
  neutral, engineering, editorial, paper, executive, analytical)
  or `style.intent.tone`. See packages/engine/src/style/.
  ```

## Gallery film auto-migration

A one-shot script (`scripts/migrate-films.sh` or a Python equivalent)
maps the old knob values to `{preset, intent}` for each gallery film:

| Legacy combo | New spec |
|---|---|
| (no knobs set) | `{preset: 'neutral'}` |
| `palette: 'cool'`, `treatment: 'crisp'` | `{preset: 'engineering'}` |
| `palette: 'warm'`, `treatment: 'whiteboard'` | `{preset: 'editorial'}` |
| `palette: 'mono'`, `treatment: 'sketch'` | `{preset: 'analytical'}` |
| ...etc | |

Run the script across the 5 tracked gallery films + 4 README demo films;
manually review the output before committing.

## Discriminator cleanup

Sprint A's two union-pollution sites get fixed in this sprint:

- `novelty: PriorArtNovelty | VennNovelty` → add a `kind` discriminator;
  renderers narrow via `kind` instead of `as` casts.
- `xAxis: Axis | LandscapeAxis` (and same for `yAxis`) → discriminator
  field; ChartScene and LandscapeScene narrow on it.

This is a small but real cleanup that pays type-safety dividends.

## Re-render the README demos

After everything merges:
- Re-render `docent-self`, `openclaw-ar`, `lethal-trifecta-blog`,
  `arxiv-2512-14806` against the new system.
- Re-upload to v2.1.x release assets (same URLs, `--clobber`).
- Re-extract preview GIFs.
- README URLs don't change — assets clobber in place.

## Non-regression

The full hermetic gallery must pass post-merge:
- `docent hermetic` (full sweep, scale 0.5) — every fixture GREEN.
- `docent depthcheck <id>` for each gallery film — same scores as
  before migration (preset selection should produce equivalent
  styling tokens).

## Non-negotiables

- No commit, no push within an agent's worktree. Stop at "ready for review."
- The 3 parallel agents must follow region-pinning at the file level:
  - M1 owns `Card`, `SceneFrame`, etc. — M2/M3 do not touch.
  - M2 / M3 split scene renderers by alphabetical first letter (M2: A-M,
    M3: N-Z) or by family lines drawn here.
- `bun` over `npm`.
- Local commits end with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
