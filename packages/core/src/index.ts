// @bjelser/core — the default implementation of @bjelser/kit.
//
// The plugin manifest lives in `index.generated.ts` and is produced by
// `scripts/gen-manifest.ts`. This file is a thin re-export so callers can
// keep importing `@bjelser/core` (the package's main export). Regenerate
// after adding/removing a plugin directory:
//
//   bun packages/core/scripts/gen-manifest.ts
//
// CI guards staleness — see the gen:manifest:check script in package.json.
//
// Loading:
//
//   import {Engine} from '@bjelser/kit';
//   import {corePlugins} from '@bjelser/core';
//   const engine = new Engine().use(corePlugins);

export {corePlugins} from './index.generated';
export * from './index.generated';
export {default} from './index.generated';
