# @example/docent-feature-modifier

A **FeaturePlugin** that uses `registerModifiers` to advertise three concrete inline directives. The R3 modifier registry demo for `@bjelser/kit`.

The pattern for any feature pack that wants to give authors per-spec shorthand the cascade compiles into structured patches before validation. Modifiers fire at one of three tiers — film, scene, or beat — and merge a `Partial<>` into the corresponding target.

## What it ships

| Modifier | Tier | Value | Patches |
|---|---|---|---|
| `kicker-prefix` | film | `string` | `{ defaultKickerPrefix: <value> }` on `spec.meta` — the renderer can read this and prepend it to every scene's `kicker`. |
| `highlight` | scene | `number` | `{ accent: 'amber', emphasisIndex: <value> }` on the scene — marks the indexed item as the hero. |
| `pace-override` | beat | `'hold' \| 'settle' \| 'normal' \| 'brisk'` | `{ pace: <value> }` on the beat — forces a rhythm regardless of cadence. |

A spec opts in by writing a `modifiers: { <key>: <value> }` map at the corresponding level. The cascade walks the registry after `preprocessSpec`, applies the patches, and strips the `modifiers` field so the validator never sees it.

## Run it

```bash
bun ../../packages/cli/src/index.ts build modifier-demo --scale 0.5 --skip-tts
```

Output at `out/modifier-demo.mp4`. The film carries:
- a film-level `modifiers: { 'kicker-prefix': 'MODIFIER' }`
- a scene-level `modifiers: { highlight: 1 }`
- a beat-level `modifiers: { 'pace-override': 'hold' }`

For an isolation smoke that proves the patch math, see the `engine.applyModifiers(spec)` call site — the kit's pure method runs the same logic the cascade does.

## What to study

- `src/index.ts` — the three `ModifierFn` implementations. Each is a pure function `(value, ctx) → Partial<target>`. Returns `{}` to no-op on bad input.
- `engine.applyModifiers(spec)` in `packages/kit/src/engine.ts` — the registry walker. Film tier merges into `spec.meta`, scene tier into each scene, beat tier into each beat. The `modifiers` keys are stripped after the merge.

## R3 — modifier semantics

Three contract obligations a modifier MUST honor:

1. **Pure transformation.** A modifier receives a value + context and returns a patch. No filesystem, no network, no globals.
2. **Defensive types.** Validate the input (`typeof value !== 'string'` → return `{}`). The user can write any value at a modifier key; the modifier owns the rejection.
3. **Tier-correct patch.** A film-tier modifier returns `Partial<FilmMeta>`. A scene-tier modifier returns `Partial<Scene>`. A beat-tier modifier returns `Partial<Beat>`. The cascade merges the patch into the matching target.

Multiple features can register modifiers. The registry's `Map.set(key, fn)` is **last-write-wins** — a later-registered feature can override an earlier one's modifier for the same key. Use globally-unique-ish keys (e.g. `@yourorg/feature/key`) to avoid collisions; the conflict policy is by-key, not by-feature.

## License

MIT
