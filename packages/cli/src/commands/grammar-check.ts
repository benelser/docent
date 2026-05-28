// `docent grammar-check` — the closed-grammar invariant for the 29-scene
// library (and any third-party packs registered alongside it).
//
// THE INVARIANTS, named verbatim:
//
//   1. COVERAGE — every registered ScenePlugin's `sceneType` appears in
//      at least one demo film in the cover set. A scene plugin nobody
//      ever uses is dead weight; a scene plugin nobody can use is a bug.
//
//   2. TAXONOMY — every registered ScenePlugin declares a `cluster` field
//      from the CLOSED 7-cluster taxonomy (or `null` for chrome scenes
//      that bracket the film without a cognitive move). The recommender
//      and the agent layer navigate by these clusters; a missing or
//      typo'd cluster breaks scene-fit.
//
//   3. PIPELINE — every film in the cover set survives the full cascade
//      (validate → render → render-check). If any film either validates
//      red or trips render-check (a scene's body never evolves), the
//      grammar-check fails — the contract is "all scenes work, end to
//      end."
//
// The cover set is a minimum-union of demo films chosen so each of the
// 29 canonical scene types appears at least once. The set is small (5
// films today) so the full pass runs in minutes, not hours.

import {existsSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

import {createEngine} from '../engine-factory';
import {runRenderCheck} from './render-check';
import {
  COGNITIVE_CLUSTERS,
  isCognitiveCluster,
  type FilmSpec,
} from '@bjelser/kit';

const log = (s: string) => process.stdout.write(`${s}\n`);
const reset = '\x1b[0m';
const red = (s: string) => `\x1b[31m${s}${reset}`;
const yellow = (s: string) => `\x1b[33m${s}${reset}`;
const green = (s: string) => `\x1b[32m${s}${reset}`;
const dim = (s: string) => `\x1b[2m${s}${reset}`;
const cyan = (s: string) => `\x1b[36m${s}${reset}`;
const bold = (s: string) => `\x1b[1m${s}${reset}`;

/**
 * The minimum-union cover set. Each of the 29 canonical scene types
 * appears in AT LEAST one of these films. The union is checked at runtime
 * — if a third-party pack registers a new scene plugin and no film in
 * this list exercises it, the COVERAGE invariant reports it.
 */
const DEFAULT_COVER_SET: ReadonlyArray<string> = [
  'grammar-check',           // 15 canonical scenes — the kitchen sink
  'rhetorical-primer',       // epigraph · concession · objection · provocation
  'sprint-b-composition-demo', // big-idea · journey-map · landscape · mechanism · timeline · tree · venn
  'causal-loop-primer',      // causal-loop
  'multi-region-db',         // map
  'prior-art-primer',        // prior-art (a small standalone primer)
];

export interface GrammarCheckArgs {
  /** Override the cover-set film ids. Default: the 5-film minimum union. */
  readonly films?: ReadonlyArray<string>;
  /** Render scale (passed through to render-check). Default 0.25. */
  readonly scale?: number;
  /** Skip the TTS stage. Default true (this is a structural check, not a TTS check). */
  readonly skipTts?: boolean;
  /** Override the films/ dir. */
  readonly filmsDir?: string;
  /** Override the output dir. */
  readonly outputDir?: string;
  /** Override the project root. */
  readonly projectRoot?: string;
}

interface SceneCoverage {
  readonly sceneType: string;
  readonly pluginName: string;
  readonly cluster: string | null | undefined;
  readonly clusterValid: boolean;
  readonly films: ReadonlyArray<string>;
}

/**
 * Walk every object in a value, recording each `{type: string}` we see.
 * Catches top-level `spec.scenes[].type` AND embedded scenes nested in
 * `embed:` slots (Sprint B's compositional grammar — a `compare.rows[].cells[].embed`
 * scene is a real exercise of that plugin's tableau renderer, so it
 * counts toward coverage even though it isn't a top-level scene).
 */
const walkTypes = (value: unknown, out: Set<string>): void => {
  if (Array.isArray(value)) {
    for (const v of value) walkTypes(v, out);
    return;
  }
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    if (typeof rec.type === 'string') out.add(rec.type);
    for (const v of Object.values(rec)) walkTypes(v, out);
  }
};

const readFilmTypes = (filmsDir: string, filmId: string): Set<string> => {
  const p = join(filmsDir, `${filmId}.json`);
  if (!existsSync(p)) return new Set();
  const spec: FilmSpec = JSON.parse(readFileSync(p, 'utf-8'));
  const types = new Set<string>();
  walkTypes(spec.scenes ?? [], types);
  return types;
};

export const runGrammarCheck = async (
  args: GrammarCheckArgs,
): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const filmsDir = args.filmsDir ?? join(projectRoot, 'films');
  const cover = args.films ?? DEFAULT_COVER_SET;

  log(cyan(`▶ docent grammar-check`));
  log(dim('  three invariants: coverage · taxonomy · pipeline'));

  // ─── 1. Build the engine and inventory registered scene plugins ───────
  const {engine, configPath, userPlugins} = await createEngine(projectRoot);
  const plugins = engine.scenes.all();
  log(
    dim(
      `  engine: ${plugins.length} scene plugins` +
        (configPath ? ` (+${userPlugins.length} from ${configPath})` : ''),
    ),
  );

  // ─── 2. TAXONOMY — every plugin declares a valid cluster ──────────────
  //
  //    `cluster: null` is allowed and reserved for chrome scenes (frame,
  //    recap) that bracket the film without performing a cognitive move.
  //    Any string that isn't in the closed 7-cluster taxonomy is a bug.
  const taxonomyErrors: string[] = [];
  for (const p of plugins) {
    const cl = p.cluster as string | null | undefined;
    if (cl === null) continue; // chrome scene — allowed
    if (cl === undefined) {
      taxonomyErrors.push(
        `${p.name} (sceneType=${p.sceneType}): missing 'cluster' field`,
      );
      continue;
    }
    if (!isCognitiveCluster(cl)) {
      taxonomyErrors.push(
        `${p.name} (sceneType=${p.sceneType}): cluster='${cl}' is not in the closed taxonomy ` +
          `(allowed: ${COGNITIVE_CLUSTERS.join(', ')} | null)`,
      );
    }
  }

  // ─── 3. COVERAGE — build the per-scene → demo-film map ────────────────
  const filmTypesMap = new Map<string, Set<string>>();
  for (const filmId of cover) {
    filmTypesMap.set(filmId, readFilmTypes(filmsDir, filmId));
  }
  const sceneCoverage: SceneCoverage[] = plugins
    .map((p) => {
      const cl = p.cluster as string | null | undefined;
      const films: string[] = [];
      for (const filmId of cover) {
        if (filmTypesMap.get(filmId)?.has(p.sceneType)) films.push(filmId);
      }
      return {
        sceneType: p.sceneType,
        pluginName: p.name,
        cluster: cl,
        clusterValid: cl === null || (typeof cl === 'string' && isCognitiveCluster(cl)),
        films,
      };
    })
    .sort((a, b) => a.sceneType.localeCompare(b.sceneType));

  const uncovered = sceneCoverage.filter((s) => s.films.length === 0);

  // ─── 4. PIPELINE — run render-check across the cover set ──────────────
  log('');
  log(cyan('──── pipeline: render-check across the cover set ────'));
  log('');
  const renderResults: Array<{filmId: string; code: number}> = [];
  for (const filmId of cover) {
    log(cyan(`  ──── ${filmId} ────`));
    const filmPath = join(filmsDir, `${filmId}.json`);
    if (!existsSync(filmPath)) {
      log(red(`    ✗ film not found at ${filmPath} — skipping`));
      renderResults.push({filmId, code: 1});
      continue;
    }
    const code = await runRenderCheck({
      filmId,
      ...(args.scale !== undefined ? {scale: args.scale} : {scale: 0.25}),
      ...(args.skipTts !== undefined ? {skipTts: args.skipTts} : {skipTts: true}),
      ...(args.filmsDir ? {filmsDir: args.filmsDir} : {}),
      ...(args.outputDir ? {outputDir: args.outputDir} : {}),
      ...(args.projectRoot ? {projectRoot: args.projectRoot} : {}),
    });
    renderResults.push({filmId, code});
    log('');
  }

  // ─── 5. Print the verdicts ────────────────────────────────────────────
  log(cyan('──── grammar-check verdict ────'));
  log('');

  // Taxonomy
  log(bold(`  TAXONOMY  (every plugin in the closed 7-cluster set)`));
  if (taxonomyErrors.length === 0) {
    log(green(`    ✓ all ${plugins.length} plugins declare a valid cluster`));
  } else {
    log(red(`    ✗ ${taxonomyErrors.length} taxonomy violation(s):`));
    for (const e of taxonomyErrors) log(red(`        ${e}`));
  }
  log('');

  // Coverage
  log(bold(`  COVERAGE  (every plugin used by at least one demo film)`));
  for (const s of sceneCoverage) {
    const clusterTag = s.cluster === null ? dim('(chrome)') : dim(`(${s.cluster})`);
    const filmList =
      s.films.length === 0
        ? red('UNCOVERED')
        : dim(s.films.join(', '));
    const mark = s.films.length === 0 ? red('✗') : green('✓');
    log(`    ${mark} ${s.sceneType.padEnd(13)} ${clusterTag.padEnd(20)} ${filmList}`);
  }
  log('');
  if (uncovered.length === 0) {
    log(green(`    ✓ every registered scene type appears in the cover set`));
  } else {
    log(
      red(
        `    ✗ ${uncovered.length} scene(s) uncovered: ${uncovered.map((s) => s.sceneType).join(', ')}`,
      ),
    );
  }
  log('');

  // Pipeline
  log(bold(`  PIPELINE  (cover-set renders through @bjelser/cli + render-check)`));
  for (const r of renderResults) {
    const mark = r.code === 0 ? green('✓') : red('✗');
    log(`    ${mark} ${r.filmId}${r.code !== 0 ? red(`  (exit ${r.code})`) : ''}`);
  }
  log('');

  const pipelinePassed = renderResults.every((r) => r.code === 0);
  const allPassed =
    taxonomyErrors.length === 0 && uncovered.length === 0 && pipelinePassed;

  log('');
  if (allPassed) {
    log(green(`✓ grammar-check PASSED — all 29 scenes work, end to end`));
    return 0;
  }
  log(red(`✗ grammar-check FAILED`));
  if (taxonomyErrors.length > 0)
    log(red(`  · ${taxonomyErrors.length} taxonomy violation(s)`));
  if (uncovered.length > 0)
    log(red(`  · ${uncovered.length} scene type(s) uncovered by demo films`));
  if (!pipelinePassed) {
    const failed = renderResults.filter((r) => r.code !== 0);
    log(red(`  · ${failed.length} film(s) failed the pipeline`));
  }
  return 5;
};
