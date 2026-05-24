// styleResolver — the pipeline. Everything else is data; this is the one
// deterministic merge function.
//
// Pipeline:
//   base renderer defaults                                  (neutralTokens)
//   → named style preset                                    (stylePresets.ts)
//   → semantic style intent                                 (styleIntentMapper.ts)
//   → agent-provided style overrides                        (input.tokens / .visualization)
//   → user preference overrides                             (input.user.tokens / .visualization)
//   → validation / normalization / accessibility constraints
//   → resolved style object
//
// The renderer consumes ONLY the ResolvedStyle this returns. Raw input never
// crosses the line.
//
// FAIL-CLOSED — invalid input shape, contrast violation, or any other
// constraint failure throws a `StyleValidationError` with structured detail.

import type {DesignTokens} from './styleTokens';
import {neutralTokens} from './styleTokens';
import type {
  RenderStyleInput,
  ResolvedStyle,
  StylePreset,
  StyleIntent,
  StyleValidationDetail,
  DesignTokenOverrides,
  VisualizationStyle,
} from './styleSchema';
import {StyleValidationError} from './styleSchema';
import {PRESETS} from './stylePresets';
import {mapIntent} from './styleIntentMapper';
import {validateInput} from './styleValidator';
import {normalizeTokens} from './styleNormalization';
import {auditContrast} from './styleAccessibility';

// ----- merge plumbing -------------------------------------------------------

// Apply a DesignTokenOverrides patch onto a complete DesignTokens, returning
// a new complete DesignTokens. Undefined fields in the patch leave the base
// alone (deep, field-by-field).
const applyOverrides = (
  base: DesignTokens,
  patch: DesignTokenOverrides | undefined,
): DesignTokens => {
  if (!patch) return base;
  return {
    bg: {...base.bg, ...patch.bg},
    ink: {...base.ink, ...patch.ink},
    accent: {...base.accent, ...patch.accent},
    typography: {
      family: {...base.typography.family, ...patch.typography?.family},
      size: {...base.typography.size, ...patch.typography?.size},
      weight: {...base.typography.weight, ...patch.typography?.weight},
      lineHeight: patch.typography?.lineHeight ?? base.typography.lineHeight,
      letterSpacing: patch.typography?.letterSpacing ?? base.typography.letterSpacing,
    },
    spacing: {...base.spacing, ...patch.spacing},
    radius: {...base.radius, ...patch.radius},
    stroke: {...base.stroke, ...patch.stroke},
  };
};

const applyVisualization = (
  base: Required<VisualizationStyle>,
  patch: VisualizationStyle | undefined,
): Required<VisualizationStyle> => {
  if (!patch) return base;
  return {
    legendPosition: patch.legendPosition ?? base.legendPosition,
    gridLines: patch.gridLines ?? base.gridLines,
    axisLabels: patch.axisLabels ?? base.axisLabels,
    maxLabelsPerSeries: patch.maxLabelsPerSeries ?? base.maxLabelsPerSeries,
    treatmentLock: patch.treatmentLock === undefined ? base.treatmentLock : patch.treatmentLock,
  };
};

// ----- defaults -------------------------------------------------------------

// What `intent` looks like when the caller supplied none. The mapper produces
// an empty delta for these; this constant exists for the ResolvedStyle's
// `intent` field so a downstream consumer can read it without undefined-checks.
const DEFAULT_INTENT: StyleIntent = {
  tone: 'neutral',
  audience: 'general',
  medium: 'web',
  density: 'comfortable',
  theme: 'auto',
  emphasis: 'insight-first',
};

const DEFAULT_VISUALIZATION: Required<VisualizationStyle> = {
  legendPosition: 'right',
  gridLines: true,
  axisLabels: true,
  maxLabelsPerSeries: 8,
  treatmentLock: null,
};

// ----- the resolver ---------------------------------------------------------

// resolveStyle — the single pipeline entry point. Pure: same input → same
// output, deterministically, with no side effects.
//
// Stages (mirroring the documented pipeline):
//   0) validate input shape (fail-closed: any issue throws BEFORE merging)
//   1) base renderer defaults  ← neutralTokens
//   2) named style preset       (input.preset ?? 'neutral')
//   3) semantic style intent    (mapIntent(input.intent))
//   4) agent-provided overrides (input.tokens / input.visualization)
//   5) user preference overrides (input.user.tokens / .visualization)
//   6) normalize
//   7) accessibility audit (fail-closed)
//   8) return the resolved style
//
// `resolveStyle(undefined)` is the byte-identical backward-compat path: it
// MUST return tokens that match neutralTokens exactly, and (by extension)
// theme.ts byte-for-byte. The snapshot test pins this.
export const resolveStyle = (input?: RenderStyleInput): ResolvedStyle => {
  // 0) input-shape validation
  const inputDetails = validateInput(input);
  if (inputDetails.length > 0) {
    throw new StyleValidationError(inputDetails);
  }

  // 1) base defaults
  let tokens: DesignTokens = neutralTokens;
  let viz: Required<VisualizationStyle> = DEFAULT_VISUALIZATION;

  // 2) preset
  const presetName: StylePreset = input?.preset ?? 'neutral';
  const preset = PRESETS[presetName];
  // The preset's `tokens` field is already a complete bundle (presets are
  // expressed as token bundles, not deltas), so this overwrites layer 1.
  tokens = preset.tokens;
  viz = preset.visualization;

  // 3) intent — pure-data delta merged over the preset.
  const intentDelta = mapIntent(input?.intent);
  tokens = applyOverrides(tokens, intentDelta.tokens);
  viz = applyVisualization(viz, intentDelta.visualization);

  // 4) agent-provided overrides
  tokens = applyOverrides(tokens, input?.tokens);
  viz = applyVisualization(viz, input?.visualization);

  // 5) user preference overrides (last — user beats agent)
  tokens = applyOverrides(tokens, input?.user?.tokens);
  viz = applyVisualization(viz, input?.user?.visualization);

  // 6) normalize. The neutral path is byte-stable through this stage.
  tokens = normalizeTokens(tokens);

  // 7) accessibility audit — fail-closed.
  const contrastDetails: StyleValidationDetail[] = auditContrast(tokens);
  if (contrastDetails.length > 0) {
    throw new StyleValidationError(contrastDetails);
  }

  // 8) the resolved style. We fill the normalized intent in for provenance —
  // downstream code (and the debug logger) can read what was actually asked.
  const resolved: ResolvedStyle = {
    preset: presetName,
    intent: {...DEFAULT_INTENT, ...input?.intent},
    tokens,
    visualization: viz,
    provenance: {
      preset: presetName,
      intent: input?.intent ?? {},
      hasTokenOverrides: Boolean(input?.tokens),
      hasUserOverrides: Boolean(input?.user?.tokens || input?.user?.visualization),
    },
  };
  return resolved;
};
