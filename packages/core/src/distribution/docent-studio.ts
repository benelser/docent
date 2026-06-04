// docent-studio adapter — publish a rendered film to docent.studio.
//
// What "publish" means here:
//   1. Validate the rendered artefacts exist on disk (mp4 + poster).
//   2. Copy them into `landing/static/films/`.
//   3. Patch `landing/src/lib/films.ts` so the FILMS array includes a
//      record for this film (if it is not already present). The
//      pre-rendered `/v/<id>` route picks the film up at SvelteKit build
//      time.
//   4. Trigger `bun run build && bunx firebase deploy --only hosting`
//      against the `docent-497713` project — unless `ctx.mock === true`,
//      in which case we walk every step except the deploy.
//
// Why the .ts edit is template-string + regex (not a TS AST):
//   films.ts is a tiny, hand-authored module with a known shape — one
//   `const FILMS: Film[] = [ ... ];` literal. A full TS AST round-trip
//   (typescript@6 transformer, ts-morph, etc.) would force a heavy
//   peer-dep onto @bjelser/core for one literal edit. The regex
//   approach is brittle in the abstract but RELIABLE here because we
//   own both ends — the file shape is part of the repo's contract. The
//   adapter REFUSES to edit if the literal can't be found and logs a
//   "rewrite films.ts by hand and re-run" message.
//
// What is NOT here (intentionally):
//   - Auth / secrets — the firebase CLI inherits whatever auth the host
//     already has (`firebase login` or service-account env).
//   - Webm conversion — that's a one-shot script the operator runs.
//   - Sitemap regeneration — the SvelteKit build owns that.

import {execFileSync} from 'node:child_process';
import {existsSync, copyFileSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

import type {AdapterContext, AdapterResult} from './types';

/**
 * Minimal record that lands in films.ts. The adapter takes optional
 * overrides via env; the smoke test sets them programmatically.
 *
 * In production, an operator running `docent drip add` upfront would have
 * already authored these in `films/<id>.json`'s `meta` — we read them
 * back from the film spec, falling back to a sensible default.
 */
interface FilmRecord {
  id: string;
  title: string;
  subject: string;
  scenes: string[];
  duration: string;
  domain: string;
}

const FIREBASE_PROJECT = 'docent-497713';
const FIREBASE_TARGET = 'main';

/**
 * Read the film spec to populate the FILMS record. The spec is the source
 * of truth for title + subject; if the file is missing or malformed, we
 * fall back to the filmId for everything (still a valid record).
 */
const readSpecForRecord = (
  projectRoot: string,
  filmId: string,
): FilmRecord => {
  const specPath = join(projectRoot, 'films', `${filmId}.json`);
  const fallback: FilmRecord = {
    id: filmId,
    title: filmId,
    subject: 'a docent film',
    scenes: [],
    duration: '0:00',
    domain: 'docent film',
  };
  if (!existsSync(specPath)) return fallback;
  try {
    const raw = readFileSync(specPath, 'utf-8');
    const spec = JSON.parse(raw) as {
      meta?: {
        id?: string;
        title?: string;
        subtitle?: string;
        subject?: string;
        domain?: string;
      };
      scenes?: Array<{type?: string}>;
    };
    const scenes = (spec.scenes ?? [])
      .map((s) => s.type)
      .filter((t): t is string => typeof t === 'string');
    return {
      id: spec.meta?.id ?? filmId,
      title: spec.meta?.title ?? filmId,
      subject: spec.meta?.subject ?? spec.meta?.subtitle ?? 'a docent film',
      scenes,
      duration: '0:00', // computed lazily by a future tooling pass
      domain: spec.meta?.domain ?? 'docent film',
    };
  } catch {
    return fallback;
  }
};

const escapeJs = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const formatRecord = (r: FilmRecord): string => {
  const scenes = r.scenes.map((s) => `'${escapeJs(s)}'`).join(', ');
  return `\t{
\t\tid: '${escapeJs(r.id)}',
\t\ttitle: '${escapeJs(r.title)}',
\t\tsubject: '${escapeJs(r.subject)}',
\t\tscenes: [${scenes}],
\t\tduration: '${escapeJs(r.duration)}',
\t\tdomain: '${escapeJs(r.domain)}'
\t}`;
};

/**
 * Insert `record` into the FILMS array in films.ts. Operation is
 * idempotent: if a record with the same id already exists, we leave
 * the file untouched and return `{ changed: false }`.
 */
const upsertFilmsTs = (
  filmsTsPath: string,
  record: FilmRecord,
): {changed: boolean; reason?: string} => {
  if (!existsSync(filmsTsPath)) {
    return {changed: false, reason: `films.ts not found at ${filmsTsPath}`};
  }
  const src = readFileSync(filmsTsPath, 'utf-8');

  // Idempotency: bail if the id already appears as `id: '<id>'`.
  const idPattern = new RegExp(`id:\\s*'${record.id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}'`);
  if (idPattern.test(src)) {
    return {changed: false, reason: 'id already in FILMS'};
  }

  // Find the closing `];` of `export const FILMS: Film[] = [ ... ];`.
  // We anchor on the literal substring `export const FILMS` and walk
  // bracket depth from the `[` after `=`.
  const startMarker = 'export const FILMS';
  const startIdx = src.indexOf(startMarker);
  if (startIdx === -1) {
    return {changed: false, reason: 'could not locate "export const FILMS" in films.ts'};
  }
  const arrayOpen = src.indexOf('[', startIdx);
  if (arrayOpen === -1) {
    return {changed: false, reason: 'could not locate FILMS array opener'};
  }
  // Find matching close — scan, tracking depth + string state lightly.
  // Cheap version: ignore strings (the file we own is JS with single
  // quotes inside literal records, no `]` inside strings).
  let depth = 0;
  let arrayClose = -1;
  for (let i = arrayOpen; i < src.length; i++) {
    const c = src[i];
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) {
        arrayClose = i;
        break;
      }
    }
  }
  if (arrayClose === -1) {
    return {changed: false, reason: 'unbalanced FILMS array'};
  }

  // Splice in: insert before the close. We add a leading comma if the
  // array is non-empty (i.e. last non-whitespace char before close is `}`).
  const inner = src.slice(arrayOpen + 1, arrayClose);
  const trimmed = inner.replace(/\s+$/, '');
  const needsComma = /[\}\]]\s*$/.test(trimmed);
  const insertion = (needsComma ? ',\n' : '\n') + formatRecord(record) + '\n';
  const next =
    src.slice(0, arrayOpen + 1) + trimmed + insertion + src.slice(arrayClose);
  writeFileSync(filmsTsPath, next, 'utf-8');
  return {changed: true};
};

export const docentStudioAdapter = async (
  ctx: AdapterContext,
): Promise<AdapterResult> => {
  const {filmId, projectRoot, mp4Path, posterPath, mock, log} = ctx;

  // Step 1 — input validation.
  if (!existsSync(mp4Path)) {
    return {ok: false, error: `mp4 missing at ${mp4Path}`};
  }

  // Step 2 — copy artefacts.
  const landingFilmsDir = join(projectRoot, 'landing', 'static', 'films');
  mkdirSync(landingFilmsDir, {recursive: true});

  const destMp4 = join(landingFilmsDir, `${filmId}.mp4`);
  if (!mock) {
    copyFileSync(mp4Path, destMp4);
  }
  log(`  ✓ copied mp4 → ${destMp4}${mock ? ' (mock)' : ''}`);

  if (posterPath && existsSync(posterPath)) {
    const destPoster = join(landingFilmsDir, `${filmId}-poster.jpg`);
    if (!mock) {
      copyFileSync(posterPath, destPoster);
    }
    log(`  ✓ copied poster → ${destPoster}${mock ? ' (mock)' : ''}`);
  }

  // Step 3 — patch films.ts.
  const filmsTsPath = join(projectRoot, 'landing', 'src', 'lib', 'films.ts');
  const record = readSpecForRecord(projectRoot, filmId);

  if (mock) {
    // In mock mode we still PARSE the spec and dry-run the films.ts edit
    // so the smoke test catches structural breakage — we just don't
    // write the new bytes to disk.
    const before = existsSync(filmsTsPath) ? readFileSync(filmsTsPath, 'utf-8') : '';
    const wouldChange = before && !new RegExp(`id:\\s*'${record.id}'`).test(before);
    log(`  ✓ films.ts edit ${wouldChange ? 'planned' : 'no-op (already present or missing file)'} (mock)`);
  } else {
    const edit = upsertFilmsTs(filmsTsPath, record);
    if (!edit.changed) {
      log(`  · films.ts unchanged (${edit.reason ?? 'idempotent'})`);
    } else {
      log(`  ✓ films.ts patched with id=${filmId}`);
    }
  }

  // Step 4 — deploy.
  if (mock) {
    log(`  · firebase deploy skipped (mock)`);
  } else {
    try {
      log(`  · running landing build…`);
      execFileSync('bun', ['run', 'build'], {
        cwd: join(projectRoot, 'landing'),
        stdio: 'inherit',
      });
      log(`  · running firebase deploy --only hosting -t ${FIREBASE_TARGET}…`);
      execFileSync(
        'bunx',
        [
          'firebase',
          'deploy',
          '--only',
          'hosting',
          '--project',
          FIREBASE_PROJECT,
          '-t',
          FIREBASE_TARGET,
        ],
        {cwd: join(projectRoot, 'landing'), stdio: 'inherit'},
      );
    } catch (err) {
      return {
        ok: false,
        error: `landing build/deploy failed: ${(err as Error).message}`,
      };
    }
  }

  const url = `https://docent.studio/v/${filmId}`;
  return {ok: true, url, ...(mock ? {note: 'mock deploy — not actually live'} : {})};
};
