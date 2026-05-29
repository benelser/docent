// `docent validate <film-id>` — run the engine's structural validator.
//
// Reads films/<id>.json, builds the engine (core + user config), runs
// engine.validate(spec), and prints a summary. Exits non-zero on errors.

import {existsSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

import {createEngine} from '../engine-factory';
import type {FilmSpec} from '@bjelser/kit';

export interface ValidateArgs {
  readonly filmId: string;
  readonly filmsDir?: string;
  readonly projectRoot?: string;
}

const log = (s: string) => process.stdout.write(`${s}\n`);

export const runValidate = async (args: ValidateArgs): Promise<number> => {
  const cwd = process.cwd();
  const projectRoot = args.projectRoot ?? cwd;
  const filmsDir = args.filmsDir ?? join(projectRoot, 'films');
  const specPath = resolve(filmsDir, `${args.filmId}.json`);

  if (!existsSync(specPath)) {
    log(`\x1b[31m✗ films/${args.filmId}.json not found at ${specPath}\x1b[0m`);
    return 1;
  }

  const spec: FilmSpec = JSON.parse(readFileSync(specPath, 'utf-8'));
  const {engine, configPath, userPlugins} = await createEngine(projectRoot);

  log(`\x1b[36m▶ docent validate ${args.filmId}\x1b[0m`);
  if (configPath) {
    log(`  config: ${configPath} (+${userPlugins.length} plugins)`);
  }

  const issues = engine.validate(spec, {projectRoot});
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  if (errors.length === 0 && warnings.length === 0) {
    log(`\x1b[32m✓ spec validates clean — ${spec.scenes.length} scene(s)\x1b[0m`);
    return 0;
  }
  if (errors.length > 0) {
    log(`\x1b[31m✗ ${errors.length} error(s):\x1b[0m`);
    for (const e of errors) {
      log(
        `  ✗ ${e.path || '(root)'}: ${e.message}` +
          (e.source ? `  [${e.source}]` : ''),
      );
    }
  }
  if (warnings.length > 0) {
    log(`\x1b[33m⚠ ${warnings.length} warning(s):\x1b[0m`);
    for (const w of warnings) {
      log(
        `  ⚠ ${w.path || '(root)'}: ${w.message}` +
          (w.source ? `  [${w.source}]` : ''),
      );
    }
  }
  return errors.length > 0 ? 2 : 0;
};
