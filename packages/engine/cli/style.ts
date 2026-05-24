// docent style — the agent-facing introspection surface over packages/engine/src/style.
//
// v2.1.0 shipped the styling resolver but left the coding-agent author with no
// way to see what presets exist, what a resolved style looks like, or which
// preset is right for a given subject. This subcommand closes that loop.
//
//   docent style list
//     enumerates the presets and the intent axes.
//
//   docent style resolve --preset <name> [--intent.<axis> <value>]
//     calls resolveStyle and prints the ResolvedStyle as JSON. Non-zero on a
//     StyleValidationError, with a structured `style validation error: ...`
//     line per detail.
//
//   docent style recommend <subject-id>
//     reads analysis/<id>.md and runs a rules-based survey→preset mapper,
//     prints {preset, intent, rationale}. NOT an LLM call; rule-based.
//
// All output that the agent layer or a downstream script needs to parse is
// JSON on stdout. Human chrome (the bullets in `list`) goes to stderr or to
// stdout only when --json is absent. The exit code is the contract.

import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {paths} from './paths';
import {
  resolveStyle,
  PRESETS,
  STYLE_PRESETS,
  STYLE_TONES,
  STYLE_AUDIENCES,
  STYLE_MEDIUMS,
  STYLE_DENSITIES,
  STYLE_THEMES,
  STYLE_EMPHASES,
  StyleValidationError,
  type StylePreset,
  type StyleIntent,
  type StyleTone,
  type StyleAudience,
  type StyleMedium,
  type StyleDensity,
  type StyleTheme,
  type StyleEmphasis,
  type RenderStyleInput,
} from '../src/style';

// ----- shared printing -------------------------------------------------------

const die = (msg: string): never => {
  process.stderr.write(`\x1b[31m✗\x1b[0m ${msg}\n`);
  process.exit(1);
};

// Print a StyleValidationError in the documented one-line-per-detail shape:
//   style validation error: <path>: <message>
const reportValidationError = (e: StyleValidationError): void => {
  for (const d of e.details) {
    process.stderr.write(`style validation error: ${d.path}: ${d.message}\n`);
  }
};

// ----- `docent style list` --------------------------------------------------

export const styleList = (json: boolean): number => {
  if (json) {
    const out = {
      presets: STYLE_PRESETS.map((name) => ({
        name,
        notes: PRESETS[name].notes,
      })),
      intentAxes: {
        tone: STYLE_TONES,
        audience: STYLE_AUDIENCES,
        medium: STYLE_MEDIUMS,
        density: STYLE_DENSITIES,
        theme: STYLE_THEMES,
        emphasis: STYLE_EMPHASES,
      },
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return 0;
  }
  process.stdout.write('\x1b[1mdocent style\x1b[0m — presets and intent axes\n\n');
  process.stdout.write('\x1b[1mpresets\x1b[0m\n');
  for (const name of STYLE_PRESETS) {
    process.stdout.write(`  ${name.padEnd(14)} ${PRESETS[name].notes}\n`);
  }
  process.stdout.write('\n\x1b[1mintent axes\x1b[0m\n');
  process.stdout.write(`  tone        ${STYLE_TONES.join(' · ')}\n`);
  process.stdout.write(`  audience    ${STYLE_AUDIENCES.join(' · ')}\n`);
  process.stdout.write(`  medium      ${STYLE_MEDIUMS.join(' · ')}\n`);
  process.stdout.write(`  density     ${STYLE_DENSITIES.join(' · ')}\n`);
  process.stdout.write(`  theme       ${STYLE_THEMES.join(' · ')}\n`);
  process.stdout.write(`  emphasis    ${STYLE_EMPHASES.join(' · ')}\n`);
  process.stdout.write('\nresolve a style:\n');
  process.stdout.write(
    '  docent style resolve --preset <name> [--intent.tone <t>] [--intent.density <d>] ...\n',
  );
  return 0;
};

// ----- `docent style resolve` ----------------------------------------------

const isStyleTone = (v: string): v is StyleTone =>
  (STYLE_TONES as readonly string[]).includes(v);
const isStyleAudience = (v: string): v is StyleAudience =>
  (STYLE_AUDIENCES as readonly string[]).includes(v);
const isStyleMedium = (v: string): v is StyleMedium =>
  (STYLE_MEDIUMS as readonly string[]).includes(v);
const isStyleDensity = (v: string): v is StyleDensity =>
  (STYLE_DENSITIES as readonly string[]).includes(v);
const isStyleTheme = (v: string): v is StyleTheme =>
  (STYLE_THEMES as readonly string[]).includes(v);
const isStyleEmphasis = (v: string): v is StyleEmphasis =>
  (STYLE_EMPHASES as readonly string[]).includes(v);
const isStylePreset = (v: string): v is StylePreset =>
  (STYLE_PRESETS as readonly string[]).includes(v);

export type ResolveArgs = {
  preset?: string;
  intent?: Record<string, string>;
};

export const styleResolveCmd = (args: ResolveArgs): number => {
  const input: RenderStyleInput = {};
  if (args.preset !== undefined) {
    if (!isStylePreset(args.preset)) {
      process.stderr.write(
        `style validation error: preset: "${args.preset}" is not a known preset. ` +
          `Known: ${STYLE_PRESETS.join(', ')}\n`,
      );
      return 1;
    }
    input.preset = args.preset;
  }
  if (args.intent) {
    const intent: StyleIntent = {};
    for (const [k, v] of Object.entries(args.intent)) {
      switch (k) {
        case 'tone':
          if (!isStyleTone(v)) {
            process.stderr.write(
              `style validation error: intent.tone: "${v}" not in [${STYLE_TONES.join(', ')}]\n`,
            );
            return 1;
          }
          intent.tone = v;
          break;
        case 'audience':
          if (!isStyleAudience(v)) {
            process.stderr.write(
              `style validation error: intent.audience: "${v}" not in [${STYLE_AUDIENCES.join(', ')}]\n`,
            );
            return 1;
          }
          intent.audience = v;
          break;
        case 'medium':
          if (!isStyleMedium(v)) {
            process.stderr.write(
              `style validation error: intent.medium: "${v}" not in [${STYLE_MEDIUMS.join(', ')}]\n`,
            );
            return 1;
          }
          intent.medium = v;
          break;
        case 'density':
          if (!isStyleDensity(v)) {
            process.stderr.write(
              `style validation error: intent.density: "${v}" not in [${STYLE_DENSITIES.join(', ')}]\n`,
            );
            return 1;
          }
          intent.density = v;
          break;
        case 'theme':
          if (!isStyleTheme(v)) {
            process.stderr.write(
              `style validation error: intent.theme: "${v}" not in [${STYLE_THEMES.join(', ')}]\n`,
            );
            return 1;
          }
          intent.theme = v;
          break;
        case 'emphasis':
          if (!isStyleEmphasis(v)) {
            process.stderr.write(
              `style validation error: intent.emphasis: "${v}" not in [${STYLE_EMPHASES.join(', ')}]\n`,
            );
            return 1;
          }
          intent.emphasis = v;
          break;
        default:
          process.stderr.write(
            `style validation error: intent.${k}: unknown intent axis (use tone/audience/medium/density/theme/emphasis)\n`,
          );
          return 1;
      }
    }
    input.intent = intent;
  }
  try {
    const resolved = resolveStyle(input);
    process.stdout.write(JSON.stringify(resolved, null, 2) + '\n');
    return 0;
  } catch (e) {
    if (e instanceof StyleValidationError) {
      reportValidationError(e);
      return 1;
    }
    process.stderr.write(
      `style validation error: (resolver): ${e instanceof Error ? e.message : String(e)}\n`,
    );
    return 1;
  }
};

// ----- `docent style recommend <id>` ----------------------------------------

// Read analysis/<id>.md and extract signal we can map deterministically to a
// preset. The mapper looks at:
//   - an explicit `style:` / `preset:` line in YAML-like front matter,
//   - the `mode:` line (pr | ar | ex),
//   - the subject / Subject heading line,
//   - keyword signals across the survey body (code, prose, math, proof, exec,
//     paper, arxiv, journal, etc.).
//
// Returns the recommended preset + a minimal intent block + a one-line
// rationale that names the survey finding that produced the choice.

export type Recommendation = {
  preset: StylePreset;
  intent: StyleIntent;
  rationale: string;
  // What the mapper saw. Helpful for debugging — exposed in --json output.
  signals: {
    mode?: 'pr' | 'ar' | 'ex';
    explicit?: string;
    topHits: {preset: StylePreset; score: number; matched: string[]}[];
  };
};

type Signal = {
  // The substring (lowercased) we look for in the survey body.
  needle: string;
  // The preset this evidence votes for, and how much weight to give it.
  preset: StylePreset;
  weight: number;
};

// Each preset has a set of keyword hits. Weights are tuned so a clear single-
// domain survey (engineering or paper) outvotes a mixed one and the recommend
// emits the dominant register.
const SIGNALS: Signal[] = [
  // engineering — code-heavy / PR / subsystem
  {needle: 'pull request', preset: 'engineering', weight: 3},
  {needle: 'pr review', preset: 'engineering', weight: 3},
  {needle: 'github.com', preset: 'engineering', weight: 1},
  {needle: 'diff', preset: 'engineering', weight: 1},
  {needle: 'load-bearing change', preset: 'engineering', weight: 2},
  {needle: 'kubernetes', preset: 'engineering', weight: 2},
  {needle: 'scheduler', preset: 'engineering', weight: 1},
  {needle: 'codebase', preset: 'engineering', weight: 2},
  {needle: 'repository', preset: 'engineering', weight: 1},
  {needle: 'commit', preset: 'engineering', weight: 1},
  {needle: 'pkg/', preset: 'engineering', weight: 2},
  {needle: 'src/', preset: 'engineering', weight: 1},
  {needle: 'subsystem', preset: 'engineering', weight: 2},
  {needle: 'function', preset: 'engineering', weight: 1},
  {needle: 'control plane', preset: 'engineering', weight: 2},

  // paper — academic / arxiv / journal
  {needle: 'arxiv', preset: 'paper', weight: 4},
  {needle: 'arxiv.org', preset: 'paper', weight: 4},
  {needle: '/abs/', preset: 'paper', weight: 3},
  {needle: '/pdf/', preset: 'paper', weight: 2},
  {needle: 'journal', preset: 'paper', weight: 2},
  {needle: 'preprint', preset: 'paper', weight: 3},
  {needle: 'cite', preset: 'paper', weight: 1},
  {needle: 'citation', preset: 'paper', weight: 1},
  {needle: 'abstract:', preset: 'paper', weight: 1},
  {needle: 'doi:', preset: 'paper', weight: 3},
  {needle: 'peer-reviewed', preset: 'paper', weight: 3},
  {needle: 'academic paper', preset: 'paper', weight: 3},
  {needle: 'research paper', preset: 'paper', weight: 3},
  {needle: 'figure 1', preset: 'paper', weight: 1},
  {needle: 'table 1', preset: 'paper', weight: 1},

  // analytical — math / proof
  {needle: 'theorem', preset: 'analytical', weight: 3},
  {needle: 'proof', preset: 'analytical', weight: 2},
  {needle: 'lemma', preset: 'analytical', weight: 2},
  {needle: 'corollary', preset: 'analytical', weight: 2},
  {needle: 'euclid', preset: 'analytical', weight: 2},
  {needle: 'derivation', preset: 'analytical', weight: 1},
  {needle: 'equation', preset: 'analytical', weight: 1},
  {needle: 'matrix', preset: 'analytical', weight: 1},
  {needle: 'vector', preset: 'analytical', weight: 1},

  // editorial — prose / essay / literary
  {needle: 'essay', preset: 'editorial', weight: 3},
  {needle: 'close reading', preset: 'editorial', weight: 3},
  {needle: 'close-reading', preset: 'editorial', weight: 3},
  {needle: 'poem', preset: 'editorial', weight: 3},
  {needle: 'stanza', preset: 'editorial', weight: 3},
  {needle: 'prose', preset: 'editorial', weight: 2},
  {needle: 'novel', preset: 'editorial', weight: 2},
  {needle: 'literary', preset: 'editorial', weight: 2},
  {needle: 'frost', preset: 'editorial', weight: 1}, // Robert Frost
  {needle: 'blog post', preset: 'editorial', weight: 2},
  {needle: 'narrative', preset: 'editorial', weight: 1},
  {needle: 'metaphor', preset: 'editorial', weight: 1},

  // executive — deck / strategy / business
  {needle: 'exec deck', preset: 'executive', weight: 3},
  {needle: 'executive summary', preset: 'executive', weight: 3},
  {needle: 'board', preset: 'executive', weight: 1},
  {needle: 'strategy', preset: 'executive', weight: 1},
  {needle: 'go-to-market', preset: 'executive', weight: 2},
];

// Pull a YAML-ish "key: value" out of the leading section of a survey. Markdown
// files often carry a small front-matter; failing that, we look for inline
// "Mode: pr" or "Style: engineering" headers anywhere in the first ~80 lines.
const readSurveyHints = (
  source: string,
): {
  mode?: 'pr' | 'ar' | 'ex';
  explicitPreset?: string;
  explicitIntent?: StyleIntent;
} => {
  const hints: {
    mode?: 'pr' | 'ar' | 'ex';
    explicitPreset?: string;
    explicitIntent?: StyleIntent;
  } = {};
  const head = source.split('\n').slice(0, 80).join('\n');

  // Mode signal — `Mode: pr` / `--mode pr`.
  const modeMatch = head.match(/(?:^|\n)\s*(?:#+\s*)?[Mm]ode\s*[:=]\s*(pr|ar|ex)\b/);
  if (modeMatch) hints.mode = modeMatch[1] as 'pr' | 'ar' | 'ex';

  // Explicit preset suggestion — `Style: engineering` or `Preset: paper`.
  const presetMatch = head.match(
    /(?:^|\n)\s*(?:#+\s*)?(?:[Ss]tyle|[Pp]reset)\s*[:=]\s*([a-z]+)/,
  );
  if (presetMatch) hints.explicitPreset = presetMatch[1];

  // Inline intent — `Tone: professional` etc.
  const intent: StyleIntent = {};
  const tone = head.match(/(?:^|\n)\s*(?:#+\s*)?[Tt]one\s*[:=]\s*([a-z-]+)/);
  if (tone && isStyleTone(tone[1])) intent.tone = tone[1];
  const audience = head.match(/(?:^|\n)\s*(?:#+\s*)?[Aa]udience\s*[:=]\s*([a-z-]+)/);
  if (audience && isStyleAudience(audience[1])) intent.audience = audience[1];
  const density = head.match(/(?:^|\n)\s*(?:#+\s*)?[Dd]ensity\s*[:=]\s*([a-z-]+)/);
  if (density && isStyleDensity(density[1])) intent.density = density[1];
  if (Object.keys(intent).length > 0) hints.explicitIntent = intent;

  return hints;
};

// Score each preset against the survey body. The winning preset is the one
// with the highest score (ties broken in declared SIGNALS order, which lists
// engineering first).
const scoreSignals = (
  body: string,
): {
  scores: Record<StylePreset, number>;
  matches: Record<StylePreset, string[]>;
} => {
  const scores: Record<StylePreset, number> = {
    neutral: 0,
    engineering: 0,
    editorial: 0,
    paper: 0,
    executive: 0,
    analytical: 0,
  };
  const matches: Record<StylePreset, string[]> = {
    neutral: [],
    engineering: [],
    editorial: [],
    paper: [],
    executive: [],
    analytical: [],
  };
  const haystack = body.toLowerCase();
  for (const s of SIGNALS) {
    if (haystack.includes(s.needle)) {
      scores[s.preset] += s.weight;
      matches[s.preset].push(s.needle);
    }
  }
  return {scores, matches};
};

// The rules-based mapper. Inputs: the raw survey text and the id (used in the
// rationale). Output: a recommendation with provenance.
export const recommendForSurvey = (id: string, source: string): Recommendation => {
  const hints = readSurveyHints(source);
  const {scores, matches} = scoreSignals(source);

  // Mode-derived default — `pr` defaults to engineering, `ex` to editorial,
  // `ar` to engineering (architecture review of a code system). These are
  // *defaults* that the signal scoring can override.
  const modeDefault: StylePreset =
    hints.mode === 'ex' ? 'editorial' : hints.mode === 'pr' ? 'engineering' : 'engineering';

  // Sort presets by score, dropping `neutral` (it has no signals; it is only
  // ever the explicit override).
  const ranked = (Object.keys(scores) as StylePreset[])
    .filter((p) => p !== 'neutral')
    .map((p) => ({preset: p, score: scores[p], matched: matches[p]}))
    .sort((a, b) => b.score - a.score);

  let chosen: StylePreset;
  let reason: string;

  if (hints.explicitPreset && isStylePreset(hints.explicitPreset)) {
    chosen = hints.explicitPreset;
    reason = `survey front-matter named preset "${hints.explicitPreset}" explicitly`;
  } else if (ranked[0].score === 0) {
    chosen = modeDefault;
    reason = `no preset-keyword hits in analysis/${id}.md; defaulted to ${chosen} for mode=${hints.mode ?? 'unset'}`;
  } else {
    // If the top scorer has at most 1 hit and the survey mode is set, prefer
    // the mode default — a thin signal is not enough to override the mode.
    if (ranked[0].score <= 1 && hints.mode) {
      chosen = modeDefault;
      reason = `weakest-signal-wins-back-to-mode: top match ${ranked[0].preset} (score ${ranked[0].score}) too thin; using mode=${hints.mode} default ${modeDefault}`;
    } else {
      chosen = ranked[0].preset;
      const hitList = ranked[0].matched.slice(0, 3).join(', ');
      reason = `${chosen} preset selected by survey signals: matched [${hitList}] (score ${ranked[0].score} vs runner-up ${ranked[1].preset}@${ranked[1].score})`;
    }
  }

  // Intent — start from explicit hints, then layer the preset's natural tone.
  const intent: StyleIntent = {...(hints.explicitIntent ?? {})};
  if (!intent.tone) {
    intent.tone =
      chosen === 'executive'
        ? 'executive'
        : chosen === 'engineering' || chosen === 'analytical'
          ? 'technical'
          : chosen === 'paper'
            ? 'professional'
            : 'neutral';
  }
  if (!intent.audience) {
    intent.audience =
      chosen === 'executive'
        ? 'executive'
        : chosen === 'engineering' || chosen === 'analytical' || chosen === 'paper'
          ? 'technical'
          : 'general';
  }
  if (!intent.density) {
    intent.density = chosen === 'executive' ? 'spacious' : 'comfortable';
  }

  return {
    preset: chosen,
    intent,
    rationale: reason,
    signals: {
      mode: hints.mode,
      explicit: hints.explicitPreset,
      topHits: ranked.slice(0, 3),
    },
  };
};

export const styleRecommend = (id: string, json: boolean): number => {
  const path = join(paths.analysis, `${id}.md`);
  if (!existsSync(path)) {
    process.stderr.write(`style validation error: analysis/${id}.md: file not found\n`);
    return 1;
  }
  let source: string;
  try {
    source = readFileSync(path, 'utf8');
  } catch (e) {
    process.stderr.write(
      `style validation error: analysis/${id}.md: ${e instanceof Error ? e.message : String(e)}\n`,
    );
    return 1;
  }
  const rec = recommendForSurvey(id, source);

  if (json) {
    process.stdout.write(
      JSON.stringify(
        {preset: rec.preset, intent: rec.intent, rationale: rec.rationale, signals: rec.signals},
        null,
        2,
      ) + '\n',
    );
    return 0;
  }
  process.stdout.write(`\x1b[1mdocent style recommend\x1b[0m — ${id}\n\n`);
  process.stdout.write(`  preset:    \x1b[36m${rec.preset}\x1b[0m\n`);
  process.stdout.write(`  intent:    ${JSON.stringify(rec.intent)}\n`);
  process.stdout.write(`  rationale: ${rec.rationale}\n`);
  if (rec.signals.topHits.length > 0) {
    process.stdout.write(`\n  top signals:\n`);
    for (const h of rec.signals.topHits) {
      process.stdout.write(
        `    ${h.preset.padEnd(14)} ${h.score.toString().padStart(2)} pts — [${h.matched.slice(0, 4).join(', ')}]\n`,
      );
    }
  }
  process.stdout.write(`\n  pin it on the spec:\n`);
  process.stdout.write(
    `    "style": ${JSON.stringify({preset: rec.preset, intent: rec.intent, rationale: rec.rationale}, null, 2).replace(/\n/g, '\n    ')}\n`,
  );
  return 0;
};

// ----- argument parsing -----------------------------------------------------

// Parse the slice of argv that follows `docent style <subcmd>`. The subcommand
// dispatch lives one layer up in docent.ts; this just chops the rest.
export const runStyle = (argv: string[]): number => {
  const sub = argv[0];
  if (!sub || sub === '--help' || sub === '-h') {
    process.stdout.write('docent style — introspect the styling resolver\n\n');
    process.stdout.write('  docent style list [--json]\n');
    process.stdout.write('    list every preset (with notes) and the intent axes\n\n');
    process.stdout.write(
      '  docent style resolve --preset <name> [--intent.<axis> <value>] ...\n',
    );
    process.stdout.write(
      '    run the styling pipeline for {preset, intent}; print ResolvedStyle as JSON\n\n',
    );
    process.stdout.write('  docent style recommend <subject-id> [--json]\n');
    process.stdout.write(
      '    read analysis/<id>.md; print the recommended {preset, intent} + rationale\n',
    );
    return sub ? 0 : 1;
  }

  if (sub === 'list') {
    return styleList(argv.includes('--json'));
  }

  if (sub === 'resolve') {
    const args: ResolveArgs = {intent: {}};
    for (let i = 1; i < argv.length; i++) {
      const tok = argv[i];
      if (tok === '--preset') {
        args.preset = argv[++i];
      } else if (tok.startsWith('--intent.')) {
        const axis = tok.slice('--intent.'.length);
        args.intent![axis] = argv[++i];
      } else if (tok === '--help' || tok === '-h') {
        process.stdout.write(
          'docent style resolve --preset <name> [--intent.<axis> <value>]\n',
        );
        return 0;
      } else if (tok === '--json') {
        // resolve is always JSON; ignore.
      } else {
        process.stderr.write(`style validation error: argv: unknown flag "${tok}"\n`);
        return 1;
      }
    }
    if (args.intent && Object.keys(args.intent).length === 0) delete args.intent;
    return styleResolveCmd(args);
  }

  if (sub === 'recommend') {
    const id = argv[1];
    if (!id || id.startsWith('--')) {
      die('usage: docent style recommend <subject-id> [--json]');
    }
    return styleRecommend(id!, argv.includes('--json'));
  }

  process.stderr.write(
    `style validation error: subcommand: unknown "style ${sub}" — use list | resolve | recommend\n`,
  );
  return 1;
};
