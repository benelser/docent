#!/usr/bin/env bun
/**
 * docent cascade — the build pipeline, run with bun.
 *
 * Stages cascade: each feeds the next. Within a stage, work is embarrassingly
 * parallel — TTS shards beats across worker processes; Remotion shards frames
 * across every core. Stages are decoupled, so each is cached independently:
 * re-running only redoes what changed.
 *
 *   survey  →  films/<id>.json        (authored by the agent, per AGENTS.md)
 *   tts     →  public/audio/<id>/*    + manifest.json
 *   clips   →  public/clips/<id>/*    (optional Manim inserts)
 *   render  →  out/<id>.mp4           (Remotion, frame-parallel)
 *
 * Usage:  bun run build [--film codex] [--skip-tts] [--still N]
 */
import {$} from 'bun';
import {existsSync} from 'node:fs';

const argv = process.argv.slice(2);
const opt = (name: string, fallback?: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')
    ? argv[i + 1]
    : fallback;
};
const flag = (name: string): boolean => argv.includes(`--${name}`);

const film = opt('film', 'codex')!;
const still = opt('still');

if (!existsSync(`films/${film}.json`)) {
  console.error(`✗ films/${film}.json not found — author the spec first (see AGENTS.md).`);
  process.exit(1);
}

const step = async (label: string, run: () => Promise<unknown>) => {
  const t0 = performance.now();
  console.log(`\n\x1b[36m▶ ${label}\x1b[0m`);
  await run();
  console.log(`\x1b[32m✔ ${label}\x1b[0m  ${((performance.now() - t0) / 1000).toFixed(1)}s`);
};

console.log(`\x1b[1mdocent\x1b[0m — building "${film}"`);

if (!flag('skip-tts')) {
  await step('narration · Kokoro TTS', async () => {
    await $`uv run python pipeline/tts.py --film ${film}`;
  });
}

if (existsSync(`manim/${film}`)) {
  await step('clips · Manim inserts', async () => {
    await $`uv run python pipeline/clips.py --film ${film}`;
  });
}

if (still) {
  await step(`still · frame ${still}`, async () => {
    await $`bunx remotion still src/index.ts ${film} out/${film}-still.png --frame=${still}`;
  });
} else {
  await step('render · Remotion (frame-parallel)', async () => {
    await $`bunx remotion render src/index.ts ${film} out/${film}.mp4 --concurrency=8`;
  });
  console.log(`\n\x1b[1m🎬 out/${film}.mp4\x1b[0m`);
}
