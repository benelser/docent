// docent.config.ts — the user-config on-ramp.
//
// The CLI's engine factory walks up from cwd looking for this file. When
// found, its `plugins` array is registered on top of @bjelser/core's
// corePlugins. Conflicts (same sceneType, same presetName) hard-fail at
// engine.use() time with both plugin names surfaced.

import scifi from './src';

export default {
  plugins: scifi,
};
