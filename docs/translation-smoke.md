# translation smoke transcript

The hermetic smoke run that verifies the translation pipeline end-to-end
without an LLM API key. Captured 2026-05-29 from the feature branch.

## Setup

```bash
mkdir -p /tmp/docent-translate-smoke
cd /tmp/docent-translate-smoke
bun init -y
```

## init the starter spec

```bash
bun /path/to/worktree/packages/cli/src/index.ts init smoketest
```

Output:

```
✓ wrote /private/tmp/docent-translate-smoke/films/smoketest.json

  Next:
    bunx docent validate smoketest   — check the spec
    bunx docent build smoketest       — render to out/smoketest.mp4

  See every scene type:
    bunx docent scene-fit list
```

## build with --lang es (noop provider, default)

```bash
bun /path/to/worktree/packages/cli/src/index.ts build smoketest \
  --lang es --skip-tts --scale 0.25 \
  --films-dir /tmp/docent-translate-smoke/films \
  --output-dir /tmp/docent-translate-smoke/out
```

Transcript (stderr + stdout merged):

```
▶ docent build smoketest
  engine: 29 scenes · 7 presets · 1 tts · 1 translation · 2 features
  entry: /path/to/worktree/.docent/tmp/render-entry-smoketest.1780074885314.tsx
  translation: lang=es voice=af_heart
[translate] no translation provider configured — narration unchanged. Register a real provider (e.g. openaiTranslationPlugin from @bjelser/tts-openai) in docent.config.ts to actually translate.
🧹 Webpack config change detected. Clearing cache...
Getting composition
⚡️ Cached bundle. Subsequent renders will be faster.
Composition          smoketest
Codec                h264
Output               /tmp/docent-translate-smoke/out/smoketest-es.mp4
Concurrency          5x
✓ rendered /tmp/docent-translate-smoke/out/smoketest-es.mp4  16.7s
```

## what was verified

- The `--lang es` flag triggers the translate stage.
- The CLI logs the resolved `voice=af_heart` (built-in lang→voice map default).
- The noop provider warning fires on stderr exactly once (per the contract).
- The output filename is `smoketest-es.mp4` — the `-es` lang suffix is applied.
- The build succeeds end-to-end despite no translation API key in the env.
- The same flow with TTS enabled (no `--skip-tts`) also succeeds — verified
  separately at `out/smoketest-es.mp4` size 2.4MB, 28.8s wall.

## what was NOT verified

- A real translation provider (OpenAI). Tested only that
  `openaiTranslationPlugin` imports cleanly and the stub `create()` throws
  the expected error when `OPENAI_API_KEY` is absent. Live API path
  requires a key.
- Multilingual TTS (kokoro is English-only by design; the lang→voice map
  always lands on `af_heart` today).
