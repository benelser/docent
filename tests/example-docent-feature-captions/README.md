# @example/docent-feature-captions

A **FeaturePlugin** that writes an SRT sidecar next to every rendered MP4. The pattern for cross-cutting concerns — captions, transcripts, chapter markers, lower-thirds — that pair the video with text.

## What it ships

| Plugin | Kind | What it does |
|---|---|---|
| `captions` | `feature` | Hooks `FeaturePlugin.afterRender(ctx)`. The cascade orchestrator hands it the per-beat TTS timings + the spec narration after the mp4 lands on disk. The feature builds cumulative SRT timestamps and writes `<outputDir>/<filmId>.srt`. |

When `--skip-tts` is on, the orchestrator synthesizes estimated per-beat seconds from word count at 150 wpm, so the SRT writer works end-to-end without the audio chain.

## Run it

```bash
bun ../../packages/cli/src/index.ts build captions-demo --scale 0.5 --skip-tts
```

Two files land:
- `out/captions-demo.mp4` — the silent render
- `out/captions-demo.srt` — 6 cues, cumulative `HH:MM:SS,mmm --> HH:MM:SS,mmm` timestamps

## What to study

- `src/captions/feature.ts` — the FeaturePlugin shape, declaring `afterRender(ctx)`.
- `src/captions/srt-writer.ts` — the cue formatter: word-wrap at ~42 chars, escape SRT metacharacters, accumulate beat seconds for cumulative timestamps.

## The `afterRender` hook

The hook receives an `AfterRenderContext`:

```ts
{
  filmSpec: FilmSpec;        // the validated spec
  outPath: string;           // absolute path of the rendered mp4
  outputDir: string;         // where sidecars typically write
  style: ResolvedStyle;      // resolved design tokens
  beats: AfterRenderBeat[];  // per-beat: sceneIndex, beatIndex, seconds, text
  ttsProviderId: string;     // 'kokoro' / 'openai' / 'skipped' / ...
}
```

Multiple features can register `afterRender`. The orchestrator calls them in registration order. A throw is surfaced as a render error; lenient features should catch their own.

## License

MIT
