// morph-layer — R16.3 cross-scene element morphing.
//
// The composition mounts one `<MorphLayer>` between every pair of adjacent
// scenes whose subsequent scene declares `transition.kind === 'morph'` and
// whose `morphIds` share at least one element id. The layer renders for
// `transition.frames` frames ending at scene B's start frame; during that
// overlap it draws a div per shared id whose position / size / style / label
// tween from scene A's value to scene B's value.
//
// What this file does NOT do:
//   - own the scene content (scene A and scene B keep rendering normally
//     under the morph layer — the morph divs are sibling overlays);
//   - hide the underlying scene chrome (the author keeps the diagram in scene
//     A visible during the morph; the morph is an *additional* visual layer);
//   - persist state across renders (every frame samples the same pure
//     interpolators).
//
// Layering decision (documented at the call site too):
//   scene A content
//     → scene B content (during overlap; fades in)
//       → MorphLayer (above both; the morphing element is the visual
//         throughline the viewer's eye follows)
//         → scene-feature plugins (audio overlay, captions, watermark)
//
// Coordinate system: canvas-pixel space. The layer is an `AbsoluteFill` at
// the composition's full resolution; positions/sizes in `MorphElement` are
// read directly as `style.left`, `style.top`, `style.width`, `style.height`.
//
// Color interpolation: HSL space (parse hex → HSL on each side → lerp h/s/l
// → re-emit hex). HSL is the right space for most marketing/UI colors;
// colors at the gamut edge (true black, true white) collapse to the same
// hue and pass through cleanly. A document-level note in the spec discusses
// the tradeoff vs. OKLCH (which would be the rigorous-color choice but adds
// a transform-matrix dependency the kit currently avoids).

import React from 'react';
import {AbsoluteFill, interpolate} from 'remotion';

import type {MorphElement, SceneMorphIds} from '../types/spec';

// ---------------------------------------------------------------------------
// Public surface — utilities authors and the composition import.
// ---------------------------------------------------------------------------

/**
 * Return the sorted intersection of ids present in BOTH `a.morphIds` and
 * `b.morphIds`. Pure and side-effect-free; safe to call from the validator,
 * the composition, or a test.
 *
 * An empty result is the "fallback to dissolve" signal the composition
 * uses when an author named `transition.kind: 'morph'` but the ids didn't
 * bind.
 */
export const findMatchedIds = (
  a: SceneMorphIds | undefined,
  b: SceneMorphIds | undefined,
): string[] => {
  if (!a || !b) return [];
  const out: string[] = [];
  for (const k of Object.keys(a)) {
    if (Object.prototype.hasOwnProperty.call(b, k)) out.push(k);
  }
  out.sort();
  return out;
};

/**
 * Parse a hex color (`#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`) into its RGB
 * channels in [0, 255] + alpha in [0, 1]. Returns `null` for non-hex input
 * — the caller falls back to "hold a's value, crossfade" in that case.
 */
const parseHex = (
  raw: string,
): {r: number; g: number; b: number; a: number} | null => {
  const s = raw.trim();
  if (!s.startsWith('#')) return null;
  const hex = s.slice(1);
  let r = 0, g = 0, b = 0, a = 1;
  if (hex.length === 3 || hex.length === 4) {
    r = parseInt(hex[0]! + hex[0]!, 16);
    g = parseInt(hex[1]! + hex[1]!, 16);
    b = parseInt(hex[2]! + hex[2]!, 16);
    if (hex.length === 4) a = parseInt(hex[3]! + hex[3]!, 16) / 255;
  } else if (hex.length === 6 || hex.length === 8) {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
    if (hex.length === 8) a = parseInt(hex.slice(6, 8), 16) / 255;
  } else {
    return null;
  }
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return {r, g, b, a};
};

/** sRGB [0,255] → HSL with h in [0,360), s/l in [0,1]. */
const rgbToHsl = (
  r: number,
  g: number,
  b: number,
): {h: number; s: number; l: number} => {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return {h: 0, s: 0, l};
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return {h, s, l};
};

/** HSL → sRGB [0,255]. Uses the chroma-based C/X/M formulation. */
const hslToRgb = (
  h: number,
  s: number,
  l: number,
): {r: number; g: number; b: number} => {
  if (s === 0) {
    const v = Math.round(l * 255);
    return {r: v, g: v, b: v};
  }
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp < 1) {
    r1 = c; g1 = x; b1 = 0;
  } else if (hp < 2) {
    r1 = x; g1 = c; b1 = 0;
  } else if (hp < 3) {
    r1 = 0; g1 = c; b1 = x;
  } else if (hp < 4) {
    r1 = 0; g1 = x; b1 = c;
  } else if (hp < 5) {
    r1 = x; g1 = 0; b1 = c;
  } else {
    r1 = c; g1 = 0; b1 = x;
  }
  const m = l - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Interpolate between two CSS colors at progress `t` in [0, 1]. Both
 * `from` and `to` should be hex strings — non-hex input causes the
 * function to return `to` when t >= 0.5 and `from` otherwise (a graceful
 * fallback; better than throwing). HSL is used as the working space so
 * mid-points have a natural hue path rather than a muddy RGB mid-grey.
 *
 * Edge cases:
 *   - `from === to`: returns `from` unchanged.
 *   - One side at saturation 0 (pure grey, pure black, pure white): the
 *     hue is irrelevant; the resulting hue tracks the colored side, so
 *     a black→red interpolation hits the right intermediate reds rather
 *     than getting stuck at hue=0 for blacks.
 */
export const interpolateColor = (
  from: string,
  to: string,
  t: number,
): string => {
  if (from === to) return from;
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) {
    return t >= 0.5 ? to : from;
  }
  const ah = rgbToHsl(a.r, a.g, a.b);
  const bh = rgbToHsl(b.r, b.g, b.b);
  // Take the shorter hue path. If one side is unsaturated (pure grey),
  // borrow the other side's hue so we don't drag through hue 0.
  let aHue = ah.s === 0 ? bh.h : ah.h;
  let bHue = bh.s === 0 ? ah.h : bh.h;
  const diff = bHue - aHue;
  if (diff > 180) aHue += 360;
  else if (diff < -180) bHue += 360;
  const h = (lerp(aHue, bHue, t) + 360) % 360;
  const s = lerp(ah.s, bh.s, t);
  const l = lerp(ah.l, bh.l, t);
  const alpha = lerp(a.a, b.a, t);
  const rgb = hslToRgb(h, s, l);
  if (alpha < 0.999) {
    const aHex = Math.round(alpha * 255)
      .toString(16)
      .padStart(2, '0');
    return (
      '#' +
      rgb.r.toString(16).padStart(2, '0') +
      rgb.g.toString(16).padStart(2, '0') +
      rgb.b.toString(16).padStart(2, '0') +
      aHex
    );
  }
  return (
    '#' +
    rgb.r.toString(16).padStart(2, '0') +
    rgb.g.toString(16).padStart(2, '0') +
    rgb.b.toString(16).padStart(2, '0')
  );
};

// ---------------------------------------------------------------------------
// MorphLayer — the React component the composition mounts during overlap.
// ---------------------------------------------------------------------------

export interface MorphLayerProps {
  /** The previous scene's morphIds (source values). */
  readonly fromIds: SceneMorphIds;
  /** The upcoming scene's morphIds (target values). */
  readonly toIds: SceneMorphIds;
  /**
   * The current frame within the OVERLAP window, in [0, totalFrames].
   * The composition computes this from the global frame minus the layer's
   * `from` offset; the layer itself does NOT call `useCurrentFrame()` so
   * it can be tested off-screen.
   */
  readonly frameInWindow: number;
  /** The total length of the overlap window in frames. */
  readonly totalFrames: number;
}

/**
 * `<MorphLayer>` — the visual continuity layer. Renders one `<div>` per
 * matched id whose position/size/style/label is tweened from the previous
 * scene's value to the upcoming scene's value over the overlap window.
 *
 * Pure component — every frame's render is a function of (fromIds, toIds,
 * frameInWindow, totalFrames). Safe to render alongside scene content
 * without worrying about React state.
 */
export const MorphLayer: React.FC<MorphLayerProps> = ({
  fromIds,
  toIds,
  frameInWindow,
  totalFrames,
}) => {
  const matched = findMatchedIds(fromIds, toIds);
  if (matched.length === 0) return null;
  // Cubic ease-in-out — gives the morph a settled landing rather than a
  // linear glide that arrives at the same speed it started.
  const t = interpolate(frameInWindow, [0, Math.max(1, totalFrames)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {matched.map((id) => {
        const a = fromIds[id]!;
        const b = toIds[id]!;
        const x = lerp(a.x, b.x, eased);
        const y = lerp(a.y, b.y, eased);
        const w = lerp(a.w, b.w, eased);
        const h = lerp(a.h, b.h, eased);
        const opacity = lerp(a.opacity ?? 1, b.opacity ?? 1, eased);
        const borderRadius = lerp(
          a.borderRadius ?? 0,
          b.borderRadius ?? 0,
          eased,
        );
        const background =
          a.color && b.color
            ? interpolateColor(a.color, b.color, eased)
            : a.color ?? b.color ?? 'transparent';
        // The label crossfades: A's label fades out across the first half,
        // B's label fades in across the second half. When labels match the
        // text stays put and only the position morphs.
        const aLabel = a.label ?? '';
        const bLabel = b.label ?? '';
        const labelsMatch = aLabel === bLabel;
        const aLabelOpacity = labelsMatch ? 1 : interpolate(eased, [0, 0.5], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
        const bLabelOpacity = labelsMatch ? 0 : interpolate(eased, [0.5, 1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
        return (
          <div
            key={`morph-${id}`}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: w,
              height: h,
              background,
              borderRadius,
              opacity,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily:
                'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
              fontWeight: 600,
              color: '#ffffff',
              textShadow: '0 1px 2px rgba(0,0,0,0.4)',
              willChange: 'transform, opacity',
              transition: 'none',
            }}
            data-morph-id={id}
          >
            {labelsMatch ? (
              aLabel
            ) : (
              <>
                <span style={{position: 'absolute', opacity: aLabelOpacity}}>
                  {aLabel}
                </span>
                <span style={{position: 'absolute', opacity: bLabelOpacity}}>
                  {bLabel}
                </span>
              </>
            )}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
