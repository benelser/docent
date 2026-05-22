// docent flywheel — the outer loop's visibility surface.
//
// Reads every per-film verdict under reviews/ (only the final ones — not the
// .round-N.json intermediate snapshots) and surfaces what is *consistently*
// falling short across films. The dimensions where ≥half the films score ≤4
// are the distillation candidates: observations the survey templates and the
// brief should absorb to raise the floor for every future film. This is the
// outer half of the virtuous cycle made operational.

import {existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {REPO_ROOT} from './paths';

type Score = {dimension: string; score: number; note?: string};
type Verdict = {pass: boolean; scores: Score[]; critiques?: unknown[]};
type FilmVerdict = {id: string; verdict: Verdict};

const REVIEWS_DIR = join(REPO_ROOT, 'reviews');

export const flywheel = async (): Promise<number> => {
  if (!existsSync(REVIEWS_DIR)) {
    console.error('\x1b[33m⚠\x1b[0m  no reviews/ yet — judge a film first (docent judge <id>)');
    return 1;
  }

  // Only the final per-film verdict — not the .round-N.json intermediates.
  const files = readdirSync(REVIEWS_DIR)
    .filter((f) => f.endsWith('.json') && !/\.round-\d+\.json$/.test(f))
    .sort();
  if (files.length === 0) {
    console.error('\x1b[33m⚠\x1b[0m  no verdicts yet — judge a film first (docent judge <id>)');
    return 1;
  }

  const verdicts: FilmVerdict[] = [];
  for (const f of files) {
    const id = f.replace(/\.json$/, '');
    const verdict = (await Bun.file(join(REVIEWS_DIR, f)).json()) as Verdict;
    verdicts.push({id, verdict});
  }
  const total = verdicts.length;

  console.log(`\x1b[1mdocent flywheel\x1b[0m — ${total} verdict(s)\n`);

  const passes = verdicts.filter((v) => v.verdict.pass).length;
  const passColor = passes === total ? '\x1b[32m' : passes === 0 ? '\x1b[31m' : '\x1b[33m';
  console.log(`  ${passColor}${passes}/${total} pass\x1b[0m`);
  for (const v of verdicts) {
    const sum = v.verdict.scores.reduce((a, s) => a + s.score, 0);
    const max = v.verdict.scores.length * 5;
    const mark = v.verdict.pass ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`    ${mark} ${v.id.padEnd(20)} ${sum}/${max}`);
  }

  // Per-dimension stats — average across films, and which films scored ≤4.
  const dims = Array.from(
    new Set(verdicts.flatMap((v) => v.verdict.scores.map((s) => s.dimension))),
  );
  type DimStat = {dim: string; avg: number; low: string[]};
  const stats: DimStat[] = [];
  for (const dim of dims) {
    const scored = verdicts
      .map((v) => ({id: v.id, s: v.verdict.scores.find((x) => x.dimension === dim)?.score}))
      .filter((x): x is {id: string; s: number} => x.s !== undefined);
    if (scored.length === 0) continue;
    stats.push({
      dim,
      avg: scored.reduce((a, x) => a + x.s, 0) / scored.length,
      low: scored.filter((x) => x.s <= 4).map((x) => x.id),
    });
  }
  stats.sort((a, b) => a.avg - b.avg);

  console.log('\n  \x1b[2mper dimension              avg   ≤4 films\x1b[0m');
  for (const s of stats) {
    const dim = s.dim.padEnd(22);
    const avg = s.avg.toFixed(1);
    const c = s.avg <= 3 ? '\x1b[31m' : s.avg < 4.5 ? '\x1b[33m' : '\x1b[32m';
    const lowMark =
      s.low.length === 0
        ? '\x1b[32mnone\x1b[0m'
        : `${s.low.length}/${total} — ${s.low.join(', ')}`;
    console.log(`  ${dim} ${c}${avg}\x1b[0m   ${lowMark}`);
  }

  // Distillation candidates — recurring ≤4 on ≥half the films.
  const candidates = stats.filter((s) => s.low.length / total >= 0.5);
  console.log('\n  \x1b[2mdistillation candidates (recurring ≤4 on ≥half the films):\x1b[0m');
  if (candidates.length === 0) {
    console.log('  \x1b[32m(none — the brief is holding the floor)\x1b[0m');
  } else {
    for (const c of candidates) {
      console.log(`  · \x1b[1m${c.dim}\x1b[0m — ${c.avg.toFixed(1)}/5 avg, low on ${c.low.length}/${total}`);
    }
    console.log(
      '\n  \x1b[2mEach candidate is an observation the survey templates / brief\x1b[0m',
    );
    console.log(
      '  \x1b[2mshould absorb so future films stop making the same mistake.\x1b[0m',
    );
  }

  return 0;
};
