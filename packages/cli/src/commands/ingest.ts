// `docent ingest <fcpxml-path> --film <id> [--apply] [--out <path>]` —
// the round-trip ingest CLI shell (R11.4).
//
// Workflow:
//   1. Load films/<id>.json (the docent spec — the truth before the editor
//      touched it).
//   2. Read the FCPXML at <fcpxml-path>.
//   3. Build the engine + the frame schedule for the spec (the kit's view
//      of where each scene lives in the timeline).
//   4. Parse the FCPXML to a flat clip list.
//   5. Diff parsed-vs-spec via `diffIngest`.
//   6. Without --apply: print a human-readable summary (with ANSI colour).
//      With --apply: rewrite films/<id>.edited.json (or --out path) via
//      `applyIngest`, surface warnings on stderr.
//
// Also exports a tiny emitter (`emitMinimalFcpxml`) used by the round-trip
// smoke test (and by ad-hoc tooling) when R11.1's full emitter isn't
// available. The emitter encodes the scene-id annotation convention
// documented in `kit/src/cascade/fcpxml-parse.ts` — keep the two in sync
// across packages.

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';

import {
  applyIngest,
  buildFrameSchedule,
  diffIngest,
  parseFcpxml,
  type FilmSpec,
  type FrameSchedule,
  type IngestDiff,
} from '@bjelser/kit';

import {createEngine} from '../engine-factory';

const log = (s: string) => process.stdout.write(`${s}\n`);
const err = (s: string) => process.stderr.write(`${s}\n`);
const reset = '\x1b[0m';
const red = (s: string) => `\x1b[31m${s}${reset}`;
const yellow = (s: string) => `\x1b[33m${s}${reset}`;
const green = (s: string) => `\x1b[32m${s}${reset}`;
const dim = (s: string) => `\x1b[2m${s}${reset}`;
const cyan = (s: string) => `\x1b[36m${s}${reset}`;
const bold = (s: string) => `\x1b[1m${s}${reset}`;

export interface IngestArgs {
  /** Path to the FCPXML file the editor produced. */
  readonly fcpxmlPath: string;
  /** Film id — looks up films/<id>.json. */
  readonly filmId: string;
  /** When true, write films/<id>.edited.json honouring the diff. */
  readonly apply?: boolean;
  /** Override the output path (defaults to films/<id>.edited.json). */
  readonly out?: string;
  /** Emit the diff as JSON on stdout instead of the human summary. */
  readonly json?: boolean;
  readonly filmsDir?: string;
  readonly projectRoot?: string;
}

// ----- the public entry point ----------------------------------------------

export const runIngest = async (args: IngestArgs): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const filmsDir = args.filmsDir ?? join(projectRoot, 'films');
  const specPath = resolve(filmsDir, `${args.filmId}.json`);
  const fcpxmlPath = resolve(cwd, args.fcpxmlPath);

  if (!existsSync(specPath)) {
    err(red(`✗ films/${args.filmId}.json not found at ${specPath}`));
    return 1;
  }
  if (!existsSync(fcpxmlPath)) {
    err(red(`✗ FCPXML not found at ${fcpxmlPath}`));
    return 1;
  }

  log(cyan(`▶ docent ingest ${args.fcpxmlPath} --film ${args.filmId}`));

  // Load + parse.
  const spec: FilmSpec = JSON.parse(readFileSync(specPath, 'utf-8'));
  const xml = readFileSync(fcpxmlPath, 'utf-8');
  const {engine} = await createEngine(projectRoot);
  const schedule = buildFrameSchedule(spec, engine);
  const parsed = parseFcpxml(xml);

  const diff = diffIngest(spec, parsed, schedule, {
    originalSpecPath: specPath,
    fcpxmlPath,
  });

  // --json: print the diff and exit (still apply if --apply also set).
  if (args.json && !args.apply) {
    process.stdout.write(JSON.stringify(diff, null, 2) + '\n');
    return 0;
  }

  if (!args.apply) {
    printDiff(diff, spec, schedule);
    return 0;
  }

  // --apply: write the rewritten spec.
  const applied = applyIngest(spec, diff);
  const outPath =
    args.out !== undefined
      ? resolve(cwd, args.out)
      : join(filmsDir, `${args.filmId}.edited.json`);
  const outDir = dirname(outPath);
  if (!existsSync(outDir)) mkdirSync(outDir, {recursive: true});
  writeFileSync(outPath, JSON.stringify(applied.spec, null, 2) + '\n');

  printDiff(diff, spec, schedule);
  log('');
  log(green(`✓ wrote ${outPath}`));
  if (applied.warnings.length > 0) {
    log(yellow(`  ${applied.warnings.length} warning(s):`));
    for (const w of applied.warnings) log(yellow(`    ⚠ ${w}`));
  }
  return 0;
};

// ----- human-readable summary ----------------------------------------------

const printDiff = (
  diff: IngestDiff,
  spec: FilmSpec,
  schedule: FrameSchedule,
): void => {
  log('');
  log(bold(cyan('──── ingest diff ────')));
  log(
    dim(
      `  fps=${diff.fps} · scenes in spec: ${spec.scenes.length} · scheduled total: ${schedule.totalFrames} frames`,
    ),
  );
  log('');

  if (diff.warnings.length > 0) {
    for (const w of diff.warnings) log(yellow(`  ⚠ ${w}`));
    log('');
  }

  if (
    diff.reorderedScenes.length === 0 &&
    diff.removedScenes.length === 0 &&
    diff.durationChanges.length === 0 &&
    diff.foreignClips.length === 0
  ) {
    log(green('  ✓ no scene-level edits detected — FCPXML matches the spec.'));
    return;
  }

  if (diff.removedScenes.length > 0) {
    log(red(bold(`  removed scenes (${diff.removedScenes.length})`)));
    for (const r of diff.removedScenes) {
      log(red(`    ✗ "${r.sceneId}" (was at index ${r.originalIndex})`));
    }
    log('');
  }

  if (diff.reorderedScenes.length > 0) {
    log(yellow(bold(`  reordered scenes (${diff.reorderedScenes.length})`)));
    for (const r of diff.reorderedScenes) {
      log(
        yellow(
          `    ↕ "${r.sceneId}": ${r.originalIndex} → ${r.newIndex}`,
        ),
      );
    }
    log('');
  }

  if (diff.durationChanges.length > 0) {
    log(yellow(bold(`  duration changes (${diff.durationChanges.length})`)));
    for (const d of diff.durationChanges) {
      const sign = d.deltaFrames > 0 ? '+' : '';
      const verb = d.deltaFrames > 0 ? 'extended' : 'shortened';
      log(
        yellow(
          `    ↔ "${d.sceneId}": ${verb}, ${d.originalFrames} → ${d.newFrames} (${sign}${d.deltaFrames}f)`,
        ),
      );
    }
    log('');
  }

  if (diff.foreignClips.length > 0) {
    log(yellow(bold(`  foreign clips (${diff.foreignClips.length})`)));
    log(
      dim(
        '    these don\'t map to any of our scenes — b-roll inserts or splits of one of our clips',
      ),
    );
    for (const c of diff.foreignClips) {
      const refTail = c.refUri !== undefined ? ` ref=${c.refUri}` : '';
      log(
        yellow(
          `    + spine[${c.spineIndex}] frames ${c.startFrame}..${c.endFrame}${refTail}`,
        ),
      );
    }
    log('');
  }
};

// ----- emitter (smoke / fallback when R11.1 isn't merged) ------------------

/**
 * Build a minimal FCPXML that the parser round-trips faithfully. Each scene
 * becomes an `<asset-clip>` on the spine; the docent scene id rides on a
 * `<note>docent:sceneId=…</note>` child (the convention documented in
 * `kit/src/cascade/fcpxml-parse.ts`).
 *
 * The emitter is intentionally simple — it exists so this command can be
 * exercised end-to-end without R11.1's full FCPXML emitter. R11.1 may
 * produce a richer FCPXML (multiple roles, audio components, chapter
 * markers); the parser is forgiving and will read both.
 *
 * Used by the round-trip smoke at `tests/r11-ingest/...`.
 */
export const emitMinimalFcpxml = (
  spec: FilmSpec,
  schedule: FrameSchedule,
): string => {
  const fps = schedule.fps;
  // FCPXML wants `<sequence frameDuration="1/<fps>s">`.
  const frameDur = `1/${fps}s`;
  // Build per-clip spine entries.
  let cursor = 0; // in frames; offsets are written in frames/fps form
  const clipLines: string[] = [];
  schedule.scenes.forEach((sc) => {
    const sceneId = sc.scene.id ?? `scene-${sc.sceneIndex}`;
    const offset = `${cursor}/${fps}s`;
    const duration = `${sc.frames}/${fps}s`;
    clipLines.push(
      [
        `      <asset-clip name="${escapeXml(sceneId)}" offset="${offset}" duration="${duration}" ref="docent:${escapeXml(sceneId)}">`,
        `        <note>docent:sceneId=${escapeXml(sceneId)}</note>`,
        `      </asset-clip>`,
      ].join('\n'),
    );
    cursor += sc.frames;
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<fcpxml version="1.10">`,
    `  <resources/>`,
    `  <library>`,
    `    <event name="${escapeXml(spec.meta.id)}">`,
    `      <project name="${escapeXml(spec.meta.title ?? spec.meta.id)}">`,
    `        <sequence format="r0" frameDuration="${frameDur}">`,
    `          <spine>`,
    clipLines.map((l) => '  ' + l).join('\n'),
    `          </spine>`,
    `        </sequence>`,
    `      </project>`,
    `    </event>`,
    `  </library>`,
    `</fcpxml>`,
    '',
  ].join('\n');
};

const escapeXml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
