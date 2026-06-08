// `docent index <dir>` — walk a directory of mixed engineering artifacts
// (wiki pages, architecture diagrams, screen-recording demos, runbook
// configs, code snippets) and print a typed manifest. The input the
// FDE/SRE survey agent consumes when authoring a lunch-and-learn film
// via docent's explainer mode.
//
// Default output: human-readable table grouped by kind, with byte sizes
// and (for media) basic probe info. With `--json`: the full AssetIndex
// object as JSON, pretty-printed (parseable by tooling).
//
// The CLI is a thin shell — all logic lives in
// `@bjelser/kit/frameworks/asset-index`. We add: arg parsing, color,
// table rendering, and a tiny "are you a directory" check.

import {existsSync, statSync} from 'node:fs';
import {resolve} from 'node:path';

import {
  indexDirectory,
  type AssetEntry,
  type AssetIndex,
  type AssetKind,
} from '@bjelser/kit';

export interface IndexAssetsArgs {
  readonly dir: string;
  readonly json?: boolean;
  readonly noProbe?: boolean;
}

const reset = '\x1b[0m';
const red = (s: string) => `\x1b[31m${s}${reset}`;
const yellow = (s: string) => `\x1b[33m${s}${reset}`;
const green = (s: string) => `\x1b[32m${s}${reset}`;
const cyan = (s: string) => `\x1b[36m${s}${reset}`;
const dim = (s: string) => `\x1b[2m${s}${reset}`;
const bold = (s: string) => `\x1b[1m${s}${reset}`;

// Status / advisory lines go to STDERR so STDOUT can carry the JSON
// payload cleanly in --json mode. The smoke test parses stdout.
const log = (s: string) => process.stderr.write(`${s}\n`);
const out = (s: string) => process.stdout.write(`${s}\n`);

const KIND_ORDER: ReadonlyArray<AssetKind> = [
  'wiki',
  'diagram',
  'screen-recording',
  'runbook-config',
  'code',
  'unknown',
];

const KIND_LABEL: Readonly<Record<AssetKind, string>> = {
  wiki: 'Wiki pages',
  diagram: 'Diagrams',
  'screen-recording': 'Screen recordings',
  'runbook-config': 'Runbook configs',
  code: 'Code',
  unknown: 'Unknown',
};

const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatMedia = (entry: AssetEntry): string => {
  const m = entry.media;
  if (!m) return '';
  const parts: string[] = [];
  if (m.width !== undefined && m.height !== undefined) {
    parts.push(`${m.width}×${m.height}`);
  } else if (m.width !== undefined) {
    parts.push(`w=${m.width}`);
  } else if (m.height !== undefined) {
    parts.push(`h=${m.height}`);
  }
  if (m.durationSeconds !== undefined) {
    parts.push(`${m.durationSeconds.toFixed(1)}s`);
  }
  if (m.hasAudio !== undefined) {
    parts.push(m.hasAudio ? 'audio' : 'silent');
  }
  return parts.join(' · ');
};

const printTable = (index: AssetIndex): void => {
  log(cyan(`▶ docent index ${index.rootDir}`));
  log(dim(`  indexed at ${index.indexedAt} · ${index.entries.length} file(s)`));
  if (index.warnings.length > 0) {
    log(yellow(`  ⚠ ${index.warnings.length} warning(s):`));
    for (const w of index.warnings) {
      log(yellow(`    ⚠ ${w}`));
    }
  }
  out('');

  for (const kind of KIND_ORDER) {
    const entries = index.byKind[kind];
    if (entries.length === 0) continue;
    out(bold(`${KIND_LABEL[kind]}  (${entries.length})`));
    for (const entry of entries) {
      const media = formatMedia(entry);
      const size = formatBytes(entry.sizeBytes);
      const trailing = media ? `${size} · ${media}` : size;
      out(`  ${entry.relPath}  ${dim(trailing)}`);
    }
    out('');
  }

  const totalBytes = index.entries.reduce((acc, e) => acc + e.sizeBytes, 0);
  out(green(`✓ ${index.entries.length} entries · ${formatBytes(totalBytes)} total`));
};

export const runIndexAssets = async (args: IndexAssetsArgs): Promise<number> => {
  const absDir = resolve(process.cwd(), args.dir);

  if (!existsSync(absDir)) {
    log(red(`✗ directory not found: ${absDir}`));
    return 1;
  }
  let st;
  try {
    st = statSync(absDir);
  } catch (e) {
    log(red(`✗ stat failed for ${absDir}: ${(e as Error).message}`));
    return 1;
  }
  if (!st.isDirectory()) {
    log(red(`✗ not a directory: ${absDir}`));
    return 1;
  }

  let index: AssetIndex;
  try {
    index = await indexDirectory(absDir, {
      probeMedia: !args.noProbe,
    });
  } catch (e) {
    log(red(`✗ indexDirectory failed: ${(e as Error).message}`));
    return 2;
  }

  if (args.json) {
    out(JSON.stringify(index, null, 2));
    return 0;
  }

  printTable(index);
  return 0;
};
