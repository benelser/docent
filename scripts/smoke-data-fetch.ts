// R16.2 smoke — exercise the data-fetch stage end-to-end against the
// live agentops docker stack (when up) and verify the fallback path
// (when down). Pure stage test — does NOT render the film.
//
// Usage:
//   bun scripts/smoke-data-fetch.ts             # uses films/live-data-smoke.json
//   bun scripts/smoke-data-fetch.ts --no-cache  # force re-fetch
//   bun scripts/smoke-data-fetch.ts --film <path>

import {readFileSync} from 'node:fs';
import {join} from 'node:path';

import {runDataFetchStage} from '../packages/kit/src/cascade/data-fetch-stage';
import type {FilmSpec} from '../packages/kit/src/types/spec';

const args = process.argv.slice(2);
const noCache = args.includes('--no-cache');
const filmIdx = args.indexOf('--film');
const filmPath =
  filmIdx >= 0 && args[filmIdx + 1]
    ? args[filmIdx + 1]!
    : join(process.cwd(), 'films', 'live-data-smoke.json');

const publicDir = join(process.cwd(), 'public');

console.log(`\n=== R16.2 data-fetch smoke ===`);
console.log(`spec:      ${filmPath}`);
console.log(`publicDir: ${publicDir}`);
console.log(`noCache:   ${noCache}\n`);

const raw = readFileSync(filmPath, 'utf-8');
const spec = JSON.parse(raw) as FilmSpec;

// Snapshot the authored values so we can print before / after.
const authored: Array<{sceneIndex: number; type: string; before: unknown}> = [];
for (let i = 0; i < (spec.scenes ?? []).length; i++) {
  const s = spec.scenes![i]!;
  if (s.type === 'query') {
    authored.push({
      sceneIndex: i,
      type: 'query',
      before: (s as unknown as {result: {value: unknown}}).result?.value,
    });
  } else if (s.type === 'waterfall') {
    authored.push({
      sceneIndex: i,
      type: 'waterfall',
      before: (s as unknown as {spans: unknown[]}).spans?.length,
    });
  }
}

const result = await runDataFetchStage(spec, {
  publicDir,
  ...(noCache ? {noCache: true} : {}),
});

console.log(`\n--- stage logs (${result.logs.length}) ---`);
for (const log of result.logs) {
  console.log(`  ${log.level === 'warn' ? '!' : '·'} ${log.message}`);
}

console.log(`\n--- per-source results (${result.entries.length}) ---`);
for (const e of result.entries) {
  console.log(
    `  [${e.ok ? 'OK ' : 'FAIL'}] scene[${e.sceneIndex}] ${e.sceneType} → ${e.url}`,
  );
  console.log(`         summary: ${e.summary}`);
  console.log(`         hash:    ${e.hash.slice(0, 16)}…`);
}

console.log(`\n--- before / after ---`);
for (const a of authored) {
  const s = spec.scenes![a.sceneIndex]!;
  const after =
    a.type === 'query'
      ? (s as unknown as {result: {value: unknown}}).result?.value
      : (s as unknown as {spans: unknown[]}).spans?.length;
  console.log(`  scene[${a.sceneIndex}] ${a.type}:`);
  console.log(`    authored: ${JSON.stringify(a.before)}`);
  console.log(`    final:    ${JSON.stringify(after)}`);
}

if (result.manifestPath) {
  console.log(`\nmanifest: ${result.manifestPath}`);
}
console.log();
