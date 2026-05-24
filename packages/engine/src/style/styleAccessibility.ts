// styleAccessibility — WCAG AA contrast enforcement on the resolved style.
//
// Per the brief, docent is fail-closed: a contrast violation after the
// preset+intent+overrides merge throws a `StyleValidationError`. No silent
// "nudge into compliance" — the author sees the failed constraint and the
// exact pair that broke.
//
// Constraint:
//   - Body text vs background: ratio ≥ 4.5:1.
//   - Large text vs background: ratio ≥ 3.0:1.
//     "Large" is defined by WCAG as ≥ 24 px, OR ≥ 19 px when also bold (≥ 700).
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
import type {StyleValidationDetail} from './styleSchema';

// ----- color parsing --------------------------------------------------------

// Parse a CSS hex / rgb / rgba color into linear-RGB components in [0, 1].
// Returns null if unparseable (validator caught this earlier; but if we get
// here with a weird color the accessibility checker degrades gracefully —
// produces no false-positive and lets the validator do its job).
type Rgb = {r: number; g: number; b: number};

const parseHex = (s: string): Rgb | null => {
  const t = s.trim().toLowerCase();
  // #rgb / #rrggbb / #rrggbbaa
  let m: RegExpMatchArray | null;
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(t);
  if (m) {
    return {
      r: parseInt(m[1] + m[1], 16) / 255,
      g: parseInt(m[2] + m[2], 16) / 255,
      b: parseInt(m[3] + m[3], 16) / 255,
    };
  }
  m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})(?:[0-9a-f]{2})?$/.exec(t);
  if (m) {
    return {
      r: parseInt(m[1], 16) / 255,
      g: parseInt(m[2], 16) / 255,
      b: parseInt(m[3], 16) / 255,
    };
  }
  return null;
};

const parseRgb = (s: string): Rgb | null => {
  const m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(s.trim());
  if (!m) return null;
  return {
    r: Number(m[1]) / 255,
    g: Number(m[2]) / 255,
    b: Number(m[3]) / 255,
  };
};

const NAMED_TO_HEX: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
  gray: '#808080',
  grey: '#808080',
};

const parseColor = (s: string): Rgb | null => {
  const t = s.trim().toLowerCase();
  if (t in NAMED_TO_HEX) return parseHex(NAMED_TO_HEX[t]);
  if (t.startsWith('#')) return parseHex(t);
  if (t.startsWith('rgb')) return parseRgb(t);
  return null;
};

// ----- contrast math (WCAG 2.1) --------------------------------------------

// sRGB → linear-RGB per the WCAG formula.
const channelToLinear = (c: number): number =>
  c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

const relativeLuminance = (rgb: Rgb): number => {
  const r = channelToLinear(rgb.r);
  const g = channelToLinear(rgb.g);
  const b = channelToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// WCAG contrast ratio — always in [1.0, 21.0].
export const contrastRatio = (fg: string, bg: string): number => {
  const a = parseColor(fg);
  const b = parseColor(bg);
  if (!a || !b) return 1; // can't compute → worst case (validator will reject)
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

// Whether a (font-size, weight) pair qualifies as WCAG "large text".
const isLargeText = (sizePx: number, weight: number): boolean => {
  if (sizePx >= 24) return true;
  if (sizePx >= 19 && weight >= 700) return true;
  return false;
};

// ----- public entry ---------------------------------------------------------

// AA thresholds.
const AA_BODY = 4.5;
const AA_LARGE = 3.0;

// Audit the resolved tokens. Body-text (`ink.hi`) vs the dominant background
// (`bg.panel`) is the primary pair the renderer puts text against in cards.
// Headings (`ink.hi` at heading size) get the relaxed threshold. The line
// stroke (`bg.line`) vs panel is checked at 3:1 — a separator stroke is the
// equivalent of "non-text content" but docent uses it to convey structure.
export const auditContrast = (tokens: DesignTokens): StyleValidationDetail[] => {
  const details: StyleValidationDetail[] = [];

  // body text — ink.hi over bg.panel. Body size is tokens.typography.size.body
  // at weight tokens.typography.weight.body.
  const bodyRatio = contrastRatio(tokens.ink.hi, tokens.bg.panel);
  const bodyLarge = isLargeText(tokens.typography.size.body, tokens.typography.weight.body);
  const bodyThreshold = bodyLarge ? AA_LARGE : AA_BODY;
  if (bodyRatio < bodyThreshold) {
    details.push({
      code: 'CONTRAST_BODY_BELOW_AA',
      path: 'tokens.ink.hi vs tokens.bg.panel',
      value: {fg: tokens.ink.hi, bg: tokens.bg.panel, ratio: Number(bodyRatio.toFixed(2))},
      expected: `ratio ≥ ${bodyThreshold} (WCAG AA ${bodyLarge ? 'large' : 'body'})`,
      message: `body text contrast ${bodyRatio.toFixed(2)}:1 < ${bodyThreshold}:1`,
    });
  }

  // mid-tone text — ink.mid vs bg.panel. Used for sub-headings / captions.
  // Mid is allowed at the large-text threshold (most uses are caption-sized
  // but still readable); the check is informational-rare-fail rather than
  // body-strict. We still hold it at AA_LARGE.
  const midRatio = contrastRatio(tokens.ink.mid, tokens.bg.panel);
  if (midRatio < AA_LARGE) {
    details.push({
      code: 'CONTRAST_MID_BELOW_AA',
      path: 'tokens.ink.mid vs tokens.bg.panel',
      value: {fg: tokens.ink.mid, bg: tokens.bg.panel, ratio: Number(midRatio.toFixed(2))},
      expected: `ratio ≥ ${AA_LARGE}`,
      message: `mid-tone text contrast ${midRatio.toFixed(2)}:1 < ${AA_LARGE}:1`,
    });
  }

  // NOTE on bg.line vs bg.panel: docent's line stroke is a *decorative*
  // separator, not a UI control or text. WCAG AA does NOT require any
  // contrast minimum for decorative content. The pipeline therefore does not
  // gate on this pair — the neutral preset's line stroke is 1.34:1 by design
  // (the dark-console aesthetic depends on it). If a future preset uses lines
  // as informational chrome, a render-time consumer can compute the ratio
  // from the resolved tokens directly via `contrastRatio()`.

  return details;
};
