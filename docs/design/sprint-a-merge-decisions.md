# Sprint A — merge-time decisions

> The 5 parallel Sprint A agents each picked field names independently
> to avoid collisions with existing types. The merge needs to reconcile
> these choices into one consistent vocabulary. This doc records the
> decisions and the rationale.

## Name collisions encountered

| Field | Existing type | New agent's choice | Why the collision |
|---|---|---|---|
| `Scene.stages` | `Stage[]` (used by `progression`) | journey-map used `journeyStages: JourneyStage[]` | Element types differ — `Stage` vs `JourneyStage`. Same name = union pollution. |
| `Scene.edges` | `Edge[]` (used by `structure`) | causal-loop used `causalEdges: CausalEdge[]` | Element types differ — `Edge` vs `CausalEdge`. Same name = union pollution. |
| `Scene.novelty` | `PriorArtNovelty` (prior-art) | venn widened to `PriorArtNovelty \| VennNovelty` | (already shipped — needs discriminator cleanup) |
| `Scene.xAxis` / `yAxis` | `Axis` (chart) | landscape widened to `Axis \| LandscapeAxis` | (already shipped — needs discriminator cleanup) |

## The decision: scoped narrow types with discriminators

We keep the per-scene-named fields (`journeyStages`, `causalEdges`) at
merge time — they're explicit and unambiguous at the renderer level.
The fix for the venn/landscape union pollution is to add `kind`
discriminator fields:

```ts
type Novelty =
  | { kind: 'prior-art'; ... }
  | { kind: 'venn'; ... };

type Axis =
  | { kind: 'chart'; ... }
  | { kind: 'landscape'; ... };
```

Renderers narrow via `kind` switches instead of `as` casts.

### Why not rename to `stages` / `edges` everywhere

Two options were considered:

1. **One union per name:** `Scene.stages: Stage[] \| JourneyStage[]`,
   discriminated by `Scene.type`. Renderers narrow via `if (scene.type
   === 'journey-map')`. — Pros: one name. Cons: every scene type carries
   every union member's full type surface; renderers need exhaustive
   type guards.

2. **Per-scene-named fields:** `journeyStages` and `causalEdges` stay
   as they are. — Pros: zero union pollution. Renderer reads exactly
   the field for its scene. Cons: more names in the spec.

We chose (2) because the spec is authored by an agent, not a human,
and the agent picks the right name from the schema. The renderer code
stays narrow.

## Sprint A merge order

The 9-way merge happens in a single sit-down using
`scripts/merge-helper.sh`. Suggested order to minimize conflicts:

1. **Styling pipeline** first — it ships infrastructure that the renderer
   migration depends on, and it touches `theme.ts`, `Film.tsx` (style
   prop threading), and `validate.ts` (style-block validation).
2. **Each scene type in turn** — timeline, tree, map, journey-map,
   causal-loop. Each appends to:
   - `spec.ts` (union member + types)
   - `film.schema.json` (enum + properties + $defs)
   - `validate.ts` (SCENE_TYPES + per-scene block + requiredBody)
   - `depthcheck.ts` (per-scene dimensions)
   - `judge.ts` (DEPTH_DIMENSIONS appended)
   - `Film.tsx` (renderer dispatch + import)
   - `survey-template.md` + `survey-explainer.md` (§ guidance)
   - `depth-review.md` (rubric)
3. **Audio rhythm** — touches the TTS pipeline + per-beat trim config;
   independent of the scene-type changes.
4. **Discriminator cleanup** at the end — add `kind` to `Novelty` and
   `Axis`, update venn/landscape/prior-art/chart renderers to narrow via
   `kind`.

## Post-merge contract

After the merge, before cutting v2.1.0:

- `bun packages/engine/cli/docent.ts hermetic <every fixture>` GREEN.
- `bun packages/engine/cli/docent.ts depthcheck <every fixture>` ≥
  pre-merge scores.
- Every new demo film (`timeline-*`, `tree-*`, `map-*`,
  `onboarding-first-30-minutes`, `causal-loop-primer`) renders at scale
  0.5 and passes depthcheck.
- Run `scripts/migrate-films.ts` against the 4 README films + 5 gallery
  films; manually review each output before committing.
- Run `scripts/rerender-demos.sh v2.1.0` after merge + tag.

## Then immediately

Dispatch the migration sprint (3 agents — chrome, diagrammatic,
narrative+motion). When migration lands, bundle everything into v2.1.0
as the bundled release described in CHANGELOG.md.
