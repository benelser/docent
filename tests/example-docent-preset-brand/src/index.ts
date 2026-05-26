// @example/docent-preset-brand — a pure preset pack.
//
// Adds ONE preset (`acme`) — a fictional company-brand register. The pack
// adds no custom scenes; the preset reskins the canonical 29 with Acme's
// brand palette (deep navy, white ink, gold accent).
//
// A consumer wires this pack into the engine via:
//
//   import {Engine} from '@docent/kit';
//   import corePlugins from '@docent/core';
//   import brand from '@example/docent-preset-brand';
//
//   const engine = new Engine().use(corePlugins).use(brand);
//
// A film opts in by naming the preset:
//
//   "style": {"preset": "acme"}

import type {Plugin} from '@docent/kit';

import {acmePreset} from './presets/acme';

export {acmePreset} from './presets/acme';

const plugins: ReadonlyArray<Plugin> = [acmePreset];

export default plugins;
