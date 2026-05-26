// Compute the `DOCENT_PLUGINS_MODULE` env var the kit's Remotion entry reads.
//
// The render subprocess re-builds the Engine from a module pointed at by
// `DOCENT_PLUGINS_MODULE`. Two cases:
//
//   1. No user config — point directly at `@docent/core`'s package entry. The
//      spawned process resolves it via its own node_modules tree (works for
//      both workspaced + npm-installed setups).
//
//   2. User config present — generate a tiny TS glue file that imports core +
//      the user config and exports the combined plugin array. The glue is
//      written under `.docent/tmp/` next to the user's project so the
//      subprocess can resolve relative imports (`./docent.config.ts`).

import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, relative, resolve} from 'node:path';

import {fileURLToPath} from 'node:url';

/**
 * Resolve the absolute path of `@docent/core`'s entry — used as the default
 * `DOCENT_PLUGINS_MODULE`. We import.meta.resolve through Node's resolver to
 * avoid hard-coding a workspace layout.
 */
const resolveCoreEntry = async (): Promise<string> => {
  // Try import.meta.resolve first (Bun + recent Node).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta = import.meta as any;
  if (typeof meta.resolve === 'function') {
    try {
      const url = await meta.resolve('@docent/core');
      if (typeof url === 'string' && url.startsWith('file:')) {
        return fileURLToPath(url);
      }
    } catch {
      // fall through
    }
  }
  // Fallback: resolve via require.resolve if available.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const req = (
      Function('return require')() as NodeJS.Require
    );
    return req.resolve('@docent/core');
  } catch {
    throw new Error(
      '[@docent/cli] could not resolve @docent/core. Is it installed? ' +
        'In a workspace setup, ensure `bun install` ran from the repo root.',
    );
  }
};

/**
 * Resolve the `DOCENT_PLUGINS_MODULE` for a render. When a config file is
 * loaded, writes a glue module that imports core + config and re-exports the
 * combined array. The glue file lives next to the config file under
 * `.docent/tmp/render-plugins-<filmId>.ts`.
 */
export const resolvePluginsModule = async (
  configPath: string | null,
  projectRoot: string,
  filmId: string,
): Promise<string> => {
  const coreEntry = await resolveCoreEntry();
  if (!configPath) {
    return coreEntry;
  }

  // Generate a glue file. We write it under .docent/tmp/ in the project root
  // so its relative path to the config is stable.
  const tmpDir = resolve(projectRoot, '.docent', 'tmp');
  mkdirSync(tmpDir, {recursive: true});
  const gluePath = resolve(tmpDir, `render-plugins-${filmId}.${Date.now()}.mjs`);

  // The glue file is .mjs so Bun/Node can import it directly without TS.
  // We import the user config dynamically (because it might be .ts — Bun
  // handles TS via on-the-fly transpile when imported from .mjs only on
  // its own loader; for Node compatibility we recommend .mjs/.js configs).
  //
  // The user config CAN be .ts because the render entry runs inside Remotion's
  // bundled context which compiles TS — but the glue file itself must import
  // a path that's resolvable from the subprocess. We use the absolute path
  // to the user config.
  const relConfig = relative(dirname(gluePath), configPath).replace(/\\/g, '/');
  const relCore = relative(dirname(gluePath), coreEntry).replace(/\\/g, '/');

  const source = `// AUTO-GENERATED — do not edit. Regenerated per render.
// Combines @docent/core's plugins with the user's docent.config plugins.
import core from ${JSON.stringify(relCore.startsWith('.') ? relCore : './' + relCore)};
import userConfig from ${JSON.stringify(relConfig.startsWith('.') ? relConfig : './' + relConfig)};

const userPlugins = Array.isArray(userConfig?.default?.plugins)
  ? userConfig.default.plugins
  : Array.isArray(userConfig?.plugins)
    ? userConfig.plugins
    : [];

const coreArr = Array.isArray(core?.default) ? core.default : Array.isArray(core) ? core : [];
const allPlugins = [...coreArr, ...userPlugins];
export default allPlugins;
`;
  writeFileSync(gluePath, source, 'utf-8');
  return gluePath;
};
