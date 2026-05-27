# @example/docent-preset-brand

A **brand preset pack** — one PresetPlugin (`acme`, navy + gold) with no scene code. The pattern for `docent-preset-<brand>` packs.

If you're shipping films under a company brand — a consistent typography, palette, and visualization style across every film — fork this. It's the smallest example of a PresetPlugin without any scene authoring.

## What it ships

| Plugin | Kind | What it does |
|---|---|---|
| `acme` | `preset` | A complete design-token bundle: deep navy panels, brand-gold accents, Inter for sans, generous spacing. The visualization style biases axes labels into mono caps and lifts the heading typography to display-weight 800. |

## Run it

```bash
bun ../../packages/cli/src/index.ts build acme-quarterly --scale 0.5 --skip-tts
```

Output at `out/acme-quarterly.mp4`. A short quarterly-report film entirely in Acme brand.

## What to study

- `src/presets/acme/tokens.ts` — the full token bundle: `bg.*`, `ink.*`, `accent.*`, typography, spacing, radius. This is what every scene reads via `common.style.tokens`.
- `src/presets/acme/index.ts` — the PresetPlugin's `tokens` + `visualization` exports + the optional `injectStyleTokens` hook.
- `films/acme-quarterly.json` — `style.preset: "acme"` is the only change vs the same film in `engineering`.

## R4 forward-compat — `extends` composition

The PresetPlugin protocol carries an optional `extends?: string` field. Today it's documented but not yet consulted by the resolver (an R4 surface). A future pack like `@example/docent-preset-acme-dark` could declare `extends: "acme"` and override only the `bg.*` tokens for a dark variant.

## License

MIT
