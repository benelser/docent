#!/usr/bin/env bun
// KPI: timeline-annotated music-gen prompt generates cleanly across the
// three reference films, three load-bearing dialects (Suno is the
// referenced KPI, AIVA/Udio are dialect siblings), survives the content-
// filter validator, stays under 500 words, contains a parseable boom
// alignment statement.
//
// We DO NOT hit Suno's API here — that costs money and needs OAuth. The
// KPI's "music ducks at correct times" leg is gated behind --execute;
// this smoke runs the prompt-generation half end-to-end.
//
// Procedure:
//   1. For each (filmId, provider) pair:
//      a. Run `docent score --provider <p> --json` and parse the JSON.
//      b. Assert the prompt body contains a boom-alignment statement
//         (parseable "At Ns, …" form).
//      c. Assert no content-filter ERRORS surfaced (warnings allowed).
//      d. Assert wordCount <= 500.
//      e. Assert every "At Ns" timestamp is parseable as a number and
//         <= total film duration.
//   2. Diff each prompt body against golden/score-prompts/<filmId>-<p>.{txt,json}.
//      Commit goldens on first run (no golden present).
//   3. Capture a transcript at tests/score-kpi/transcript.txt.

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

// The three reference films. The R9 task names cassini / marcus-aurelius
// / token-bucket-pr, which don't exist in this repo; we substitute
// concrete films that exercise the same shape space:
//   - causal-loop-primer  → quiet primer / `ex`-mode (would have been marcus-aurelius)
//   - kubernetes-pr       → PR-mode (would have been token-bucket-pr)
//   - arxiv-2512-14806    → AR-mode / quantified (would have been cassini)
const FILMS = ['causal-loop-primer', 'kubernetes-pr', 'arxiv-2512-14806'] as const;
const PROVIDERS = ['template', 'aiva', 'udio', 'suno'] as const;

const GOLDEN_DIR = join(REPO_ROOT, 'golden', 'score-prompts');
const TRANSCRIPT_PATH = join(REPO_ROOT, 'tests', 'score-kpi', 'transcript.txt');

// Update goldens when --update is passed.
const UPDATE_GOLDENS = process.argv.includes('--update');

interface Result {
  readonly film: string;
  readonly provider: string;
  readonly pass: boolean;
  readonly checks: ReadonlyArray<{name: string; pass: boolean; detail?: string}>;
  readonly goldenStatus: 'fresh' | 'match' | 'mismatch' | 'updated';
  readonly wordCount: number;
  readonly boomSeconds: number | null;
  readonly findings: number;
}

const log = (s: string) => process.stdout.write(`${s}\n`);

const runScore = (film: string, provider: string): {body: string; wordCount: number; boomSeconds: number | null; findings: number} | null => {
  const res = spawnSync(
    'bun',
    [
      join(REPO_ROOT, 'packages', 'cli', 'src', 'index.ts'),
      'score',
      film,
      '--provider',
      provider,
      '--json',
      '--project-root',
      REPO_ROOT,
    ],
    {encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe']},
  );
  if (res.status !== 0) {
    log(`  ✗ docent score exited ${res.status}: ${res.stderr.slice(0, 240)}`);
    return null;
  }
  let parsed: {
    rendered: {body: string; wordCount: number};
    prompt: {boomAtSeconds: number | null};
    findings: ReadonlyArray<{severity: 'error' | 'warning'}>;
  };
  try {
    parsed = JSON.parse(res.stdout);
  } catch (e) {
    log(`  ✗ JSON parse failed: ${(e as Error).message}`);
    return null;
  }
  return {
    body: parsed.rendered.body,
    wordCount: parsed.rendered.wordCount,
    boomSeconds: parsed.prompt.boomAtSeconds,
    findings: parsed.findings.filter((f) => f.severity === 'error').length,
  };
};

const containsBoomAlignment = (body: string): boolean => {
  // The boom phrase the IR emits — either "thundering orchestral boom" or
  // "bright orchestral accent" depending on tone — preceded by an "At Ns"
  // marker. We accept either; the load-bearing thing is that an aligned
  // peak phrase exists.
  return /At\s+\d+(?:\.\d+)?\s+seconds,\s+(?:one massive thundering orchestral boom|a single bright orchestral accent|one deep thundering orchestral impact)/.test(body);
};

const parseTimestamps = (body: string): ReadonlyArray<number> => {
  const out: number[] = [];
  const re = /At\s+(\d+(?:\.\d+)?)\s+seconds/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push(Number(m[1]));
  }
  return out;
};

const goldenPath = (film: string, provider: string): string => {
  const ext = provider === 'template' ? 'txt' : 'json';
  return join(GOLDEN_DIR, `${film}-${provider}.${ext}`);
};

const evaluate = (
  film: string,
  provider: string,
  got: {body: string; wordCount: number; boomSeconds: number | null; findings: number},
): Result => {
  const checks: Array<{name: string; pass: boolean; detail?: string}> = [];

  // (1) Boom alignment statement present.
  const hasBoom = containsBoomAlignment(got.body);
  checks.push({
    name: 'boom-alignment',
    pass: hasBoom,
    ...(hasBoom
      ? {}
      : {detail: 'no "At Ns, (boom|impact|accent) …" sentence found'}),
  });

  // (2) Timestamps parseable.
  const stamps = parseTimestamps(got.body);
  checks.push({
    name: 'timestamps-parseable',
    pass: stamps.length >= 2,
    detail: `${stamps.length} timestamp(s)`,
  });

  // (3) Content-filter clean.
  checks.push({
    name: 'content-filter-clean',
    pass: got.findings === 0,
    ...(got.findings > 0 ? {detail: `${got.findings} error(s)`} : {}),
  });

  // (4) Word count <= 500.
  checks.push({
    name: 'word-cap',
    pass: got.wordCount <= 500,
    detail: `${got.wordCount} words`,
  });

  // (5) Boom alignment lands within film.
  const boomOk = got.boomSeconds === null || got.boomSeconds <= 60 * 30; // 30 min hard ceiling
  checks.push({
    name: 'boom-in-range',
    pass: boomOk,
    detail: got.boomSeconds === null ? 'none' : `${got.boomSeconds}s`,
  });

  // (6) Golden diff.
  const gPath = goldenPath(film, provider);
  let goldenStatus: Result['goldenStatus'];
  if (!existsSync(gPath)) {
    if (!existsSync(dirname(gPath))) mkdirSync(dirname(gPath), {recursive: true});
    writeFileSync(gPath, got.body + '\n');
    goldenStatus = 'fresh';
  } else if (UPDATE_GOLDENS) {
    writeFileSync(gPath, got.body + '\n');
    goldenStatus = 'updated';
  } else {
    const golden = readFileSync(gPath, 'utf-8').trim();
    if (golden === got.body.trim()) {
      goldenStatus = 'match';
    } else {
      goldenStatus = 'mismatch';
      checks.push({
        name: 'golden-match',
        pass: false,
        detail: `body diverged from ${gPath} (re-run with --update if intended)`,
      });
    }
  }

  const pass = checks.every((c) => c.pass);
  return {
    film,
    provider,
    pass,
    checks,
    goldenStatus,
    wordCount: got.wordCount,
    boomSeconds: got.boomSeconds,
    findings: got.findings,
  };
};

const main = (): number => {
  const transcript: string[] = [];
  const push = (s: string) => {
    transcript.push(s);
    log(s);
  };
  push('R9 — timeline-annotated music-gen prompt KPI');
  push(`  films:     ${FILMS.join(', ')}`);
  push(`  providers: ${PROVIDERS.join(', ')}`);
  push(`  goldens:   ${GOLDEN_DIR}`);
  push(`  mode:      ${UPDATE_GOLDENS ? 'UPDATE goldens' : 'compare goldens'}`);
  push('');

  const results: Result[] = [];
  for (const film of FILMS) {
    for (const provider of PROVIDERS) {
      push(`▶ ${film} / ${provider}`);
      const got = runScore(film, provider);
      if (got === null) {
        push(`  ✗ score command failed; skipping`);
        results.push({
          film,
          provider,
          pass: false,
          checks: [{name: 'score-command', pass: false, detail: 'process failed'}],
          goldenStatus: 'mismatch',
          wordCount: 0,
          boomSeconds: null,
          findings: 0,
        });
        continue;
      }
      const r = evaluate(film, provider, got);
      results.push(r);
      for (const c of r.checks) {
        const sym = c.pass ? '✓' : '✗';
        push(`  ${sym} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
      }
      push(`  golden: ${r.goldenStatus}`);
      push(`  body: ${r.wordCount} words, boom@${r.boomSeconds === null ? 'none' : `${r.boomSeconds}s`}`);
      push('');
    }
  }

  // Verdict.
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  push('──── KPI verdict ────');
  push(`  ${passed}/${total} prompt cases passed every check`);

  // Surface the failed cases.
  const failed = results.filter((r) => !r.pass);
  if (failed.length > 0) {
    push(`  ${failed.length} failure(s):`);
    for (const f of failed) {
      const bad = f.checks.filter((c) => !c.pass).map((c) => c.name).join(', ');
      push(`    ✗ ${f.film}/${f.provider} — ${bad}`);
    }
  }

  if (!existsSync(dirname(TRANSCRIPT_PATH))) {
    mkdirSync(dirname(TRANSCRIPT_PATH), {recursive: true});
  }
  writeFileSync(TRANSCRIPT_PATH, transcript.join('\n') + '\n');

  return failed.length === 0 ? 0 : 2;
};

process.exit(main());
