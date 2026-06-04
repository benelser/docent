// `docent score <film-id> --provider aiva|udio|suno|template`
//
// R9 — emit a timeline-annotated music-gen prompt for a film. The CLI
// is the thin shell on top of `@bjelser/core`'s `buildScorePrompt` +
// `renderScorePrompt` + `validatePromptBody`. We do NOT call the
// music-gen APIs here — gating that behind `--execute` is the deliberate
// safety; this command produces the *text* a human would paste into
// Suno's UI (or curl to AIVA's REST endpoint).
//
// The cascade:
//   1. Load spec from films/<id>.json.
//   2. Run validate (so structural errors surface BEFORE we walk the
//      schedule).
//   3. Run resolveStyle (so the engine has a complete style context;
//      we don't need the result here but we want the same gating
//      build does — a bad preset reference shouldn't yield a half-
//      baked prompt).
//   4. Load the persisted TTS manifest from
//      <publicDir>/audio/<filmId>/manifest.json if present — so the
//      schedule is keyed off real clip seconds (and per-word timings,
//      which the IR currently doesn't use but the smoke test surfaces).
//   5. Build the frame schedule.
//   6. Build the IR + render the dialect.
//   7. Run the content-filter validator. `--validate` blocks emit on
//      errors; default-mode emits but surfaces them.
//   8. Print to stdout, or write to `out/<filmId>-score-prompt.<ext>`.

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';

import {createEngine} from '../engine-factory';
import {
  buildFrameSchedule,
  type FilmSpec,
  type ScoreProvider,
  type TtsAudioMap,
} from '@bjelser/kit';
import {
  buildScorePrompt,
  renderScorePrompt,
  validatePromptBody,
} from '@bjelser/core';

export interface ScoreArgs {
  readonly filmId: string;
  readonly provider?: ScoreProvider;
  readonly write?: boolean;
  readonly validate?: boolean;
  readonly json?: boolean;
  readonly filmsDir?: string;
  readonly outputDir?: string;
  readonly projectRoot?: string;
}

// Status lines go to STDERR so `--json` and the plain-text body emission
// can own STDOUT cleanly — the smoke test parses stdout as JSON when
// `--json` is set; other consumers pipe the plain prose body straight to
// a file. The few user-visible status lines (which provider, which
// timing source) live on stderr.
const log = (s: string) => process.stderr.write(`${s}\n`);
const err = (s: string) => process.stderr.write(`${s}\n`);

const reset = '\x1b[0m';
const red = (s: string) => `\x1b[31m${s}${reset}`;
const yellow = (s: string) => `\x1b[33m${s}${reset}`;
const green = (s: string) => `\x1b[32m${s}${reset}`;
const cyan = (s: string) => `\x1b[36m${s}${reset}`;
const dim = (s: string) => `\x1b[2m${s}${reset}`;

const VALID_PROVIDERS: ReadonlyArray<ScoreProvider> = ['template', 'aiva', 'udio', 'suno'];

const isValidProvider = (s: unknown): s is ScoreProvider =>
  typeof s === 'string' && (VALID_PROVIDERS as ReadonlyArray<string>).includes(s);

export const runScore = async (args: ScoreArgs): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const filmsDir = args.filmsDir ?? join(projectRoot, 'films');
  const outputDir = args.outputDir ?? join(projectRoot, 'out');
  const specPath = resolve(filmsDir, `${args.filmId}.json`);

  if (!existsSync(specPath)) {
    err(red(`✗ films/${args.filmId}.json not found at ${specPath}`));
    return 1;
  }

  const provider: ScoreProvider = args.provider ?? 'template';
  if (!isValidProvider(provider)) {
    err(red(`✗ unknown provider "${provider}" — expected one of ${VALID_PROVIDERS.join(', ')}`));
    return 64;
  }

  const spec: FilmSpec = JSON.parse(readFileSync(specPath, 'utf-8'));
  const {engine} = await createEngine(projectRoot);

  log(cyan(`▶ docent score ${args.filmId} --provider ${provider}`));

  // 1. Pre-validate so a structural failure surfaces early. We
  // deliberately do NOT apply modifiers / preprocessSpec — the score
  // prompt is keyed off the AUTHORED scene list, not the expanded one;
  // that's the shape humans reason about and the only shape the boom
  // heuristic can meaningfully read.
  const issues = engine.validate(spec, {projectRoot});
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    err(red(`✗ spec validation failed (${errors.length} error(s)) — fix before scoring`));
    for (const e of errors.slice(0, 5)) err(red(`    ✗ ${e.path || '(root)'}: ${e.message}`));
    return 2;
  }

  // 2. resolveStyle — gate on a bad preset reference. We don't need
  // the return value yet (the IR derives its tone from style.intent
  // directly), but the resolver's gating saves a confused prompt.
  try {
    engine.resolveStyle(spec);
  } catch (e) {
    err(red(`✗ resolveStyle failed: ${(e as Error).message}`));
    return 2;
  }

  // 3. Load the persisted TTS manifest if present so the schedule's
  // beat-duration math is keyed off real audio. Absence falls through
  // to the per-beat text estimator — the IR still emits, just with
  // less precise timestamps. We print which path the cascade took.
  const manifestPath = join(projectRoot, 'public', 'audio', args.filmId, 'manifest.json');
  let ttsAudio: TtsAudioMap | undefined;
  let ttsSource = 'estimator (no manifest)';
  if (existsSync(manifestPath)) {
    try {
      const raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
        readonly beats?: Readonly<Record<string, {
          readonly sceneIndex: number;
          readonly beatIndex: number;
          readonly file: string;
          readonly seconds: number;
          readonly words?: ReadonlyArray<{readonly text: string; readonly startFrame: number; readonly endFrame: number}>;
        }>>;
      };
      if (raw.beats) {
        const map: Record<`${number}-${number}`, {file: string; seconds: number; words?: ReadonlyArray<{text: string; startFrame: number; endFrame: number}>}> = {};
        for (const beat of Object.values(raw.beats)) {
          const key = `${beat.sceneIndex}-${beat.beatIndex}` as `${number}-${number}`;
          map[key] = {
            file: beat.file,
            seconds: beat.seconds,
            ...(beat.words ? {words: beat.words} : {}),
          };
        }
        ttsAudio = map as TtsAudioMap;
        ttsSource = `manifest (${Object.keys(raw.beats).length} beats)`;
      }
    } catch {
      // fall through to estimator
    }
  }
  log(dim(`  timing source: ${ttsSource}`));

  // 4. Schedule + IR + render.
  const schedule = buildFrameSchedule(spec, engine, ttsAudio);
  const ir = buildScorePrompt(engine, spec, schedule);
  const rendered = renderScorePrompt(provider, ir);

  // 5. Content-filter pass. We screen the NARRATIVE portion only — for
  //    template that's the full body, for JSON dialects (aiva/udio/suno)
  //    that's the prose paragraph the provider's model actually reads.
  //    Otherwise legitimate JSON fields (AIVA's `forbid: ["vocals"]`)
  //    would trip the banned-term rule.
  const findings = validatePromptBody(rendered.narrative);
  const filterErrors = findings.filter((f) => f.severity === 'error');
  const filterWarnings = findings.filter((f) => f.severity === 'warning');

  log(
    dim(
      `  schedule: ${schedule.scenes.length} scenes · ${ir.durationSeconds.toFixed(1)}s · ` +
        `boom@${ir.boomAtSeconds === null ? 'none' : `${ir.boomAtSeconds.toFixed(1)}s`}`,
    ),
  );
  log(dim(`  rendered: ${rendered.wordCount} words · tone=${ir.tone}`));

  if (filterErrors.length > 0 || filterWarnings.length > 0) {
    log('');
    if (filterErrors.length > 0) {
      log(red(`  ✗ content-filter ${filterErrors.length} error(s):`));
      for (const f of filterErrors) {
        log(red(`    ✗ [${f.rule}] ${f.message}`));
        if (f.suggestion !== undefined) log(dim(`        suggest: "${f.suggestion}"`));
      }
    }
    if (filterWarnings.length > 0) {
      log(yellow(`  ⚠ content-filter ${filterWarnings.length} warning(s):`));
      for (const f of filterWarnings) {
        log(yellow(`    ⚠ [${f.rule}] ${f.message}`));
      }
    }
  }

  // --validate is strict: any error in the content-filter blocks emit.
  if (args.validate && filterErrors.length > 0) {
    log(red(`✗ validation failed — fix content-filter errors before emit`));
    return 3;
  }

  // 6. Emit. By default print body to stdout; with --write persist to
  // out/<id>-score-prompt.<ext>. We append a header comment with the
  // rationale + boom timestamp so the human reviewer has context.
  const ext = provider === 'template' ? 'txt' : 'json';
  const outPath = join(outputDir, `${args.filmId}-score-prompt.${ext}`);

  const decorated =
    provider === 'template'
      ? decorateTemplate(rendered.body, ir)
      : rendered.body;

  if (args.write) {
    if (!existsSync(dirname(outPath))) {
      mkdirSync(dirname(outPath), {recursive: true});
    }
    writeFileSync(outPath, decorated + (decorated.endsWith('\n') ? '' : '\n'));
    log(green(`✓ wrote ${outPath}`));
  } else if (args.json) {
    // JSON mode: emit the full IR + rendered body for a machine consumer.
    process.stdout.write(
      JSON.stringify(
        {
          filmId: args.filmId,
          provider,
          prompt: ir,
          rendered: {
            provider: rendered.provider,
            body: rendered.body,
            narrative: rendered.narrative,
            wordCount: rendered.wordCount,
          },
          findings,
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    log('');
    process.stdout.write(decorated + (decorated.endsWith('\n') ? '' : '\n'));
  }

  return 0;
};

/**
 * Prefix the template-body with a small docent comment block so the
 * pasted text carries the rationale + timing trace into the music-gen
 * tool's UI. JSON dialects (aiva, udio, suno) get a similar comment
 * via the body's own envelope.
 */
const decorateTemplate = (
  body: string,
  ir: {readonly filmId: string; readonly tone: string; readonly durationSeconds: number; readonly boomAtSeconds: number | null},
): string => {
  const header = [
    `# docent score prompt`,
    `# film: ${ir.filmId}`,
    `# tone: ${ir.tone}`,
    `# duration: ${ir.durationSeconds.toFixed(1)}s`,
    `# boom: ${ir.boomAtSeconds === null ? 'none (no tension → big-idea/recap handoff)' : `${ir.boomAtSeconds.toFixed(1)}s`}`,
    ``,
  ].join('\n');
  return header + body;
};
