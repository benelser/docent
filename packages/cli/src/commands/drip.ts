// `docent drip` — scheduled, multi-platform film publication.
//
// Five subcommands:
//
//   docent drip add <filmId> --schedule <spec> --platform <list>
//   docent drip list
//   docent drip status <filmId>
//   docent drip cancel <filmId>
//   docent drip tick                  ← called by cron
//
// State lives in `drip/queue.json` at the project root. The audit log lives
// in `drip/audit.log` (NDJSON, append-only). The tick acquires a directory
// lock (`drip/.tick.lock`) so two concurrent ticks can't race.
//
// Platform-side effects (the actual deploy / upload) live in
// `@bjelser/core/distribution` — one adapter per platform. This command
// is the orchestration: schedule → due-check → adapter dispatch → status
// update.

import {existsSync} from 'node:fs';
import {join, resolve} from 'node:path';

import {
  ALL_PLATFORMS,
  isPlatform,
  type DripEntry,
  type DripManifest,
  type Platform,
  type PlatformResult,
} from '@bjelser/kit';
import {runPlatformAdapter, type AdapterContext} from '@bjelser/core';

import {appendAudit, readQueue, withLock, writeQueue} from '../drip/manifest';
import {nextFire, parseScheduleArg, due} from '../drip/schedule';

const log = (s: string) => process.stdout.write(`${s}\n`);
const err = (s: string) => process.stderr.write(`${s}\n`);
const reset = '\x1b[0m';
const red = (s: string) => `\x1b[31m${s}${reset}`;
const yellow = (s: string) => `\x1b[33m${s}${reset}`;
const green = (s: string) => `\x1b[32m${s}${reset}`;
const dim = (s: string) => `\x1b[2m${s}${reset}`;
const cyan = (s: string) => `\x1b[36m${s}${reset}`;

const resolveProjectRoot = (override?: string): string =>
  override ? resolve(override) : resolve(process.cwd());

const findEntry = (q: DripManifest, filmId: string): DripEntry | undefined =>
  q.entries.find((e) => e.id === filmId);

const findEntryIdx = (q: DripManifest, filmId: string): number =>
  q.entries.findIndex((e) => e.id === filmId);

/* ─────────── docent drip add ─────────── */

export interface DripAddArgs {
  readonly filmId: string;
  readonly schedule: string;
  readonly platforms: readonly Platform[];
  readonly projectRoot?: string;
  readonly note?: string;
}

export const runDripAdd = async (args: DripAddArgs): Promise<number> => {
  const projectRoot = resolveProjectRoot(args.projectRoot);
  const filmId = args.filmId;

  // Validate film artefacts BEFORE queuing — don't queue stale entries.
  const specPath = join(projectRoot, 'films', `${filmId}.json`);
  if (!existsSync(specPath)) {
    err(red(`docent drip add: spec not found at ${specPath}`));
    err(`  Run \`docent init ${filmId}\` first, then \`docent build ${filmId}\`.`);
    return 64;
  }
  // We don't require out/<id>.mp4 at add time — the operator may queue
  // ahead of the render. The tick re-checks at fire time.

  let schedule;
  try {
    schedule = parseScheduleArg(args.schedule);
  } catch (e) {
    err(red(`docent drip add: ${(e as Error).message}`));
    return 64;
  }

  const queue = readQueue(projectRoot);
  const existing = findEntry(queue, filmId);
  if (existing) {
    err(red(`docent drip add: ${filmId} already in queue (status=${existing.status}).`));
    err(`  Use \`docent drip cancel ${filmId}\` and re-add, or edit drip/queue.json directly.`);
    return 64;
  }

  const entry: DripEntry = {
    id: filmId,
    platforms: args.platforms,
    schedule,
    status: 'pending',
    attempts: 0,
    ...(args.note ? {note: args.note} : {}),
  };
  queue.entries.push(entry);
  writeQueue(projectRoot, queue);
  appendAudit(projectRoot, {
    ts: new Date().toISOString(),
    filmId,
    event: 'add',
    note: `platforms=${args.platforms.join(',')} schedule=${args.schedule}`,
  });

  const fireAt = nextFire(schedule);
  log(green(`✓ queued ${cyan(filmId)} → ${args.platforms.join(', ')}`));
  log(dim(`  next fire: ${fireAt.toISOString()}`));
  return 0;
};

/* ─────────── docent drip list ─────────── */

export interface DripListArgs {
  readonly projectRoot?: string;
  readonly json?: boolean;
}

const statusColor = (s: string): string => {
  switch (s) {
    case 'published':
      return green(s);
    case 'failed':
      return red(s);
    case 'publishing':
    case 'scheduled':
      return yellow(s);
    case 'skipped':
      return dim(s);
    default:
      return cyan(s);
  }
};

export const runDripList = async (args: DripListArgs): Promise<number> => {
  const projectRoot = resolveProjectRoot(args.projectRoot);
  const queue = readQueue(projectRoot);

  if (args.json) {
    process.stdout.write(JSON.stringify(queue, null, 2) + '\n');
    return 0;
  }

  if (queue.entries.length === 0) {
    log(dim(`drip queue empty. Use \`docent drip add <filmId> --schedule …\` to queue a film.`));
    return 0;
  }

  log(cyan(`drip queue — ${queue.entries.length} entries (lastTick=${queue.lastTick ?? 'never'})\n`));

  for (const e of queue.entries) {
    let next = '—';
    try {
      next = nextFire(e.schedule).toISOString();
    } catch {
      /* shape error elsewhere */
    }
    log(`  ${cyan(e.id.padEnd(28))} ${statusColor(e.status).padEnd(20)} ` +
      `next=${next}  platforms=${e.platforms.join(',')}`);
    if (e.error) log(red(`      err: ${e.error}`));
  }
  return 0;
};

/* ─────────── docent drip status ─────────── */

export interface DripStatusArgs {
  readonly filmId: string;
  readonly projectRoot?: string;
}

export const runDripStatus = async (args: DripStatusArgs): Promise<number> => {
  const projectRoot = resolveProjectRoot(args.projectRoot);
  const queue = readQueue(projectRoot);
  const entry = findEntry(queue, args.filmId);
  if (!entry) {
    err(red(`docent drip status: ${args.filmId} not in queue`));
    return 64;
  }
  log(cyan(`\ndocent drip — ${args.filmId}\n`));
  log(`  status:      ${statusColor(entry.status)}`);
  log(`  attempts:    ${entry.attempts}`);
  log(`  platforms:   ${entry.platforms.join(', ')}`);
  log(`  schedule:    ${JSON.stringify(entry.schedule)}`);
  try {
    log(`  next fire:   ${nextFire(entry.schedule).toISOString()}`);
  } catch {
    log(`  next fire:   ${red('(unresolvable)')}`);
  }
  if (entry.publishedAt) log(`  publishedAt: ${entry.publishedAt}`);
  if (entry.error) log(`  ${red('error')}:       ${entry.error}`);
  if (entry.note) log(`  note:        ${entry.note}`);
  if (entry.results && entry.results.length > 0) {
    log(`\n  per-platform:`);
    for (const r of entry.results) {
      log(
        `    ${r.platform.padEnd(16)} ${statusColor(r.status).padEnd(16)} ` +
          `${r.url ?? '—'}${r.error ? red(' err=' + r.error) : ''}`,
      );
    }
  }
  log('');
  return 0;
};

/* ─────────── docent drip cancel ─────────── */

export interface DripCancelArgs {
  readonly filmId: string;
  readonly projectRoot?: string;
}

export const runDripCancel = async (args: DripCancelArgs): Promise<number> => {
  const projectRoot = resolveProjectRoot(args.projectRoot);
  const queue = readQueue(projectRoot);
  const idx = findEntryIdx(queue, args.filmId);
  if (idx === -1) {
    err(red(`docent drip cancel: ${args.filmId} not in queue`));
    return 64;
  }
  const entry = queue.entries[idx]!;
  if (entry.status === 'published') {
    err(yellow(`docent drip cancel: ${args.filmId} already published. Skipping.`));
    return 0;
  }
  entry.status = 'skipped';
  writeQueue(projectRoot, queue);
  appendAudit(projectRoot, {
    ts: new Date().toISOString(),
    filmId: args.filmId,
    event: 'cancel',
  });
  log(green(`✓ cancelled ${args.filmId} (marked skipped)`));
  return 0;
};

/* ─────────── docent drip tick ─────────── */

export interface DripTickArgs {
  readonly projectRoot?: string;
  /** Skip the platform side-effects. Default reads $DOCENT_DRIP_MOCK. */
  readonly mock?: boolean;
  /** Treat all entries as due (smoke test). */
  readonly force?: boolean;
}

/**
 * One tick = walk the queue, fire every entry whose schedule has elapsed
 * (and is in `pending`), update status + audit.
 */
export const runDripTick = async (args: DripTickArgs): Promise<number> => {
  const projectRoot = resolveProjectRoot(args.projectRoot);
  const mock = args.mock ?? process.env.DOCENT_DRIP_MOCK === '1';

  return withLock(projectRoot, async () => {
    const queue = readQueue(projectRoot);
    const now = new Date();
    queue.lastTick = now.toISOString();
    writeQueue(projectRoot, queue);

    appendAudit(projectRoot, {
      ts: now.toISOString(),
      filmId: '*',
      event: 'tick-start',
      note: `entries=${queue.entries.length} mock=${mock}`,
    });

    let publishedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < queue.entries.length; i++) {
      const entry = queue.entries[i]!;
      if (entry.status !== 'pending' && !(args.force && entry.status !== 'published')) {
        continue;
      }
      if (!args.force && !due(entry.schedule, now)) {
        continue;
      }

      // Validate the artefact exists. If not, we mark publishing but
      // skip immediately — the operator may still be rendering. We don't
      // mark `failed` because that would burn a retry attempt for a
      // condition the operator can fix without re-queuing.
      const mp4Path = join(projectRoot, 'out', `${entry.id}.mp4`);
      if (!existsSync(mp4Path)) {
        appendAudit(projectRoot, {
          ts: new Date().toISOString(),
          filmId: entry.id,
          event: 'tick-skip',
          note: `mp4 not found at ${mp4Path}`,
        });
        log(yellow(`  · ${entry.id}: mp4 missing at ${mp4Path}, skipping until next tick`));
        skippedCount++;
        continue;
      }

      // The "narrative gate" — defer to `docent assert` if a render-check
      // manifest is on disk. We deliberately don't BLOCK shipping if the
      // gate has never been run (a fresh film should be shippable); we
      // only block if the gate exists AND signalled regression.
      // Spec: "gate against shipping a broken film". A red-line we honour
      // without forcing the operator to wire it up first.
      const assertManifest = join(
        projectRoot,
        'out',
        `.assert-${entry.id}`,
        'report.json',
      );
      if (existsSync(assertManifest)) {
        try {
          const fs = require('node:fs');
          const report = JSON.parse(fs.readFileSync(assertManifest, 'utf-8'));
          if (report.regressed === true) {
            log(red(`  ✗ ${entry.id}: docent assert reports a regression — refusing to publish`));
            entry.status = 'failed';
            entry.attempts++;
            entry.error = 'assert reports regression; re-render and re-run assert';
            writeQueue(projectRoot, queue);
            appendAudit(projectRoot, {
              ts: new Date().toISOString(),
              filmId: entry.id,
              event: 'publish-fail',
              error: entry.error,
            });
            failedCount++;
            continue;
          }
        } catch {
          /* report unreadable — fall through and publish; we don't fail-closed
             on a missing gate (the spec says gate-if-present). */
        }
      }

      // Fire the publish cycle.
      entry.status = 'publishing';
      entry.attempts++;
      delete (entry as Partial<DripEntry>).error;
      writeQueue(projectRoot, queue);
      appendAudit(projectRoot, {
        ts: new Date().toISOString(),
        filmId: entry.id,
        event: 'publish-start',
        note: `platforms=${entry.platforms.join(',')} mock=${mock}`,
      });

      const results: PlatformResult[] = [];
      let anyFail = false;

      const posterPath = join(projectRoot, 'out', `${entry.id}-poster.jpg`);
      const ctx: AdapterContext = {
        filmId: entry.id,
        projectRoot,
        mp4Path,
        ...(existsSync(posterPath) ? {posterPath} : {}),
        mock,
        log: (m) => log(dim(m)),
      };

      for (const platform of entry.platforms) {
        log(`  → ${entry.id} :: ${platform}${mock ? dim(' (mock)') : ''}`);
        const result = await runPlatformAdapter(platform, ctx);
        if (result.ok) {
          results.push({
            platform,
            status: 'published',
            publishedAt: new Date().toISOString(),
            url: result.url,
          });
          appendAudit(projectRoot, {
            ts: new Date().toISOString(),
            filmId: entry.id,
            event: 'publish-ok',
            platform,
            url: result.url,
          });
          log(green(`    ✓ ${platform}: ${result.url}`));
        } else {
          anyFail = true;
          results.push({platform, status: 'failed', error: result.error});
          appendAudit(projectRoot, {
            ts: new Date().toISOString(),
            filmId: entry.id,
            event: 'publish-fail',
            platform,
            error: result.error,
          });
          log(red(`    ✗ ${platform}: ${result.error}`));
        }
      }

      entry.results = results;
      if (anyFail) {
        entry.status = 'failed';
        entry.error = results
          .filter((r) => r.status === 'failed')
          .map((r) => `${r.platform}: ${r.error}`)
          .join('; ');
        failedCount++;
      } else {
        entry.status = 'published';
        entry.publishedAt = new Date().toISOString();
        publishedCount++;
      }
      writeQueue(projectRoot, queue);
    }

    appendAudit(projectRoot, {
      ts: new Date().toISOString(),
      filmId: '*',
      event: 'tick-end',
      note: `published=${publishedCount} failed=${failedCount} deferred=${skippedCount}`,
    });

    log(
      `\ntick complete: ${green(String(publishedCount))} published, ` +
        `${red(String(failedCount))} failed, ${yellow(String(skippedCount))} deferred`,
    );
    return failedCount > 0 ? 2 : 0;
  });
};

/* ─────────── platform-list parser shared by the CLI shell ─────────── */

export const parsePlatformList = (raw: string): readonly Platform[] => {
  const tokens = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const out: Platform[] = [];
  for (const t of tokens) {
    if (!isPlatform(t)) {
      throw new Error(
        `invalid --platform "${t}". Expected one of: ${ALL_PLATFORMS.join(', ')}`,
      );
    }
    out.push(t);
  }
  if (out.length === 0) {
    throw new Error(`--platform must list at least one platform`);
  }
  return out;
};
