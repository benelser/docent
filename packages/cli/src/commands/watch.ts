// `docent watch <film-id>` — re-validate + re-render on spec save.
//
// The author-loop tightener. Editing a spec by hand is iteration: tweak a
// narration, save, run validate, run depthcheck, run build, read the
// findings, tweak again. This command collapses that into a file watcher:
// any save to films/<id>.json (or to docent.config.ts) replays the chain
// and streams the result with timestamps.
//
// Pairs with `docent preview`: with `--no-build`, watch only revalidates
// and depthchecks — Remotion Studio handles its own frame re-renders, so
// asking the cascade to render again would just duplicate work.
//
// Watcher choice: node's `fs.watch` (which Bun implements natively). It is
// noisy on macOS (a single editor save often fires 2–3 events; atomic-save
// editors that write a tmp file and rename can fire on the directory, not
// the file), so we debounce 250ms and we watch the parent directory in
// addition to the file itself — that catches the rename-into-place pattern
// Vim/IntelliJ use.

import {existsSync, readFileSync, watch as fsWatch, type FSWatcher} from 'node:fs';
import {basename, dirname, join, resolve} from 'node:path';

import {depthCheck, type FilmSpec} from '@bjelser/kit';

import {runBuild} from './build';
import {createEngine} from '../engine-factory';

export interface WatchArgs {
  readonly filmId: string;
  readonly filmsDir?: string;
  readonly outputDir?: string;
  readonly scale?: number;
  readonly skipTts?: boolean;
  readonly projectRoot?: string;
  /** Re-validate + depthcheck on save, but don't render. */
  readonly noBuild?: boolean;
}

const ts = (): string => {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `\x1b[90m${hh}:${mm}:${ss}\x1b[0m`;
};

const log = (s: string) => process.stdout.write(`${ts()} ${s}\n`);
const logErr = (s: string) => process.stderr.write(`${ts()} ${s}\n`);

export const runWatch = async (args: WatchArgs): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const filmsDir = args.filmsDir ?? join(projectRoot, 'films');
  const specPath = resolve(filmsDir, `${args.filmId}.json`);
  const configPath = resolve(projectRoot, 'docent.config.ts');

  if (!existsSync(specPath)) {
    logErr(`\x1b[31m✗ films/${args.filmId}.json not found at ${specPath}\x1b[0m`);
    return 1;
  }

  log(`\x1b[36m▶ docent watch ${args.filmId}\x1b[0m`);
  log(`  spec:   ${specPath}`);
  if (existsSync(configPath)) log(`  config: ${configPath}`);
  log(
    `  mode:   ${args.noBuild ? 'validate + depthcheck (no build)' : 'validate + depthcheck + build'}`,
  );
  log(`  press Ctrl+C to stop`);

  // One pass = validate → depthcheck → (build). Re-entrant guard prevents
  // overlapping runs: if a save lands while a build is mid-flight, queue
  // a follow-up pass to fire after this one completes.
  let running = false;
  let queued = false;

  const runPass = async (reason: string): Promise<void> => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      log(`\x1b[36m▶ change detected (${reason}) — replaying\x1b[0m`);

      // Parse + validate. A syntax error in the JSON itself is the most
      // common authoring slip — surface it with the file path so editors
      // can jump to the offending line.
      let spec: FilmSpec;
      try {
        spec = JSON.parse(readFileSync(specPath, 'utf-8')) as FilmSpec;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logErr(`\x1b[31m✗ ${specPath}: invalid JSON\x1b[0m`);
        logErr(`  ${msg}`);
        return;
      }

      const {engine, configPath: loadedConfigPath, userPlugins} = await createEngine(projectRoot);
      if (loadedConfigPath) {
        log(`  config: ${loadedConfigPath} (+${userPlugins.length} plugins)`);
      }

      const issues = engine.validate(spec);
      const errors = issues.filter((i) => i.severity === 'error');
      const warnings = issues.filter((i) => i.severity === 'warning');

      if (errors.length > 0) {
        logErr(`\x1b[31m✗ ${errors.length} validation error(s) — aborting rebuild\x1b[0m`);
        for (const e of errors) {
          logErr(
            `  ✗ ${specPath}: ${e.path || '(root)'}: ${e.message}` +
              (e.source ? `  [${e.source}]` : ''),
          );
        }
        return;
      }
      if (warnings.length > 0) {
        log(`\x1b[33m⚠ ${warnings.length} validation warning(s)\x1b[0m`);
        for (const w of warnings) {
          log(`  ⚠ ${w.path || '(root)'}: ${w.message}`);
        }
      } else {
        log(`\x1b[32m✓ validates clean — ${spec.scenes.length} scene(s)\x1b[0m`);
      }

      // depthcheck: warnings only — never abort. The contract is "be
      // noisier but keep moving" so the author sees the recommendations
      // alongside the render.
      const depthFindings = await depthCheck(spec, engine);
      const depthErrors = depthFindings.filter((f) => f.severity === 'error');
      const depthWarns = depthFindings.filter((f) => f.severity === 'warning');
      if (depthFindings.length === 0) {
        log(`\x1b[32m✓ depth contract met\x1b[0m`);
      } else {
        if (depthErrors.length > 0) {
          log(`\x1b[33m⚠ depth: ${depthErrors.length} error(s)\x1b[0m`);
          for (const e of depthErrors) {
            log(`  ⚠ [${e.ruleId}] ${e.path}: ${e.message}`);
          }
        }
        if (depthWarns.length > 0) {
          log(`\x1b[33m⚠ depth: ${depthWarns.length} warning(s)\x1b[0m`);
          for (const w of depthWarns) {
            log(`  ⚠ [${w.ruleId}] ${w.path}: ${w.message}`);
          }
        }
      }

      if (args.noBuild) {
        log(`\x1b[90m• --no-build set; skipping render\x1b[0m`);
        return;
      }

      // Delegate to runBuild — same cascade, same flags, same exit codes.
      // runBuild re-loads the spec from disk, which is fine: we just
      // confirmed it parses, and a millisecond-window race where the file
      // changes again between here and runBuild's read just means the
      // queued pass picks up the newer version.
      const code = await runBuild({
        filmId: args.filmId,
        ...(args.filmsDir ? {filmsDir: args.filmsDir} : {}),
        ...(args.outputDir ? {outputDir: args.outputDir} : {}),
        ...(args.scale !== undefined ? {scale: args.scale} : {}),
        ...(args.skipTts ? {skipTts: true} : {}),
        ...(args.projectRoot ? {projectRoot: args.projectRoot} : {}),
      });
      if (code === 0) {
        log(`\x1b[32m✓ build complete\x1b[0m`);
      } else {
        logErr(`\x1b[31m✗ build exited ${code}\x1b[0m`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.stack ?? e.message : String(e);
      logErr(`\x1b[31m✗ watch pass crashed:\x1b[0m`);
      logErr(msg);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        // Re-fire on next tick so the timestamp moves and the user can
        // see the second pass distinctly.
        setImmediate(() => void runPass('queued'));
      }
    }
  };

  // Debounce: a single save often fires 2–3 fs events on macOS (chmod +
  // truncate + write), and atomic-save editors (Vim, IntelliJ) trigger a
  // rename on the parent directory. 250ms collapses both patterns into
  // one pass.
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const schedule = (reason: string): void => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void runPass(reason);
    }, 250);
  };

  const watchers: FSWatcher[] = [];

  // Watch the spec file. fs.watch on a file may stop firing if the file
  // is replaced (atomic save) — so we also watch the films dir and filter
  // for the spec's basename. Belt + braces.
  const specBase = basename(specPath);
  try {
    watchers.push(
      fsWatch(specPath, () => schedule(`change ${specBase}`)),
    );
  } catch (e) {
    // Falls through; the directory watcher below will still catch saves.
    const msg = e instanceof Error ? e.message : String(e);
    logErr(`\x1b[33m⚠ couldn't watch ${specPath} directly: ${msg}\x1b[0m`);
  }

  try {
    watchers.push(
      fsWatch(dirname(specPath), (_event, filename) => {
        if (filename && filename === specBase) {
          schedule(`dir-event ${specBase}`);
        }
      }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logErr(`\x1b[33m⚠ couldn't watch ${dirname(specPath)}: ${msg}\x1b[0m`);
  }

  if (existsSync(configPath)) {
    try {
      watchers.push(
        fsWatch(configPath, () => schedule('change docent.config.ts')),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logErr(`\x1b[33m⚠ couldn't watch docent.config.ts: ${msg}\x1b[0m`);
    }
  }

  log(`\x1b[32m✓ watching\x1b[0m`);

  // Run an initial pass on startup so the author sees the current state
  // without having to save first.
  await runPass('initial');

  // SIGINT — gracefully close watchers and exit 0. Don't lose stdout: the
  // node default handler kills the process before any pending writes
  // flush.
  return await new Promise<number>((resolveExit) => {
    const shutdown = (): void => {
      log(`\x1b[36m▶ shutting down\x1b[0m`);
      if (debounceTimer) clearTimeout(debounceTimer);
      for (const w of watchers) {
        try {
          w.close();
        } catch {
          // ignore: already closed
        }
      }
      resolveExit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
};
