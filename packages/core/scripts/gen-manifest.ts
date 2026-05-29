#!/usr/bin/env bun
// packages/core/scripts/gen-manifest.ts
//
// Code-generates `src/index.generated.ts` — the @bjelser/core plugin manifest.
//
// Why this exists (D9 of the v3.0 stabilization sprint, docs/design/v3-stabilization.md):
// the hand-assembled manifest in src/index.ts had 38 imports + 38 array entries
// that drifted from disk every time a new plugin landed. This script enumerates
// `src/{scenes,presets,features,tts}/<name>/` directories and emits the imports
// + the `corePlugins` array deterministically.
//
// Discovery strategy: convention-based with override.
//   1. Convention — directory name converted to camelCase + a kind-specific
//      suffix is the expected named export:
//        scenes/<name>/   -> <camelCase>Plugin     (e.g. big-idea -> bigIdeaPlugin)
//        presets/<name>/  -> <camelCase>Preset     (e.g. neutral  -> neutralPreset)
//        features/<name>/ -> <camelCase>Feature    (e.g. narration -> narrationFeature)
//        tts/<name>/      -> <camelCase>TtsPlugin  (e.g. kokoro   -> kokoroTtsPlugin)
//   2. The script verifies the export actually exists by scanning the directory's
//      `index.{ts,tsx}` for `export const <conventionName>` OR for an
//      `export default` re-binding the same const. If neither appears, it errors
//      loudly — better to fail at codegen than silently emit a broken import.
//
// Output: src/index.generated.ts, marked `do not edit`. Re-run after adding a
// plugin: `bun packages/core/scripts/gen-manifest.ts`.

import {readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC_DIR = resolve(__dirname, '..', 'src');
const OUTPUT = join(SRC_DIR, 'index.generated.ts');

type Kind = 'preset' | 'feature' | 'tts' | 'scene';

interface CategoryConfig {
  /** Subdirectory under src/ that hosts these plugins. */
  dir: string;
  /** Plugin kind tag — purely for the generated comment block. */
  kind: Kind;
  /** Suffix appended to the camelCased directory name. */
  suffix: string;
  /**
   * Optional explicit order. If provided, the generated array lists these
   * directory names first in this exact sequence; any extras land after
   * alphabetically. Used to preserve byte-equivalence with the hand-assembled
   * manifest in v3.0-pre.0.
   */
  orderOverride?: readonly string[];
  /** Human-readable label for the section comment in the generated file. */
  label: string;
}

const CATEGORIES: readonly CategoryConfig[] = [
  {
    dir: 'presets',
    kind: 'preset',
    suffix: 'Preset',
    // Preserves the v2.5.x stylePresets.ts ordering: `neutral` is the
    // byte-identical anchor (must come first); the rest follow the order
    // they landed in the engine. Future presets append alphabetically.
    orderOverride: [
      'neutral',
      'engineering',
      'editorial',
      'paper',
      'analytical',
      'executive',
    ],
    label: 'Presets',
  },
  {
    dir: 'features',
    kind: 'feature',
    suffix: 'Feature',
    // narration lands before audio-rhythm because narration owns the
    // canonical chunk timing audio-rhythm reads; alphabetical would invert
    // a real dependency in spirit (not in the loader, but in mental model).
    // audio-bed comes last — it consumes the schedule's per-beat audio
    // refs (set by the narration overlay path) for its duck windows.
    orderOverride: ['narration', 'audio-rhythm', 'audio-bed'],
    label: 'Features',
  },
  {
    dir: 'tts',
    kind: 'tts',
    suffix: 'TtsPlugin',
    label: 'TTS providers',
  },
  {
    dir: 'scenes',
    kind: 'scene',
    suffix: 'Plugin',
    label: 'Scenes',
  },
];

interface Discovered {
  /** Directory name under src/<category.dir>/ (e.g. `big-idea`). */
  dirName: string;
  /** Convention-derived named export (e.g. `bigIdeaPlugin`). */
  exportName: string;
  /** Import path the generated file should use (no extension). */
  importPath: string;
}

function camelCase(kebab: string): string {
  return kebab.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function findIndexFile(pluginDir: string): string | null {
  for (const ext of ['ts', 'tsx']) {
    const p = join(pluginDir, `index.${ext}`);
    try {
      if (statSync(p).isFile()) return p;
    } catch {
      /* fallthrough */
    }
  }
  return null;
}

/**
 * Confirm the convention-named export actually exists in the plugin's index
 * file. We accept either:
 *   - `export const <name>` (the canonical form every current plugin uses)
 *   - `export {<name>}` (a re-export — supports the override mechanism where
 *     an author binds the convention name to an internally-named const)
 * If neither is present we error: silently emitting an unresolvable import
 * would make the manifest break only at the next `tsc`, far from the cause.
 */
function exportExists(indexFile: string, exportName: string): boolean {
  const src = readFileSync(indexFile, 'utf8');
  const patterns = [
    new RegExp(`export\\s+const\\s+${exportName}\\b`),
    new RegExp(`export\\s*\\{[^}]*\\b${exportName}\\b[^}]*\\}`),
  ];
  return patterns.some((re) => re.test(src));
}

function discoverCategory(cat: CategoryConfig): Discovered[] {
  const categoryRoot = join(SRC_DIR, cat.dir);
  if (!isDir(categoryRoot)) {
    throw new Error(
      `gen-manifest: expected directory ${categoryRoot} (category "${cat.dir}") to exist`,
    );
  }

  const entries = readdirSync(categoryRoot)
    .filter((name) => !name.startsWith('.'))
    .filter((name) => isDir(join(categoryRoot, name)));

  // Order: overrides first (in declared sequence), then anything else alphabetically.
  const override = cat.orderOverride ?? [];
  const overrideSet = new Set(override);
  const extras = entries
    .filter((name) => !overrideSet.has(name))
    .sort((a, b) => a.localeCompare(b));
  const overridePresent = override.filter((name) => entries.includes(name));
  const ordered = [...overridePresent, ...extras];

  // Any override entry that *doesn't* exist on disk is a config error worth
  // surfacing — likely a typo or a renamed plugin directory.
  const missingFromDisk = override.filter((name) => !entries.includes(name));
  if (missingFromDisk.length > 0) {
    throw new Error(
      `gen-manifest: category "${cat.dir}" orderOverride references directories that don't exist: ${missingFromDisk.join(', ')}`,
    );
  }

  return ordered.map((dirName) => {
    const pluginDir = join(categoryRoot, dirName);
    const indexFile = findIndexFile(pluginDir);
    if (!indexFile) {
      throw new Error(
        `gen-manifest: plugin directory ${pluginDir} has no index.ts or index.tsx`,
      );
    }
    const exportName = camelCase(dirName) + cat.suffix;
    if (!exportExists(indexFile, exportName)) {
      throw new Error(
        `gen-manifest: ${indexFile} does not export a const named "${exportName}". ` +
          `Either rename the export to match convention, or re-export it: ` +
          `\`export {internalName as ${exportName}};\``,
      );
    }
    return {
      dirName,
      exportName,
      importPath: `./${cat.dir}/${dirName}`,
    };
  });
}

interface DiscoveredCategory {
  cat: CategoryConfig;
  plugins: Discovered[];
}

function discoverAll(): DiscoveredCategory[] {
  return CATEGORIES.map((cat) => ({cat, plugins: discoverCategory(cat)}));
}

function renderManifest(discovered: readonly DiscoveredCategory[]): string {
  const total = discovered.reduce((n, c) => n + c.plugins.length, 0);

  const header = `// AUTO-GENERATED by scripts/gen-manifest.ts. Do NOT edit by hand.
//
// Regenerate after adding/removing/renaming a plugin directory:
//   bun packages/core/scripts/gen-manifest.ts
//
// The generator globs src/{scenes,presets,features,tts}/*/index.{ts,tsx} and
// emits the convention-named named export for each (see scripts/gen-manifest.ts
// for the convention and the override mechanism). The order below is the
// canonical plugin-load order — see CATEGORIES in the generator for the
// per-category ordering rules.
//
// Total plugins: ${total}

import type {Plugin} from '@bjelser/kit';

`;

  const imports = discovered
    .flatMap(({cat, plugins}) => [
      `// ${cat.label} (${plugins.length})`,
      ...plugins.map(
        (p) => `import {${p.exportName}} from '${p.importPath}';`,
      ),
      '',
    ])
    .join('\n')
    .trimEnd();

  const reexports = discovered
    .flatMap(({cat, plugins}) => [
      `// ${cat.label}`,
      `export {${plugins.map((p) => p.exportName).join(', ')}};`,
      '',
    ])
    .join('\n')
    .trimEnd();

  const arrayBody = discovered
    .flatMap(({cat, plugins}) => [
      `  // ${cat.label} (${plugins.length})`,
      ...plugins.map((p) => `  ${p.exportName},`),
    ])
    .join('\n');

  const manifest = `/**
 * The set of plugins shipped with \`@bjelser/core\` — the opinionated default
 * implementation. The engine's \`use()\` sniffs \`plugin.kind\` and dispatches
 * to the right registry, so loading order is irrelevant to correctness; the
 * order below is stable for reviewability (presets first, then features, TTS,
 * then scenes alphabetically).
 */
export const corePlugins: readonly Plugin[] = [
${arrayBody}
];

export default corePlugins;
`;

  return [header, imports, '', '// Named re-exports for callers that want them directly.', reexports, '', manifest].join('\n');
}

function main() {
  const discovered = discoverAll();
  const output = renderManifest(discovered);
  writeFileSync(OUTPUT, output);

  // Console summary — what the script found and where it wrote.
  // The exact wording is convenient for the C2 task report but is also
  // helpful for any human running it locally.
  const lines: string[] = [];
  let total = 0;
  for (const {cat, plugins} of discovered) {
    total += plugins.length;
    lines.push(`  ${cat.label.padEnd(16)} (${plugins.length})  ${plugins.map((p) => p.dirName).join(', ')}`);
  }
  console.log(`gen-manifest: wrote ${OUTPUT}`);
  console.log(`gen-manifest: discovered ${total} plugins:`);
  for (const l of lines) console.log(l);
}

main();
