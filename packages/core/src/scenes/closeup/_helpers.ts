// Inlined helpers for the closeup scene.
//
// These mirror the v2.5.x engine's shared `glow` utility and the
// `codeTheme` Prism theme. The v3.0 fan-out moves each scene into its own
// directory in @docent/core; the shared component infrastructure
// (SceneFrame, Narration, FittedText, code-theme, glow, fonts) will be
// migrated by separate agents and reconciled by the integrator at merge
// time. For now we colocate the minimum each scene needs so the per-scene
// worktree builds clean.
//
// When the shared-infra migration lands, the closeup scene will import
// these from @docent/core/_shared (or equivalent) and this file goes away.

import type {PrismTheme} from 'prism-react-renderer';

/**
 * Translucent accent fills, for glows and panel washes. Mirrors
 * packages/engine/src/theme.ts:glow exactly.
 */
export const glow = (hex: string, alpha: number): string => {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
};

/**
 * Syntax theme for code scenes — tuned to the dark-console palette.
 * Mirrors packages/engine/src/components/code-theme.ts exactly.
 */
export const codeTheme: PrismTheme = {
  plain: {color: '#dfe4ee', backgroundColor: 'transparent'},
  styles: [
    {types: ['comment', 'prolog', 'doctype', 'cdata'], style: {color: '#5b6373', fontStyle: 'italic'}},
    {types: ['punctuation'], style: {color: '#8a93a6'}},
    {types: ['operator'], style: {color: '#9aa3b5'}},
    {types: ['keyword', 'rule', 'important', 'atrule'], style: {color: '#b69cff'}},
    {types: ['string', 'char', 'attr-value', 'inserted'], style: {color: '#5fe8a4'}},
    {types: ['number', 'boolean', 'constant', 'symbol'], style: {color: '#ffc24d'}},
    {types: ['function', 'function-variable'], style: {color: '#5cb6ff'}},
    {types: ['class-name', 'builtin', 'maybe-class-name'], style: {color: '#3fe0d0'}},
    {types: ['attr-name', 'property', 'variable'], style: {color: '#ff9bb0'}},
    {types: ['macro', 'namespace'], style: {color: '#ffc24d'}},
    {types: ['lifetime-annotation', 'lifetime'], style: {color: '#ff7d97'}},
    {types: ['deleted'], style: {color: '#ff7d97'}},
  ],
};

/**
 * Which beat is on screen at a given (scene-relative) frame. Mirrors the
 * v2.5.x engine's `activeBeatIndex`, adapted to walk the kit's
 * BeatTimelineSlot[] (which exposes `startFrame` rather than the legacy
 * `from`).
 */
export const activeBeatIndex = (
  beats: ReadonlyArray<{readonly startFrame: number}>,
  frame: number,
): number => {
  for (let i = beats.length - 1; i >= 0; i--) {
    const b = beats[i];
    if (b && frame >= b.startFrame) return i;
  }
  return 0;
};
