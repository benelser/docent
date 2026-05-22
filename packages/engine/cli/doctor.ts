// `docent doctor` — validate that the environment can run the cascade.
//
// The check manifest below is the single source of truth for what each stage
// of the cascade depends on. doctor groups its results by stage, so a failure
// points straight at the stage it would break. A hermetic environment is, by
// definition, one where `docent doctor --json` passes against pinned versions.

import {existsSync} from 'node:fs';
import {cpus, totalmem} from 'node:os';
import {join} from 'node:path';
import {REPO_ROOT, paths} from './paths';

export type CheckStatus = 'ok' | 'warn' | 'fail';
export type Stage = 'system' | 'survey' | 'tts' | 'clips' | 'render' | 'publish';

export type CheckOutcome = {
  id: string;
  label: string;
  stage: Stage;
  required: boolean;
  status: CheckStatus;
  detail: string;
  remediation?: string;
};

const STAGES: {stage: Stage; title: string}[] = [
  {stage: 'system', title: 'System'},
  {stage: 'survey', title: 'Survey   — the agent authors the spec'},
  {stage: 'tts', title: 'TTS      — Kokoro narration'},
  {stage: 'clips', title: 'Clips    — Manim inserts (optional)'},
  {stage: 'render', title: 'Render   — Remotion'},
  {stage: 'publish', title: 'Publish  — post the film to the PR'},
];

// Spawn a command with a hard timeout — some agent CLIs (codex) hang on
// --version, and doctor must never hang.
const probe = async (
  cmd: string,
  args: string[],
  timeoutMs = 6000,
): Promise<{code: number; out: string} | null> => {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn([cmd, ...args], {stdout: 'pipe', stderr: 'pipe'});
  } catch {
    return null;
  }
  const killer = setTimeout(() => proc.kill(), timeoutMs);
  try {
    const code = await proc.exited;
    clearTimeout(killer);
    const out = (await new Response(proc.stdout).text()).trim();
    return {code, out};
  } catch {
    clearTimeout(killer);
    return {code: -1, out: ''};
  }
};

const firstLine = (s: string, n = 64): string => (s.split('\n')[0] || '').slice(0, n);

type Check = {
  id: string;
  label: string;
  stage: Stage;
  required: boolean;
  run: () => Promise<{status: CheckStatus; detail: string; remediation?: string}>;
};

// Present-on-PATH + version check for a required or optional binary.
const binCheck = (c: {
  id: string;
  label: string;
  stage: Stage;
  bin: string;
  required: boolean;
  versionArgs?: string[];
  remediation: string;
}): Check => ({
  id: c.id,
  label: c.label,
  stage: c.stage,
  required: c.required,
  run: async () => {
    if (!Bun.which(c.bin)) {
      return {
        status: c.required ? 'fail' : 'warn',
        detail: `${c.bin} not found on PATH`,
        remediation: c.remediation,
      };
    }
    const r = await probe(c.bin, c.versionArgs ?? ['--version']);
    const ver = r && r.code === 0 && r.out ? firstLine(r.out) : 'present (version unavailable)';
    return {status: 'ok', detail: ver};
  },
});

const CHECKS: Check[] = [
  // ---- system ----
  {
    id: 'cores',
    label: 'CPU cores',
    stage: 'system',
    required: false,
    run: async () => {
      const n = cpus().length;
      return n >= 4
        ? {status: 'ok', detail: `${n} cores — frame-parallel render`}
        : {status: 'warn', detail: `${n} cores — renders will be slow`};
    },
  },
  {
    id: 'memory',
    label: 'Memory',
    stage: 'system',
    required: false,
    run: async () => {
      const gb = totalmem() / 1024 ** 3;
      return gb >= 8
        ? {status: 'ok', detail: `${gb.toFixed(0)} GiB`}
        : {status: 'warn', detail: `${gb.toFixed(0)} GiB — Remotion and torch are memory-hungry`};
    },
  },
  {
    id: 'disk',
    label: 'Disk space',
    stage: 'system',
    required: false,
    run: async () => {
      const r = await probe('df', ['-Pk', REPO_ROOT]);
      if (!r || r.code !== 0) return {status: 'warn', detail: 'could not determine free space'};
      const cols = (r.out.split('\n')[1] || '').trim().split(/\s+/);
      const freeGb = Number(cols[3]) / 1024 ** 2;
      return freeGb >= 5
        ? {status: 'ok', detail: `${freeGb.toFixed(1)} GiB free`}
        : {status: 'warn', detail: `${freeGb.toFixed(1)} GiB free — films run 20–50 MB each`};
    },
  },
  // ---- survey ----
  binCheck({
    id: 'git',
    label: 'git',
    stage: 'survey',
    bin: 'git',
    required: true,
    remediation: 'install git',
  }),
  binCheck({
    id: 'gh',
    label: 'GitHub CLI',
    stage: 'survey',
    bin: 'gh',
    required: true,
    remediation: 'install gh — https://cli.github.com',
  }),
  {
    id: 'gh-auth',
    label: 'GitHub auth',
    stage: 'survey',
    required: true,
    run: async () => {
      if (!Bun.which('gh')) return {status: 'fail', detail: 'gh not installed', remediation: 'install gh'};
      // A stale GITHUB_TOKEN in the env masks the keyring login — strip it.
      let proc: ReturnType<typeof Bun.spawn>;
      try {
        proc = Bun.spawn(['gh', 'auth', 'status'], {
          stdout: 'pipe',
          stderr: 'pipe',
          env: {...process.env, GITHUB_TOKEN: ''},
        });
      } catch {
        return {status: 'fail', detail: 'gh not runnable'};
      }
      await proc.exited;
      const out =
        (await new Response(proc.stdout).text()) + (await new Response(proc.stderr).text());
      const m = out.match(/Logged in to \S+ account (\S+)/);
      return m
        ? {status: 'ok', detail: `authenticated as ${m[1]}`}
        : {status: 'warn', detail: 'not authenticated', remediation: 'run: gh auth login'};
    },
  },
  {
    id: 'agent',
    label: 'Coding agent',
    stage: 'survey',
    required: true,
    run: async () => {
      const found = ['claude', 'codex'].filter((a) => Bun.which(a));
      return found.length
        ? {status: 'ok', detail: `${found.join(', ')} — docent rides inside the agent`}
        : {
            status: 'fail',
            detail: 'no coding agent (claude / codex) on PATH',
            remediation: 'install Claude Code or Codex',
          };
    },
  },
  binCheck({
    id: 'apm',
    label: 'Agent Package Manager',
    stage: 'survey',
    bin: 'apm',
    required: false,
    remediation: 'install apm — https://github.com/microsoft/apm',
  }),
  {
    id: 'docent-agent',
    label: 'docent-agent package',
    stage: 'survey',
    required: false,
    run: async () => ({
      status: 'warn',
      detail: 'not yet published — survey runs from the in-repo brief for now',
      remediation: 'pending: the docent-agent APM package',
    }),
  },
  // ---- tts ----
  binCheck({
    id: 'uv',
    label: 'uv (Python runner)',
    stage: 'tts',
    bin: 'uv',
    required: true,
    remediation: 'install uv — https://docs.astral.sh/uv',
  }),
  binCheck({
    id: 'ffmpeg',
    label: 'ffmpeg',
    stage: 'tts',
    bin: 'ffmpeg',
    required: true,
    versionArgs: ['-version'],
    remediation: 'install ffmpeg',
  }),
  binCheck({
    id: 'ffprobe',
    label: 'ffprobe',
    stage: 'tts',
    bin: 'ffprobe',
    required: true,
    versionArgs: ['-version'],
    remediation: 'install ffmpeg (ffprobe ships with it)',
  }),
  {
    id: 'pyenv',
    label: 'Python env (Kokoro)',
    stage: 'tts',
    required: true,
    run: async () => {
      return existsSync(join(REPO_ROOT, '.venv'))
        ? {status: 'ok', detail: '.venv present'}
        : {status: 'fail', detail: '.venv missing', remediation: 'run: uv sync'};
    },
  },
  // ---- clips (optional) ----
  {
    id: 'clips',
    label: 'Manim inserts',
    stage: 'clips',
    required: false,
    run: async () => ({
      status: 'ok',
      detail: 'optional — rendered only for films with a manim/<id> directory',
    }),
  },
  // ---- render ----
  {
    id: 'bun',
    label: 'bun',
    stage: 'render',
    required: true,
    run: async () => ({status: 'ok', detail: `bun ${Bun.version}`}),
  },
  {
    id: 'remotion',
    label: 'Remotion engine',
    stage: 'render',
    required: true,
    run: async () => {
      return existsSync(paths.remotionBin)
        ? {status: 'ok', detail: 'node_modules/.bin/remotion present'}
        : {status: 'fail', detail: 'remotion binary missing', remediation: 'run: bun install'};
    },
  },
  {
    id: 'assets-net',
    label: 'First-run assets',
    stage: 'render',
    required: false,
    run: async () => ({
      status: 'ok',
      detail: 'Remotion fetches headless Chromium and Google fonts on first render',
    }),
  },
  // ---- publish ----
  {
    id: 'publish',
    label: 'PR comment posting',
    stage: 'publish',
    required: false,
    run: async () => ({
      status: 'ok',
      detail: 'uses the GitHub auth above; --post attaches the film to the PR',
    }),
  },
];

export const runChecks = async (): Promise<CheckOutcome[]> =>
  Promise.all(
    CHECKS.map(async (c) => {
      const r = await c.run();
      return {id: c.id, label: c.label, stage: c.stage, required: c.required, ...r};
    }),
  );

const GLYPH: Record<CheckStatus, string> = {
  ok: '\x1b[32m✓\x1b[0m',
  warn: '\x1b[33m⚠\x1b[0m',
  fail: '\x1b[31m✗\x1b[0m',
};

export const doctor = async (json: boolean): Promise<number> => {
  const outcomes = await runChecks();
  const failed = outcomes.filter((o) => o.status === 'fail' && o.required);
  const warned = outcomes.filter((o) => o.status === 'warn');

  if (json) {
    console.log(
      JSON.stringify(
        {ready: failed.length === 0, failed: failed.length, warnings: warned.length, checks: outcomes},
        null,
        2,
      ),
    );
    return failed.length === 0 ? 0 : 1;
  }

  console.log('\x1b[1mdocent doctor\x1b[0m — cascade readiness\n');
  for (const {stage, title} of STAGES) {
    const group = outcomes.filter((o) => o.stage === stage);
    if (!group.length) continue;
    console.log(`\x1b[1m${title}\x1b[0m`);
    for (const o of group) {
      console.log(`  ${GLYPH[o.status]} ${o.label} — ${o.detail}`);
      if (o.status !== 'ok' && o.remediation) console.log(`      ↳ ${o.remediation}`);
    }
    console.log('');
  }
  if (failed.length === 0) {
    console.log(`\x1b[32m✔ cascade ready\x1b[0m  (${warned.length} warning${warned.length === 1 ? '' : 's'})`);
  } else {
    console.log(
      `\x1b[31m✗ cascade blocked\x1b[0m  — ${failed.length} required check${failed.length === 1 ? '' : 's'} failing`,
    );
  }
  return failed.length === 0 ? 0 : 1;
};
