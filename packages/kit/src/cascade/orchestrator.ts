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

import type {Engine} from '../engine';
import type {
  FilmSpec,
  Issue,
  RenderOptions,
  RenderResult,
} from '../protocols';
import type {ResolvedStyle} from '../types/style';
import {runTtsStage, type TtsStageManifest} from './tts-stage';
import {runRenderStage} from './render-stage';

/** A summarized record of what each stage did — surfaced for diagnostics. */
export interface CascadeStageRecord {
  readonly name: 'validate' | 'resolveStyle' | 'tts' | 'render';
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
    ttsManifest = await runTtsStage(spec, engine, stageOpts);
    const seconds = (performance.now() - t0) / 1000;
    stages.push({
      name: 'tts',
      seconds,
      summary: `${ttsManifest.beats.length} beats · ${ttsManifest.totalSeconds.toFixed(1)}s narration · ${ttsManifest.providerId}`,
    });
  }

  // ─── 4. render ───────────────────────────────────────────────────────
  const t0 = performance.now();
  const result = await runRenderStage({
    spec,
    engine,
    style,
    tts: ttsManifest,
    opts,
  });
  const seconds = (performance.now() - t0) / 1000;
  stages.push({name: 'render', seconds});

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
