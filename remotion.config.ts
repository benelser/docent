// Remotion config loaded by `remotion render` from the project root.
//
// Critical: @docent/core ships its component re-exports using the modern
// "ESM-with-explicit-.js" pattern (`export {X} from './foo.js'` even though
// the source is `./foo.tsx`). TypeScript and Bun's TS resolver remap `.js`
// to `.tsx` automatically; webpack's default resolver does NOT. The
// `resolve.extensionAlias` knob below tells webpack: when an import ends in
// `.js`, also try `.ts` / `.tsx` on disk.
//
// Without this, `remotion render` against any entry that traverses
// @docent/core fails with "Field 'browser' doesn't contain a valid alias
// configuration … component.js.tsx doesn't exist".

import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer('angle');

Config.overrideWebpackConfig((cfg) => ({
  ...cfg,
  resolve: {
    ...(cfg.resolve ?? {}),
    extensionAlias: {
      ...(cfg.resolve as {extensionAlias?: Record<string, string[]>})?.extensionAlias,
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mtsx', '.mjs'],
    },
  },
}));
