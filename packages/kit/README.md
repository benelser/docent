# @bjelser/kit

The framework. Zero opinions, zero implementations.

`@bjelser/kit` owns the plugin protocols, the registries, the `Engine` class,
the spec validator, the cascade orchestrator, and the Remotion bindings.
Every scene, preset, TTS provider, and feature in `@bjelser/core` (and every
third-party plugin pack) is registered through this package's public API
via `engine.use(plugin)`.

There is no private path. `@bjelser/core` is one customer of `@bjelser/kit`'s
public API; a third-party plugin pack has exactly the same powers and
constraints.

## What this package IS

- The 4 plugin protocols: `ScenePlugin`, `PresetPlugin`, `TtsProviderPlugin`,
  `FeaturePlugin`.
- The `Engine` class with its 5 registries (scene / preset / tts / feature /
  modifier).
- The `engine.use(plugin)` polymorphic dispatch — sniffs `plugin.kind`,
  routes to the right registry, conflict-detects with both names surfaced.
- The CLOSED 7-cluster cognitive-cluster taxonomy every scene declares
  against (or `null` for chrome-only scenes).
- The design-token, style, spec, and TTS type vocabulary every plugin reads
  and contributes to.

## What this package IS NOT

- **Not the implementation.** Zero scenes. Zero presets. Zero TTS providers.
  Zero opinions about what a film looks like. The 29 default scenes, the
  6 default presets, the Kokoro TTS provider, the default narration feature
  — every one of them lives in `@bjelser/core`, registered through this
  package's public API.
- **Not a renderer.** `@bjelser/kit` references React + Remotion in types
  only (peer dependencies). The kit imports nothing at runtime from either.

## Status

Phase A.1 of the rip-and-replace. Every protocol type is declared; every
registry is constructible; `engine.use(plugin)` works end to end including
conflict detection. The methods that DO the work (`schema`, `validate`,
`resolveStyle`, `render`) throw `not implemented — phase A.X` and are
filled in by Phase A.2 through A.9. See
`docs/design/plugin-architecture-dag.md` for the dependency graph.

## Forward-compat hooks shipped here

| Hook | Where | Lights up in |
|---|---|---|
| R3 — custom modifiers | `ModifierRegistry` shape + `FeaturePlugin.registerModifiers` | Future release; protocol is stable now. |
| R4 — preset composition | `PresetPlugin.extends?: string` (currently IGNORED by resolver) | Future release; field is reserved. |
| R6 — inline microsyntax | `FeaturePlugin.preprocessSpec?(spec)` | Future release; decoder lands as a feature plugin. |

None of these break the public API when they ship.

## The 7 cognitive clusters

Every `ScenePlugin` declares its `cluster` from this closed list:

- `connection` — relationships, dependencies, links between entities.
- `time` — temporal sequencing, before/after, progressions, timelines.
- `flow` — control flow, data flow, state transitions, pipelines, cycles.
- `comparison` — side-by-side options, trade-offs, scoring, charts on real axes.
- `categorization` — taxonomies, set membership, boundaries between kinds, matrices.
- `experience` — the human angle: a journey, a perception, an experiential walk.
- `narrative` — story, argument, commitment, "we chose X because of Y".

Chrome-only scenes (`frame`, `recap`) declare `cluster: null` — they bracket
the film but perform no cognitive move.

## Quick reference

```ts
import {Engine, type ScenePlugin} from '@bjelser/kit';

// Construct an empty engine.
const engine = new Engine();

// Register a plugin (or an array of plugins).
engine.use(myPlugin);
engine.use([sceneA, sceneB, preset, ttsProvider]);

// Inspect the registries.
engine.scenes.has('frame');
engine.scenes.get('frame');
engine.scenes.all();

// Drive the cascade (Phase A.4+ — throws today).
const issues = engine.validate(spec);
const style = engine.resolveStyle(spec);
await engine.render(spec, {scale: 0.5});
```

## License

MIT — same as the rest of docent.
