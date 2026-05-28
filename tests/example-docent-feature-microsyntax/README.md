# @example/docent-feature-microsyntax

A **FeaturePlugin** that uses `preprocessSpec` to expand inline microsyntax directives in a film spec before the validator sees it. The R6 forward-compat hook in `@docent/kit`.

The pattern for any feature pack that wants to let authors write shorter or more domain-specific spec source and have the cascade expand it transparently — author shorthand, normalization passes, legacy field translators, microsyntax macros.

## What it ships

| Plugin | Kind | What it does |
|---|---|---|
| `@example/docent-feature-microsyntax` | `feature` | Implements `FeaturePlugin.preprocessSpec(spec)`. The cascade runs the hook before validation; the validator + renderer see only the expanded form. |

## The three directives

A scene opts in by adding a `directives: ['@@@…', '@@@…']` array. The preprocessor reads + strips that array before the validator sees the spec, so the directives never trip an unknown-field warning.

| Directive | What it does |
|---|---|
| `@@@auto-id` | At scene level: any `nodes[]` element without an `id` gets one derived from its `label` (`'Spec on disk'` → `'spec-on-disk'`). Same for `edges[]` without `id` (uses `from-to`). Collisions are auto-suffixed. |
| `@@@reveal-all` | At scene level: the **last** beat that doesn't already set `reveal` gets `reveal: [<every node id>]`. Lets a scene say "and then everything is on screen" without enumerating. |
| `@@@beat-stride N` | At scene level: if a beat carries a long narration, split it into N beats by sentence boundary. The first inherits the original beat's `id`/`reveal`/etc.; the rest carry just the narration text. |

## Run it

```bash
bun ../../packages/cli/src/index.ts build microsyntax-demo --scale 0.5 --skip-tts
```

Output at `out/microsyntax-demo.mp4`. The film is a clean two-scene primer; the proof is that the build banner shows `+1 from docent.config.ts` and the cascade reports `preprocessSpec: 1 feature(s) ran` for every film built in this project.

For a directive-bearing smoke (proves the transformations apply), import the feature and call `preprocessSpec` directly:

```ts
import {microsyntaxFeature} from '@example/docent-feature-microsyntax';

const expanded = microsyntaxFeature.preprocessSpec!(spec);
// expanded.scenes[i].nodes[j].id is now derived
// expanded.scenes[i].beats[k].reveal is now filled in
// the scene's `directives` array is gone
```

## What to study

- `src/index.ts` — the FeaturePlugin shape + the three directive handlers (`applyAutoId`, `applyRevealAll`, `applyBeatStride`). Each is a pure function `SceneLike → SceneLike`.
- The orchestrator in `packages/kit/src/cascade/orchestrator.ts` — see how multiple registered features chain through `engine.preprocessSpec(spec)`.

## R6 — preprocessSpec semantics

Three contract obligations a feature's `preprocessSpec` MUST honor:

1. **Identity by default.** If your hook has nothing to do with a spec, return it unchanged. Don't mutate; spread.
2. **Pure transformation.** Don't read from the network, the filesystem, or stateful globals during preprocessSpec. The hook runs at the start of every render — keep it deterministic.
3. **No silent failure.** If your transformation cannot apply (e.g. an `@@@` directive with bad arguments), throw with a clear message; the cascade refuses to run a partial preprocessor.

The cascade runs every registered feature's hook in registration order — each receives the output of the previous. Chained features can compose freely.

## License

MIT
