// captionsFeature — write `<outputDir>/<filmId>.srt` next to the mp4.
//
// Strategy: implement `FeaturePlugin.afterRender`. The orchestrator fires
// this hook after `runRenderStage` returns, handing us the per-beat TTS
// clip durations + the spec's narration. The hook builds an SRT cue list
// from that pair and writes the file alongside the rendered video.
//
// What this demonstrates: a feature plugin can ship a real post-render
// side-effect without touching `@docent/core`, the CLI, or the render
// pipeline. The protocol is the only contract.

import {writeFileSync} from 'node:fs';
import {basename, extname, join} from 'node:path';

import type {AfterRenderContext, FeaturePlugin} from '@docent/kit';

import {buildSrt} from './srt-writer';

/**
 * Compute the SRT sidecar path for a given mp4 path. Replaces the video
 * extension with `.srt` so the file pairs cleanly with the render
 * (`out/captions-demo.mp4` → `out/captions-demo.srt`).
 */
const srtPathFor = (outPath: string, outputDir: string): string => {
  const ext = extname(outPath);
  const base = basename(outPath, ext);
  return join(outputDir, `${base}.srt`);
};

export const captionsFeature: FeaturePlugin = {
  kind: 'feature',
  name: '@example/docent-feature-captions',
  version: '0.1.0',

  /**
   * The feature's only hook. Builds an SRT cue list from `ctx.beats` and
   * writes it next to the rendered mp4.
   *
   * The cue clock is cumulative: cue 1 starts at 0 and runs for the first
   * beat's clipSeconds; cue 2 picks up where cue 1 ended; and so on. Beats
   * with no narration text are skipped so they don't take cue space.
   */
  async afterRender(ctx: AfterRenderContext): Promise<void> {
    const srt = buildSrt(ctx.beats);
    const target = srtPathFor(ctx.outPath, ctx.outputDir);
    writeFileSync(target, srt, 'utf-8');
    process.stdout.write(
      `[@example/docent-feature-captions] wrote ${target} ` +
        `(${ctx.beats.filter((b) => (b.text ?? '').trim().length > 0).length} cues)\n`,
    );
  },
};

export default captionsFeature;
