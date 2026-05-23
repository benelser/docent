// `docent hermetic --fresh-user` — simulate a brand-new user installing docent
// via APM (Claude) or Codex's plugin marketplace, and producing their first
// film, end-to-end, inside a tmpdir.
//
// What the existing `docent hermetic` covers: the deterministic render cascade
// against pinned fixtures (the engine). What it does NOT cover: the path the
// README's Quickstart actually puts a user on — `apm install docent-agent` /
// `codex plugin add docent-agent@docent`, the skill surface lands,
// `/docent-doctor` runs green, `/docent-build` lands an mp4 on disk. This
// mode is that gate.
//
// Two host targets exercise the same skill surface from two install paths:
//   --target claude  apm install --target claude → ~/.claude-shaped tmpdir
//   --target codex   codex plugin marketplace add + plugin add → ~/.codex cache
//   --target all     both, sequentially
//
// Everything that can be staged in a tmpdir is. The Codex leg necessarily
// touches `~/.codex/plugins/cache/` and the Codex marketplace config — but it
// registers a *unique* temp-prefixed marketplace name (`docent-hermetic-<ts>`)
// so it cannot collide with the user's real `docent` marketplace, and it tears
// down both the plugin registration and the marketplace entry on exit. The
// Claude leg keeps its strict no-touch-$HOME discipline.
//
// Steps that depend on parallel work in flight (the skill files, the
// `--install` half of `docent doctor`) DEGRADE GRACEFULLY to WARN so this test
// is usable in isolation — it never blocks itself on another agent's PR.

import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, cpSync, mkdirSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {REPO_ROOT, paths} from './paths';
import {runChecks} from './doctor';
import {runCascade} from './cascade';

type Status = 'pass' | 'warn' | 'fail';
type StepResult = {name: string; status: Status; detail: string};

export type FreshUserTarget = 'claude' | 'codex' | 'all';

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

// Spawn a child process and capture exit + stderr tail. Used for `apm` and
// `codex` only — the cascade is invoked in-process to keep the test fast and
// the error trace readable.
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
const stageTmpdir = (label: string): {dir: string; result: StepResult} => {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = mkdtempSync(join(tmpdir(), `docent-fresh-user-${label}-${ts}-`));
  return {
    dir,
    result: {
      name: 'tmpdir staged',
      status: 'pass',
      detail: dir,
    },
  };
};

// ============================================================================
// Claude leg — apm install --target claude
// ============================================================================

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

// ============================================================================
// Codex leg — codex plugin marketplace add + codex plugin add
// ============================================================================

// Names that should never appear as the test marketplace identifier. The user's
// real Codex setup lists their personal marketplace as `docent`; we register
// under a temp-prefixed name so we can't ever collide with it.
const codexMarketplaceName = (ts: string): string =>
  `docent-hermetic-${ts.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;

// (1) stage a marketplace root in the tmpdir. The Codex CLI resolves
// `source.path` relative to the marketplace.json directory — so we cannot
// point it at the real agent package by absolute path (Codex's loader rejects
// out-of-tree paths). Instead we symlink the agent package into the tmpdir
// at `./packages/agent` and use the matching relative reference, which is
// what Codex expects from a real marketplace checkout.
const stageCodexMarketplace = (
  dir: string,
  marketplaceName: string,
): StepResult => {
  const agentPkg = join(REPO_ROOT, 'packages', 'agent');
  if (!existsSync(join(agentPkg, '.codex-plugin', 'plugin.json'))) {
    return {
      name: 'codex marketplace staged',
      status: 'fail',
      detail: `packages/agent/.codex-plugin/plugin.json missing — Codex cannot resolve the plugin`,
    };
  }
  const marketplaceDir = join(dir, '.agents', 'plugins');
  try {
    mkdirSync(marketplaceDir, {recursive: true});
    mkdirSync(join(dir, 'packages'), {recursive: true});
    symlinkSync(agentPkg, join(dir, 'packages', 'agent'));
    const marketplace = {
      name: marketplaceName,
      interface: {displayName: 'docent (hermetic)'},
      plugins: [
        {
          name: 'docent-agent',
          source: {source: 'local', path: './packages/agent'},
          policy: {installation: 'AVAILABLE', authentication: 'ON_INSTALL'},
          category: 'Engineering',
        },
      ],
    };
    writeFileSync(
      join(marketplaceDir, 'marketplace.json'),
      JSON.stringify(marketplace, null, 2),
    );
  } catch (e) {
    return {
      name: 'codex marketplace staged',
      status: 'fail',
      detail: `could not stage tmpdir marketplace: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  return {
    name: 'codex marketplace staged',
    status: 'pass',
    detail: `${dir} (marketplace name: ${marketplaceName})`,
  };
};

// (2) `codex plugin marketplace add <dir>` then `codex plugin add docent-agent@<name>`.
const installCodexPlugin = async (
  dir: string,
  marketplaceName: string,
): Promise<StepResult> => {
  if (!Bun.which('codex')) {
    return {
      name: 'codex plugin install',
      status: 'warn',
      detail: 'codex not on PATH — skipping (Codex users will hit this same gap)',
    };
  }
  const addMarket = await run('codex', ['plugin', 'marketplace', 'add', dir], dir, 60_000);
  if (addMarket.code !== 0) {
    return {
      name: 'codex plugin install',
      status: 'fail',
      detail: `codex plugin marketplace add exited ${addMarket.code}: ${tail(addMarket.stderr || addMarket.stdout)}`,
    };
  }
  const addPlugin = await run(
    'codex',
    ['plugin', 'add', `docent-agent@${marketplaceName}`],
    dir,
    60_000,
  );
  if (addPlugin.code !== 0) {
    return {
      name: 'codex plugin install',
      status: 'fail',
      detail: `codex plugin add exited ${addPlugin.code}: ${tail(addPlugin.stderr || addPlugin.stdout)}`,
    };
  }
  // Surface the last useful line — typically "Installed plugin root: <path>"
  // — so the report points at the on-disk cache the next step verifies.
  const lastLine = (addPlugin.stdout || addPlugin.stderr).trim().split('\n').pop() ?? '';
  return {
    name: 'codex plugin install',
    status: 'pass',
    detail: `docent-agent@${marketplaceName} added — ${lastLine.slice(0, 160)}`,
  };
};

// (3) `codex plugin list -m <marketplace>` must report `installed, enabled`.
const verifyCodexEnabled = async (marketplaceName: string): Promise<StepResult> => {
  if (!Bun.which('codex')) {
    return {
      name: 'codex plugin enabled',
      status: 'warn',
      detail: 'codex not on PATH — cannot verify',
    };
  }
  const r = await run('codex', ['plugin', 'list', '-m', marketplaceName], REPO_ROOT, 30_000);
  if (r.code !== 0) {
    return {
      name: 'codex plugin enabled',
      status: 'fail',
      detail: `codex plugin list exited ${r.code}: ${tail(r.stderr || r.stdout)}`,
    };
  }
  // Output table includes a STATUS column — match the literal substring.
  if (!/installed, enabled/.test(r.stdout)) {
    return {
      name: 'codex plugin enabled',
      status: 'fail',
      detail: `plugin not reported as installed+enabled — got: ${tail(r.stdout, 240)}`,
    };
  }
  return {
    name: 'codex plugin enabled',
    status: 'pass',
    detail: 'docent-agent reported as installed, enabled',
  };
};

// (4) the four skills must be reachable in Codex's plugin cache, AND each
// SKILL.md must parse (frontmatter + body + name matches dir).
const checkCodexSkills = (marketplaceName: string): StepResult => {
  // Codex cache layout: ~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/
  const cacheRoot = join(
    process.env.HOME ?? '',
    '.codex',
    'plugins',
    'cache',
    marketplaceName,
    'docent-agent',
  );
  if (!existsSync(cacheRoot)) {
    return {
      name: 'codex skill surface',
      status: 'fail',
      detail: `cache root missing: ${cacheRoot}`,
    };
  }
  // The version directory is whatever Codex picks from .codex-plugin/plugin.json;
  // discover it rather than hard-coding.
  let versionDir: string;
  try {
    const versions = readdirSync(cacheRoot);
    if (versions.length === 0) {
      return {
        name: 'codex skill surface',
        status: 'fail',
        detail: `no version subdir under ${cacheRoot}`,
      };
    }
    versionDir = join(cacheRoot, versions[0]);
  } catch (e) {
    return {
      name: 'codex skill surface',
      status: 'fail',
      detail: `could not read ${cacheRoot}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const skillsDir = join(versionDir, 'skills');
  const expected = ['docent-doctor', 'docent-pr', 'docent-ar', 'docent-explain'];
  const missing: string[] = [];
  const malformed: string[] = [];

  for (const name of expected) {
    const skillFile = join(skillsDir, name, 'SKILL.md');
    if (!existsSync(skillFile)) {
      missing.push(name);
      continue;
    }
    let body = '';
    try {
      body = readFileSync(skillFile, 'utf8');
    } catch (e) {
      malformed.push(`${name} (unreadable: ${e instanceof Error ? e.message : String(e)})`);
      continue;
    }
    if (body.length < 64) {
      malformed.push(`${name} (only ${body.length} bytes)`);
      continue;
    }
    // Frontmatter required for Codex skill discovery.
    const fm = body.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!fm) {
      malformed.push(`${name} (no YAML frontmatter)`);
      continue;
    }
    // Body after frontmatter — at least one non-blank line.
    const afterFm = body.slice(fm[0].length).trim();
    if (afterFm.length < 16) {
      malformed.push(`${name} (frontmatter present but body empty)`);
      continue;
    }
    // name: <dir> match — the loader keys off this. Tolerate quoted/unquoted.
    const nameMatch = fm[1].match(/^name:\s*['"]?([^'"\n]+?)['"]?\s*$/m);
    if (!nameMatch) {
      malformed.push(`${name} (frontmatter missing name: field)`);
      continue;
    }
    if (nameMatch[1].trim() !== name) {
      malformed.push(`${name} (frontmatter name=${nameMatch[1].trim()} ≠ dir)`);
    }
  }

  if (missing.length > 0) {
    return {
      name: 'codex skill surface',
      status: 'fail',
      detail: `missing in cache: ${missing.join(', ')} (under ${skillsDir.replace(process.env.HOME ?? '', '~')})`,
    };
  }
  if (malformed.length > 0) {
    return {
      name: 'codex skill surface',
      status: 'fail',
      detail: malformed.join('; '),
    };
  }
  return {
    name: 'codex skill surface',
    status: 'pass',
    detail: `4/4 skills parse with frontmatter + body; name matches dir`,
  };
};

// (5) simulate `/docent-doctor` from inside Codex — same in-process doctor
// pass as the Claude leg. The actual gate Quickstart depends on.
const simulateCodexDoctor = simulateDocentDoctor;

// Cleanup the Codex marketplace + plugin registration. Best-effort: we report
// each failure as a warning rather than fail the whole leg, because a stuck
// marketplace entry is recoverable for the user with `codex plugin marketplace
// remove <name>` — but we'd rather not stop the test from completing.
const teardownCodex = async (marketplaceName: string): Promise<StepResult> => {
  if (!Bun.which('codex')) {
    return {
      name: 'codex teardown',
      status: 'warn',
      detail: 'codex not on PATH — nothing to undo',
    };
  }
  const problems: string[] = [];
  const removePlugin = await run(
    'codex',
    ['plugin', 'remove', `docent-agent@${marketplaceName}`],
    REPO_ROOT,
    30_000,
  );
  if (removePlugin.code !== 0) {
    problems.push(`plugin remove exited ${removePlugin.code}: ${tail(removePlugin.stderr || removePlugin.stdout, 100)}`);
  }
  const removeMarket = await run(
    'codex',
    ['plugin', 'marketplace', 'remove', marketplaceName],
    REPO_ROOT,
    30_000,
  );
  if (removeMarket.code !== 0) {
    problems.push(`marketplace remove exited ${removeMarket.code}: ${tail(removeMarket.stderr || removeMarket.stdout, 100)}`);
  }
  // Verify it's actually gone.
  const list = await run('codex', ['plugin', 'marketplace', 'list'], REPO_ROOT, 15_000);
  if (list.code === 0 && new RegExp(`\\b${marketplaceName}\\b`).test(list.stdout)) {
    problems.push(`${marketplaceName} still present in marketplace list`);
  }
  // Codex deregisters the plugin but leaves its cache dir on disk under
  // ~/.codex/plugins/cache/<marketplace>/. Sweep it so we leave no trace.
  const cacheDir = join(process.env.HOME ?? '', '.codex', 'plugins', 'cache', marketplaceName);
  if (existsSync(cacheDir)) {
    try {
      rmSync(cacheDir, {recursive: true, force: true});
    } catch (e) {
      problems.push(`could not remove cache ${cacheDir}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (problems.length > 0) {
    return {
      name: 'codex teardown',
      status: 'warn',
      detail: problems.join('; '),
    };
  }
  return {
    name: 'codex teardown',
    status: 'pass',
    detail: `removed plugin + marketplace ${marketplaceName}`,
  };
};

// ============================================================================
// shared cleanup
// ============================================================================

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

// ============================================================================
// leg orchestrators
// ============================================================================

type LegOpts = {keep: boolean; silent: boolean};
type LegResult = {dir: string; steps: StepResult[]};

const runClaudeLeg = async (opts: LegOpts): Promise<LegResult> => {
  const steps: StepResult[] = [];
  const {dir, result: stagedResult} = stageTmpdir('claude');
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

  const cleanRes = cleanup(dir, opts.keep);
  steps.push(cleanRes);
  if (!opts.silent) printStep(cleanRes);

  return {dir, steps};
};

const runCodexLeg = async (opts: LegOpts): Promise<LegResult> => {
  const steps: StepResult[] = [];
  const {dir, result: stagedResult} = stageTmpdir('codex');
  steps.push(stagedResult);
  if (!opts.silent) printStep(stagedResult);

  // Unique marketplace name keyed off the tmpdir's timestamp suffix so we
  // can NEVER collide with the user's real `docent` marketplace.
  const dirTs = dir.split('docent-fresh-user-codex-')[1]?.replace(/-+$/, '') ?? `${Date.now()}`;
  const marketplaceName = codexMarketplaceName(dirTs);

  const stageRes = stageCodexMarketplace(dir, marketplaceName);
  steps.push(stageRes);
  if (!opts.silent) printStep(stageRes);

  // If staging failed we still need to clean up the tmpdir, but skip the
  // codex commands that would just compound the error.
  let installRes: StepResult;
  let enabledRes: StepResult;
  let skillRes: StepResult;
  let doctorRes: StepResult;
  let teardownRes: StepResult;

  if (stageRes.status === 'fail') {
    const skipReason = 'skipped — marketplace staging failed';
    installRes = {name: 'codex plugin install', status: 'fail', detail: skipReason};
    enabledRes = {name: 'codex plugin enabled', status: 'fail', detail: skipReason};
    skillRes = {name: 'codex skill surface', status: 'fail', detail: skipReason};
    doctorRes = {name: '/docent-doctor', status: 'fail', detail: skipReason};
    teardownRes = {name: 'codex teardown', status: 'pass', detail: 'nothing registered'};
  } else {
    installRes = await installCodexPlugin(dir, marketplaceName);
    steps.push(installRes);
    if (!opts.silent) printStep(installRes);

    if (installRes.status === 'fail' || installRes.status === 'warn') {
      const skipReason =
        installRes.status === 'warn'
          ? 'skipped — codex not on PATH'
          : 'skipped — codex plugin install failed';
      enabledRes = {name: 'codex plugin enabled', status: installRes.status, detail: skipReason};
      skillRes = {name: 'codex skill surface', status: installRes.status, detail: skipReason};
    } else {
      enabledRes = await verifyCodexEnabled(marketplaceName);
      skillRes = checkCodexSkills(marketplaceName);
    }
    steps.push(enabledRes);
    if (!opts.silent) printStep(enabledRes);
    steps.push(skillRes);
    if (!opts.silent) printStep(skillRes);

    doctorRes = await simulateCodexDoctor();
    steps.push(doctorRes);
    if (!opts.silent) printStep(doctorRes);

    // Teardown runs UNCONDITIONALLY if install registered anything — we never
    // want to leave a stale marketplace entry behind.
    if (installRes.status === 'pass') {
      teardownRes = await teardownCodex(marketplaceName);
    } else {
      teardownRes = {
        name: 'codex teardown',
        status: installRes.status === 'warn' ? 'pass' : 'warn',
        detail:
          installRes.status === 'warn'
            ? 'nothing to undo (install skipped)'
            : 'install failed before registration; best-effort teardown anyway',
      };
      if (installRes.status === 'fail') {
        // Best-effort: try to remove anyway. The marketplace add might have
        // succeeded even if `plugin add` failed.
        teardownRes = await teardownCodex(marketplaceName);
      }
    }
    steps.push(teardownRes);
    if (!opts.silent) printStep(teardownRes);
  }

  // For the failure-skip branches above we still need to push the steps that
  // didn't go through the live path.
  if (stageRes.status === 'fail') {
    steps.push(installRes, enabledRes, skillRes, doctorRes, teardownRes);
    if (!opts.silent) {
      printStep(installRes);
      printStep(enabledRes);
      printStep(skillRes);
      printStep(doctorRes);
      printStep(teardownRes);
    }
  }

  const cleanRes = cleanup(dir, opts.keep);
  steps.push(cleanRes);
  if (!opts.silent) printStep(cleanRes);

  return {dir, steps};
};

// ============================================================================
// public entry point
// ============================================================================

export type FreshUserOptions = {
  keep?: boolean;
  silent?: boolean;
  target?: FreshUserTarget;
};

export type FreshUserLegReport = {
  target: 'claude' | 'codex';
  dir: string;
  steps: StepResult[];
};

export type FreshUserReport = {
  // Back-compat: when only one target ran, `dir` is that leg's tmpdir.
  dir: string;
  // Back-compat: flattened union of all legs' steps.
  steps: StepResult[];
  // Per-target breakdown when multiple legs ran.
  legs: FreshUserLegReport[];
  verdict: 'GREEN' | 'YELLOW' | 'RED';
};

export const hermeticFreshUser = async (
  opts: FreshUserOptions = {},
): Promise<{code: number; report: FreshUserReport}> => {
  const target: FreshUserTarget = opts.target ?? 'claude';
  const log = opts.silent ? () => {} : (s: string) => console.log(s);

  const targets: ('claude' | 'codex')[] =
    target === 'all' ? ['claude', 'codex'] : [target];

  log(
    `\x1b[1mdocent hermetic --fresh-user\x1b[0m — simulate install → first film  (target: ${target})\n`,
  );

  const legs: FreshUserLegReport[] = [];
  const legOpts: LegOpts = {keep: opts.keep ?? false, silent: opts.silent ?? false};

  for (const t of targets) {
    if (!opts.silent) {
      console.log(`\x1b[1m── ${t} leg ──\x1b[0m`);
    }
    const res = t === 'claude' ? await runClaudeLeg(legOpts) : await runCodexLeg(legOpts);
    legs.push({target: t, dir: res.dir, steps: res.steps});
    if (!opts.silent) console.log('');
  }

  // Aggregate across all legs.
  const allSteps = legs.flatMap((l) => l.steps);
  const fails = allSteps.filter((s) => s.status === 'fail').length;
  const warns = allSteps.filter((s) => s.status === 'warn').length;
  const passes = allSteps.filter((s) => s.status === 'pass').length;

  const verdict: 'GREEN' | 'YELLOW' | 'RED' =
    fails > 0 ? 'RED' : warns > 0 ? 'YELLOW' : 'GREEN';

  if (!opts.silent) {
    const color =
      verdict === 'GREEN' ? '\x1b[32m' : verdict === 'YELLOW' ? '\x1b[33m' : '\x1b[31m';
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
    report: {
      dir: legs[0]?.dir ?? '',
      steps: allSteps,
      legs,
      verdict,
    },
  };
};
