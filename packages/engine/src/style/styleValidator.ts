// styleValidator — schema validation of the RAW input and of the resolved
// output. Fail-closed: every constraint that fails appends a structured
// detail; if the list is non-empty the resolver throws a
// `StyleValidationError`.
//
// Pipeline location:
//   base renderer defaults
//   → named style preset
//   → semantic style intent
//   → agent-provided style overrides
//   → user preference overrides
//   → validation / normalization / accessibility constraints     ← THIS FILE
//                                                                  (+ styleNormalization.ts,
//                                                                   styleAccessibility.ts)
//   → resolved style object
//
// Constraints implemented here (input-shape level):
//   - Preset name is in the registered enum.
//   - Color strings are valid CSS hex (#RGB, #RRGGBB, #RRGGBBAA), rgb(...) /
//     rgba(...), or one of a small list of named CSS colors.
//   - Font sizes in [10, 200] px.
//   - Spacing in [0, 200] px.
//   - Legend positions in the enum.
//   - Density / tone / audience / medium / theme / emphasis in their enums.

import type {
  RenderStyleInput,
  StyleValidationDetail,
  DesignTokenOverrides,
} from './styleSchema';
import {
  STYLE_PRESETS,
  STYLE_TONES,
  STYLE_AUDIENCES,
  STYLE_MEDIUMS,
  STYLE_DENSITIES,
  STYLE_THEMES,
  STYLE_EMPHASES,
  LEGEND_POSITIONS,
} from './styleSchema';

// ----- regex bank -----------------------------------------------------------

// #RGB  /  #RRGGBB  /  #RRGGBBAA (the validator accepts all three).
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
// rgb(0, 0, 0) and rgba(0, 0, 0, 0.5) with permissive whitespace.
const RGB_RE =
  /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:\d*\.?\d+)\s*)?\)$/;
// hsl()/hsla() — same shape, percent-suffixed s/l.
const HSL_RE =
  /^hsla?\(\s*-?\d{1,3}(?:\.\d+)?\s*,\s*\d{1,3}(?:\.\d+)?%\s*,\s*\d{1,3}(?:\.\d+)?%\s*(?:,\s*(?:\d*\.?\d+)\s*)?\)$/;

// A small allowlist of CSS named colors that may legitimately appear in
// presets. We intentionally do NOT accept all 140+ named colours — this is
// the closed set the brief implies.
const NAMED_COLORS = new Set([
  'transparent',
  'black',
  'white',
  'red',
  'green',
  'blue',
  'cyan',
  'magenta',
  'yellow',
  'orange',
  'purple',
  'gray',
  'grey',
  'currentcolor',
]);

const isValidColor = (s: unknown): boolean => {
  if (typeof s !== 'string') return false;
  const t = s.trim();
  if (HEX_RE.test(t)) return true;
  if (RGB_RE.test(t)) return true;
  if (HSL_RE.test(t)) return true;
  if (NAMED_COLORS.has(t.toLowerCase())) return true;
  return false;
};

// ----- range constraints ----------------------------------------------------

// Font sizes — anything outside [10, 200] px is rejected. The validator is the
// hard limit; the normaliser does NOT clamp into this range (clamping a
// 5000-px font silently is misleading). Author error → fail loud.
const FONT_MIN = 10;
const FONT_MAX = 200;

// Spacing — non-negative and bounded so a typo can't push layout off-screen.
const SPACING_MIN = 0;
const SPACING_MAX = 200;

// ----- input-shape validation ----------------------------------------------

const enumCheck = <T extends string>(
  axis: string,
  value: unknown,
  allowed: readonly T[],
  details: StyleValidationDetail[],
): void => {
  if (value === undefined) return;
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    details.push({
      code: 'INVALID_ENUM',
      path: axis,
      value,
      expected: `one of: ${allowed.join(', ')}`,
      message: `expected one of [${allowed.join(', ')}]`,
    });
  }
};

const colorCheck = (
  path: string,
  value: unknown,
  details: StyleValidationDetail[],
): void => {
  if (value === undefined) return;
  if (!isValidColor(value)) {
    details.push({
      code: 'INVALID_COLOR',
      path,
      value,
      expected: '#RGB / #RRGGBB / #RRGGBBAA / rgb()/rgba() / hsl()/hsla() / named color',
      message: 'not a valid CSS color',
    });
  }
};

const fontSizeCheck = (
  path: string,
  value: unknown,
  details: StyleValidationDetail[],
): void => {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < FONT_MIN || value > FONT_MAX) {
    details.push({
      code: 'FONT_SIZE_OUT_OF_RANGE',
      path,
      value,
      expected: `[${FONT_MIN}, ${FONT_MAX}] px`,
      message: `font size out of [${FONT_MIN}, ${FONT_MAX}] px`,
    });
  }
};

const spacingCheck = (
  path: string,
  value: unknown,
  details: StyleValidationDetail[],
): void => {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < SPACING_MIN || value > SPACING_MAX) {
    details.push({
      code: 'SPACING_OUT_OF_RANGE',
      path,
      value,
      expected: `[${SPACING_MIN}, ${SPACING_MAX}] px`,
      message: `spacing out of [${SPACING_MIN}, ${SPACING_MAX}] px`,
    });
  }
};

const validateTokenOverrides = (
  o: DesignTokenOverrides | undefined,
  pathPrefix: string,
  details: StyleValidationDetail[],
): void => {
  if (!o) return;
  if (o.bg) for (const k of Object.keys(o.bg)) colorCheck(`${pathPrefix}.bg.${k}`, (o.bg as Record<string, unknown>)[k], details);
  if (o.ink) for (const k of Object.keys(o.ink)) colorCheck(`${pathPrefix}.ink.${k}`, (o.ink as Record<string, unknown>)[k], details);
  if (o.accent) for (const k of Object.keys(o.accent)) colorCheck(`${pathPrefix}.accent.${k}`, (o.accent as Record<string, unknown>)[k], details);
  if (o.typography?.size) {
    for (const k of Object.keys(o.typography.size)) {
      fontSizeCheck(`${pathPrefix}.typography.size.${k}`, (o.typography.size as Record<string, unknown>)[k], details);
    }
  }
  if (o.spacing) {
    for (const k of Object.keys(o.spacing)) {
      spacingCheck(`${pathPrefix}.spacing.${k}`, (o.spacing as Record<string, unknown>)[k], details);
    }
  }
  if (o.radius) {
    for (const k of Object.keys(o.radius)) {
      spacingCheck(`${pathPrefix}.radius.${k}`, (o.radius as Record<string, unknown>)[k], details);
    }
  }
  if (o.stroke) {
    for (const k of Object.keys(o.stroke)) {
      const v = (o.stroke as Record<string, unknown>)[k];
      if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 50)) {
        details.push({
          code: 'STROKE_OUT_OF_RANGE',
          path: `${pathPrefix}.stroke.${k}`,
          value: v,
          expected: '[0, 50] px',
          message: 'stroke width out of [0, 50] px',
        });
      }
    }
  }
};

// ----- public entry points --------------------------------------------------

// Validate the raw RenderStyleInput SHAPE — before the pipeline merges
// anything. Returns a structured detail list; caller decides whether to throw.
// Accessibility checks (contrast) run AFTER merge — see styleAccessibility.ts.
export const validateInput = (
  input: RenderStyleInput | undefined,
): StyleValidationDetail[] => {
  const details: StyleValidationDetail[] = [];
  if (!input) return details;

  // preset enum
  if (input.preset !== undefined) {
    enumCheck('preset', input.preset, STYLE_PRESETS, details);
  }

  // intent enums
  if (input.intent) {
    enumCheck('intent.tone', input.intent.tone, STYLE_TONES, details);
    enumCheck('intent.audience', input.intent.audience, STYLE_AUDIENCES, details);
    enumCheck('intent.medium', input.intent.medium, STYLE_MEDIUMS, details);
    enumCheck('intent.density', input.intent.density, STYLE_DENSITIES, details);
    enumCheck('intent.theme', input.intent.theme, STYLE_THEMES, details);
    enumCheck('intent.emphasis', input.intent.emphasis, STYLE_EMPHASES, details);
  }

  // visualization shape (both top-level and user.)
  const checkVisualization = (
    v: NonNullable<RenderStyleInput['visualization']> | undefined,
    pp: string,
  ): void => {
    if (!v) return;
    enumCheck(`${pp}.legendPosition`, v.legendPosition, LEGEND_POSITIONS, details);
    if (v.maxLabelsPerSeries !== undefined) {
      const n = v.maxLabelsPerSeries;
      if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 200) {
        details.push({
          code: 'MAX_LABELS_OUT_OF_RANGE',
          path: `${pp}.maxLabelsPerSeries`,
          value: n,
          expected: '[0, 200]',
          message: 'maxLabelsPerSeries out of [0, 200]',
        });
      }
    }
    if (v.treatmentLock !== undefined && v.treatmentLock !== null) {
      enumCheck(`${pp}.treatmentLock`, v.treatmentLock, ['crisp', 'sketch', 'whiteboard'] as const, details);
    }
  };
  checkVisualization(input.visualization, 'visualization');
  checkVisualization(input.user?.visualization, 'user.visualization');

  // token overrides
  validateTokenOverrides(input.tokens, 'tokens', details);
  validateTokenOverrides(input.user?.tokens, 'user.tokens', details);

  return details;
};

// Re-export the helpers — styleNormalization / styleAccessibility use them too.
export const _internals = {isValidColor, FONT_MIN, FONT_MAX, SPACING_MIN, SPACING_MAX};
