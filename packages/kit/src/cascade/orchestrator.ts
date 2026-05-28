// The cascade orchestrator — the pipeline behind `engine.render(spec, opts)`.
//
// Per §4.7 of the strategy doc and Phase A.7 of the DAG, the cascade is:
//
//     validate → resolveStyle → ttsStage → renderStage
//
// Each stage is a separate function in this directory so a caller (a CLI
// shell, a hermetic test) can exercise one stage in isolation. The
// orchestrator is the *only* place the order is encoded.
//
// **Tolerance for parallel Phase A landing.** A.7 (this file) lists
// only A.1, A.2, A.3 as predecessors — A.4 (validation framework) and
// A.9 (Remotion bindings) are explicitly *parallel*. So:
//
//   - When `engine.validate` throws the "not implemented (phase A.4)"
//     sentinel, the orchestrator surfaces a structured warning and
//     proceeds. Once A.4 lands, validation runs for real.
//   - When the render stage throws the "not implemented (A.9 dependency)"
//     sentinel, the orchestrator lets it propagate; the caller saw
//     validate + style + tts run before the throw.
//
// This is the standard Phase-A discipline: every framework piece is
// exercisable the instant its own predecessors land, even if downstream
// peers haven't yet.

import {dirname} from 'node:path';

import type {Engine} from '../engine';
import type {
  AfterRenderBeat,
  AfterRenderContext,
  FilmSpec,
  Issue,
  RenderOptions,
  RenderResult,
} from '../protocols';
import type {Beat, Scene} from '../types/spec';
import type {ResolvedStyle} from '../types/style';
import {runTtsStage, type TtsStageManifest} from './tts-stage';
import {runRenderStage} from './render-stage';

/** A summarized record of what each stage did — surfaced for diagnostics. */
export interface CascadeStageRecord {
  readonly name:
    | 'preprocessSpec'
    | 'applyModifiers'
    | 'validate'
    | 'resolveStyle'
    | 'tts'
    | 'render';
  readonly seconds: number;
  /** Stage-specific summary line (e.g. "12 beats · 3.4s narration"). */
  readonly summary?: string;
}

/**
 * Sentinel: does the error message indicate a not-yet-implemented Phase A
 * stage? Used to keep the cascade tolerant of parallel-track landings.
 */
const isNotImplementedSentinel = (e: unknown): boolean => {
  if (!(e instanceof Error)) return false;
  return /not implemented \(phase A\.\d|A\.\d dependency\)/i.test(e.message);
};

/** Format a fail-fast error for unrecoverable validation issues. */
const formatValidationFailure = (issues: ReadonlyArray<Issue>): string => {
  const hardFails = issues.filter((i) => i.severity === 'error');
  return (
    `spec fails validation:\n` +
    hardFails
      .map(
        (i) =>
          `  ✗ ${i.path || '(root)'}: ${i.message}${
            i.source ? ` [${i.source}]` : ''
          }`,
      )
      .join('\n')
  );
};

/**
 * Run the full cascade. Returns the render result and the per-stage
 * timing breakdown. **The render stage throws "not implemented" until A.9
 * lands** — see the file-level comment.
 *
 * The orchestrator is a pure function over `(spec, engine, opts)`; the
 * caller owns argument resolution (e.g. reading the spec from disk).
 */
export const runCascade = async (
  spec: FilmSpec,
  engine: Engine,
  opts: RenderOptions = {},
): Promise<RenderResult> => {
  const stages: CascadeStageRecord[] = [];

  // ─── 0. preprocessSpec — R6 microsyntax chain ─────────────────────────
  // Delegate to engine.preprocessSpec() so the CLI's pre-validate step and
  // the cascade see the same expansion. A feature with no preprocessSpec
  // hook is invisible to this stage.
  {
    const t0 = performance.now();
    const features = engine.features.all();
    const chainCount = features.filter(
      (f) => typeof f.preprocessSpec === 'function',
    ).length;
    spec = engine.preprocessSpec(spec);
    const seconds = (performance.now() - t0) / 1000;
    stages.push({
      name: 'preprocessSpec',
      seconds,
      summary:
        chainCount === 0
          ? 'no preprocessSpec features registered'
          : `${chainCount} feature(s) ran`,
    });
  }

  // ─── 0b. applyModifiers — R3 modifier registry ────────────────────────
  // Walk the three-tier registry and merge per-key patches into film meta /
  // scenes / beats. Strip the `modifiers` keys so the validator sees a
  // clean spec. Identity when no modifiers are registered.
  {
    const t0 = performance.now();
    const totalMods =
      engine.modifiers.film.size +
      engine.modifiers.scene.size +
      engine.modifiers.beat.size;
    spec = engine.applyModifiers(spec);
    const seconds = (performance.now() - t0) / 1000;
    stages.push({
      name: 'applyModifiers',
      seconds,
      summary:
        totalMods === 0
          ? 'no modifiers registered'
          : `${totalMods} modifier(s) (film:${engine.modifiers.film.size}, scene:${engine.modifiers.scene.size}, beat:${engine.modifiers.beat.size})`,
    });
  }

  // ─── 1. validate ─────────────────────────────────────────────────────
  // The spec contract gate. Hard-fail on errors; surface warnings.
  // Tolerant of A.4 not-yet-landed: a "not implemented" throw is
  // surfaced as a structured note but does not stop the cascade.
  {
    const t0 = performance.now();
    let issues: Issue[] = [];
    let validateRan = true;
    try {
      issues = engine.validate(spec);
    } catch (e) {
      if (isNotImplementedSentinel(e)) {
        validateRan = false;
      } else {
        throw e;
      }
    }
    const seconds = (performance.now() - t0) / 1000;

    if (validateRan) {
      const hardFails = issues.filter((i) => i.severity === 'error');
      if (hardFails.length > 0) {
        throw new Error(formatValidationFailure(issues));
      }
      stages.push({
        name: 'validate',
        seconds,
        summary: `${issues.length} issue(s)`,
      });
    } else {
      stages.push({
        name: 'validate',
        seconds,
        summary: 'skipped — validate not yet implemented (A.4 pending)',
      });
    }
  }

  // ─── 2. resolveStyle ─────────────────────────────────────────────────
  // The style pipeline gate. Throws on contract failure BEFORE the slow
  // tts/render stages burn minutes. Tolerant of A.7 partial landing only
  // for the same Phase-A reason (this very file owns it).
  let style: ResolvedStyle;
  {
    const t0 = performance.now();
    try {
      style = engine.resolveStyle(spec);
    } catch (e) {
      if (isNotImplementedSentinel(e)) {
        throw new Error(
          '[@docent/kit] cascade: resolveStyle threw "not implemented" — ' +
            'this should be impossible given A.7 is the implementer. ' +
            `Underlying: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      throw e;
    }
    const seconds = (performance.now() - t0) / 1000;
    stages.push({
      name: 'resolveStyle',
      seconds,
      summary: `preset=${style.preset}`,
    });
  }

  // ─── 3. tts ──────────────────────────────────────────────────────────
  // Synthesizes every beat. Throws a `TtsProviderError` if the provider
  // is missing or fails to initialize. The kit owns the contract; the
  // CLI layer adds caching + filesystem persistence on top.
  //
  // `opts.skipTts` short-circuits the stage entirely — useful for fast
  // visual iteration. The render still runs; the resulting mp4 is silent.
  let ttsManifest: TtsStageManifest;
  if (opts.skipTts) {
    ttsManifest = {
      providerId: 'skipped',
      voice: '',
      totalSeconds: 0,
      beats: [],
    };
    stages.push({
      name: 'tts',
      seconds: 0,
      summary: 'skipped (--skip-tts)',
    });
  } else {
    const t0 = performance.now();
    const stageOpts: Parameters<typeof runTtsStage>[2] = {};
    if (opts.cacheDir !== undefined) stageOpts.cacheDir = opts.cacheDir;
    // Persistence target — narrationFeature reads the resulting
    // `<publicDir>/audio/<filmId>/manifest.json` at render-entry generation
    // time so per-beat `<Audio>` overlays attach during the Remotion render.
    if (opts.publicDir !== undefined) stageOpts.publicDir = opts.publicDir;
    if (spec.meta?.id) stageOpts.filmId = spec.meta.id;
    ttsManifest = await runTtsStage(spec, engine, stageOpts);
    const seconds = (performance.now() - t0) / 1000;
    stages.push({
      name: 'tts',
      seconds,
      summary: `${ttsManifest.beats.length} beats · ${ttsManifest.totalSeconds.toFixed(1)}s narration · ${ttsManifest.providerId}`,
    });
  }

  // Post-TTS hook — the CLI uses this to regenerate the Remotion entry so
  // it can statically `import` the freshly-written per-film audio manifest.
  // No-op when the caller didn't supply one.
  let renderOpts: RenderOptions = opts;
  if (opts.onTtsComplete && spec.meta?.id) {
    const updatedEntry = await opts.onTtsComplete({
      publicDir: opts.publicDir,
      filmId: spec.meta.id,
    });
    if (typeof updatedEntry === 'string' && updatedEntry.length > 0) {
      renderOpts = {...opts, entryPath: updatedEntry};
    }
  }

  // ─── 4. render ───────────────────────────────────────────────────────
  const t0 = performance.now();
  const result = await runRenderStage({
    spec,
    engine,
    style,
    tts: ttsManifest,
    opts: renderOpts,
  });
  const seconds = (performance.now() - t0) / 1000;
  stages.push({name: 'render', seconds});

  // ─── 5. afterRender — feature side-effects ───────────────────────────
  // Every registered FeaturePlugin that declares an `afterRender` hook is
  // called here, in registration order. This is the slot for sidecar
  // writers — SRT captions, transcripts, chapter markers — that pair the
  // rendered mp4 with text. The hook receives per-beat TTS timings + the
  // spec's narration so a feature can build text-with-timestamps without
  // re-running TTS.
  const features = engine.features.all();
  const hasAfterRender = features.some((f) => typeof f.afterRender === 'function');
  if (hasAfterRender) {
    // Build the per-beat record once and pass it to every hook.
    const beatRecords: AfterRenderBeat[] = [];
    const beatTextLookup = new Map<string, string>();
    const sceneIdLookup = new Map<number, string | undefined>();
    const scenes: Scene[] = spec.scenes ?? [];
    for (let si = 0; si < scenes.length; si++) {
      const sc = scenes[si];
      sceneIdLookup.set(si, sc?.id);
      if (!sc || !Array.isArray(sc.beats)) continue;
      const sceneBeats = sc.beats as Beat[];
      for (let bi = 0; bi < sceneBeats.length; bi++) {
        const b = sceneBeats[bi];
        if (!b) continue;
        beatTextLookup.set(`${si}-${bi}`, b.narration ?? '');
      }
    }
    // Walk the TTS manifest first — that's the authoritative source for
    // clip duration. Beats with no narration / no TTS skip silently.
    if (ttsManifest.beats.length > 0) {
      for (const b of ttsManifest.beats) {
        const key = `${b.sceneIndex}-${b.beatIndex}`;
        const text = beatTextLookup.get(key) ?? '';
        const record: AfterRenderBeat = {
          sceneIndex: b.sceneIndex,
          beatIndex: b.beatIndex,
          seconds: b.clipSeconds,
          text,
          ...(sceneIdLookup.get(b.sceneIndex) !== undefined
            ? {sceneId: sceneIdLookup.get(b.sceneIndex)!}
            : {}),
          ...(b.beatId !== undefined ? {beatId: b.beatId} : {}),
        };
        beatRecords.push(record);
        beatTextLookup.delete(key);
      }
    } else {
      // No TTS ran (--skip-tts, or all beats silent). Synthesize estimated
      // timings from the narration text alone so captions still render:
      // ~150 wpm = 2.5 wps, with a 1s floor per beat. This is the same
      // policy the engine's narration overlay uses when audio is missing.
      for (let si = 0; si < scenes.length; si++) {
        const sc = scenes[si];
        if (!sc || !Array.isArray(sc.beats)) continue;
        const sceneBeats = sc.beats as Beat[];
        for (let bi = 0; bi < sceneBeats.length; bi++) {
          const b = sceneBeats[bi];
          if (!b) continue;
          const text = b.narration ?? '';
          const words = text.trim().split(/\s+/).filter(Boolean).length;
          const estimated = Math.max(1, words / 2.5);
          beatRecords.push({
            sceneIndex: si,
            beatIndex: bi,
            seconds: Number(estimated.toFixed(3)),
            text,
            ...(sc.id !== undefined ? {sceneId: sc.id} : {}),
            ...(b.id !== undefined ? {beatId: b.id} : {}),
          });
        }
      }
    }

    const outputDir = opts.outputDir ?? dirname(result.outPath);
    const ctx: AfterRenderContext = {
      filmSpec: spec,
      outPath: result.outPath,
      outputDir,
      style,
      beats: beatRecords,
      ttsProviderId: ttsManifest.providerId,
    };
    for (const f of features) {
      if (typeof f.afterRender !== 'function') continue;
      await f.afterRender(ctx);
    }
  }

  // Surface tts metrics in the result so the CLI can print a summary.
  return {
    outPath: result.outPath,
    durationMs: result.durationMs,
    tts: ttsManifest.beats.map((b) => ({
      sceneIndex: b.sceneIndex,
      beatIndex: b.beatIndex,
      wpm: b.wpm,
      clipSeconds: b.clipSeconds,
    })),
  };
};
