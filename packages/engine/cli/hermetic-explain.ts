// `docent hermetic --explain <url> --target claude|codex|all` — the
// end-to-end Go Live gate. Validates that the FULL skill cascade
// (survey → treatment → spec → review → build) actually produces a film
// when invoked from each agent host.
//
// Why this exists separately from `--fresh-user`:
//
//   --fresh-user validates the INSTALL surface (apm/codex plugin install,
//   skill discovery, doctor health, build of a pre-authored film).
//
//   --explain validates the AUTHORING surface — that the agent itself
//   (claude or codex) can read the survey brief, drive the cascade,
//   and land an mp4 from a URL the user typed. Failure modes this
//   catches that fresh-user does not: agent CLI hangs, stale prompts,
//   judge round-budget exhaustion, render contract regressions on
//   freshly-authored specs.
//
// Each leg runs the cascade in subprocess (the same way a user would),
// not via in-process function calls — that way we exercise PATH
// resolution, the shim, env propagation, every link in the real chain.

import {existsSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {REPO_ROOT, paths} from './paths';

export type ExplainTarget = 'claude' | 'codex' | 'all';

export type ExplainStep = {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
  seconds: number;
};

export type ExplainLegReport = {
  target: 'claude' | 'codex';
  filmId: string;
  output: string | null;       // absolute path to the rendered mp4 (when render PASS)
  outputBytes: number | null;
  steps: ExplainStep[];
};

export type ExplainReport = {
  url: string;
  target: ExplainTarget;
  legs: ExplainLegReport[];
  verdict: 'GREEN' | 'YELLOW' | 'RED';
};

export type ExplainOptions = {
  url: string;
  target?: ExplainTarget;
  silent?: boolean;
  scale?: number;              // render scale (default 0.5 — fast for a gate)
  maxRounds?: number;          // review --max-rounds (default 2)
  keepOnFail?: boolean;        // keep film artefacts after a failed leg
};

// Run a docent subcommand with a per-stage timeout. The hermetic harness
// MUST treat agent stalls as failures — a real user hits that wall too.
// Returns the subprocess stdout for surfacing in the step detail.
const runStage = async (
  args: string[],
  timeoutMs: number,
): Promise<{ok: boolean; code: number; out: string; err: string; timedOut: boolean}> => {
  const docentBin = join(REPO_ROOT, 'packages', 'engine', 'cli', 'docent.ts');
  const fullArgs = ['bun', docentBin, ...args];
  const proc = Bun.spawn(fullArgs, {
    cwd: REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  clearTimeout(timer);
  return {ok: code === 0 && !timedOut, code, out, err, timedOut};
};

const lastLine = (s: string, limit = 140): string => {
  const trimmed = s.trim().split('\n').filter(Boolean);
  const tail = trimmed[trimmed.length - 1] ?? '';
  return tail.length > limit ? tail.slice(0, limit - 1) + '…' : tail;
};

// One full /docent-explain cascade for one agent. Each step is timed,
// statuses roll up to the leg's verdict. If survey hangs, that's a
// hard fail — exactly the failure mode a real user hit yesterday.
const runExplainLeg = async (
  agent: 'claude' | 'codex',
  opts: ExplainOptions,
): Promise<ExplainLegReport> => {
  const filmId = `explain-validate-${agent}-${Date.now()}`;
  const scale = opts.scale ?? 0.5;
  const maxRounds = opts.maxRounds ?? 2;
  const steps: ExplainStep[] = [];
  const log = opts.silent ? () => {} : (s: string) => console.log(s);

  const stage = async (
    name: string,
    args: string[],
    timeoutMs: number,
  ): Promise<boolean> => {
    log(`  \x1b[2m▶ ${name}…\x1b[0m`);
    const t0 = performance.now();
    const r = await runStage(args, timeoutMs);
    const seconds = (performance.now() - t0) / 1000;
    if (r.timedOut) {
      const step: ExplainStep = {
        name,
        status: 'fail',
        detail: `timed out after ${(timeoutMs / 1000).toFixed(0)}s`,
        seconds,
      };
      steps.push(step);
      log(`  \x1b[31m✗ ${name}\x1b[0m — timed out (${seconds.toFixed(1)}s)`);
      return false;
    }
    if (!r.ok) {
      const step: ExplainStep = {
        name,
        status: 'fail',
        detail: `exit ${r.code} — ${lastLine(r.err || r.out)}`,
        seconds,
      };
      steps.push(step);
      log(`  \x1b[31m✗ ${name}\x1b[0m — ${step.detail}  (${seconds.toFixed(1)}s)`);
      return false;
    }
    const step: ExplainStep = {
      name,
      status: 'pass',
      detail: lastLine(r.out),
      seconds,
    };
    steps.push(step);
    log(`  \x1b[32m✓ ${name}\x1b[0m  (${seconds.toFixed(1)}s)`);
    return true;
  };

  log(`\x1b[1m── ${agent} leg — film id ${filmId} ──\x1b[0m`);

  // 1. Survey — the longest single stage. Both agents have to author
  //    analysis/<id>.md from the URL. Budget 12 min — covers a slow
  //    fetch + a deep read.
  const surveyOk = await stage(
    'survey',
    ['survey', opts.url, '--mode', 'ex', '--agent', agent, '--id', filmId],
    12 * 60_000,
  );
  if (!surveyOk) return {target: agent, filmId, output: null, outputBytes: null, steps};

  // 2. Treatment — writes treatments/<id>.md. ~2-5 min on a real run.
  const treatmentOk = await stage(
    'treatment',
    ['treatment', filmId, '--agent', agent],
    8 * 60_000,
  );
  if (!treatmentOk) return {target: agent, filmId, output: null, outputBytes: null, steps};

  // 3. Spec compile — writes films/<id>.json. Fast (~1 min).
  const specOk = await stage(
    'spec compile',
    ['treatment', filmId, '--to-spec', '--agent', agent],
    5 * 60_000,
  );
  if (!specOk) return {target: agent, filmId, output: null, outputBytes: null, steps};

  // 4. Review — the mandatory judge loop. Up to 2 rounds × ~3-4 min each.
  const reviewOk = await stage(
    'review (judge × n rounds)',
    ['review', filmId, '--max-rounds', String(maxRounds), '--agent', agent],
    20 * 60_000,
  );
  if (!reviewOk) return {target: agent, filmId, output: null, outputBytes: null, steps};

  // 5. Build — survey/treatment/review all done; this is the cascade.
  //    TTS + render at the chosen scale. Budget 15 min.
  const buildOk = await stage(
    `build (scale ${scale})`,
    ['build', filmId, '--scale', String(scale)],
    15 * 60_000,
  );
  if (!buildOk) return {target: agent, filmId, output: null, outputBytes: null, steps};

  // 6. Artefact assertion — the mp4 actually exists on disk and is
  //    non-trivial. This is the gate the user is paying us for.
  const outPath = join(paths.out, `${filmId}.mp4`);
  if (!existsSync(outPath)) {
    steps.push({
      name: 'artefact present',
      status: 'fail',
      detail: `${outPath} missing after build`,
      seconds: 0,
    });
    log(`  \x1b[31m✗ artefact present\x1b[0m — ${outPath} missing`);
    return {target: agent, filmId, output: null, outputBytes: null, steps};
  }
  const bytes = statSync(outPath).size;
  const minBytes = 1024 * 1024; // 1 MB — anything smaller is broken
  steps.push({
    name: 'artefact present',
    status: bytes >= minBytes ? 'pass' : 'warn',
    detail: `${(bytes / 1024 / 1024).toFixed(1)} MB at ${outPath}`,
    seconds: 0,
  });
  log(
    `  \x1b[32m✓ artefact present\x1b[0m — ${(bytes / 1024 / 1024).toFixed(1)} MB`,
  );

  return {target: agent, filmId, output: outPath, outputBytes: bytes, steps};
};

export const hermeticExplain = async (
  opts: ExplainOptions,
): Promise<{code: number; report: ExplainReport}> => {
  const target: ExplainTarget = opts.target ?? 'all';
  const log = opts.silent ? () => {} : (s: string) => console.log(s);

  const targets: ('claude' | 'codex')[] =
    target === 'all' ? ['claude', 'codex'] : [target];

  log(
    `\x1b[1mdocent hermetic --explain\x1b[0m — full /docent-explain cascade · target: ${target}\n` +
      `  url: ${opts.url}\n`,
  );

  const legs: ExplainLegReport[] = [];
  for (const t of targets) {
    const res = await runExplainLeg(t, opts);
    legs.push(res);
    log('');
  }

  const allSteps = legs.flatMap((l) => l.steps);
  const fails = allSteps.filter((s) => s.status === 'fail').length;
  const warns = allSteps.filter((s) => s.status === 'warn').length;
  const passes = allSteps.filter((s) => s.status === 'pass').length;

  const verdict: 'GREEN' | 'YELLOW' | 'RED' =
    fails > 0 ? 'RED' : warns > 0 ? 'YELLOW' : 'GREEN';

  if (!opts.silent) {
    const color =
      verdict === 'GREEN' ? '\x1b[32m' : verdict === 'YELLOW' ? '\x1b[33m' : '\x1b[31m';
    log(`${color}\x1b[1m${verdict}\x1b[0m  ${passes} pass · ${warns} warn · ${fails} fail`);
    for (const leg of legs) {
      const legFails = leg.steps.filter((s) => s.status === 'fail').length;
      if (legFails > 0) {
        log(`  \x1b[31m✗\x1b[0m ${leg.target}: ${legFails} step(s) failed`);
      } else if (leg.output) {
        log(
          `  \x1b[32m✓\x1b[0m ${leg.target}: rendered ${leg.outputBytes! / 1024 / 1024 | 0} MB → ${leg.output}`,
        );
      }
    }
    if (verdict === 'GREEN') {
      log('\x1b[32m✔ explain cascade Go Live ready in every target\x1b[0m');
    } else if (verdict === 'YELLOW') {
      log('\x1b[33m⚠ explain cascade launchable — warnings before broad rollout\x1b[0m');
    } else {
      log('\x1b[31m✗ explain cascade is NOT ready — a real user would hit this failure\x1b[0m');
    }
  }

  return {
    code: verdict === 'RED' ? 1 : 0,
    report: {url: opts.url, target, legs, verdict},
  };
};
