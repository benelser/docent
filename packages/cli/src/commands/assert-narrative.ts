// `docent assert <film-id> --narrative` — narrative-quality cascade.
//
// THE INVARIANT (named verbatim):
//
//   "A film's narration must not drift off the surveyed voice, and must
//    not invent numbers the diagram disagrees with."
//
// The pixel-diff assert (assert.ts) catches a "rings overlap saturn"
// regression — the visual ground truth. This module catches the failure
// mode pixel-diff cannot see: a beat that *says* "the rings overlap"
// when the structure scene's nodes say otherwise; a beat that drifts
// from terse documentary register into TED-talk uplift; a beat that
// restates the diagram instead of adding meaning over it.
//
// Two stages:
//
//   1. LINT (always runs) — regex/structural checks via
//      `@bjelser/core/narrative-quality`. Zero tokens. Gateable in CI.
//   2. JUDGES (opt-in, --judges) — LLM-backed voice / accuracy /
//      viz-placement checks via a registered NarrativeJudgeProvider.
//      Auto-skipped when no API key — the cascade still prints a
//      verdict, but the judge rows say SKIP.
//
// VERDICT
//
//   - PASS    — every category reported PASS.
//   - HUMAN   — accuracy mismatch or viz suggestion, no REJECT.
//   - REJECT  — any rule at severity 'warn' or 'error' or any judge
//               category that returned a definitive failure.
//
// Exit codes: 0 PASS, 2 REJECT, 3 HUMAN_REVIEW, 1 missing inputs.

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

import type {FilmSpec, JudgeInput, JudgeOutput, NarrativeJudgeProvider} from '@bjelser/kit';
import {
  lintFilmNarration,
  noopJudgeProvider,
  type BeatLintFinding,
  type LintFilmInput,
} from '@bjelser/core';

const log = (s: string) => process.stdout.write(`${s}\n`);
const reset = '\x1b[0m';
const red = (s: string) => `\x1b[31m${s}${reset}`;
const yellow = (s: string) => `\x1b[33m${s}${reset}`;
const green = (s: string) => `\x1b[32m${s}${reset}`;
const dim = (s: string) => `\x1b[2m${s}${reset}`;
const cyan = (s: string) => `\x1b[36m${s}${reset}`;
const bold = (s: string) => `\x1b[1m${s}${reset}`;

export interface AssertNarrativeArgs {
  readonly filmId: string;
  readonly filmsDir?: string;
  readonly projectRoot?: string;
  readonly outputDir?: string;
  /** Opt-in: run the LLM judges. Defaults to false. */
  readonly judges?: boolean;
  /** Judge provider id; defaults to `'noop'`. `--judge-provider openai`. */
  readonly judgeProvider?: string;
  /** Cap on beats sampled by each judge (cost guard). Default 20. */
  readonly judgeBeatLimit?: number;
}

type Category = 'lint' | 'voice' | 'accuracy' | 'viz';
type CategoryVerdict = 'PASS' | 'HUMAN' | 'REJECT' | 'SKIP';

interface CategoryRow {
  readonly category: Category;
  readonly verdict: CategoryVerdict;
  readonly summary: string;
}

/**
 * Pull every beat with narration out of a spec into the flat shape the
 * lint runner consumes.
 */
const flattenSpec = (spec: FilmSpec): LintFilmInput => ({
  scenes: spec.scenes.map((scene, sceneIndex) => {
    const beats = (scene.beats ?? []).map((beat, beatIndex) => ({
      beatIndex,
      narration: typeof beat.narration === 'string' ? beat.narration : '',
    }));
    const heading =
      typeof (scene as {heading?: string}).heading === 'string'
        ? (scene as {heading?: string}).heading
        : typeof (scene as {kicker?: string}).kicker === 'string'
          ? (scene as {kicker?: string}).kicker
          : undefined;
    return {
      sceneIndex,
      type: scene.type,
      ...(heading !== undefined ? {heading} : {}),
      beats,
    };
  }),
});

/** Built-in providers we know how to construct from the CLI without docent.config.ts. */
const resolveJudgeProvider = async (
  id: string | undefined,
): Promise<{provider: NarrativeJudgeProvider; note: string}> => {
  if (!id || id === 'noop') {
    return {provider: noopJudgeProvider, note: 'noop — pass --judge-provider openai for real grading'};
  }
  if (id === 'openai') {
    try {
      const mod = await import('@bjelser/tts-openai');
      const provider = (mod as any).openaiNarrativeJudgeProvider as NarrativeJudgeProvider;
      if (!provider) throw new Error('openaiNarrativeJudgeProvider not exported');
      const hasKey = typeof process !== 'undefined' && process.env.OPENAI_API_KEY;
      return {
        provider,
        note: hasKey ? `openai (${provider.displayName})` : 'openai — OPENAI_API_KEY missing; will SKIP every beat',
      };
    } catch (err) {
      log(yellow(`⚠ failed to load @bjelser/tts-openai (${(err as Error).message}); falling back to noop`));
      return {provider: noopJudgeProvider, note: 'noop (fallback)'};
    }
  }
  log(yellow(`⚠ unknown judge provider "${id}"; falling back to noop`));
  return {provider: noopJudgeProvider, note: 'noop (fallback)'};
};

const formatRow = (r: CategoryRow): string => {
  const mark =
    r.verdict === 'PASS'
      ? green('PASS  ')
      : r.verdict === 'SKIP'
        ? yellow('SKIP  ')
        : r.verdict === 'HUMAN'
          ? yellow('HUMAN ')
          : red('REJECT');
  return `  ${r.category.padEnd(10)} ${mark}  ${dim(r.summary)}`;
};

const lintToVerdict = (findings: ReadonlyArray<BeatLintFinding>): CategoryVerdict => {
  const sev = (s: BeatLintFinding['severity']): 'error' | 'warn' | 'info' => s;
  const hasError = findings.some((f) => sev(f.severity) === 'error' || sev(f.severity) === 'warn');
  if (hasError) return 'REJECT';
  if (findings.length > 0) return 'HUMAN';
  return 'PASS';
};

const judgeOutputsToVerdict = (
  outputs: ReadonlyArray<JudgeOutput>,
  category: Category,
): {verdict: CategoryVerdict; summary: string} => {
  if (outputs.length === 0) return {verdict: 'SKIP', summary: 'no beats sampled'};
  const allSkipped = outputs.every((o) => o.skipped);
  if (allSkipped) {
    const reason = outputs[0]?.skippedReason ?? 'skipped';
    return {verdict: 'SKIP', summary: `skipped (${reason})`};
  }
  if (category === 'voice') {
    const drifts = outputs.filter(
      (o) => o.kind === 'voice' && !o.skipped && (o as any).authentic === false,
    ) as Array<JudgeOutput & {drift?: string | null}>;
    if (drifts.length === 0) return {verdict: 'PASS', summary: '0 drift'};
    return {verdict: 'REJECT', summary: `${drifts.length} drift beat(s)`};
  }
  if (category === 'accuracy') {
    let mismatchCount = 0;
    for (const o of outputs) {
      if (o.kind === 'accuracy' && !o.skipped && o.consistent === false) {
        mismatchCount += o.mismatches.length || 1;
      }
    }
    if (mismatchCount === 0) return {verdict: 'PASS', summary: '0 mismatches'};
    return {verdict: 'HUMAN', summary: `${mismatchCount} numeric mismatch(es)`};
  }
  // viz
  const redundant = outputs.filter((o) => o.kind === 'viz-placement' && !o.skipped && o.redundant);
  if (redundant.length === 0) return {verdict: 'PASS', summary: 'no suggestions'};
  return {verdict: 'HUMAN', summary: `${redundant.length} redundancy suggestion(s)`};
};

const overallVerdict = (rows: ReadonlyArray<CategoryRow>): {verdict: CategoryVerdict; exitCode: number} => {
  if (rows.some((r) => r.verdict === 'REJECT')) return {verdict: 'REJECT', exitCode: 2};
  if (rows.some((r) => r.verdict === 'HUMAN')) return {verdict: 'HUMAN', exitCode: 3};
  return {verdict: 'PASS', exitCode: 0};
};

const printLintTable = (
  findings: ReadonlyArray<BeatLintFinding>,
  spec: FilmSpec,
): void => {
  if (findings.length === 0) {
    log(dim('  no lint findings'));
    return;
  }
  // Group by scene
  const bySceneMap = new Map<number, BeatLintFinding[]>();
  for (const f of findings) {
    if (!bySceneMap.has(f.sceneIndex)) bySceneMap.set(f.sceneIndex, []);
    bySceneMap.get(f.sceneIndex)!.push(f);
  }
  const ordered = [...bySceneMap.entries()].sort((a, b) => a[0] - b[0]);
  for (const [sceneIndex, group] of ordered) {
    const scene = spec.scenes[sceneIndex];
    const sceneLabel = `scene[${sceneIndex}] ${scene?.type ?? '?'}${
      typeof (scene as any)?.heading === 'string' ? ` — "${(scene as any).heading}"` : ''
    }`;
    log('');
    log(cyan(`  ${sceneLabel}`));
    log(dim(`    ${'beat'.padEnd(4)}  ${'rule'.padEnd(22)}  ${'sev'.padEnd(5)}  match`));
    for (const f of group) {
      const sevStr =
        f.severity === 'warn' ? yellow('WARN ') : f.severity === 'error' ? red('ERROR') : dim('info ');
      log(
        `    ${String(f.beatIndex).padEnd(4)}  ${f.ruleId.padEnd(22)}  ${sevStr}  ${f.match}`,
      );
      if (f.suggestion) log(dim(`         → ${f.suggestion}`));
    }
  }
};

export const runAssertNarrative = async (args: AssertNarrativeArgs): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const filmsDir = args.filmsDir ?? join(projectRoot, 'films');
  const outputDir = args.outputDir ?? join(projectRoot, 'out');
  const specPath = resolve(filmsDir, `${args.filmId}.json`);

  log(cyan(`▶ docent assert ${args.filmId} --narrative`));
  log(
    dim(
      `  the invariant: narration must not drift voice and must not invent numbers the scene disagrees with`,
    ),
  );

  if (!existsSync(specPath)) {
    log(red(`✗ films/${args.filmId}.json not found at ${specPath}`));
    return 1;
  }
  let spec: FilmSpec;
  try {
    spec = JSON.parse(readFileSync(specPath, 'utf-8')) as FilmSpec;
  } catch (err) {
    log(red(`✗ failed to parse ${specPath}: ${(err as Error).message}`));
    return 1;
  }

  // ----- LINT stage --------------------------------------------------------
  log(cyan('▶ lint stage  (regex / structural)'));
  const flat = flattenSpec(spec);
  const lint = lintFilmNarration(flat);
  printLintTable(lint.findings, spec);
  log('');
  log(
    dim(
      `  beats walked: ${lint.totalBeats} · findings: ${lint.findings.length} · per-rule: ${JSON.stringify(lint.perRule)}`,
    ),
  );

  const lintVerdict = lintToVerdict(lint.findings);
  const lintSummary =
    lint.findings.length === 0
      ? 'clean'
      : Object.entries(lint.perRule)
          .map(([k, v]) => `${v} ${k}`)
          .join(', ');

  const rows: CategoryRow[] = [
    {category: 'lint', verdict: lintVerdict, summary: lintSummary},
  ];

  // ----- JUDGES stage ------------------------------------------------------
  let voiceOut: JudgeOutput[] = [];
  let accuracyOut: JudgeOutput[] = [];
  let vizOut: JudgeOutput[] = [];

  if (args.judges) {
    log('');
    log(cyan('▶ judges stage  (LLM)'));
    const {provider, note} = await resolveJudgeProvider(args.judgeProvider);
    log(dim(`  judge provider: ${note}`));

    // Sampling: judge at most N beats per category to bound cost.
    const limit = args.judgeBeatLimit ?? 20;
    const allBeats: Array<{sceneIndex: number; beatIndex: number; narration: string; scene: any}> = [];
    spec.scenes.forEach((scene, sceneIndex) => {
      (scene.beats ?? []).forEach((beat, beatIndex) => {
        if (typeof beat.narration === 'string' && beat.narration.trim().length > 0) {
          allBeats.push({sceneIndex, beatIndex, narration: beat.narration, scene});
        }
      });
    });
    const sampled = allBeats.slice(0, limit);
    if (allBeats.length > limit) {
      log(dim(`  sampling first ${limit} of ${allBeats.length} beats (cost cap)`));
    }

    const domain = {
      ...(typeof spec.meta.mode === 'string' ? {mode: spec.meta.mode} : {}),
      ...(typeof (spec.meta as any).subject === 'string' ? {subject: (spec.meta as any).subject} : {}),
      ...(typeof spec.meta.register === 'string' ? {register: spec.meta.register} : {}),
    };

    const buildInput = (
      kind: JudgeInput['kind'],
      b: (typeof allBeats)[number],
    ): JudgeInput => {
      const heading =
        typeof (b.scene as {heading?: string}).heading === 'string'
          ? (b.scene as {heading?: string}).heading
          : typeof (b.scene as {kicker?: string}).kicker === 'string'
            ? (b.scene as {kicker?: string}).kicker
            : undefined;
      const sceneCluster = (b.scene.beats ?? [])
        .map((bb: any) => bb.narration)
        .filter((s: any) => typeof s === 'string' && s.length > 0);
      // For accuracy, pass the whole scene spec (sans beats) as sceneData.
      const {beats: _omit, ...sceneRest} = b.scene as Record<string, unknown>;
      return {
        kind,
        filmId: spec.meta.id,
        sceneIndex: b.sceneIndex,
        beatIndex: b.beatIndex,
        sceneType: String(b.scene.type),
        ...(heading !== undefined ? {sceneHeading: heading} : {}),
        narration: b.narration,
        sceneCluster,
        sceneData: sceneRest as Record<string, unknown>,
        ...(Object.keys(domain).length > 0 ? {domain} : {}),
      };
    };

    // We keep each output paired with its scene/beat position so the
    // diagnostic lines below can name the offending beat — the JudgeOutput
    // shape itself is position-agnostic.
    const judgeWithPosition = async (
      kind: JudgeInput['kind'],
    ): Promise<Array<{output: JudgeOutput; sceneIndex: number; beatIndex: number}>> =>
      Promise.all(
        sampled.map(async (b) => ({
          sceneIndex: b.sceneIndex,
          beatIndex: b.beatIndex,
          output: await provider.judge(buildInput(kind, b)),
        })),
      );

    log(dim(`  voice: ${sampled.length} beat(s)`));
    const voicePairs = await judgeWithPosition('voice');
    voiceOut = voicePairs.map((p) => p.output);
    log(dim(`  accuracy: ${sampled.length} beat(s)`));
    const accuracyPairs = await judgeWithPosition('accuracy');
    accuracyOut = accuracyPairs.map((p) => p.output);
    log(dim(`  viz: ${sampled.length} beat(s)`));
    const vizPairs = await judgeWithPosition('viz-placement');
    vizOut = vizPairs.map((p) => p.output);

    // Surface drift / mismatch evidence inline
    for (const p of voicePairs) {
      const o = p.output;
      if (o.kind === 'voice' && !o.skipped && o.authentic === false) {
        log(red(`    voice drift at scene[${p.sceneIndex}].beat[${p.beatIndex}]: ${o.drift ?? 'unknown'}`));
        for (const e of o.evidence.slice(0, 2)) log(dim(`      "${e}"`));
      }
    }
    for (const p of accuracyPairs) {
      const o = p.output;
      if (o.kind === 'accuracy' && !o.skipped && o.consistent === false) {
        for (const m of o.mismatches) {
          log(
            yellow(
              `    accuracy mismatch at scene[${p.sceneIndex}].beat[${p.beatIndex}]: "${m.narrationClaim}" vs "${m.sceneTruth}"`,
            ),
          );
        }
      }
    }
    for (const p of vizPairs) {
      const o = p.output;
      if (o.kind === 'viz-placement' && !o.skipped && o.redundant) {
        log(
          yellow(
            `    viz redundancy at scene[${p.sceneIndex}].beat[${p.beatIndex}]: ${o.redundantPhrase ?? '(no phrase)'} — ${o.suggestion ?? ''}`,
          ),
        );
      }
    }

    rows.push({
      category: 'voice',
      ...judgeOutputsToVerdict(voiceOut, 'voice'),
    });
    rows.push({
      category: 'accuracy',
      ...judgeOutputsToVerdict(accuracyOut, 'accuracy'),
    });
    rows.push({
      category: 'viz',
      ...judgeOutputsToVerdict(vizOut, 'viz'),
    });
  }

  // ----- VERDICT -----------------------------------------------------------
  log('');
  log(bold(cyan('NARRATIVE GATE')));
  for (const r of rows) log(formatRow(r));
  const {verdict, exitCode} = overallVerdict(rows);
  const verdictColor = verdict === 'PASS' ? green : verdict === 'HUMAN' ? yellow : red;
  log('');
  log(`  verdict:    ${verdictColor(verdict)}`);

  // Write a JSON sidecar.
  try {
    if (!existsSync(outputDir)) mkdirSync(outputDir, {recursive: true});
    const sidecarPath = join(outputDir, `narrative-${args.filmId}.json`);
    const sidecar = {
      filmId: args.filmId,
      generatedAt: new Date().toISOString(),
      lint: {
        totalBeats: lint.totalBeats,
        findings: lint.findings,
        perRule: lint.perRule,
      },
      judges: args.judges
        ? {
            voice: voiceOut,
            accuracy: accuracyOut,
            viz: vizOut,
          }
        : null,
      categories: rows,
      verdict,
    };
    writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2) + '\n');
    log(dim(`  sidecar: ${sidecarPath}`));
  } catch (err) {
    log(yellow(`⚠ failed to write sidecar: ${(err as Error).message}`));
  }

  return exitCode;
};
