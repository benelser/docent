#!/usr/bin/env bun
// Smoke test for R4 — scheduled drip publication.
//
// THE KPI (from the research DAG): "queue 3 films Mon/Wed/Fri 15:00; audit
// log shows 3 publishes within ±60s of scheduled times." Three days is too
// long to wait, so we collapse the test: 3 films, schedules 30s / 60s / 90s
// from now, tick every 5s for 2 minutes, assert every entry's `publishedAt`
// is within ±60s of its scheduled `datetime`.
//
// METHOD
//   1. Spin up a hermetic project root at /tmp/docent-drip-smoke-<ts>/ with:
//        films/<id>.json    (3 minimal specs)
//        out/<id>.mp4       (3 stub mp4s — any non-empty file works since
//                             the docent-studio adapter is in mock mode)
//        landing/src/lib/films.ts  (an empty FILMS array so the adapter can
//                                    splice records in without trampling
//                                    the worktree's real file)
//   2. `docent drip add` three entries with datetime schedules.
//   3. Loop: every 5s call `docent drip tick --mock` until all entries are
//      published OR we hit the 2-minute budget.
//   4. Read the final queue.json. For each entry:
//        - status must be "published"
//        - publishedAt must be within ±60s of schedule.datetime
//        - audit.log must contain a publish-ok line for the entry
//   5. Print a transcript-style summary + exit 0 (pass) or 2 (fail).
//
// Exit codes: 0 pass, 1 setup error, 2 KPI fail.

import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const REPO = join(import.meta.dir, '..');
const CLI = join(REPO, 'packages/cli/src/index.ts');
const TS = new Date().toISOString().replace(/[:.]/g, '-');
const PROJECT = join('/tmp', `docent-drip-smoke-${TS}`);

const log = (s: string) => process.stdout.write(`${s}\n`);
const reset = '\x1b[0m';
const red = (s: string) => `\x1b[31m${s}${reset}`;
const yellow = (s: string) => `\x1b[33m${s}${reset}`;
const green = (s: string) => `\x1b[32m${s}${reset}`;
const dim = (s: string) => `\x1b[2m${s}${reset}`;
const cyan = (s: string) => `\x1b[36m${s}${reset}`;

const KEEP = process.argv.includes('--keep');
const BUDGET_MS = 2 * 60_000;
const TICK_INTERVAL_MS = 5_000;
const PER_ENTRY_TOLERANCE_MS = 60_000;

/* ─────────── setup ─────────── */

const setupProject = (): {filmIds: string[]; schedules: string[]} => {
  if (existsSync(PROJECT)) rmSync(PROJECT, {recursive: true});
  mkdirSync(PROJECT, {recursive: true});
  mkdirSync(join(PROJECT, 'films'), {recursive: true});
  mkdirSync(join(PROJECT, 'out'), {recursive: true});
  mkdirSync(join(PROJECT, 'landing/src/lib'), {recursive: true});
  mkdirSync(join(PROJECT, 'landing/static/films'), {recursive: true});

  // Empty films.ts with a known shape — the docent-studio adapter splices
  // a record in here. We use the same file layout as the real one so the
  // regex finder works.
  writeFileSync(
    join(PROJECT, 'landing/src/lib/films.ts'),
    `// Smoke fixture.
export type Film = {
\tid: string;
\ttitle: string;
\tsubject: string;
\tscenes: string[];
\tduration: string;
\tdomain: string;
};

export const FILMS: Film[] = [];
`,
    'utf-8',
  );

  const filmIds: string[] = [];
  const schedules: string[] = [];
  const now = Date.now();
  const offsets = [30_000, 60_000, 90_000];

  for (let i = 0; i < 3; i++) {
    const id = `smoke-film-${i + 1}`;
    filmIds.push(id);

    // Minimal spec — only the meta fields the adapter reads.
    const spec = {
      meta: {
        id,
        title: `Smoke Film ${i + 1}`,
        subject: `the ${['first', 'second', 'third'][i]} test entry`,
        domain: 'smoke · scheduling',
        fps: 30,
        width: 1920,
        height: 1080,
      },
      scenes: [
        {type: 'frame', title: 'placeholder', beats: [{narration: 'placeholder'}]},
      ],
    };
    writeFileSync(
      join(PROJECT, 'films', `${id}.json`),
      JSON.stringify(spec, null, 2),
    );

    // Stub mp4 — any non-empty file. The adapter never decodes it in
    // mock mode (it just copies it, which we also skip).
    writeFileSync(join(PROJECT, 'out', `${id}.mp4`), `stub-mp4-${id}`);

    const schedule = `@${new Date(now + offsets[i]!).toISOString()}`;
    schedules.push(schedule);
  }

  return {filmIds, schedules};
};

/* ─────────── CLI invocation ─────────── */

const runCli = (args: string[], opts: {silent?: boolean} = {}): {code: number; out: string; err: string} => {
  const res = spawnSync('bun', [CLI, ...args], {
    cwd: PROJECT,
    encoding: 'utf-8',
    env: {...process.env, DOCENT_DRIP_MOCK: '1'},
  });
  if (!opts.silent) {
    if (res.stdout) process.stdout.write(res.stdout);
    if (res.stderr) process.stderr.write(res.stderr);
  }
  return {code: res.status ?? 0, out: res.stdout ?? '', err: res.stderr ?? ''};
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ─────────── main ─────────── */

const main = async (): Promise<number> => {
  log(cyan(`R4 drip smoke — project=${PROJECT}\n`));

  log(dim('── 1. setup ──'));
  const {filmIds, schedules} = setupProject();
  for (let i = 0; i < filmIds.length; i++) {
    log(`   ${filmIds[i]}  schedule=${schedules[i]}`);
  }

  log(dim('\n── 2. queue ──'));
  for (let i = 0; i < filmIds.length; i++) {
    const res = runCli([
      'drip',
      'add',
      filmIds[i]!,
      '--schedule',
      schedules[i]!,
      '--platform',
      'docent-studio',
    ]);
    if (res.code !== 0) {
      log(red(`✗ docent drip add failed for ${filmIds[i]} (exit ${res.code})`));
      return 1;
    }
  }

  log(dim('\n── 3. list (initial state) ──'));
  runCli(['drip', 'list']);

  log(dim('\n── 4. tick loop (budget=2min, interval=5s) ──'));
  const start = Date.now();
  let ticks = 0;
  while (Date.now() - start < BUDGET_MS) {
    ticks++;
    const elapsed = Math.round((Date.now() - start) / 1000);
    log(dim(`\n  · tick ${ticks} (t+${elapsed}s)`));
    const res = runCli(['drip', 'tick', '--mock'], {silent: false});
    if (res.code !== 0 && res.code !== 2) {
      log(red(`tick failed unexpectedly (exit ${res.code})`));
      return 1;
    }
    // Read queue; if all published, we're done.
    const queue = JSON.parse(
      readFileSync(join(PROJECT, 'drip/queue.json'), 'utf-8'),
    );
    const allDone = queue.entries.every(
      (e: {status: string}) => e.status === 'published' || e.status === 'failed' || e.status === 'skipped',
    );
    if (allDone) {
      log(green(`  · all entries reached terminal status after ${ticks} ticks`));
      break;
    }
    await sleep(TICK_INTERVAL_MS);
  }

  log(dim('\n── 5. final queue ──'));
  runCli(['drip', 'list']);

  log(dim('\n── 6. KPI assertion ──'));
  const finalQueue = JSON.parse(
    readFileSync(join(PROJECT, 'drip/queue.json'), 'utf-8'),
  );
  const audit = existsSync(join(PROJECT, 'drip/audit.log'))
    ? readFileSync(join(PROJECT, 'drip/audit.log'), 'utf-8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

  let ok = true;
  for (let i = 0; i < filmIds.length; i++) {
    const id = filmIds[i]!;
    const entry = finalQueue.entries.find((e: {id: string}) => e.id === id);
    if (!entry) {
      log(red(`  ✗ ${id}: not found in final queue`));
      ok = false;
      continue;
    }
    if (entry.status !== 'published') {
      log(red(`  ✗ ${id}: status=${entry.status} (expected "published")`));
      if (entry.error) log(red(`     error: ${entry.error}`));
      ok = false;
      continue;
    }
    if (!entry.publishedAt) {
      log(red(`  ✗ ${id}: missing publishedAt`));
      ok = false;
      continue;
    }
    const scheduledMs = Date.parse(entry.schedule.datetime);
    const publishedMs = Date.parse(entry.publishedAt);
    const delta = publishedMs - scheduledMs;
    const within = Math.abs(delta) <= PER_ENTRY_TOLERANCE_MS;
    const sign = delta >= 0 ? '+' : '';
    const tag = within ? green('within ±60s') : red('OUT OF WINDOW');
    log(
      `  ${within ? '✓' : '✗'} ${id}: published ${sign}${Math.round(delta / 1000)}s after schedule  ${tag}`,
    );
    if (!within) ok = false;

    // Audit log: was there a publish-ok event for this id?
    const okEvent = audit.find(
      (l: {filmId?: string; event?: string}) =>
        l.filmId === id && l.event === 'publish-ok',
    );
    if (!okEvent) {
      log(red(`  ✗ ${id}: no publish-ok event in audit.log`));
      ok = false;
    }
  }

  log('');
  if (ok) {
    log(green('═══ KPI PASS: 3 entries published within ±60s of schedule ═══'));
    if (!KEEP) rmSync(PROJECT, {recursive: true});
    return 0;
  }
  log(red('═══ KPI FAIL ═══'));
  log(yellow(`  project retained at ${PROJECT} for inspection`));
  return 2;
};

main().catch((err) => {
  log(red(`smoke failed: ${err.message}`));
  if (err.stack) log(dim(err.stack));
  process.exit(1);
}).then((code) => process.exit(code));
