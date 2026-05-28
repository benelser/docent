# @example/docent-scifi

The **§10 acceptance test** for docent's plugin architecture. A third-party pack that ships one scene plugin (`holodeck`) and one preset plugin (`scifi-noir`) and renders end-to-end through `docent build` without forking `@bjelser/core`.

If you're authoring your first `@yourorg/docent-*` pack, **fork this one**. It is the smallest complete example: two plugins, one film, all the contract obligations honored.

## What it ships

| Plugin | Kind | What it does |
|---|---|---|
| `holodeck` | `scene` | A new `scene.type` discriminator with its own schema branch (a holodeck stage with characters + a directive), Remotion component, validate, depth-rules, judge-dimensions. Cluster: `experience`. |
| `scifi-noir` | `preset` | A new visual register — neon-on-black design tokens, a noir-flavored visualization style. |

The demo film `films/scifi-demo.json` exercises both: a five-scene short that walks through arrival, holodeck staging, conflict, and a closing recap.

## Run it

From this directory:

```bash
bun ../../packages/cli/src/index.ts build scifi-demo --scale 0.5 --skip-tts
```

Or from the repo root:

```bash
bun run docent build scifi-demo --scale 0.5 --skip-tts \
  --project-root tests/example-docent-scifi
```

Output lands at `out/scifi-demo.mp4`.

## What to fork

- `src/scenes/holodeck/` — the full ScenePlugin shape (`index.ts`, `component.tsx`, `schema.ts`, `validate.ts`, `depth-rules.ts`, `judge-dimensions.ts`).
- `src/presets/scifi-noir/` — the PresetPlugin shape (`index.ts`, `tokens.ts`).
- `src/index.ts` — the pack's default export, the array of plugins the host engine consumes.
- `docent.config.ts` — how the pack registers itself when `@bjelser/cli` discovers it at project root.

For the full plugin-authoring guide, see the [main README](../../README.md#plugin-authoring) and [`docs/design/plugin-architecture-strategy.md`](../../docs/design/plugin-architecture-strategy.md).

## License

MIT
