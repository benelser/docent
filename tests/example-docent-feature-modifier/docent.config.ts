// docent.config.ts — wires @example/docent-feature-modifier into the engine.
//
// The feature's registerModifiers hook fires during engine.use(). The
// cascade walks the resulting ModifierRegistry after preprocessSpec.

import modifierFeature from './src';

export default {
  plugins: [modifierFeature],
};
