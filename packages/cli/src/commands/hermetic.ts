// `docent hermetic` — render the 4 gallery fixture films end to end.
//
// The 4 fixtures cover the canonical cognitive moves:
//   - linear-algebra   (explainer, mathematical)
//   - kubernetes-pr    (PR review)
//   - euclid-primes    (explainer, classical proof)
//   - stopping-by-woods (explainer, poetry)
//
// Each renders via `runBuild` with the optional --scale knob. Aggregates
// pass/fail; exits non-zero on any failure.

import {runBuild} from './build';

export interface HermeticArgs {
  readonly scale?: number;
  readonly concurrency?: number;
  readonly outputDir?: string;
  readonly filmsDir?: string;
  readonly projectRoot?: string;
}

const FIXTURES: ReadonlyArray<string> = [
  'linear-algebra',
  'kubernetes-pr',
  'euclid-primes',
  'stopping-by-woods',
];

const log = (s: string) => process.stdout.write(`${s}\n`);

export const runHermetic = async (args: HermeticArgs): Promise<number> => {
  log(`\x1b[36m▶ docent hermetic — ${FIXTURES.length} fixtures\x1b[0m`);
  const results: {filmId: string; code: number}[] = [];
  for (const filmId of FIXTURES) {
    log(`\n\x1b[36m──── ${filmId} ────\x1b[0m`);
    const code = await runBuild({
      filmId,
      ...(args.scale !== undefined ? {scale: args.scale} : {}),
      ...(args.concurrency !== undefined ? {concurrency: args.concurrency} : {}),
      ...(args.outputDir ? {outputDir: args.outputDir} : {}),
      ...(args.filmsDir ? {filmsDir: args.filmsDir} : {}),
      ...(args.projectRoot ? {projectRoot: args.projectRoot} : {}),
    });
    results.push({filmId, code});
  }

  log(`\n\x1b[36m──── hermetic summary ────\x1b[0m`);
  const passed = results.filter((r) => r.code === 0).length;
  const failed = results.length - passed;
  for (const r of results) {
    const mark = r.code === 0 ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    log(`  ${mark} ${r.filmId}${r.code === 0 ? '' : ` (exit ${r.code})`}`);
  }
  log(
    failed === 0
      ? `\x1b[32m✓ hermetic GREEN — ${passed}/${results.length}\x1b[0m`
      : `\x1b[31m✗ hermetic FAILED — ${passed}/${results.length}\x1b[0m`,
  );
  return failed === 0 ? 0 : 1;
};
