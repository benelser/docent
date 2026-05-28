// docent style — the agent-facing introspection surface over @docent/kit's
// style/preset system. Mirrors `docent scene-fit` one layer down: closes the
// "which preset is right for this subject?" loop the agent had no handle on.
//
//   docent style list [--json]
//     enumerates registered preset plugins with cue, notes, and registered
//     intent axes (tone, audience, etc.).
//
//   docent style recommend <subject-id> [--json]
//     reads analysis/<id>.md and runs a rule-based survey → preset mapper
//     against each plugin's advertised signals. Returns the highest-scoring
//     preset + a one-line rationale citing the matched needle. NOT an LLM
//     call.
//
// REGISTRY-DRIVEN: a third-party PresetPlugin that declares its own `cue`
// and `signals` participates first-class. See packages/kit/src/protocols.ts
// for the PresetPlugin contract.

import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

import type {Engine, PresetPlugin} from '@docent/kit';
import {
  STYLE_AUDIENCES,
  STYLE_DENSITIES,
  STYLE_EMPHASES,
  STYLE_MEDIUMS,
  STYLE_THEMES,
  STYLE_TONES,
} from '@docent/kit';

import {createEngine} from '../engine-factory';

const log = (s: string): void => {
  process.stdout.write(`${s}\n`);
};
const err = (s: string): void => {
  process.stderr.write(`${s}\n`);
};

const cyan = (s: string): string => `\x1b[36m${s}\x1b[0m`;
const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;
const yellow = (s: string): string => `\x1b[33m${s}\x1b[0m`;

export interface StyleArgs {
  readonly analysisDir?: string;
  readonly projectRoot?: string;
}

interface ListArgs extends StyleArgs {
  readonly json?: boolean;
}

interface RecommendArgs extends StyleArgs {
  readonly subjectId: string;
  readonly json?: boolean;
}

// ---- recommend mapper ------------------------------------------------------

interface EffectivePresetSignal {
  readonly needle: string;
  readonly preset: string;
  readonly weight: number;
}

interface PresetScore {
  preset: string;
  score: number;
  matched: string[];
}

const buildEffectiveSignals = (engine: Engine): EffectivePresetSignal[] => {
  const out: EffectivePresetSignal[] = [];
  for (const p of engine.presets.all() as ReadonlyArray<PresetPlugin>) {
    if (!p.signals) continue;
    for (const s of p.signals) {
      out.push({
        needle: s.needle.toLowerCase(),
        preset: p.presetName,
        weight: s.weight,
      });
    }
  }
  return out;
};

const detectExplicitPreset = (
  source: string,
): {preset: string | undefined; line: string | undefined} => {
  const head = source.split('\n').slice(0, 80).join('\n');
  // Look for `Style:` / `Preset:` line in front-matter-ish prose.
  const m = head.match(/(?:^|\n)\s*(?:#+\s*)?(?:[Ss]tyle|[Pp]reset)\s*[:=]\s*([a-z0-9_-]+)/);
  return m ? {preset: m[1], line: m[0]?.trim()} : {preset: undefined, line: undefined};
};

const detectMode = (source: string): 'pr' | 'ar' | 'ex' | undefined => {
  const head = source.split('\n').slice(0, 80).join('\n');
  const m = head.match(/(?:^|\n)\s*(?:#+\s*)?[Mm]ode\s*[:=]\s*(pr|ar|ex)\b/);
  return m ? (m[1] as 'pr' | 'ar' | 'ex') : undefined;
};

const scoreSurvey = (
  source: string,
  signals: ReadonlyArray<EffectivePresetSignal>,
  knownPresets: ReadonlySet<string>,
): PresetScore[] => {
  const scores = new Map<string, {score: number; matched: string[]}>();
  for (const p of knownPresets) scores.set(p, {score: 0, matched: []});
  const haystack = source.toLowerCase();
  for (const s of signals) {
    if (haystack.includes(s.needle)) {
      const e = scores.get(s.preset) ?? {score: 0, matched: []};
      e.score += s.weight;
      e.matched.push(s.needle);
      scores.set(s.preset, e);
    }
  }
  return [...scores.entries()]
    .map(([preset, v]) => ({preset, score: v.score, matched: v.matched}))
    .sort((a, b) => b.score - a.score);
};

export interface StyleRecommendation {
  preset: string;
  rationale: string;
  signals: {
    mode?: 'pr' | 'ar' | 'ex';
    explicit?: string;
    topHits: ReadonlyArray<PresetScore>;
  };
}

export const recommendPreset = (
  engine: Engine,
  source: string,
): StyleRecommendation => {
  const plugins = engine.presets.all() as ReadonlyArray<PresetPlugin>;
  const known = new Set<string>(plugins.map((p) => p.presetName));

  // Highest precedence: an explicit `Style: …` / `Preset: …` line.
  const {preset: explicit, line} = detectExplicitPreset(source);
  const mode = detectMode(source);

  if (explicit && known.has(explicit)) {
    return {
      preset: explicit,
      rationale: `survey explicitly names the preset (\`${line}\`).`,
      signals: {
        ...(mode ? {mode} : {}),
        ...(line ? {explicit: line} : {}),
        topHits: [],
      },
    };
  }

  // Signal-driven scoring.
  const signalsTable = buildEffectiveSignals(engine);
  const ranked = scoreSurvey(source, signalsTable, known);
  const top = ranked[0];

  if (!top || top.score === 0) {
    // No signal — fall back to neutral (always registered as the floor) if
    // present; otherwise the first registered preset.
    const fallback = known.has('neutral')
      ? 'neutral'
      : (plugins[0]?.presetName ?? 'neutral');
    return {
      preset: fallback,
      rationale:
        'no preset-specific signal found in the survey; falling back to the neutral baseline.',
      signals: {
        ...(mode ? {mode} : {}),
        ...(line ? {explicit: line} : {}),
        topHits: ranked,
      },
    };
  }

  const hits = top.matched.slice(0, 3).join(', ');
  return {
    preset: top.preset,
    rationale: `survey contains [${hits}] (score ${top.score}) — strongest signal for the '${top.preset}' preset.`,
    signals: {
      ...(mode ? {mode} : {}),
      ...(line ? {explicit: line} : {}),
      topHits: ranked.filter((r) => r.score > 0).slice(0, 5),
    },
  };
};

// ---- CLI -------------------------------------------------------------------

export const runStyleList = async (args: ListArgs): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const {engine} = await createEngine(projectRoot);
  const plugins = engine.presets.all() as ReadonlyArray<PresetPlugin>;

  if (args.json) {
    log(
      JSON.stringify(
        {
          presets: plugins.map((p) => ({
            name: p.presetName,
            ...(p.cue ? {cue: p.cue} : {}),
            ...(p.notes ? {notes: p.notes} : {}),
            ...(p.extends ? {extends: p.extends} : {}),
          })),
          intent: {
            tone: STYLE_TONES,
            audience: STYLE_AUDIENCES,
            medium: STYLE_MEDIUMS,
            density: STYLE_DENSITIES,
            theme: STYLE_THEMES,
            emphasis: STYLE_EMPHASES,
          },
        },
        null,
        2,
      ),
    );
    return 0;
  }

  log(`${bold('docent style')} — registered presets + the intent axes\n`);
  log(bold('  Presets'));
  for (const p of plugins) {
    const extendsTag = p.extends ? dim(` extends:${p.extends}`) : '';
    const cue = p.cue ?? p.notes ?? '(no cue advertised)';
    log(`    ${cyan(p.presetName.padEnd(14))} ${cue}${extendsTag}`);
  }
  log('');
  log(bold('  Intent axes'));
  log(dim(`    tone     ${STYLE_TONES.join(' · ')}`));
  log(dim(`    audience ${STYLE_AUDIENCES.join(' · ')}`));
  log(dim(`    medium   ${STYLE_MEDIUMS.join(' · ')}`));
  log(dim(`    density  ${STYLE_DENSITIES.join(' · ')}`));
  log(dim(`    theme    ${STYLE_THEMES.join(' · ')}`));
  log(dim(`    emphasis ${STYLE_EMPHASES.join(' · ')}`));
  log('');
  log('recommend a preset for a survey:\n  docent style recommend <subject-id> [--json]');
  return 0;
};

export const runStyleRecommend = async (
  args: RecommendArgs,
): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const analysisDir = args.analysisDir ?? join(projectRoot, 'analysis');
  const path = join(analysisDir, `${args.subjectId}.md`);

  if (!existsSync(path)) {
    err(`style error: analysis/${args.subjectId}.md: file not found at ${path}`);
    return 1;
  }
  let source: string;
  try {
    source = readFileSync(path, 'utf-8');
  } catch (e) {
    err(`style error: ${path}: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }

  const {engine} = await createEngine(projectRoot);
  const result = recommendPreset(engine, source);

  if (args.json) {
    log(JSON.stringify({id: args.subjectId, ...result}, null, 2));
    return 0;
  }

  log(`${bold('docent style recommend')} — ${args.subjectId}\n`);
  log(`  ${cyan('preset:')} ${result.preset}`);
  log(`  ${cyan('rationale:')} ${dim(result.rationale)}`);
  if (result.signals.mode) {
    log(`  ${cyan('mode:')} ${dim(result.signals.mode)}`);
  }
  if (result.signals.topHits.length > 0) {
    log('');
    log(`  ${cyan('top hits')}`);
    for (const h of result.signals.topHits) {
      const matched = h.matched.slice(0, 3).join(', ');
      log(`    ${dim(h.preset.padEnd(14))} score ${h.score.toString().padStart(2)} ${dim(matched)}`);
    }
  } else if (result.signals.explicit === undefined) {
    log(`\n  ${yellow('⚠ no signals matched — fell back to neutral.')}`);
  }
  return 0;
};
