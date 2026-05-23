// `docent hermetic --fresh-user` — simulate a brand-new user installing docent
// via APM and producing their first film, end-to-end, inside a tmpdir.
//
// What the existing `docent hermetic` covers: the deterministic render cascade
// against pinned fixtures (the engine). What it does NOT cover: the path the
// README's Quickstart actually puts a user on — `apm install docent-agent`,
// the skill surface lands, `/docent-doctor` runs green, `/docent-build` lands
// an mp4 on disk. This mode is that gate.
//
// Everything happens in `$TMPDIR/docent-fresh-user-<ts>/`. We never touch the
// user's `~/.apm` or `~/.claude`. Steps that depend on parallel work in flight
// (the skill files, the `--install` half of `docent doctor`) DEGRADE GRACEFULLY
// to WARN so this test is usable in isolation — it never blocks itself on
// another agent's PR.

import {existsSync, mkdtempSync, readFileSync, rmSync, statSync, cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {REPO_ROOT, paths} from './paths';
import {runChecks} from './doctor';
import {runCascade} from './cascade';

type Status = 'pass' | 'warn' | 'fail';
type StepResult = {name: string; status: Status; detail: string};

const GLYPH: Record<Status, string> = {
  pass: '\x1b[32m✓\x1b[0m',
  warn: '\x1b[33m⚠\x1b[0m',
  fail: '\x1b[31m✗\x1b[0m',
};

const LABEL: Record<Status, string> = {
  pass: '\x1b[32mPASS\x1b[0m',
  warn: '\x1b[33mWARN\x1b[0m',
  fail: '\x1b[31mFAIL\x1b[0m',
};

const printStep = (r: StepResult): void => {
  console.log(`  ${GLYPH[r.status]} ${LABEL[r.status]}  ${r.name} — ${r.detail}`);
};

// Spawn a child process and capture exit + stderr tail. Used for `apm` only —
// the cascade is invoked in-process to keep the test fast and the error trace
// readable.
const run = async (
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs = 60_000,
): Promise<{code: number; stderr: string; stdout: string}> => {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn([cmd, ...args], {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {...process.env, GITHUB_TOKEN: ''},
    });
  } catch (e) {
    return {code: -1, stderr: e instanceof Error ? e.message : String(e), stdout: ''};
  }
  const killer = setTimeout(() => proc.kill(), timeoutMs);
  const code = await proc.exited;
  clearTimeout(killer);
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return {code, stderr, stdout};
};

const tail = (s: string, n = 200): string =>
  s.trim().split('\n').slice(-3).join(' ⏎ ').slice(-n);

// (1) carve a tmpdir and `cd`-ish to it. We never touch $HOME, ~/.apm, or
// ~/.claude — the path used is process.env.TMPDIR or the OS default.
const stageTmpdir = (): {dir: string; result: StepResult} => {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = mkdtempSync(join(tmpdir(), `docent-fresh-user-${ts}-`));
  return {
    dir,
    result: {
      name: 'tmpdir staged',
      status: 'pass',
      detail: dir,
    },
  };
};

// (2) simulate `apm install docent-agent`. APM's marketplace does not yet
// publish docent-agent, so we install against the local agent package path —
// what `apm install <path>` does when handed a directory. This validates the
// install surface end-to-end: the manifest parses, the package layout passes
// validation, and the files land where APM puts a freshly-installed package.
const simulateApmInstall = async (dir: string): Promise<StepResult> => {
  if (!Bun.which('apm')) {
    return {
      name: 'apm install docent-agent',
      status: 'warn',
      detail: 'apm not on PATH — skipping (real users will hit this same gap)',
    };
  }
  const agentPkg = join(REPO_ROOT, 'packages', 'agent');
  if (!existsSync(join(agentPkg, 'apm.yml'))) {
    return {
      name: 'apm install docent-agent',
      status: 'fail',
      detail: `packages/agent/apm.yml missing — cannot simulate apm install`,
    };
  }
  const r = await run('apm', ['install', '--target', 'claude', agentPkg], dir, 90_000);
  if (r.code !== 0) {
    return {
      name: 'apm install docent-agent',
      status: 'fail',
      detail: `apm exited ${r.code}: ${tail(r.stderr || r.stdout)}`,
    };
  }
  const installed = join(dir, 'apm_modules', '_local', 'agent');
  if (!existsSync(installed)) {
    return {
      name: 'apm install docent-agent',
      status: 'fail',
      detail: `apm reported success but apm_modules/_local/agent is missing`,
    };
  }
  return {
    name: 'apm install docent-agent',
    status: 'pass',
    detail: `installed via local path → ${installed.replace(dir, '<tmpdir>')}`,
  };
};

// (3) verify the skill surface lands. The other parallel agent is authoring
// packages/agent/skills/; if that work hasn't landed in this worktree yet we
// degrade to WARN so this test stays usable in isolation.
const checkSkillSurface = (dir: string): StepResult => {
  const installedRoot = join(dir, 'apm_modules', '_local', 'agent');
  const candidates = [
    join(installedRoot, 'skills', 'docent-doctor.md'),
    join(installedRoot, 'skills', 'docent-doctor', 'SKILL.md'),
    join(installedRoot, '.claude', 'skills', 'docent-doctor.md'),
    join(REPO_ROOT, 'packages', 'agent', 'skills', 'docent-doctor.md'),
    join(REPO_ROOT, 'packages', 'agent', 'skills', 'docent-doctor', 'SKILL.md'),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    return {
      name: 'skill surface present',
      status: 'warn',
      detail:
        'no docent-doctor skill file yet — pending parallel work on packages/agent/skills/',
    };
  }
  // Parseable = non-empty, has a frontmatter-or-heading marker. The Claude Code
  // skill convention is YAML frontmatter; treat either fence as acceptable.
  let body = '';
  try {
    body = readFileSync(found, 'utf8');
  } catch (e) {
    return {
      name: 'skill surface present',
      status: 'fail',
      detail: `${found} unreadable: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (body.length < 32) {
    return {
      name: 'skill surface present',
      status: 'fail',
      detail: `${found} is too short to be a real skill (${body.length} bytes)`,
    };
  }
  const hasFrontmatter = /^---\s*\n[\s\S]*?\n---/.test(body);
  const hasHeading = /^#\s+/m.test(body);
  if (!hasFrontmatter && !hasHeading) {
    return {
      name: 'skill surface present',
      status: 'warn',
      detail: `${found.replace(dir, '<tmpdir>')} present but has neither frontmatter nor a heading`,
    };
  }
  return {
    name: 'skill surface present',
    status: 'pass',
    detail: `${found.replace(dir, '<tmpdir>').replace(REPO_ROOT, '<repo>')} parseable (${body.length} bytes)`,
  };
};

// (4) simulate the user invoking `/docent-doctor`. The other parallel agent is
// adding `--install --yes` to `docent doctor` to auto-repair what is fixable.
// If that flag isn't here yet, we fall back to the read-only check and assert
// all REQUIRED checks pass — that is the actual gate Quickstart depends on.
const simulateDocentDoctor = async (): Promise<StepResult> => {
  const outcomes = await runChecks();
  const requiredFails = outcomes.filter((o) => o.status === 'fail' && o.required);
  if (requiredFails.length > 0) {
    const names = requiredFails.map((o) => o.label).join(', ');
    return {
      name: '/docent-doctor',
      status: 'fail',
      detail: `${requiredFails.length} required check(s) failing — ${names}`,
    };
  }
  const optionalWarns = outcomes.filter(
    (o) => o.status === 'warn' || (o.status === 'fail' && !o.required),
  );
  if (optionalWarns.length > 0) {
    return {
      name: '/docent-doctor',
      status: 'warn',
      detail: `${outcomes.length - optionalWarns.length}/${outcomes.length} green; ${optionalWarns.length} optional issue(s)`,
    };
  }
  return {
    name: '/docent-doctor',
    status: 'pass',
    detail: `all ${outcomes.length} checks green`,
  };
};

// (5) simulate `/docent-build linear-algebra --skip-tts`. We drive the cascade
// in-process so we can keep wall time + the error surface in this file.
// Output lands in REPO_ROOT/out/linear-algebra.mp4 (the cascade is bound to
// REPO_ROOT for path resolution); we then copy it into the tmpdir so the
// fresh-user simulation has a real artifact the human can inspect.
const simulateDocentBuild = async (
  dir: string,
): Promise<StepResult> => {
  const film = 'linear-algebra';
  const specPath = join(paths.films, `${film}.json`);
  if (!existsSync(specPath)) {
    return {
      name: '/docent-build linear-algebra',
      status: 'fail',
      detail: `films/${film}.json not in this checkout`,
    };
  }
  // The cascade rejects --skip-tts when audio isn't already on disk. Verify the
  // prebuilt audio for linear-algebra exists; otherwise this test would FAIL
  // for an unrelated reason and the verdict would be misleading.
  const audioDir = join(paths.publicDir, 'audio', film);
  if (!existsSync(audioDir)) {
    return {
      name: '/docent-build linear-algebra',
      status: 'warn',
      detail: `public/audio/${film}/ not on disk — run TTS once with: docent build ${film}`,
    };
  }

  // Silence the cascade's own banner so the fresh-user report stays clean.
  const origLog = console.log;
  const origErr = console.error;
  const origWrite = process.stdout.write.bind(process.stdout);
  const origErrWrite = process.stderr.write.bind(process.stderr);
  console.log = () => {};
  console.error = () => {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout as any).write = () => true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stderr as any).write = () => true;

  const t0 = performance.now();
  let cascadeOutput = '';
  let cascadeErr: string | null = null;
  try {
    const res = await runCascade({film, skipTts: true, scale: 0.5});
    cascadeOutput = res.output;
  } catch (e) {
    cascadeErr = e instanceof Error ? e.message.split('\n')[0] : String(e);
  } finally {
    console.log = origLog;
    console.error = origErr;
    process.stdout.write = origWrite;
    process.stderr.write = origErrWrite;
  }
  const seconds = (performance.now() - t0) / 1000;

  if (cascadeErr) {
    return {
      name: '/docent-build linear-algebra',
      status: 'fail',
      detail: `cascade threw after ${seconds.toFixed(1)}s: ${cascadeErr}`,
    };
  }
  if (!existsSync(cascadeOutput)) {
    return {
      name: '/docent-build linear-algebra',
      status: 'fail',
      detail: `cascade reported ${cascadeOutput} but file is missing`,
    };
  }
  const size = statSync(cascadeOutput).size;
  if (size < 1024 * 1024) {
    return {
      name: '/docent-build linear-algebra',
      status: 'fail',
      detail: `output is only ${(size / 1024).toFixed(0)}KB (expect > 1MB)`,
    };
  }

  // Mirror the artifact into the tmpdir so the fresh-user dir reflects what a
  // real user would see at the end of `/docent-build`.
  const mirrored = join(dir, `${film}.mp4`);
  try {
    cpSync(cascadeOutput, mirrored);
  } catch (e) {
    return {
      name: '/docent-build linear-algebra',
      status: 'warn',
      detail: `built ${(size / 1024 / 1024).toFixed(1)}MB in ${seconds.toFixed(1)}s but copy to tmpdir failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  return {
    name: '/docent-build linear-algebra',
    status: 'pass',
    detail: `${(size / 1024 / 1024).toFixed(1)}MB mp4 in ${seconds.toFixed(1)}s → ${mirrored.replace(dir, '<tmpdir>')}`,
  };
};

const cleanup = (dir: string, keep: boolean): StepResult => {
  if (keep) {
    return {
      name: 'tmpdir kept',
      status: 'pass',
      detail: `inspect: ${dir}`,
    };
  }
  try {
    rmSync(dir, {recursive: true, force: true});
    return {name: 'tmpdir cleaned', status: 'pass', detail: 'removed'};
  } catch (e) {
    return {
      name: 'tmpdir cleaned',
      status: 'warn',
      detail: `could not remove ${dir}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
};

export type FreshUserOptions = {
  keep?: boolean;
  silent?: boolean;
};

export type FreshUserReport = {
  dir: string;
  steps: StepResult[];
  verdict: 'GREEN' | 'YELLOW' | 'RED';
};

export const hermeticFreshUser = async (
  opts: FreshUserOptions = {},
): Promise<{code: number; report: FreshUserReport}> => {
  const log = opts.silent ? () => {} : (s: string) => console.log(s);

  log(`\x1b[1mdocent hermetic --fresh-user\x1b[0m — simulate apm install → first film\n`);

  const steps: StepResult[] = [];
  const {dir, result: stagedResult} = stageTmpdir();
  steps.push(stagedResult);
  if (!opts.silent) printStep(stagedResult);

  const installRes = await simulateApmInstall(dir);
  steps.push(installRes);
  if (!opts.silent) printStep(installRes);

  const skillRes = checkSkillSurface(dir);
  steps.push(skillRes);
  if (!opts.silent) printStep(skillRes);

  const doctorRes = await simulateDocentDoctor();
  steps.push(doctorRes);
  if (!opts.silent) printStep(doctorRes);

  // Only attempt the build if doctor is at least usable (no required-check
  // FAILs). If doctor failed, the build would fail for a downstream reason
  // and the report would obscure the root cause.
  let buildRes: StepResult;
  if (doctorRes.status === 'fail') {
    buildRes = {
      name: '/docent-build linear-algebra',
      status: 'fail',
      detail: 'skipped — /docent-doctor failed; fix the environment first',
    };
  } else {
    buildRes = await simulateDocentBuild(dir);
  }
  steps.push(buildRes);
  if (!opts.silent) printStep(buildRes);

  const cleanRes = cleanup(dir, opts.keep ?? false);
  steps.push(cleanRes);
  if (!opts.silent) printStep(cleanRes);

  const fails = steps.filter((s) => s.status === 'fail').length;
  const warns = steps.filter((s) => s.status === 'warn').length;
  const passes = steps.filter((s) => s.status === 'pass').length;

  const verdict: 'GREEN' | 'YELLOW' | 'RED' =
    fails > 0 ? 'RED' : warns > 0 ? 'YELLOW' : 'GREEN';

  if (!opts.silent) {
    const color =
      verdict === 'GREEN' ? '\x1b[32m' : verdict === 'YELLOW' ? '\x1b[33m' : '\x1b[31m';
    console.log('');
    console.log(
      `${color}\x1b[1m${verdict}\x1b[0m  ${passes} pass · ${warns} warn · ${fails} fail`,
    );
    if (verdict === 'GREEN') {
      console.log('\x1b[32m✔ fresh-user path is Go Live ready\x1b[0m');
    } else if (verdict === 'YELLOW') {
      console.log(
        '\x1b[33m⚠ fresh-user path launchable — address warnings before broad rollout\x1b[0m',
      );
    } else {
      console.log(
        '\x1b[31m✗ fresh-user path is NOT ready — a real user would hit this failure\x1b[0m',
      );
    }
  }

  return {
    code: verdict === 'RED' ? 1 : 0,
    report: {dir, steps, verdict},
  };
};
