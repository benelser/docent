# @example/docent-finance

A **vertical scene pack** — two new `scene.type` discriminators (`ohlc` and `candlestick`) tuned for financial-instrument storytelling. The pattern for `docent-scenes-<vertical>` packs (medicine, biology, law, sports analytics).

## What it ships

| Plugin | Kind | Cluster | What it does |
|---|---|---|---|
| `ohlc` | `scene` | `comparison` | An OHLC bar chart that builds beat-by-beat. The depth rule names the "arc load-bearing" contract: narration must read the shape across bars, not just point at one. |
| `candlestick` | `scene` | `comparison` | A candlestick close-up: each beat earns its width by naming a structural feature (wick / body / open / close / pattern). |

Both scenes carry per-plugin depth rules + judge dimensions — the depthcheck contract the framework refuses to render without.

## Run it

```bash
bun ../../packages/cli/src/index.ts build finance-primer --scale 0.5 --skip-tts
```

Output at `out/finance-primer.mp4`. A 50-second walk through a fictional ticker's quarter.

## Why fork this pack

If you're shipping a vertical pack — finance, medicine, law, climate — you'll need:
- Multiple scene types that share a cognitive cluster (here: `comparison`)
- Scene-specific depth rules that the LLM grader can hold the film to
- Schemas with strict per-type fields the validator can enforce
- A single project-level export that registers all of them via `docent.config.ts`

This pack is the smallest realistic example of that shape.

## What to study

- `src/scenes/ohlc/depth-rules.ts` — how a vertical pack names a per-scene cognitive contract (`ohlc-arc-load-bearing`).
- `src/scenes/ohlc/judge-dimensions.ts` — what the LLM judge is asked to evaluate the scene against (`ohlc-volume-narrated`, `ohlc-trend-named`).
- `src/scenes/ohlc/schema.ts` — the JSON-schema fragment the kit merges into the computed film schema.
- `films/finance-primer.json` — the demo spec that exercises both scenes.

## License

MIT
