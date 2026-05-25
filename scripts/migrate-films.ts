// migrate-films.ts — one-shot migrator from legacy knobs to ResolvedStyle.
//
// Maps legacy scene-level knobs (palette / treatment / register / accent)
// onto the new top-level FilmSpec.style {preset, intent} vocabulary, and
// strips the legacy fields from every Scene.
//
// Run during the migration sprint (after the styling pipeline merges and
// before the renderer-migration sprint dispatches). The mapping below is
// a STARTING POINT — review each film's output by hand before committing.
//
// Usage:
//   bun scripts/migrate-films.ts <film.json> [--write]
//
// Without --write, prints the proposed migration to stdout. With --write,
// updates the file in place.

import {existsSync} from 'node:fs';
import {join} from 'node:path';

type LegacyKnobs = {
  palette?: 'cool' | 'warm' | 'signal' | 'mono';
  treatment?: 'crisp' | 'sketch' | 'whiteboard';
  register?: 'grave' | 'curious' | 'dry';
  accent?: string;
};

type StyleInput = {
  preset?: string;
  intent?: {
    tone?: string;
    audience?: string;
    medium?: string;
    density?: string;
    theme?: string;
    emphasis?: string;
  };
};

// The mapping table. Each row encodes how a *combination* of legacy knobs
// at the film level resolves to {preset, intent}. The mapper picks the
// most-specific row that matches; falls back to {preset: 'neutral'}.
//
// Pure data — no branching by knob name inside the resolver function.
const MAPPING: {
  matches: LegacyKnobs;
  style: StyleInput;
  rationale: string;
}[] = [
  // The current four featured films map to these presets per the gallery.
  // Verify each by inspecting the rendered output before accepting.
  {
    matches: {treatment: 'whiteboard', palette: 'warm'},
    style: {preset: 'editorial'},
    rationale: 'Whiteboard warm = close-reading register (stopping-by-woods, lethal-trifecta tagline)',
  },
  {
    matches: {treatment: 'sketch'},
    style: {preset: 'analytical', intent: {tone: 'technical'}},
    rationale: 'Sketch register = math / proof aesthetic',
  },
  {
    matches: {palette: 'cool', register: 'grave'},
    style: {preset: 'engineering'},
    rationale: 'Cool palette + grave register = the kubernetes-pr / docent-self engineering register',
  },
  {
    matches: {palette: 'cool'},
    style: {preset: 'engineering'},
    rationale: 'Cool palette alone = engineering register, no specific tonal commitment',
  },
  {
    matches: {palette: 'warm'},
    style: {preset: 'editorial', intent: {tone: 'professional'}},
    rationale: 'Warm without whiteboard = professional editorial',
  },
  {
    matches: {palette: 'signal'},
    style: {preset: 'analytical', intent: {emphasis: 'data-first'}},
    rationale: 'Signal palette = quantitative emphasis',
  },
  {
    matches: {palette: 'mono'},
    style: {preset: 'analytical'},
    rationale: 'Mono = analytical register',
  },
  // The arxiv-style paper register.
  {
    matches: {treatment: 'whiteboard', register: 'dry'},
    style: {preset: 'paper'},
    rationale: 'Whiteboard + dry register = academic paper register',
  },
];

const matches = (knobs: LegacyKnobs, pattern: LegacyKnobs): boolean => {
  for (const [k, v] of Object.entries(pattern)) {
    if (knobs[k as keyof LegacyKnobs] !== v) return false;
  }
  return true;
};

const resolveLegacy = (knobs: LegacyKnobs): {style: StyleInput; rationale: string} => {
  for (const row of MAPPING) {
    if (matches(knobs, row.matches)) return {style: row.style, rationale: row.rationale};
  }
  return {style: {preset: 'neutral'}, rationale: 'no legacy knobs detected → neutral default'};
};

// Sniff the film's "dominant" legacy knobs by majority vote across scenes.
// A film whose scenes mostly use `palette: 'cool'` resolves to engineering;
// outliers are left as scene-level overrides if necessary (manual review).
const dominantKnobs = (scenes: Record<string, unknown>[]): LegacyKnobs => {
  const tally = (key: 'palette' | 'treatment' | 'register' | 'accent') => {
    const counts: Record<string, number> = {};
    for (const sc of scenes) {
      const v = sc[key];
      if (typeof v === 'string') counts[v] = (counts[v] ?? 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0];
  };
  const out: LegacyKnobs = {};
  const palette = tally('palette');
  if (palette) out.palette = palette as LegacyKnobs['palette'];
  const treatment = tally('treatment');
  if (treatment) out.treatment = treatment as LegacyKnobs['treatment'];
  const register = tally('register');
  if (register) out.register = register as LegacyKnobs['register'];
  return out;
};

const stripLegacy = (sc: Record<string, unknown>): Record<string, unknown> => {
  const {palette, treatment, register, accent, ...rest} = sc;
  void palette;
  void treatment;
  void register;
  void accent;
  return rest;
};

const main = async () => {
  const args = process.argv.slice(2);
  const filmPath = args.find((a) => !a.startsWith('--'));
  const write = args.includes('--write');
  if (!filmPath || !existsSync(filmPath)) {
    console.error('usage: bun scripts/migrate-films.ts <film.json> [--write]');
    process.exit(1);
  }

  const spec = await Bun.file(filmPath).json();
  const scenes = (spec.scenes ?? []) as Record<string, unknown>[];

  // Sniff the dominant legacy knobs across the film.
  const knobs = dominantKnobs(scenes);
  const {style: derivedStyle, rationale: derivedRationale} = resolveLegacy(knobs);

  // Preserve any existing top-level `style` block — the v2.2.0 README films
  // already committed to a preset; the migrator must not clobber that.
  const hasExistingStyle =
    spec.style && typeof spec.style === 'object' && spec.style.preset;
  const style = hasExistingStyle ? spec.style : derivedStyle;
  const rationale = hasExistingStyle
    ? `preserved existing style commitment (preset: ${spec.style.preset})`
    : derivedRationale;

  // Strip meta.register if present (the film-mood knob, removed in v2.4).
  const {register: _r, ...metaRest} = (spec.meta ?? {}) as Record<string, unknown>;
  void _r;

  // Apply: set FilmSpec.style; strip per-scene legacy knobs.
  const migrated = {
    ...spec,
    meta: metaRest,
    style,
    scenes: scenes.map(stripLegacy),
  };

  // Report.
  console.error(`\x1b[1mmigrate-films\x1b[0m  ${filmPath}`);
  console.error(`  dominant legacy knobs: ${JSON.stringify(knobs)}`);
  console.error(`  → style: ${JSON.stringify(style)}`);
  console.error(`  → ${rationale}`);
  console.error('');

  if (write) {
    await Bun.write(filmPath, JSON.stringify(migrated, null, 2) + '\n');
    console.error(`  \x1b[32m✓ wrote ${filmPath}\x1b[0m`);
  } else {
    console.log(JSON.stringify(migrated, null, 2));
    console.error(`  \x1b[33m(dry run — pass --write to update the file)\x1b[0m`);
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
