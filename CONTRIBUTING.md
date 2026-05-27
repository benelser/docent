# Contributing to docent

Two ways to contribute, two on-ramps.

## I want to ship a `@yourorg/docent-*` extension pack

You **don't need to fork** docent. The plugin architecture is the contract — your pack lives in its own repo, declares `peerDependencies: { "@docent/kit": "^3.0.0" }`, and registers through the framework's public API exactly the way `@docent/core` does.

Four runnable reference packs live under [`tests/example-docent-*/`](tests/). Pick the one whose shape matches yours:

| Pack | What to fork it for |
|---|---|
| [`tests/example-docent-scifi/`](tests/example-docent-scifi/) | A scene + preset pack — the simplest complete shape. The §10 acceptance test. |
| [`tests/example-docent-finance/`](tests/example-docent-finance/) | A vertical scene pack with multiple scene types in one cluster. |
| [`tests/example-docent-preset-brand/`](tests/example-docent-preset-brand/) | A brand preset pack with no scene code. |
| [`tests/example-docent-feature-captions/`](tests/example-docent-feature-captions/) | A FeaturePlugin with a post-render sidecar writer (`afterRender` hook). |

Each pack has its own README naming the contract obligations its plugins honor.

The full plugin-authoring guide is in the [main README](README.md#plugin-authoring). The interfaces are JSDoc'd in [`packages/kit/src/protocols.ts`](packages/kit/src/protocols.ts); read them as the contract.

After authoring, verify your pack lands clean:

```bash
# Tsc check
bunx tsc --noEmit

# Render the demo film
bun /path/to/docent/packages/cli/src/index.ts build <your-film-id> --scale 0.5

# Run the harness suite
bun /path/to/docent/packages/cli/src/index.ts render-check <your-film-id>
bun /path/to/docent/packages/cli/src/index.ts grammar-check  # if you registered the pack
```

### Pull-request your pack into the gallery (optional)

If your pack is broadly useful and you want it cited as a community example, open a PR adding a row to the gallery table in the main README and a short link from this file. Don't add the pack to `tests/example-docent-*/` — those are the framework's own reference packs. Community packs live in their own repos under your org.

## I want to change `@docent/core`, `@docent/kit`, or `@docent/cli`

The bar for landing a change in the framework or the default implementation:

1. **Read the design docs.** [`plugin-architecture-strategy.md`](docs/design/plugin-architecture-strategy.md) is the canonical strategy doc; [`plugin-architecture.md`](docs/design/plugin-architecture.md) is the original research-driven design.
2. **Honor the contract.** Every change to `packages/kit/src/protocols.ts` is a major version bump. Adding hooks (new optional fields on existing protocols) is additive — see how `FeaturePlugin.afterRender` was added in v3.0-rc.0 as the SRT-writer hook.
3. **Run the harness.** Before opening a PR:
   ```bash
   bun run docent grammar-check        # every scene type covered + every cover-set film passes
   bun run docent hermetic --scale 0.5 # the 4 gallery fixtures still render
   ```
   Both must be GREEN.
4. **Write a depth contract.** A new ScenePlugin without `depth-rules.ts` and `judge-dimensions.ts` doesn't ship. The empty-array case is fine ("no scene-specific rules; the film-wide grader still applies"), but the file must exist with the explanatory comment.
5. **No private path between `@docent/core` and `@docent/kit`.** The §10 acceptance test (the scifi pack) proves the surface is symmetric — a third-party plugin has exactly the same powers and constraints as a core plugin. If a change to `@docent/core` requires a private import from `@docent/kit`, it's the wrong shape.

## I just want to author a film

You're in the right place — open the main [README](README.md), follow the Quick Start, and write your `films/<id>.json`. No contribution needed.

## License

The repository is MIT. Community packs published under MIT or a compatible OSS license can cite docent without negotiation.
