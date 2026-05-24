// styleNormalization — defensive cleanup applied AFTER the validator has
// already accepted the input shape, but BEFORE the accessibility pass.
//
// The brief is explicit: docent is fail-closed on invalid input. So
// normalization is NOT a forgiving "clamp anything weird into range" stage.
// It is instead a deterministic *rounding / canonicalisation* layer:
//
//   - Numeric tokens that survived validation may carry fractional pixel
//     values from intent-mapper math (e.g. density * 16 = 13.6); these get
//     rounded to integers so the renderer never sees non-integer px.
//   - Color strings are canonicalised to lowercase hex when they came in as
//     hex (so two equivalent representations produce one resolved style).
//   - Line-height and letter-spacing are clamped to their reasonable runtime
//     ranges (lineHeight in [0.8, 3.0]; letterSpacing in [-0.1, 0.5] em),
//     which the validator does NOT enforce by shape — they're soft ranges
//     the intent mapper could exceed.
//
// Pipeline location:
//   base renderer defaults
//   → named style preset
//   → semantic style intent
//   → agent-provided style overrides
//   → user preference overrides
//   → validation / normalization / accessibility constraints     ← THIS FILE
//   → resolved style object

import type {DesignTokens} from './styleTokens';

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const canonColor = (c: string): string => {
  const t = c.trim();
  if (HEX_RE.test(t)) {
    // Expand #rgb → #rrggbb, lowercase everything.
    const lower = t.toLowerCase();
    if (lower.length === 4) {
      const r = lower[1];
      const g = lower[2];
      const b = lower[3];
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    return lower;
  }
  return t;
};

const roundPx = (n: number): number => Math.round(n);

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

// Normalize a fully-merged DesignTokens — guaranteed to be a complete bundle.
// IMPORTANT: this function is byte-stable when the input is already canonical.
// `neutralTokens` MUST come through untouched (snapshot test pins this).
export const normalizeTokens = (t: DesignTokens): DesignTokens => ({
  bg: {
    void: canonColor(t.bg.void),
    base: canonColor(t.bg.base),
    panel: canonColor(t.bg.panel),
    panelHi: canonColor(t.bg.panelHi),
    line: canonColor(t.bg.line),
    lineHi: canonColor(t.bg.lineHi),
  },
  ink: {
    hi: canonColor(t.ink.hi),
    mid: canonColor(t.ink.mid),
    low: canonColor(t.ink.low),
    faint: canonColor(t.ink.faint),
  },
  accent: {
    blue: canonColor(t.accent.blue),
    cyan: canonColor(t.accent.cyan),
    green: canonColor(t.accent.green),
    amber: canonColor(t.accent.amber),
    rose: canonColor(t.accent.rose),
    violet: canonColor(t.accent.violet),
  },
  typography: {
    family: {...t.typography.family},
    size: {
      micro: roundPx(t.typography.size.micro),
      small: roundPx(t.typography.size.small),
      body: roundPx(t.typography.size.body),
      label: roundPx(t.typography.size.label),
      heading: roundPx(t.typography.size.heading),
      display: roundPx(t.typography.size.display),
    },
    weight: {
      body: clamp(Math.round(t.typography.weight.body / 100) * 100, 100, 900),
      label: clamp(Math.round(t.typography.weight.label / 100) * 100, 100, 900),
      heading: clamp(Math.round(t.typography.weight.heading / 100) * 100, 100, 900),
      display: clamp(Math.round(t.typography.weight.display / 100) * 100, 100, 900),
    },
    lineHeight: clamp(t.typography.lineHeight, 0.8, 3.0),
    letterSpacing: clamp(t.typography.letterSpacing, -0.1, 0.5),
  },
  spacing: {
    xs: roundPx(t.spacing.xs),
    sm: roundPx(t.spacing.sm),
    md: roundPx(t.spacing.md),
    lg: roundPx(t.spacing.lg),
    xl: roundPx(t.spacing.xl),
    gutter: roundPx(t.spacing.gutter),
  },
  radius: {
    sm: roundPx(t.radius.sm),
    md: roundPx(t.radius.md),
    lg: roundPx(t.radius.lg),
  },
  stroke: {
    hairline: t.stroke.hairline,
    thin: t.stroke.thin,
    regular: t.stroke.regular,
    bold: t.stroke.bold,
  },
});
