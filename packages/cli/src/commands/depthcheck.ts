// `docent depthcheck <film-id>` — aggregate all registered plugins'
// `depthRules` over the spec and print the findings.

import {existsSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

import {depthCheck, type FilmSpec} from '@docent/kit';

import {createEngine} from '../engine-factory';

export interface DepthcheckArgs {
  readonly filmId: string;
  readonly filmsDir?: string;
  readonly projectRoot?: string;
}

const log = (s: string) => process.stdout.write(`${s}\n`);

export const runDepthcheck = async (args: DepthcheckArgs): Promise<number> => {
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

  log(`\x1b[36m▶ docent depthcheck ${args.filmId}\x1b[0m`);
  if (configPath) {
    log(`  config: ${configPath} (+${userPlugins.length} plugins)`);
  }

  const findings = await depthCheck(spec, engine);
  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');
  const infos = findings.filter((f) => f.severity === 'info');

  if (findings.length === 0) {
    log(`\x1b[32m✓ depth contract met — every scene cleared every rule\x1b[0m`);
    return 0;
  }

  if (errors.length > 0) {
    log(`\x1b[31m✗ ${errors.length} error(s):\x1b[0m`);
    for (const e of errors) {
      log(`  ✗ [${e.ruleId}] ${e.path}: ${e.message}`);
      if (e.suggestion) log(`     → ${e.suggestion}`);
    }
  }
  if (warnings.length > 0) {
    log(`\x1b[33m⚠ ${warnings.length} warning(s):\x1b[0m`);
    for (const w of warnings) {
      log(`  ⚠ [${w.ruleId}] ${w.path}: ${w.message}`);
      if (w.suggestion) log(`     → ${w.suggestion}`);
    }
  }
  if (infos.length > 0) {
    log(`\x1b[90mℹ ${infos.length} info finding(s)\x1b[0m`);
    for (const i of infos) {
      log(`  ℹ [${i.ruleId}] ${i.path}: ${i.message}`);
    }
  }
  return errors.length > 0 ? 2 : 0;
};
