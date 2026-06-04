// drip/queue.json — atomic read/write of the queue manifest.
//
// Atomicity strategy:
//   - All writes go through `writeQueue`, which writes to a `.tmp` sibling
//     and `rename`s into place. POSIX rename is atomic on the same filesystem.
//   - Concurrent ticks are kept off the queue with a separate lockfile
//     (`drip/.tick.lock`) acquired in `withLock`. Lock is a directory
//     (mkdir is atomic everywhere) so a crashed tick leaves a stale lock
//     the next tick can break after `LOCK_STALE_MS`.

import {existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';

import {emptyManifest, type DripManifest} from '@bjelser/kit';

export const QUEUE_FILE = 'drip/queue.json';
export const AUDIT_FILE = 'drip/audit.log';
const LOCK_DIR = 'drip/.tick.lock';
const LOCK_STALE_MS = 5 * 60_000; // 5 minutes — a tick that takes longer is wedged

export const queuePath = (projectRoot: string): string =>
  join(projectRoot, QUEUE_FILE);

export const auditPath = (projectRoot: string): string =>
  join(projectRoot, AUDIT_FILE);

export const lockPath = (projectRoot: string): string =>
  join(projectRoot, LOCK_DIR);

export const readQueue = (projectRoot: string): DripManifest => {
  const file = queuePath(projectRoot);
  if (!existsSync(file)) return emptyManifest();
  try {
    const raw = readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as DripManifest;
    if (parsed.version !== 1) {
      throw new Error(`drip/queue.json has unsupported version ${parsed.version}`);
    }
    // Defensive normalization — older files may not have these fields yet.
    parsed.entries = parsed.entries ?? [];
    return parsed;
  } catch (err) {
    throw new Error(`failed to read ${file}: ${(err as Error).message}`);
  }
};

export const writeQueue = (projectRoot: string, manifest: DripManifest): void => {
  const file = queuePath(projectRoot);
  mkdirSync(dirname(file), {recursive: true});
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  renameSync(tmp, file);
};

export const appendAudit = (projectRoot: string, line: object): void => {
  const file = auditPath(projectRoot);
  mkdirSync(dirname(file), {recursive: true});
  // NDJSON — one line per event; rotate by date when the file exceeds
  // ~10 MB (a future cron task; for now we just append).
  const fs = require('node:fs');
  fs.appendFileSync(file, JSON.stringify(line) + '\n', 'utf-8');
};

/**
 * Acquire a tick lock; throw if the lock is held and not stale.
 *
 * The lock is a DIRECTORY because mkdir is atomic on every filesystem
 * we care about (POSIX, NTFS, APFS). The dir's mtime is the heartbeat —
 * older than LOCK_STALE_MS means the previous tick crashed.
 */
export const withLock = async <T>(
  projectRoot: string,
  fn: () => Promise<T>,
): Promise<T> => {
  const lock = lockPath(projectRoot);
  mkdirSync(dirname(lock), {recursive: true});

  try {
    mkdirSync(lock);
  } catch (err) {
    // EEXIST — someone else holds it. Check staleness.
    if (existsSync(lock)) {
      const age = Date.now() - statSync(lock).mtimeMs;
      if (age < LOCK_STALE_MS) {
        throw new Error(
          `drip tick locked (${Math.round(age / 1000)}s ago). Another tick may be in progress; ` +
            `if you're sure not, rm -rf ${lock} and retry.`,
        );
      }
      // Stale — steal it.
      try {
        rmdirSync(lock);
      } catch {
        /* ignore */
      }
      mkdirSync(lock);
    } else {
      throw err;
    }
  }

  try {
    return await fn();
  } finally {
    try {
      rmdirSync(lock);
    } catch {
      /* ignore — best-effort */
    }
  }
};
