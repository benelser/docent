#!/usr/bin/env bun
// KPI: injected tic flagged at 100% recall, <5% FP rate.
//
// Procedure (the spec):
//   1. Take an existing rendered film spec.
//   2. Create CLEAN baseline + TICKED copy where one filler transition
//      is injected into 5 randomly chosen beats.
//   3. Run `docent assert --narrative` on the BASELINE — note its
//      natural finding count (BASELINE_FP_COUNT).
//   4. Run on the TICKED copy — RECALL = (flagged_injected / 5).
//   5. FP_RATE = (flagged_not_injected_beats / total_not_injected_beats),
//      measured against the baseline.
//   6. Pass: RECALL == 100%, FP_RATE <= 5%.
//
// The injected tic is one of {totally, obviously, actually, literally,
// frankly, essentially, basically} — the filler-transitions rule's
// vocabulary. We choose a different word for each injection to ensure
// the rule recognizes the whole set, not just one word.

import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {spawnSync} from 'node:child_process';

import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const SOURCE_FILM = process.argv[2] ?? 'causal-loop-primer';
const KPI_DIR = join(REPO_ROOT, 'tests', 'narrative-kpi', 'fixtures');
const FILMS_DIR = join(REPO_ROOT, 'films');

// The closed vocabulary the filler-transitions rule recognizes.
const FILLER_WORDS = [
  'totally',
  'obviously',
  'actually',
  'literally',
  'frankly',
  'essentially',
  'basically',
] as const;

// Deterministic injection: choose a fixed random-ish set of beat indices
// + filler words. Reproducibility matters more than randomness here.
// We don't want the KPI to change between runs.
const INJECTIONS = [
  {index: 2, word: 'totally'},
  {index: 7, word: 'obviously'},
  {index: 11, word: 'literally'},
  {index: 15, word: 'essentially'},
  {index: 19, word: 'frankly'},
] as const;

interface Beat {
  id?: string;
  narration?: string;
  [k: string]: unknown;
}
interface Scene {
  type: string;
  beats?: Beat[];
  [k: string]: unknown;
}
interface FilmSpec {
  meta: {id: string; [k: string]: unknown};
  scenes: Scene[];
  [k: string]: unknown;
}

interface Sidecar {
  filmId: string;
  lint: {
    totalBeats: number;
    findings: ReadonlyArray<{
      ruleId: string;
      sceneIndex: number;
      beatIndex: number;
      match: string;
      severity: string;
    }>;
    perRule: Record<string, number>;
  };
}

/** Walk every beat in the spec; return a flat list keyed by global index. */
const flattenBeats = (
  spec: FilmSpec,
): Array<{globalIndex: number; sceneIndex: number; beatIndex: number; beat: Beat}> => {
  const out: Array<{globalIndex: number; sceneIndex: number; beatIndex: number; beat: Beat}> = [];
  let i = 0;
  spec.scenes.forEach((scene, sceneIndex) => {
    (scene.beats ?? []).forEach((beat, beatIndex) => {
      if (typeof beat.narration === 'string' && beat.narration.length > 0) {
        out.push({globalIndex: i, sceneIndex, beatIndex, beat});
        i++;
      }
    });
  });
  return out;
};

/**
 * Inject one filler word into the beat's narration in a way that *is*
 * flaggable: word-boundary intact, outside any quoted span. We prepend
 * the filler followed by a comma at the start of a randomly-picked
 * sentence — the model of how an AI tic would be added.
 */
const injectFiller = (narration: string, word: string): string => {
  // Find the first sentence boundary inside the narration; insert
  // <Capitalised word>, before the next sentence's first character.
  // If no boundary, prepend at the start.
  const sentenceBoundary = narration.search(/(?<=[.!?])\s+(?=[A-Z])/);
  const cap = word.charAt(0).toUpperCase() + word.slice(1);
  if (sentenceBoundary === -1) {
    return `${cap}, ${narration.charAt(0).toLowerCase()}${narration.slice(1)}`;
  }
  const before = narration.slice(0, sentenceBoundary + 1);
  const rest = narration.slice(sentenceBoundary + 1).trimStart();
  return `${before} ${cap}, ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`;
};

const main = (): number => {
  if (!existsSync(KPI_DIR)) mkdirSync(KPI_DIR, {recursive: true});

  const sourcePath = join(FILMS_DIR, `${SOURCE_FILM}.json`);
  if (!existsSync(sourcePath)) {
    console.error(`source film not found: ${sourcePath}`);
    return 1;
  }
  const sourceSpec = JSON.parse(readFileSync(sourcePath, 'utf-8')) as FilmSpec;

  // CLEAN baseline — just a copy under a new id so the linter sidecar
  // is keyed separately.
  const baseline = JSON.parse(JSON.stringify(sourceSpec)) as FilmSpec;
  baseline.meta.id = `${SOURCE_FILM}-baseline`;

  // TICKED — same shape, but inject filler into 5 chosen beats.
  const ticked = JSON.parse(JSON.stringify(sourceSpec)) as FilmSpec;
  ticked.meta.id = `${SOURCE_FILM}-ticked`;
  const flat = flattenBeats(ticked);
  const injectedGlobalIndices: number[] = [];
  const injectedPositions: Array<{sceneIndex: number; beatIndex: number; word: string}> = [];
  for (const {index, word} of INJECTIONS) {
    const target = flat[index];
    if (!target) {
      console.error(`injection target index ${index} out of range (max ${flat.length - 1})`);
      return 1;
    }
    const before = target.beat.narration!;
    const after = injectFiller(before, word);
    target.beat.narration = after;
    injectedGlobalIndices.push(target.globalIndex);
    injectedPositions.push({sceneIndex: target.sceneIndex, beatIndex: target.beatIndex, word});
    console.log(
      `  injected "${word}" at scene[${target.sceneIndex}].beat[${target.beatIndex}] (global #${target.globalIndex})`,
    );
  }

  // Write fixture specs into a private tests/ films-dir so the live
  // films/ directory stays clean. The CLI's --films-dir flag points it
  // at the fixtures for these runs.
  const baselinePath = join(KPI_DIR, `${SOURCE_FILM}-baseline.json`);
  const tickedPath = join(KPI_DIR, `${SOURCE_FILM}-ticked.json`);
  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n');
  writeFileSync(tickedPath, JSON.stringify(ticked, null, 2) + '\n');

  // Also write a small evidence file capturing which beats are injected.
  writeFileSync(
    join(KPI_DIR, 'injections.json'),
    JSON.stringify({sourceFilm: SOURCE_FILM, injectedPositions, injectedGlobalIndices}, null, 2) + '\n',
  );

  const runAssertNarrative = (filmId: string): Sidecar => {
    const r = spawnSync(
      'bun',
      [
        'packages/cli/src/index.ts',
        'assert',
        filmId,
        '--narrative',
        '--films-dir',
        KPI_DIR,
      ],
      {cwd: REPO_ROOT, encoding: 'utf-8'},
    );
    process.stdout.write(r.stdout);
    process.stderr.write(r.stderr);
    const sidecarPath = join(REPO_ROOT, 'out', `narrative-${filmId}.json`);
    if (!existsSync(sidecarPath)) throw new Error(`no sidecar at ${sidecarPath}`);
    return JSON.parse(readFileSync(sidecarPath, 'utf-8')) as Sidecar;
  };

  console.log('\n========================================');
  console.log('  STAGE 1 — baseline');
  console.log('========================================\n');
  const baselineSidecar = runAssertNarrative(`${SOURCE_FILM}-baseline`);

  console.log('\n========================================');
  console.log('  STAGE 2 — ticked');
  console.log('========================================\n');
  const tickedSidecar = runAssertNarrative(`${SOURCE_FILM}-ticked`);

  // ----- KPI computation --------------------------------------------------
  // RECALL: count how many of the 5 injected (sceneIndex,beatIndex)
  // positions are flagged by the `filler-transitions` rule in the ticked
  // run.
  const tickedFillerFindings = tickedSidecar.lint.findings.filter(
    (f) => f.ruleId === 'filler-transitions',
  );
  const injectedKeys = new Set(injectedPositions.map((p) => `${p.sceneIndex}:${p.beatIndex}`));
  const flaggedInjectedKeys = new Set<string>();
  const flaggedNonInjected: typeof tickedFillerFindings = [];
  for (const f of tickedFillerFindings) {
    const k = `${f.sceneIndex}:${f.beatIndex}`;
    if (injectedKeys.has(k)) {
      // Confirm the match string is *the injected word* — guards against
      // a coincidental pre-existing match colliding with an injection
      // position.
      flaggedInjectedKeys.add(k);
    } else {
      flaggedNonInjected.push(f);
    }
  }

  const totalBeatsTicked = tickedSidecar.lint.totalBeats;
  const baselineFpCount = baselineSidecar.lint.findings.filter(
    (f) => f.ruleId === 'filler-transitions',
  ).length;

  const recall = flaggedInjectedKeys.size / INJECTIONS.length;

  // FP_RATE definition per the spec:
  //   "FP_RATE = (flagged_not_injected / total_beats_not_injected)
  //    measured against the baseline FP count"
  //
  // Two readings — we report both:
  //   (a) raw FP rate on the ticked run: count beats flagged that were
  //       NOT in the injected set, divided by (totalBeats - 5).
  //   (b) net-new FP rate: subtract out the baseline's natural matches
  //       so a pre-existing "actually" in beat 3 doesn't count as a tool
  //       false-positive — it's a real (latent) finding.
  const nonInjectedBeats = totalBeatsTicked - INJECTIONS.length;
  const flaggedNonInjectedBeats = new Set(
    flaggedNonInjected.map((f) => `${f.sceneIndex}:${f.beatIndex}`),
  ).size;
  const rawFpRate = flaggedNonInjectedBeats / nonInjectedBeats;
  const netNewFlaggedNonInjected = Math.max(0, flaggedNonInjectedBeats - baselineFpCount);
  const netNewFpRate = netNewFlaggedNonInjected / nonInjectedBeats;

  console.log('\n========================================');
  console.log('  KPI VERDICT');
  console.log('========================================');
  console.log(`  source film:                 ${SOURCE_FILM}`);
  console.log(`  total beats (ticked):        ${totalBeatsTicked}`);
  console.log(`  injected positions:          ${INJECTIONS.length}`);
  console.log(`  baseline natural matches:    ${baselineFpCount}`);
  console.log(`  ticked filler matches:       ${tickedFillerFindings.length}`);
  console.log(`  flagged-injected:            ${flaggedInjectedKeys.size}/${INJECTIONS.length}`);
  console.log(`  flagged-non-injected beats:  ${flaggedNonInjectedBeats}`);
  console.log(`  net-new FP (subtract base):  ${netNewFlaggedNonInjected}`);
  console.log();
  console.log(`  RECALL:                      ${(recall * 100).toFixed(1)}%`);
  console.log(`  FP_RATE (raw):               ${(rawFpRate * 100).toFixed(2)}%`);
  console.log(`  FP_RATE (net-new vs base):   ${(netNewFpRate * 100).toFixed(2)}%`);
  console.log();
  const recallOk = recall >= 1.0;
  const fpOk = netNewFpRate <= 0.05;
  console.log(`  PASS criterion: RECALL == 100% AND FP_RATE (net-new) <= 5%`);
  console.log(`  recall:   ${recallOk ? 'PASS' : 'FAIL'}`);
  console.log(`  fp_rate:  ${fpOk ? 'PASS' : 'FAIL'}`);
  console.log(`  OVERALL:  ${recallOk && fpOk ? 'PASS' : 'FAIL'}`);
  console.log();

  // Write KPI sidecar for the report.
  writeFileSync(
    join(KPI_DIR, 'kpi-result.json'),
    JSON.stringify(
      {
        sourceFilm: SOURCE_FILM,
        totalBeatsTicked,
        injections: INJECTIONS,
        baselineFpCount,
        tickedFillerMatches: tickedFillerFindings.length,
        flaggedInjected: flaggedInjectedKeys.size,
        flaggedNonInjectedBeats,
        netNewFlaggedNonInjected,
        recall,
        rawFpRate,
        netNewFpRate,
        recallPass: recallOk,
        fpRatePass: fpOk,
        overallPass: recallOk && fpOk,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );

  return recallOk && fpOk ? 0 : 2;
};

process.exit(main());
