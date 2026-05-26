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

import path from 'node:path';
import {Config} from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer('angle');

// Remotion's CLI evaluates this config file via require() in CJS — neither
// `import.meta.dirname` nor `__dirname` is reliably populated. We resolve
// the project root from `process.cwd()` (Remotion's CLI sets cwd to the
// project root before evaluating the config — same as the legacy engine
// invocation).
const PROJECT_ROOT = process.cwd();

Config.overrideWebpackConfig((cfg) => ({
  ...cfg,
  resolve: {
    ...(cfg.resolve ?? {}),
    // .js → .ts/.tsx remap: @docent/core uses the ESM-explicit-.js re-export
    // pattern (`export {X} from './foo.js'`) even though sources are .tsx.
    // Webpack's default resolver doesn't do this remap; TS + Bun do.
    extensionAlias: {
      ...(cfg.resolve as {extensionAlias?: Record<string, string[]>})?.extensionAlias,
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mtsx', '.mjs'],
    },
    // Alias for the migration bridge namespace used by in-flight scene
    // migrations (currently: quantities). When the bridge consumers finish
    // migrating into @docent/core, this alias can be removed.
    alias: {
      ...(cfg.resolve as {alias?: Record<string, string>})?.alias,
      '@docent-engine-bridge': path.resolve(PROJECT_ROOT, 'packages/engine/src'),
    },
    // Stub out node-only modules for the chromium bundle. Core's kokoro TTS
    // provider statically imports `node:fs`; the kit's render-stage imports
    // `node:child_process` etc. Neither is reachable from chromium-side
    // render code (TTS runs in Node before render; render-stage is the
    // Node-side caller of `remotion render` itself). The empty-module stubs
    // let webpack complete its bundle without those node deps.
    fallback: {
      ...(cfg.resolve as {fallback?: Record<string, string | false>})?.fallback,
      child_process: false,
      fs: false,
      os: false,
      path: false,
      url: false,
      stream: false,
      crypto: false,
    },
  },
  // Webpack 5: `node:*` URIs and Node-only deps (kokoro-js, onnxruntime,
  // @huggingface/transformers, etc.) sit behind unreachable call paths in
  // the chromium bundle — TTS runs Node-side; the render-stage shells out
  // from Node. We externalize them as `var undefined` so webpack emits a
  // literal `undefined` reference (no `require()` call). Anything that tries
  // to actually USE these modules in chromium would fail, but the unreachable
  // code paths just sit dead in the bundle.
  externals: [
    ...(Array.isArray(cfg.externals)
      ? cfg.externals
      : cfg.externals
        ? [cfg.externals]
        : []),
    (
      {request}: {request?: string},
      callback: (e?: unknown, r?: string) => void,
    ) => {
      if (!request) return callback();
      const nodeOnlyPackages = [
        'kokoro-js',
        '@huggingface/transformers',
        'onnxruntime-node',
        'onnxruntime-web',
        'phonemizer',
        'sharp',
      ];
      const isNodeUri = request.startsWith('node:');
      const isNodeOnlyPkg =
        nodeOnlyPackages.includes(request) ||
        nodeOnlyPackages.some((p) => request.startsWith(p + '/'));
      if (isNodeUri || isNodeOnlyPkg) {
        // `var undefined` external type: webpack emits `module.exports = undefined`
        // at the import site. Chromium evaluates it without trying to call
        // `require()`. The downside: any code that actually invokes a member
        // (e.g. `mkdirSync(...)`) throws — but those code paths are dead in
        // the chromium-side render path.
        return callback(null, 'var undefined');
      }
      return callback();
    },
  ],
}));
