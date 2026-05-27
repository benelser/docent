# @example/docent-preset-brand

A **brand preset pack** — one PresetPlugin (`acme`, navy + gold) with no scene code. The pattern for `docent-preset-<brand>` packs.

If you're shipping films under a company brand — a consistent typography, palette, and visualization style across every film — fork this. It's the smallest example of a PresetPlugin without any scene authoring.

## What it ships

| Plugin | Kind | What it does |
|---|---|---|
| `acme` | `preset` | A complete design-token bundle: deep navy panels, brand-gold accents, Inter for sans, generous spacing. The visualization style biases axes labels into mono caps and lifts the heading typography to display-weight 800. |
| `acme-dark` | `preset` | Composes on top of `acme` via `extends: "acme"`. Overrides ONLY the `bg.*` group + `ink.faint` to a near-black ground. Inherits accent palette, typography, spacing, radius, stroke, and visualization knobs unchanged. **The R4 preset-composition demo** — proves the kit's `extends` chain resolves correctly. |

## Run it

```bash
bun ../../packages/cli/src/index.ts build acme-quarterly --scale 0.5 --skip-tts
bun ../../packages/cli/src/index.ts build acme-quarterly-dark --scale 0.5 --skip-tts
```

Two films:
- `out/acme-quarterly.mp4` — light Acme.
- `out/acme-quarterly-dark.mp4` — dark Acme, composed via `extends: "acme"`.

Compare the two stills at any timestamp: the gold accents are identical, the typography is identical, only the background and the disabled-ink tone change. That's the contract of R4 composition: explicit, layered, the chain visible in `docent doctor`.

## What to study

- `src/presets/acme/tokens.ts` — the full token bundle: `bg.*`, `ink.*`, `accent.*`, typography, spacing, radius. This is what every scene reads via `common.style.tokens`.
- `src/presets/acme/index.ts` — the PresetPlugin's `tokens` + `visualization` exports + the optional `injectStyleTokens` hook.
- `films/acme-quarterly.json` — `style.preset: "acme"` is the only change vs the same film in `engineering`.

## R4 composition — `extends` resolved at style-resolution time

The PresetPlugin protocol carries an optional `extends?: string` field. The style resolver walks the chain base-first and shadows tokens per category:

```
neutral floor
  + acme.tokens        (deep navy, white ink, gold accent)
  + acme-dark.tokens   (overrides bg.* + ink.faint only)
  + film.style.tokens  (any per-film overrides)
```

What's enforced:
- **Cycles** — `A extends B`, `B extends A` throws `preset_cycle` at resolution time and is flagged by `docent doctor` at registry-load time.
- **Unknown targets** — `extends: "doesnt-exist"` throws `unknown_extends` at resolution time and is flagged by `doctor` at registry-load time.
- **Visualization fallback** — a derived preset can omit `visualization`; the resolver picks up the most-derived chain member with a value for each knob.

For a cross-pack composition example, a community pack `@yourorg/docent-preset-acme-marketing` can declare `extends: "acme"` from a different repo entirely — the resolver only cares that both presets are registered on the same engine.

## License

MIT
