// `docent doctor` — validate that the environment can run the cascade.
//
// The check manifest below is the single source of truth for what each stage
// of the cascade depends on. doctor groups its results by stage, so a failure
// points straight at the stage it would break. A hermetic environment is, by
// definition, one where `docent doctor --json` passes against pinned versions.
//
// With `--install`, doctor turns from a *reporter* into a *bootstrapper*:
// each check that knows how to install itself can be invoked, and the failed
// checks become a sequence of `installer → re-check`. `--yes` skips the
// confirmation prompt so the whole thing is one command in CI / skills.

import {existsSync, mkdirSync} from 'node:fs';
import {cpus, platform, totalmem} from 'node:os';
import {join} from 'node:path';
import {REPO_ROOT, paths} from './paths';

export type CheckStatus = 'ok' | 'warn' | 'fail';
export type Stage = 'system' | 'survey' | 'tts' | 'clips' | 'render' | 'publish';
export type Platform = 'darwin' | 'linux' | 'other';

export type CheckOutcome = {
  id: string;
  label: string;
  stage: Stage;
  required: boolean;
  status: CheckStatus;
  detail: string;
  remediation?: string;
  installable?: boolean;
};

// The result of trying to run an installer for a single check.
export type InstallResult =
  | {kind: 'installed'; detail: string; outcome: CheckOutcome}
  | {kind: 'install-failed'; detail: string; outcome: CheckOutcome}
  | {kind: 'not-attempted'; detail: string; outcome: CheckOutcome}
  | {kind: 'declined'; outcome: CheckOutcome};

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

// Platform detection — the installers diverge sharply across these.
export const detectPlatform = (): Platform => {
  const p = platform();
  if (p === 'darwin') return 'darwin';
  if (p === 'linux') return 'linux';
  return 'other';
};

// Run an arbitrary install command through `sh -c` so we can use pipes,
// redirects, and POSIX features without quoting them ourselves. stdout/stderr
// stream to the user so they see brew/apt churn live. Returns the combined
// captured output (last ~80 lines) for the failure summary.
const runShell = async (
  shellCmd: string,
  opts: {cwd?: string; env?: Record<string, string>} = {},
): Promise<{success: boolean; detail: string}> => {
  console.log(`    \x1b[90m$ ${shellCmd}\x1b[0m`);
  const recent: string[] = [];
  const push = (line: string): void => {
    recent.push(line);
    if (recent.length > 80) recent.shift();
  };
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(['sh', '-c', shellCmd], {
      cwd: opts.cwd ?? REPO_ROOT,
      env: {...process.env, ...(opts.env ?? {})},
      stdout: 'pipe',
      stderr: 'pipe',
    });
  } catch (e) {
    return {success: false, detail: `failed to spawn sh: ${e instanceof Error ? e.message : String(e)}`};
  }
  // Tee stdout and stderr to the user *and* the capture buffer.
  const pump = async (stream: ReadableStream<Uint8Array>): Promise<void> => {
    const reader = stream.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      buf += dec.decode(value, {stream: true});
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        push(line);
        process.stdout.write(`      ${line}\n`);
      }
    }
    if (buf) {
      push(buf);
      process.stdout.write(`      ${buf}\n`);
    }
  };
  await Promise.all([pump(proc.stdout as ReadableStream<Uint8Array>), pump(proc.stderr as ReadableStream<Uint8Array>)]);
  const code = await proc.exited;
  if (code === 0) {
    return {success: true, detail: `exit 0`};
  }
  const tail = recent.slice(-6).join(' ⏎ ').slice(-400);
  return {success: false, detail: `exit ${code} — ${tail || 'no output'}`};
};

// Many installers (uv, bun) drop their binary in $HOME/.local/bin or $HOME/.bun/bin
// without modifying the current process PATH. Augment PATH for the rest of the
// doctor run so the re-check sees the freshly-installed tool.
const PATH_EXTRAS = [
  `${process.env.HOME ?? ''}/.local/bin`,
  `${process.env.HOME ?? ''}/.bun/bin`,
  `${process.env.HOME ?? ''}/.cargo/bin`,
  '/opt/homebrew/bin',
  '/usr/local/bin',
];
const augmentPath = (): void => {
  const cur = (process.env.PATH ?? '').split(':');
  const have = new Set(cur);
  const additions = PATH_EXTRAS.filter((p) => p && !have.has(p));
  if (additions.length) {
    process.env.PATH = [...cur, ...additions].join(':');
  }
};

type Check = {
  id: string;
  label: string;
  stage: Stage;
  required: boolean;
  run: () => Promise<{status: CheckStatus; detail: string; remediation?: string}>;
  // Optional installer. If absent, the check is reported only.
  // The implementation is responsible for printing what it is doing.
  install?: () => Promise<{success: boolean; detail: string}>;
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
  install?: () => Promise<{success: boolean; detail: string}>;
}): Check => ({
  id: c.id,
  label: c.label,
  stage: c.stage,
  required: c.required,
  install: c.install,
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

// --- installers --------------------------------------------------------------
//
// Each installer is a thin wrapper around `runShell`. They MUST be safe to
// run when the tool is already present (brew formula reinstall = no-op, uv
// install script detects existing install). They MUST NOT uninstall or
// remove anything.

const PLATFORM: Platform = detectPlatform();

const notInstallableOnPlatform = (
  tool: string,
  manualHint: string,
): (() => Promise<{success: boolean; detail: string}>) =>
  async () => ({
    success: false,
    detail: `no installer for ${tool} on platform "${PLATFORM}" — ${manualHint}`,
  });

const installUv = async (): Promise<{success: boolean; detail: string}> => {
  // Astral's official one-liner. Idempotent: detects an existing uv.
  return runShell('curl -LsSf https://astral.sh/uv/install.sh | sh');
};

const installBun = async (): Promise<{success: boolean; detail: string}> => {
  return runShell('curl -fsSL https://bun.sh/install | bash');
};

const installFfmpeg = async (): Promise<{success: boolean; detail: string}> => {
  if (PLATFORM === 'darwin') return runShell('brew install ffmpeg');
  if (PLATFORM === 'linux') return runShell('sudo apt-get update && sudo apt-get install -y ffmpeg');
  return {success: false, detail: `no installer for ffmpeg on platform "${PLATFORM}"`};
};

const installGh = async (): Promise<{success: boolean; detail: string}> => {
  if (PLATFORM === 'darwin') return runShell('brew install gh');
  if (PLATFORM === 'linux') return runShell('sudo apt-get update && sudo apt-get install -y gh');
  return {success: false, detail: `no installer for gh on platform "${PLATFORM}"`};
};

const installGit = async (): Promise<{success: boolean; detail: string}> => {
  if (PLATFORM === 'darwin') return runShell('brew install git');
  if (PLATFORM === 'linux') return runShell('sudo apt-get update && sudo apt-get install -y git');
  return {success: false, detail: `no installer for git on platform "${PLATFORM}"`};
};

const installApm = async (): Promise<{success: boolean; detail: string}> => {
  // Microsoft APM ships the unix one-liner at aka.ms/apm-unix. Use that on
  // both macOS and Linux — it picks the right native binary.
  if (PLATFORM === 'darwin' || PLATFORM === 'linux') {
    return runShell('curl -sSL https://aka.ms/apm-unix | sh');
  }
  return {success: false, detail: `no installer for apm on platform "${PLATFORM}"`};
};

const ghAuthLogin = async (): Promise<{success: boolean; detail: string}> => {
  // `gh auth login` is interactive — we cannot answer the device-code prompt
  // here. The right move is to print the command and report not-attempted so
  // the human runs it themselves.
  return {
    success: false,
    detail: 'gh auth is interactive — run: gh auth login',
  };
};

const installUvSync = async (): Promise<{success: boolean; detail: string}> => {
  if (!Bun.which('uv')) {
    return {success: false, detail: 'uv not on PATH — install uv first'};
  }
  return runShell('uv sync', {cwd: REPO_ROOT});
};

const installBunInstall = async (): Promise<{success: boolean; detail: string}> => {
  if (!Bun.which('bun')) {
    return {success: false, detail: 'bun not on PATH — install bun first'};
  }
  return runShell('bun install', {cwd: REPO_ROOT});
};

// Kokoro voice weights live under the Hugging Face hub cache; the model is
// downloaded the first time `KPipeline` is instantiated. We warm them up by
// importing KPipeline inside `.venv` so the first real render does not stall
// for ~300 MB of weights on its critical path.
const KOKORO_CACHE = join(
  process.env.HF_HOME ?? join(process.env.HOME ?? '~', '.cache', 'huggingface'),
  'hub',
  'models--hexgrad--Kokoro-82M',
);

const installKokoroWeights = async (): Promise<{success: boolean; detail: string}> => {
  if (!Bun.which('uv')) {
    return {success: false, detail: 'uv not on PATH — run uv sync first'};
  }
  // One-liner: import KPipeline with the voice we ship. Kokoro fetches the
  // weights into ~/.cache/huggingface and we are done.
  return runShell(
    `uv run python -c "from kokoro import KPipeline; KPipeline(lang_code='a')"`,
    {cwd: REPO_ROOT},
  );
};

// `docent` on PATH — the shim that makes the CLI callable from any cwd,
// including from inside a coding agent's skill invocation. Without it the
// skills would have to know where the docent checkout lives; with it they
// just say `docent <cmd>`.
//
// Two files on disk:
//   ~/.config/docent/home   — records the absolute path to the checkout
//   ~/.local/bin/docent     — a tiny bash wrapper that reads `home` and
//                             execs `bun packages/engine/cli/docent.ts` in
//                             that directory.
//
// `~/.local/bin` is the conventional userland binary directory; users
// already have it on PATH if they've installed any toolchain (rustup, pip
// --user, etc.). If it is not on PATH, the installer prints a one-line
// instruction.

const SHIM_DIR = join(process.env.HOME ?? '~', '.local', 'bin');
const SHIM_PATH = join(SHIM_DIR, 'docent');
const CONFIG_DIR = join(process.env.HOME ?? '~', '.config', 'docent');
const HOME_FILE = join(CONFIG_DIR, 'home');

const installDocentShim = async (): Promise<{success: boolean; detail: string}> => {
  mkdirSync(SHIM_DIR, {recursive: true});
  mkdirSync(CONFIG_DIR, {recursive: true});
  await Bun.write(HOME_FILE, REPO_ROOT + '\n');
  const shim = `#!/usr/bin/env bash
# docent — generated by 'docent doctor --install'. Reads the checkout
# location from ~/.config/docent/home and execs the CLI there.
set -euo pipefail
HOME_FILE="\${XDG_CONFIG_HOME:-$HOME/.config}/docent/home"
if [[ ! -f "$HOME_FILE" ]]; then
  echo "docent: no checkout recorded at $HOME_FILE — re-run 'docent doctor --install --yes' from your clone" >&2
  exit 1
fi
DOCENT_HOME="$(cat "$HOME_FILE")"
if [[ ! -d "$DOCENT_HOME" ]]; then
  echo "docent: checkout missing at $DOCENT_HOME — re-clone or re-run doctor from the new clone" >&2
  exit 1
fi
exec bun "$DOCENT_HOME/packages/engine/cli/docent.ts" "$@"
`;
  await Bun.write(SHIM_PATH, shim);
  await runShell(`chmod +x ${SHIM_PATH}`);
  const onPath = (process.env.PATH ?? '').split(':').includes(SHIM_DIR);
  return {
    success: true,
    detail: onPath
      ? `docent → ${SHIM_PATH} (on PATH)`
      : `docent → ${SHIM_PATH} — add ~/.local/bin to PATH: echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc`,
  };
};

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
    install: installGit,
  }),
  binCheck({
    id: 'gh',
    label: 'GitHub CLI',
    stage: 'survey',
    bin: 'gh',
    required: true,
    remediation: 'install gh — https://cli.github.com',
    install: installGh,
  }),
  {
    id: 'gh-auth',
    label: 'GitHub auth',
    stage: 'survey',
    required: true,
    install: ghAuthLogin,
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
    // No installer — Claude Code and Codex each have their own bespoke install
    // path and we won't pick for the user. doctor reports remediation instead.
    run: async () => {
      // Probe that each agent actually *runs* — being on PATH is not enough
      // (a broken install can leave a wrapper that fails to spawn its binary).
      const report: string[] = [];
      let anyWorks = false;
      for (const a of ['claude', 'codex']) {
        if (!Bun.which(a)) continue;
        const r = await probe(a, ['--version'], 8000);
        if (r && r.code === 0) {
          report.push(`${a} ✓`);
          anyWorks = true;
        } else {
          report.push(`${a} on PATH but not runnable`);
        }
      }
      if (report.length === 0) {
        return {
          status: 'fail',
          detail: 'no coding agent (claude / codex) on PATH',
          remediation: 'install Claude Code or Codex',
        };
      }
      if (!anyWorks) {
        return {
          status: 'fail',
          detail: report.join('; '),
          remediation: 'repair the agent install — the binary fails to spawn',
        };
      }
      return {
        status: report.some((r) => r.includes('not runnable')) ? 'warn' : 'ok',
        detail: report.join('; '),
        remediation: report.some((r) => r.includes('not runnable'))
          ? 'one agent is broken — survey can still run on the working one'
          : undefined,
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
    install: installApm,
  }),
  {
    id: 'docent-agent',
    label: 'docent-agent package',
    stage: 'survey',
    required: false,
    // No installer — the docent-agent APM package is not yet published.
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
    install: installUv,
  }),
  binCheck({
    id: 'ffmpeg',
    label: 'ffmpeg',
    stage: 'tts',
    bin: 'ffmpeg',
    required: true,
    versionArgs: ['-version'],
    remediation: 'install ffmpeg',
    install: installFfmpeg,
  }),
  binCheck({
    id: 'ffprobe',
    label: 'ffprobe',
    stage: 'tts',
    bin: 'ffprobe',
    required: true,
    versionArgs: ['-version'],
    remediation: 'install ffmpeg (ffprobe ships with it)',
    install: installFfmpeg,
  }),
  {
    id: 'pyenv',
    label: 'Python env (Kokoro, deprecated fallback)',
    stage: 'tts',
    // Default TTS now runs through kokoro-js (TS-native). The Python sidecar
    // is no longer required — kept as an optional fallback for users on the
    // legacy path and for the manim/clips pipeline.
    required: false,
    install: installUvSync,
    run: async () => {
      return existsSync(join(REPO_ROOT, '.venv'))
        ? {status: 'ok', detail: '.venv present'}
        : {status: 'warn', detail: '.venv missing — optional (clips pipeline needs it)', remediation: 'run: uv sync (only if you use manim inserts)'};
    },
  },
  {
    id: 'kokoro-weights',
    label: 'Kokoro voice weights (deprecated Python path)',
    stage: 'tts',
    // Default TTS now downloads ONNX weights via @huggingface/transformers on
    // first kokoro-js use; the Python-side Kokoro cache is no longer required.
    required: false,
    install: installKokoroWeights,
    run: async () => {
      return existsSync(KOKORO_CACHE)
        ? {status: 'ok', detail: 'hexgrad/Kokoro-82M cached (legacy Python path)'}
        : {
            status: 'warn',
            detail: 'legacy Python weights not cached — default TTS uses kokoro-js (ONNX) instead',
            remediation:
              'no action needed — the kokoro-js path downloads weights via @huggingface/transformers on first synth',
          };
    },
  },
  {
    id: 'kokoro-js',
    label: 'kokoro-js (default TTS provider)',
    stage: 'tts',
    required: true,
    run: async () => {
      try {
        await import('kokoro-js');
        return {status: 'ok', detail: 'kokoro-js npm package present'};
      } catch (e) {
        return {
          status: 'fail',
          detail: 'kokoro-js not installed',
          remediation: 'run: bun add kokoro-js',
        };
      }
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
    install: installBun,
    // bun is the runtime that loaded this file — by construction it is present
    // when this check runs. The installer exists for the (hypothetical) case
    // where this check is reached via a re-run after a partial bootstrap.
    run: async () => ({status: 'ok', detail: `bun ${Bun.version}`}),
  },
  {
    id: 'remotion',
    label: 'Remotion engine',
    stage: 'render',
    required: true,
    install: installBunInstall,
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
  {
    id: 'docent-cli',
    label: 'docent CLI on PATH',
    stage: 'render',
    required: true,
    install: installDocentShim,
    run: async () => {
      // The shim is what lets a coding-agent skill invoke `docent ar <repo>`
      // from any project directory — without it, the skills have to know
      // where the docent checkout lives and that breaks first-run UX.
      if (!existsSync(SHIM_PATH)) {
        return {
          status: 'fail',
          detail: 'docent shim not installed',
          remediation: 'docent doctor --install --yes (installs ~/.local/bin/docent)',
        };
      }
      if (!existsSync(HOME_FILE)) {
        return {
          status: 'fail',
          detail: 'docent home file missing',
          remediation: 'docent doctor --install --yes (records DOCENT_HOME)',
        };
      }
      const onPath = (process.env.PATH ?? '').split(':').includes(SHIM_DIR);
      return onPath
        ? {status: 'ok', detail: `${SHIM_PATH} on PATH`}
        : {
            status: 'warn',
            detail: 'shim installed but ~/.local/bin not on PATH',
            remediation: `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc; source ~/.zshrc`,
          };
    },
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

const runOne = async (c: Check): Promise<CheckOutcome> => {
  const r = await c.run();
  return {
    id: c.id,
    label: c.label,
    stage: c.stage,
    required: c.required,
    ...r,
    installable: typeof c.install === 'function',
  };
};

export const runChecks = async (): Promise<CheckOutcome[]> => Promise.all(CHECKS.map(runOne));

const GLYPH: Record<CheckStatus, string> = {
  ok: '\x1b[32m✓\x1b[0m',
  warn: '\x1b[33m⚠\x1b[0m',
  fail: '\x1b[31m✗\x1b[0m',
};

// Read a single y/n line from stdin. Default Y so an empty Enter accepts.
const askYesNo = async (prompt: string): Promise<boolean> => {
  process.stdout.write(`${prompt} [Y/n] `);
  const decoder = new TextDecoder();
  // Read one chunk from stdin. Bun exposes process.stdin as a readable stream.
  const reader = (process.stdin as unknown as NodeJS.ReadableStream)[Symbol.asyncIterator]();
  const {value, done} = await reader.next();
  if (done || value === undefined) return false;
  const text = (typeof value === 'string' ? value : decoder.decode(value as Uint8Array)).trim().toLowerCase();
  if (text === '' || text === 'y' || text === 'yes') return true;
  return false;
};

const printOutcome = (o: CheckOutcome): void => {
  console.log(`  ${GLYPH[o.status]} ${o.label} — ${o.detail}`);
  if (o.status !== 'ok' && o.remediation) console.log(`      ↳ ${o.remediation}`);
};

const printGrouped = (outcomes: CheckOutcome[]): void => {
  for (const {stage, title} of STAGES) {
    const group = outcomes.filter((o) => o.stage === stage);
    if (!group.length) continue;
    console.log(`\x1b[1m${title}\x1b[0m`);
    for (const o of group) printOutcome(o);
    console.log('');
  }
};

// --- the install flow -------------------------------------------------------

type InstallSummary = {
  installed: InstallResult[];
  failed: InstallResult[];
  notAttempted: InstallResult[];
  declined: InstallResult[];
};

const runInstallFlow = async (
  initial: CheckOutcome[],
  assumeYes: boolean,
): Promise<{outcomes: CheckOutcome[]; summary: InstallSummary}> => {
  const summary: InstallSummary = {installed: [], failed: [], notAttempted: [], declined: []};

  // The set of checks that *need* attention: fail (any) or warn (any).
  // We re-fetch the outcome before each install in case a previous install
  // already satisfied a downstream dependency (e.g. installing uv flips the
  // .venv installer's prereq check).
  const targets = initial.filter((o) => o.status !== 'ok' && o.installable);

  if (targets.length === 0) {
    console.log('\x1b[32m✔ nothing to install — every check that has an installer is already green\x1b[0m\n');
    return {outcomes: initial, summary};
  }

  console.log(`\x1b[1mdocent doctor --install\x1b[0m — ${targets.length} check(s) to bootstrap\n`);

  // Walk in the original order so survey deps install before tts deps install
  // before render deps install — the natural cascade order.
  const orderedIds = CHECKS.map((c) => c.id);
  const orderedTargets = orderedIds
    .map((id) => targets.find((t) => t.id === id))
    .filter((t): t is CheckOutcome => t !== undefined);

  for (const target of orderedTargets) {
    const check = CHECKS.find((c) => c.id === target.id);
    if (!check || !check.install) {
      summary.notAttempted.push({kind: 'not-attempted', detail: 'no installer', outcome: target});
      continue;
    }

    // Re-read live outcome — a prior install may have already satisfied it.
    const live = await runOne(check);
    if (live.status === 'ok') {
      console.log(`  ${GLYPH.ok} ${live.label} — already ok (no action)\n`);
      continue;
    }

    console.log(`  ${GLYPH[live.status]} ${live.label} — ${live.detail}`);
    if (!assumeYes) {
      const yes = await askYesNo(`    install now?`);
      if (!yes) {
        console.log(`      \x1b[90m↳ skipped by user\x1b[0m\n`);
        summary.declined.push({kind: 'declined', outcome: live});
        continue;
      }
    } else {
      console.log(`      \x1b[90m↳ --yes: proceeding\x1b[0m`);
    }

    let attempt: {success: boolean; detail: string};
    try {
      attempt = await check.install();
    } catch (e) {
      attempt = {success: false, detail: e instanceof Error ? e.message : String(e)};
    }
    augmentPath();

    // Re-run the check to see if the installer worked.
    const after = await runOne(check);
    if (attempt.success && after.status === 'ok') {
      console.log(`    \x1b[32m✓ ${after.label} — installed (${after.detail})\x1b[0m\n`);
      summary.installed.push({kind: 'installed', detail: after.detail, outcome: after});
    } else if (attempt.success && after.status !== 'ok') {
      // The installer thinks it succeeded but the check still fails. Treat as
      // failed — the post-install state is what matters.
      const reason = `installer reported success but check still ${after.status}: ${after.detail}`;
      console.log(`    \x1b[31m✗ ${after.label} — ${reason}\x1b[0m\n`);
      summary.failed.push({kind: 'install-failed', detail: reason, outcome: after});
    } else if (!attempt.success && attempt.detail.startsWith('no installer for')) {
      console.log(`    \x1b[33m⚠ ${after.label} — not-attempted (${attempt.detail})\x1b[0m\n`);
      summary.notAttempted.push({kind: 'not-attempted', detail: attempt.detail, outcome: after});
    } else {
      console.log(`    \x1b[31m✗ ${after.label} — ${attempt.detail}\x1b[0m\n`);
      summary.failed.push({kind: 'install-failed', detail: attempt.detail, outcome: after});
    }
  }

  const final = await runChecks();
  return {outcomes: final, summary};
};

const printInstallSummary = (s: InstallSummary): void => {
  console.log(`\x1b[1mInstall summary\x1b[0m`);
  const line = (label: string, items: InstallResult[], color: string): void => {
    if (items.length === 0) return;
    const names = items.map((i) => i.outcome.label).join(', ');
    console.log(`  ${color}${label}\x1b[0m  ${items.length}: ${names}`);
  };
  line('installed-OK ', s.installed, '\x1b[32m');
  line('install-failed', s.failed, '\x1b[31m');
  line('not-attempted', s.notAttempted, '\x1b[33m');
  line('declined     ', s.declined, '\x1b[90m');
  if (s.failed.length) {
    console.log('');
    console.log('\x1b[31mfailure details\x1b[0m');
    for (const f of s.failed) {
      console.log(`  ${f.outcome.label}:`);
      console.log(`    ${f.detail.split('\n').join('\n    ')}`);
    }
  }
  console.log('');
};

// --- entry point -------------------------------------------------------------

export const doctor = async (
  json: boolean,
  opts: {install?: boolean; yes?: boolean} = {},
): Promise<number> => {
  // Make sure the doctor's own re-checks can see binaries that landed in
  // standard user-local locations during a prior install in this same run.
  augmentPath();

  const initial = await runChecks();

  // Read-only paths — JSON output and the default invocation.
  if (!opts.install) {
    const failed = initial.filter((o) => o.status === 'fail' && o.required);
    const warned = initial.filter((o) => o.status === 'warn');
    if (json) {
      console.log(
        JSON.stringify(
          {ready: failed.length === 0, failed: failed.length, warnings: warned.length, checks: initial},
          null,
          2,
        ),
      );
      return failed.length === 0 ? 0 : 1;
    }
    console.log('\x1b[1mdocent doctor\x1b[0m — cascade readiness\n');
    printGrouped(initial);
    if (failed.length === 0) {
      console.log(`\x1b[32m✔ cascade ready\x1b[0m  (${warned.length} warning${warned.length === 1 ? '' : 's'})`);
    } else {
      console.log(
        `\x1b[31m✗ cascade blocked\x1b[0m  — ${failed.length} required check${failed.length === 1 ? '' : 's'} failing`,
      );
    }
    return failed.length === 0 ? 0 : 1;
  }

  // Install path — print the initial state then walk the installers.
  console.log('\x1b[1mdocent doctor\x1b[0m — cascade readiness (pre-install)\n');
  printGrouped(initial);

  const {outcomes: final, summary} = await runInstallFlow(initial, opts.yes === true);

  console.log('\x1b[1mdocent doctor\x1b[0m — cascade readiness (post-install)\n');
  printGrouped(final);
  printInstallSummary(summary);

  if (json) {
    const failedCount = final.filter((o) => o.status === 'fail' && o.required).length;
    const warnCount = final.filter((o) => o.status === 'warn').length;
    console.log(
      JSON.stringify(
        {
          ready: failedCount === 0,
          failed: failedCount,
          warnings: warnCount,
          checks: final,
          install: {
            installed: summary.installed.map((r) => r.outcome.id),
            failed: summary.failed.map((r) => ({id: r.outcome.id, detail: r.detail})),
            notAttempted: summary.notAttempted.map((r) => ({id: r.outcome.id, detail: r.detail})),
            declined: summary.declined.map((r) => r.outcome.id),
          },
        },
        null,
        2,
      ),
    );
  }

  const stillFailing = final.filter((o) => o.status === 'fail' && o.required);
  if (stillFailing.length === 0) {
    console.log(`\x1b[32m✔ cascade ready\x1b[0m`);
    return 0;
  }
  console.log(
    `\x1b[31m✗ cascade blocked\x1b[0m  — ${stillFailing.length} required check${stillFailing.length === 1 ? '' : 's'} still failing`,
  );
  return 1;
};
