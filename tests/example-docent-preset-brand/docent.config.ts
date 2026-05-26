// docent.config.ts — wires @example/docent-preset-brand into the engine.
//
// The CLI's engine factory walks up from cwd looking for this file. When
// found, its `plugins` array is registered on top of @docent/core's
// corePlugins. The brand pack adds one preset (`acme`) — no custom scenes.
//
// A film opts into the preset by writing `meta.style: {preset: 'acme'}` (or
// the equivalent top-level `style.preset` field).

import brand from './src';

export default {
  plugins: brand,
};
