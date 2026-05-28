// acme-dark — Acme brand, dark mode.
//
// Demonstrates R4 preset composition: this preset declares
// `extends: 'acme'` and overrides ONLY the bg.* tokens (and the ink.faint
// disabled color). Everything else — accents, typography, spacing,
// radius, stroke, visualization knobs — inherits from acme verbatim.
//
// The style resolver walks the chain: [acme, acme-dark]. Tokens compose
// neutral floor → acme → acme-dark → spec-level overrides. The most
// distinctive Acme element — the gold accent — survives unchanged.
//
// Authors opt into this preset by writing `style: {preset: 'acme-dark'}`
// at the film level. Both packs (acme and acme-dark) must be registered.
// Cross-pack composition is the same protocol — a community pack could
// declare `extends: 'acme'` from its own repo.

import type {DesignTokens, PresetPlugin} from '@bjelser/kit';

// Only the bg.* group + ink.faint diverge. Every other token inherits
// from acme through the extends chain.
const bgDarkOverride: Partial<DesignTokens['bg']> = {
  void: '#000000',        // true black ground
  base: '#040814',        // near-black with the navy hint
  panel: '#0a1024',       // deep panel
  panelHi: '#101a3a',     // active panel — still readable
  line: '#1a2a52',        // border
  lineHi: '#2a3f72',      // focused border
};

const inkDarkOverride: Partial<DesignTokens['ink']> = {
  // hi/mid/low stay from acme (high-contrast on the deeper ground works).
  // Adjust only `faint` so disabled text doesn't disappear against the
  // darker panel.
  faint: '#3a455e',
};

export const acmeDarkPreset: PresetPlugin = {
  kind: 'preset',
  name: '@example/docent-preset-brand/acme-dark',
  version: '0.1.0',
  presetName: 'acme-dark',
  extends: 'acme',  // ← R4: compose on top of the acme preset
  tokens: {
    bg: bgDarkOverride as DesignTokens['bg'],
    ink: inkDarkOverride as DesignTokens['ink'],
  } as Partial<DesignTokens> as DesignTokens,
  notes:
    "Acme Corp dark mode. Extends 'acme' — same gold accent + typography + spacing; only the bg/ink.faint diverge.",
};

export default acmeDarkPreset;
