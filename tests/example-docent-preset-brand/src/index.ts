// @example/docent-preset-brand — a pure preset pack.
//
// Adds TWO presets:
//   - `acme`       — the base brand register (deep navy, white ink, gold accent)
//   - `acme-dark`  — extends `acme`; overrides only the bg.* + ink.faint
//                    tokens to a near-black ground. Inherits the accent
//                    palette, typography, spacing, radius, stroke, and
//                    visualization knobs unchanged.
//
// The pack adds no custom scenes; both presets reskin the canonical 29
// with the Acme brand voice.
//
// `acme-dark` is the **R4 preset composition demo** — proves the kit's
// `extends` field resolves a base-first chain at style-resolution time.
// A consumer wires this pack into the engine via:
//
//   import {Engine} from '@bjelser/kit';
//   import corePlugins from '@bjelser/core';
//   import brand from '@example/docent-preset-brand';
//
//   const engine = new Engine().use(corePlugins).use(brand);
//
// A film opts into either preset by name:
//
//   "style": {"preset": "acme"}        // brand, light
//   "style": {"preset": "acme-dark"}   // brand, dark — composed from acme

import type {Plugin} from '@bjelser/kit';

import {acmePreset} from './presets/acme';
import {acmeDarkPreset} from './presets/acme-dark';

export {acmePreset} from './presets/acme';
export {acmeDarkPreset} from './presets/acme-dark';

const plugins: ReadonlyArray<Plugin> = [acmePreset, acmeDarkPreset];

export default plugins;
