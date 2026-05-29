// Generator for the per-render Remotion entry script.
//
// Why per-render: Remotion bundles for chromium; everything reachable from
// the entry must be statically importable at bundle time. Plugins live in
// `@bjelser/core` (always) plus optionally in a user `docent.config.ts`. The
// CLI knows both paths at render time and writes a small entry .tsx that
// statically imports them and calls `registerKitRoot({plugins, spec})`.
//
// Why TS (not pre-compiled JS): Remotion's bundler accepts .tsx and runs
// esbuild/webpack with TS support. The generated entry is throwaway — it
// lives under `<projectRoot>/.docent/tmp/` and is overwritten each render.

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

import type {Plugin} from '@bjelser/kit';

export interface GenerateEntryOptions {
  /** Absolute path of the film spec JSON. */
  readonly specPath: string;
  /** Absolute path of the user docent.config file (or null). */
  readonly configPath: string | null;
  /** The film id — used in the generated entry filename. */
  readonly filmId: string;
  /** Project root — the entry is written under `<projectRoot>/.docent/tmp/`. */
  readonly projectRoot: string;
  /**
   * The set of user plugins, post-loadConfig. Surfaced for diagnostics; the
   * generator references them by config-file path, not by value.
   */
  readonly userPlugins: ReadonlyArray<Plugin>;
  /**
   * Absolute path of the Remotion `public/` dir. When set, the generator
   * looks for a per-film tts manifest at
   * `<publicDir>/audio/<filmId>/manifest.json` and inlines its `beats`
   * map in the entry so the narration feature can attach per-beat
   * `<Audio>` overlays via `staticFile()`.
   */
  readonly publicDir?: string;
}

/** Resolve the absolute path of a package's package.json `main`. */
/**
 * Resolve a package subpath to its absolute on-disk entry.
 *
 * `fromDir` should be the *consumer's* project root (where their
 * node_modules lives). When the CLI is itself symlinked from a
 * file:-linked dep (a hermetic dogfood install), `import.meta.resolve`
 * runs in the CLI's REAL path — which is the worktree, not the
 * consumer — so a subpath like `@bjelser/core/browser` fails because
 * the worktree doesn't carry @bjelser/core in node_modules (it IS the
 * source). Resolving via `module.createRequire(<fromDir>)` instead
 * uses the consumer's resolution context, which is what we want for
 * any link layout (npm install, bun install file:, symlinks).
 */
const resolvePackageEntry = async (
  name: string,
  fromDir: string,
): Promise<string> => {
  try {
    const {createRequire} = await import('node:module');
    const req = createRequire(`${fromDir}/__entry__`);
    return req.resolve(name);
  } catch {
    // Fall through to import.meta.resolve for environments where
    // node:module isn't available.
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta = import.meta as any;
  if (typeof meta.resolve === 'function') {
    try {
      const url = await meta.resolve(name);
      if (typeof url === 'string' && url.startsWith('file:')) {
        return fileURLToPath(url);
      }
    } catch {
      // fall through
    }
  }
  throw new Error(
    `[@bjelser/cli] could not resolve "${name}" — is it installed in ${fromDir}?`,
  );
};

/**
 * Generate a per-render Remotion entry .tsx file under `.docent/tmp/`.
 * Returns the absolute path. The file is overwritten each render and is
 * safe to ignore in source control.
 */
export const generateRenderEntry = async (
  opts: GenerateEntryOptions,
): Promise<string> => {
  const tmpDir = resolve(opts.projectRoot, '.docent', 'tmp');
  mkdirSync(tmpDir, {recursive: true});
  const entryPath = resolve(
    tmpDir,
    `render-entry-${opts.filmId}.${Date.now()}.tsx`,
  );

  // Resolve absolute paths to @bjelser/kit and @bjelser/core so the generated
  // entry can import them as filesystem paths. This sidesteps any node-
  // modules resolution surprises inside the tmp dir.
  //
  // For core, prefer the browser-safe sub-export (`@bjelser/core/browser`)
  // when it exists — that file omits the TTS provider so webpack's
  // chrome-headless bundle never tries to resolve `node:fs`/`node:path`/
  // `node:child_process`. Falls back to the full entry for older versions
  // (which will fail at bundle time with a clearer error).
  const kitEntry = await resolvePackageEntry(
    '@bjelser/kit',
    opts.projectRoot,
  );
  let coreEntry: string;
  try {
    coreEntry = await resolvePackageEntry(
      '@bjelser/core/browser',
      opts.projectRoot,
    );
  } catch {
    coreEntry = await resolvePackageEntry('@bjelser/core', opts.projectRoot);
  }

  // Compute relative paths from the entry's directory to each target.
  const relSpec = relative(dirname(entryPath), opts.specPath).replace(/\\/g, '/');
  const relCore = relative(dirname(entryPath), coreEntry).replace(/\\/g, '/');
  // For the kit, we want to import the buildKitRoot helper specifically.
  // The kit entry source lives at <kitDir>/remotion/entry.tsx. We use the .tsx
  // extension explicitly so the bundler doesn't fall back to .ts/.js by
  // accident.
  const kitDir = dirname(kitEntry);
  const relKitEntryHelper = relative(
    dirname(entryPath),
    resolve(kitDir, 'remotion', 'entry.tsx'),
  ).replace(/\\/g, '/');

  const prefix = (p: string): string => (p.startsWith('.') ? p : './' + p);

  const userImport = opts.configPath
    ? `import userConfig from ${JSON.stringify(
        prefix(relative(dirname(entryPath), opts.configPath).replace(/\\/g, '/')),
      )};
const userPlugins = Array.isArray(userConfig?.plugins) ? userConfig.plugins : [];`
    : `const userPlugins: any[] = [];`;

  // Inline the per-film tts manifest's `{<sceneIdx>-<beatIdx>: {file, seconds}}`
  // map. Read here at generation time so the entry is a fully static module
  // (Remotion's webpack bundler doesn't need filesystem I/O at render time).
  let ttsAudioLiteral = 'undefined';
  if (opts.publicDir) {
    const manifestPath = join(
      opts.publicDir,
      'audio',
      opts.filmId,
      'manifest.json',
    );
    if (existsSync(manifestPath)) {
      try {
        const raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
          beats?: Record<
            string,
            {file?: string; seconds?: number} | undefined
          >;
        };
        const audioMap: Record<string, {file: string; seconds: number}> = {};
        const beatsObj = raw.beats ?? {};
        for (const [key, val] of Object.entries(beatsObj)) {
          if (val && typeof val.file === 'string') {
            audioMap[key] = {
              file: val.file,
              seconds: typeof val.seconds === 'number' ? val.seconds : 0,
            };
          }
        }
        if (Object.keys(audioMap).length > 0) {
          ttsAudioLiteral = JSON.stringify(audioMap);
        }
      } catch {
        // tolerable — fall back to silent render with a warning at runtime.
      }
    }
  }

  // NOTE: Remotion's CLI greps the entry source for the literal string
  // "registerRoot" (see node_modules/@remotion/bundler/dist/bundle.js
  // validateEntryPoint). We MUST call `registerRoot` by name here (not via a
  // wrapper helper) so the validator finds the marker.
  const source = `// AUTO-GENERATED by @bjelser/cli — do not edit; regenerated per render.
// Statically imports @bjelser/core and optional user plugins so webpack can
// bundle every scene component referenced by the film for chromium-side
// frame rendering.
import {registerRoot} from 'remotion';
import {buildKitRoot} from ${JSON.stringify(prefix(relKitEntryHelper))};
import corePlugins from ${JSON.stringify(prefix(relCore))};
import spec from ${JSON.stringify(prefix(relSpec))};
${userImport}

const all = [...corePlugins, ...userPlugins];
const ttsAudio = ${ttsAudioLiteral};
registerRoot(buildKitRoot(ttsAudio !== undefined ? {plugins: all, spec, ttsAudio} : {plugins: all, spec}));
`;
  writeFileSync(entryPath, source, 'utf-8');
  return entryPath;
};
