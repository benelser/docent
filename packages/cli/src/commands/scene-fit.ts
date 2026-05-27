// docent scene-fit — the agent-facing introspection surface over the scene
// grammar.
//
// docent ships a closed grammar of 29 canonical scene types in @docent/core
// (organized by the kit's closed 7-cluster cognitive taxonomy), but the
// agent has no CLI handle to ask "given this subject's survey, which scene
// types fit?" without one. Without it, the agent reflex-defaults to
// frame/structure/compare/tension/recap on every film — the suspected
// "default rut" that produces tour-shaped specs instead of reviews. This
// subcommand closes that loop.
//
//   docent scene-fit list [--json]
//     enumerates registered scene plugins grouped by cognitive cluster,
//     with the "reach for it when" cue each plugin advertises.
//
//   docent scene-fit recommend <subject-id> [--json] [--top N]
//     reads analysis/<id>.md, runs a rule-based survey→scene-type mapper
//     against each plugin's advertised signal needles, and prints the top
//     N recommendations with rationales tying each pick to a specific
//     match. NOT an LLM call. The default top=8 matches a typical 6-8
//     scene film.
//
// REGISTRY-DRIVEN: this command has no hardcoded knowledge of the 29
// canonical scene types. The cue + signal list are advertised at the
// plugin level (ScenePlugin.cue, ScenePlugin.signals — see
// @docent/kit/protocols.ts). A third-party pack registered via
// docent.config.ts participates exactly the same way @docent/core's 29
// scenes do; no fork, no PR into this file.

import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

import type {Engine, ScenePlugin} from '@docent/kit';

import {createEngine} from '../engine-factory';

// The "default rut" — the five scene types an undirected agent reflex-defaults
// to on every film, regardless of subject. If the recommender returns *only*
// members of this set in the top N, the caller should consider whether the
// subject actually demands one of the more specific primitives. This set is
// intentionally hardcoded (not derived from the registry) — it's the
// recommender's anti-overfit signal, not a property of any individual plugin.
const DEFAULT_RUT: ReadonlySet<string> = new Set([
  'frame',
  'structure',
  'compare',
  'tension',
  'recap',
]);

// ----- the mapper ------------------------------------------------------------

type EffectiveSignal = {
  readonly needle: string;
  readonly scene: string;
  readonly weight: number;
};

export type SceneRecommendation = {
  scene: string;
  cluster: string;
  score: number;
  matched: string[];
  rationale: string;
};

export type RecommendResult = {
  id: string;
  recommendations: SceneRecommendation[];
  warningOnDefault: boolean;
  notes: string[];
};

/**
 * Build the recommender's signal table at runtime from the engine's
 * registered scene plugins. Each plugin's `signals` array contributes
 * its own (needle, weight) entries; plugins that omit `signals` simply
 * don't vote. This is the registry-driven path — there is no hardcoded
 * fallback list any more.
 */
const buildEffectiveSignals = (engine: Engine): EffectiveSignal[] => {
  const out: EffectiveSignal[] = [];
  for (const p of engine.scenes.all() as ReadonlyArray<ScenePlugin>) {
    if (!p.signals) continue;
    for (const s of p.signals) {
      out.push({
        needle: s.needle.toLowerCase(),
        scene: p.sceneType,
        weight: s.weight,
      });
    }
  }
  return out;
};

const scoreSurvey = (
  body: string,
  signals: ReadonlyArray<EffectiveSignal>,
  knownTypes: ReadonlySet<string>,
): {scores: Record<string, number>; matches: Record<string, string[]>} => {
  const scores: Record<string, number> = {};
  const matches: Record<string, string[]> = {};
  for (const t of knownTypes) {
    scores[t] = 0;
    matches[t] = [];
  }
  const haystack = body.toLowerCase();
  for (const s of signals) {
    if (haystack.includes(s.needle)) {
      if (scores[s.scene] === undefined) {
        scores[s.scene] = 0;
        matches[s.scene] = [];
      }
      scores[s.scene]! += s.weight;
      matches[s.scene]!.push(s.needle);
    }
  }
  return {scores, matches};
};

const detectMode = (source: string): 'pr' | 'ar' | 'ex' | undefined => {
  const head = source.split('\n').slice(0, 80).join('\n');
  const m = head.match(/(?:^|\n)\s*(?:#+\s*)?[Mm]ode\s*[:=]\s*(pr|ar|ex)\b/);
  return m ? (m[1] as 'pr' | 'ar' | 'ex') : undefined;
};

/**
 * Resolve a scene's cluster + cue from the plugin shape. Falls back to
 * informative defaults only when the plugin omits `cluster` or `cue`.
 */
const resolveMeta = (
  plugin: ScenePlugin | undefined,
): {cluster: string; cue: string} => {
  const cluster =
    plugin?.cluster === null
      ? 'chrome'
      : (plugin?.cluster ?? 'unclassified');
  const cue = plugin?.cue ?? '(no cue advertised by this plugin)';
  return {cluster, cue};
};

const buildRationale = (
  scene: string,
  cue: string,
  score: number,
  matched: string[],
  mode?: 'pr' | 'ar' | 'ex',
): string => {
  if (scene === 'frame') return 'every film opens with a frame (the opening commitment).';
  if (scene === 'recap') return 'every film closes with a recap (the ruling).';
  if (scene === 'diff' && score === 0 && mode === 'pr') {
    return 'PR films show what changed — diff is structurally required.';
  }
  if (scene === 'big-idea' && score === 0 && mode === 'ex') {
    return 'every explainer carries one held sentence before the recap.';
  }
  if (matched.length === 0) {
    return `${cue} (no specific signal — included by mode default)`;
  }
  const hits = matched.slice(0, 3).join(', ');
  return `survey contains [${hits}] (score ${score}) → ${cue}`;
};

export const recommendScenes = (
  engine: Engine,
  id: string,
  source: string,
  top: number = 8,
): RecommendResult => {
  if (top < 1) top = 1;

  const plugins = engine.scenes.all() as ReadonlyArray<ScenePlugin>;
  const sceneTypes = new Set<string>(plugins.map((p) => p.sceneType));

  const signalsTable = buildEffectiveSignals(engine);
  const {scores, matches} = scoreSurvey(source, signalsTable, sceneTypes);
  const mode = detectMode(source);

  // Tie-break order: registration order.
  const orderIndex = new Map<string, number>();
  let i = 0;
  for (const p of plugins) orderIndex.set(p.sceneType, i++);

  const ranked = [...sceneTypes]
    .filter((t) => t !== 'frame' && t !== 'recap')
    .map((scene) => {
      const plugin = plugins.find((p) => p.sceneType === scene);
      const meta = resolveMeta(plugin);
      return {
        scene,
        cluster: meta.cluster,
        score: scores[scene] ?? 0,
        matched: matches[scene] ?? [],
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (orderIndex.get(a.scene) ?? 1e9) - (orderIndex.get(b.scene) ?? 1e9);
    });

  const bodySlots = Math.max(1, top - 2);
  const bodyPicks = ranked.filter((r) => r.score > 0).slice(0, bodySlots);

  const modeAdds: string[] = [];
  if (mode === 'pr' && !bodyPicks.find((r) => r.scene === 'diff') && sceneTypes.has('diff')) {
    modeAdds.push('diff');
  }
  if (
    mode === 'ex' &&
    !bodyPicks.find((r) => r.scene === 'big-idea') &&
    sceneTypes.has('big-idea')
  ) {
    modeAdds.push('big-idea');
  }

  const seen = new Set<string>();
  const out: SceneRecommendation[] = [];

  const push = (scene: string, score: number, matched: string[]): void => {
    if (seen.has(scene)) return;
    seen.add(scene);
    const plugin = plugins.find((p) => p.sceneType === scene);
    const meta = resolveMeta(plugin);
    out.push({
      scene,
      cluster: meta.cluster,
      score,
      matched,
      rationale: buildRationale(scene, meta.cue, score, matched, mode),
    });
  };

  // Structural openers/closers: included only when registered.
  if (sceneTypes.has('frame')) push('frame', 0, []);
  for (const r of bodyPicks) push(r.scene, r.score, r.matched);
  for (const s of modeAdds) push(s, 0, []);
  if (sceneTypes.has('recap')) push('recap', 0, []);

  const trimmed = out.slice(0, top);

  const bodyOnly = trimmed
    .map((r) => r.scene)
    .filter((s) => s !== 'frame' && s !== 'recap');
  const allRut = bodyOnly.length > 0 && bodyOnly.every((s) => DEFAULT_RUT.has(s));
  const hasOnlyDefaults = bodyOnly.length === 0 || allRut;

  const notes: string[] = [];
  if (hasOnlyDefaults) {
    notes.push(
      `recommendation collapsed to the default rut (frame/structure/compare/tension/recap). ` +
        `Re-read the survey — does the subject ACTUALLY demand only these primitives, ` +
        `or does it want one of the cluster-specific primitives (run \`docent scene-fit list\` ` +
        `for the registered catalog)?`,
    );
  }
  if (mode) notes.push(`mode detected: ${mode}`);

  return {id, recommendations: trimmed, warningOnDefault: hasOnlyDefaults, notes};
};

// ----- the CLI surface ------------------------------------------------------

const log = (s: string): void => {
  process.stdout.write(`${s}\n`);
};
const err = (s: string): void => {
  process.stderr.write(`${s}\n`);
};

export interface SceneFitArgs {
  /** Override the analysis/ directory. Default: <projectRoot>/analysis. */
  readonly analysisDir?: string;
  /** Override the project root. */
  readonly projectRoot?: string;
}

interface ListArgs extends SceneFitArgs {
  readonly json?: boolean;
}

interface RecommendArgs extends SceneFitArgs {
  readonly subjectId: string;
  readonly top?: number;
  readonly json?: boolean;
}

/**
 * `docent scene-fit list` — enumerate registered scene plugins by cluster.
 *
 * Reads from the engine registry; each plugin's cluster + cue come from its
 * declared ScenePlugin shape. Third-party plugins registered via
 * docent.config.ts surface alongside core without any change to this command.
 */
export const runSceneFitList = async (args: ListArgs): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const {engine} = await createEngine(projectRoot);
  const plugins = engine.scenes.all() as ReadonlyArray<ScenePlugin>;

  const grouped = new Map<
    string,
    Array<{scene: string; cue: string; rutTag: boolean}>
  >();
  for (const p of plugins) {
    const meta = resolveMeta(p);
    const bucket = grouped.get(meta.cluster) ?? [];
    bucket.push({
      scene: p.sceneType,
      cue: meta.cue,
      rutTag: DEFAULT_RUT.has(p.sceneType),
    });
    grouped.set(meta.cluster, bucket);
  }

  if (args.json) {
    const out: Record<string, Array<{scene: string; cue: string; rut: boolean}>> = {};
    for (const [cluster, scenes] of grouped) {
      out[cluster] = scenes.map((s) => ({
        scene: s.scene,
        cue: s.cue,
        rut: s.rutTag,
      }));
    }
    log(JSON.stringify({clusters: out, defaultRut: [...DEFAULT_RUT]}, null, 2));
    return 0;
  }

  log('\x1b[1mdocent scene-fit\x1b[0m — registered scene plugins by cognitive cluster\n');
  // Closed-taxonomy display order; 'unclassified' falls to the bottom.
  const clusterOrder = [
    'connection',
    'time',
    'flow',
    'comparison',
    'categorization',
    'experience',
    'narrative',
    'chrome',
  ];
  const seen = new Set<string>();
  for (const cluster of clusterOrder) {
    const scenes = grouped.get(cluster);
    if (!scenes || scenes.length === 0) continue;
    seen.add(cluster);
    log(`\x1b[1m${cluster}\x1b[0m`);
    for (const s of scenes) {
      const rutTag = s.rutTag ? ' \x1b[90m[default-rut]\x1b[0m' : '';
      log(`  \x1b[36m${s.scene.padEnd(14)}\x1b[0m ${s.cue}${rutTag}`);
    }
    log('');
  }
  // Surface any plugin that declared a non-canonical cluster (or omitted it).
  for (const [cluster, scenes] of grouped) {
    if (seen.has(cluster)) continue;
    log(`\x1b[1m${cluster}\x1b[0m (non-canonical)`);
    for (const s of scenes) {
      log(`  \x1b[36m${s.scene.padEnd(14)}\x1b[0m ${s.cue}`);
    }
    log('');
  }
  log(
    'recommend scenes for a survey:\n  docent scene-fit recommend <subject-id> [--top N] [--json]',
  );
  return 0;
};

/**
 * `docent scene-fit recommend <subject-id>` — run the registry-driven
 * rule-based mapper against <projectRoot>/analysis/<id>.md.
 */
export const runSceneFitRecommend = async (
  args: RecommendArgs,
): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const analysisDir = args.analysisDir ?? join(projectRoot, 'analysis');
  const path = join(analysisDir, `${args.subjectId}.md`);

  if (!existsSync(path)) {
    err(`scene-fit error: analysis/${args.subjectId}.md: file not found at ${path}`);
    return 1;
  }
  let source: string;
  try {
    source = readFileSync(path, 'utf-8');
  } catch (e) {
    err(`scene-fit error: ${path}: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }

  const {engine} = await createEngine(projectRoot);
  const top = args.top ?? 8;
  const result = recommendScenes(engine, args.subjectId, source, top);

  if (args.json) {
    log(JSON.stringify(result, null, 2));
    return 0;
  }

  log(`\x1b[1mdocent scene-fit recommend\x1b[0m — ${args.subjectId} (top ${top})\n`);
  for (const r of result.recommendations) {
    const tag = DEFAULT_RUT.has(r.scene) ? ' \x1b[90m[default-rut]\x1b[0m' : '';
    log(
      `  \x1b[36m${r.scene.padEnd(14)}\x1b[0m \x1b[90m${r.cluster.padEnd(18)}\x1b[0m ` +
        `score ${r.score.toString().padStart(2)}${tag}`,
    );
    log(`    \x1b[90m${r.rationale}\x1b[0m`);
  }
  if (result.warningOnDefault) {
    log(`\n  \x1b[33m⚠ warningOnDefault\x1b[0m — recommendation is the suspected default rut.`);
    if (result.notes[0]) log(`    ${result.notes[0]}`);
  } else if (result.notes.length > 0) {
    log(`\n  notes:`);
    for (const n of result.notes) log(`    - ${n}`);
  }
  return 0;
};
