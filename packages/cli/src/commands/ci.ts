// `docent ci` — hermetic /tmp smoke harness against THE ACTUAL PUBLISHED package.
//
// THE INVARIANT (named verbatim):
//
//   "Every release must survive a cold `bun add` into an empty /tmp project."
//
// Why this exists: the `node:fs` webpack regression we shipped as
// @bjelser/core@3.0.10 passed every agent's smoke test — because every agent
// ran their smoke against the WORKTREE, which carries a `remotion.config.ts`
// that stubs `node:` imports. That config doesn't ship in the published
// tarball, so cold consumers hit the wall the moment webpack tries to bundle
// `node:fs` for chrome-headless. The lesson: smoke tests inside the repo
// can't see what publish-time changes.
//
// Method:
//   1. mktemp -d a fresh project root.
//   2. `bun init -y`, then `bun add @bjelser/{cli,core,kit}@latest` (or pinned
//      versions via --versions cli=X,core=Y,kit=Z).
//   3. `bun pm trust onnxruntime-node protobufjs` — kokoro postinstalls.
//   4. (--local <repo>) overlay the worktree's packages/{cli,core,kit}/src
//      and package.json onto node_modules/@bjelser/{cli,core,kit}. This is
//      the "overlay" pattern earlier agents reinvented; centralised here so
//      contributors can smoke-test unpublished changes before they push.
//   5. Walk the validation matrix step by step. Each step records a typed
//      result; the full transcript is printed at the end.
//   6. Cleanup on green; leave the tmpdir on red for debugging.
//
// Exit codes:
//   0 — every step passed
//   1 — harness error (network, fs, missing binary)
//   2 — one or more matrix steps failed

import {execFileSync, spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const log = (s: string): void => process.stdout.write(`${s}\n`);
const reset = '\x1b[0m';
const red = (s: string) => `\x1b[31m${s}${reset}`;
const green = (s: string) => `\x1b[32m${s}${reset}`;
const cyan = (s: string) => `\x1b[36m${s}${reset}`;
const dim = (s: string) => `\x1b[2m${s}${reset}`;
const yellow = (s: string) => `\x1b[33m${s}${reset}`;

export interface CiArgs {
  /** Pin specific versions instead of @latest. e.g. "cli=3.0.12,core=3.0.11,kit=3.0.4". */
  readonly versions?: string;
  /**
   * Path to a sibling docent repo (e.g. /Users/belser/ventures/archcast).
   * After `bun add`, overlay <repo>/packages/{cli,core,kit}/src + package.json
   * over node_modules/@bjelser/{cli,core,kit}/. The pre-push contributor flow.
   */
  readonly local?: string;
  /** Skip the portrait variant step (faster smoke for iteration). */
  readonly skipPortrait?: boolean;
  /** Keep the tmpdir even on green — for inspection. */
  readonly keep?: boolean;
}

interface StepResult {
  readonly name: string;
  readonly status: 'pass' | 'fail';
  readonly durationMs: number;
  readonly output: string;
  readonly error?: string;
}

interface Versions {
  readonly cli: string;
  readonly core: string;
  readonly kit: string;
}

const parseVersions = (raw: string | undefined): Versions => {
  if (!raw) return {cli: 'latest', core: 'latest', kit: 'latest'};
  const pairs = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const out: Record<string, string> = {cli: 'latest', core: 'latest', kit: 'latest'};
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim();
    if (k === 'cli' || k === 'core' || k === 'kit') out[k] = v;
  }
  return out as Versions;
};

const runStep = (
  name: string,
  fn: () => {output: string} | void,
): StepResult => {
  const start = Date.now();
  log(`\n${cyan('▶')} ${name}`);
  try {
    const r = fn();
    const durationMs = Date.now() - start;
    log(`  ${green('✓')} ${name} ${dim(`(${(durationMs / 1000).toFixed(1)}s)`)}`);
    return {name, status: 'pass', durationMs, output: r?.output ?? ''};
  } catch (err) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    const out =
      err instanceof Error && (err as Error & {stdout?: string}).stdout
        ? String((err as Error & {stdout?: string}).stdout)
        : '';
    log(`  ${red('✗')} ${name} ${dim(`(${(durationMs / 1000).toFixed(1)}s)`)}`);
    log(dim(msg.split('\n').slice(0, 6).map((l) => `    ${l}`).join('\n')));
    return {name, status: 'fail', durationMs, output: out, error: msg};
  }
};

const shellOut = (
  cmd: string,
  args: ReadonlyArray<string>,
  cwd: string,
  envExtra?: Record<string, string>,
): string => {
  const res = spawnSync(cmd, [...args], {
    cwd,
    encoding: 'utf-8',
    env: {...process.env, ...envExtra},
    maxBuffer: 64 * 1024 * 1024,
  });
  const combined = (res.stdout ?? '') + (res.stderr ?? '');
  if (res.status !== 0) {
    const err = new Error(
      `${cmd} ${args.join(' ')} exited ${res.status}\n${combined.slice(-2000)}`,
    );
    (err as Error & {stdout?: string}).stdout = combined;
    throw err;
  }
  return combined;
};

const overlayLocal = (repo: string, root: string): void => {
  for (const pkg of ['cli', 'core', 'kit'] as const) {
    const src = join(repo, 'packages', pkg, 'src');
    const pkgJson = join(repo, 'packages', pkg, 'package.json');
    const dst = join(root, 'node_modules', '@bjelser', pkg);
    if (!existsSync(src)) {
      throw new Error(`--local overlay: missing ${src}`);
    }
    if (!existsSync(dst)) {
      throw new Error(
        `--local overlay: ${dst} missing — did "bun add" succeed?`,
      );
    }
    // Replace the published src with the worktree's src.
    rmSync(join(dst, 'src'), {recursive: true, force: true});
    cpSync(src, join(dst, 'src'), {recursive: true});
    // Replace the package.json so exports/bin paths track the worktree.
    cpSync(pkgJson, join(dst, 'package.json'));
  }
};

const ffprobeDimensions = (mp4: string): {w: number; h: number} => {
  const out = execFileSync(
    'ffprobe',
    [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=p=0',
      mp4,
    ],
    {encoding: 'utf-8'},
  );
  const [w, h] = out.trim().split(',').map(Number);
  if (!w || !h) throw new Error(`ffprobe returned no dims for ${mp4}: "${out}"`);
  return {w, h};
};

export const runCi = async (args: CiArgs): Promise<number> => {
  const versions = parseVersions(args.versions);
  log(cyan(`▶ docent ci — hermetic /tmp smoke`));
  log(
    dim(
      `  @bjelser/cli@${versions.cli}, @bjelser/core@${versions.core}, @bjelser/kit@${versions.kit}` +
        (args.local ? ` (+ overlay from ${args.local})` : ''),
    ),
  );

  // 1. Create tmpdir.
  let root: string;
  try {
    root = execFileSync('mktemp', ['-d', join(tmpdir(), 'docent-ci-XXXXXX')], {
      encoding: 'utf-8',
    }).trim();
  } catch (err) {
    log(red(`✗ harness: mktemp failed — ${err instanceof Error ? err.message : err}`));
    return 1;
  }
  log(dim(`  tmpdir: ${root}`));

  const results: StepResult[] = [];
  const ciStart = Date.now();
  let leaveTmpdir = args.keep === true;

  // 2. bun init.
  results.push(
    runStep('bun init -y', () => {
      const output = shellOut('bun', ['init', '-y'], root);
      return {output};
    }),
  );

  // 3. bun add the published packages.
  if (results.at(-1)?.status === 'pass') {
    results.push(
      runStep(
        `bun add @bjelser/cli@${versions.cli} @bjelser/core@${versions.core} @bjelser/kit@${versions.kit}`,
        () => {
          const output = shellOut(
            'bun',
            [
              'add',
              `@bjelser/cli@${versions.cli}`,
              `@bjelser/core@${versions.core}`,
              `@bjelser/kit@${versions.kit}`,
            ],
            root,
          );
          return {output};
        },
      ),
    );
  }

  // 4. Trust kokoro postinstalls (silent if already trusted).
  if (results.at(-1)?.status === 'pass') {
    results.push(
      runStep('bun pm trust onnxruntime-node protobufjs', () => {
        // `bun pm trust` exits non-zero when there's nothing to trust; treat
        // that as fine. Only fail when we genuinely can't run the binary.
        const res = spawnSync(
          'bun',
          ['pm', 'trust', 'onnxruntime-node', 'protobufjs'],
          {cwd: root, encoding: 'utf-8'},
        );
        const combined = (res.stdout ?? '') + (res.stderr ?? '');
        // status null = could not spawn.
        if (res.status === null) {
          throw new Error(`bun pm trust could not spawn:\n${combined}`);
        }
        return {output: combined};
      }),
    );
  }

  // 5. Overlay --local if requested.
  if (results.at(-1)?.status === 'pass' && args.local) {
    results.push(
      runStep(`--local overlay from ${args.local}`, () => {
        overlayLocal(resolve(args.local!), root);
        return {output: `copied packages/{cli,core,kit}/src + package.json`};
      }),
    );
  }

  // Helper to run bunx docent ... and capture output, only when prior steps green.
  const bunxDocent = (
    label: string,
    docentArgs: ReadonlyArray<string>,
    envExtra?: Record<string, string>,
  ): void => {
    if (results.at(-1)?.status === 'fail') return;
    results.push(
      runStep(label, () => {
        const output = shellOut(
          'bunx',
          ['docent', ...docentArgs],
          root,
          envExtra,
        );
        return {output};
      }),
    );
  };

  // 6. Validation matrix.
  // (a) help structure — schema docs for the structure scene
  bunxDocent('bunx docent help structure', ['help', 'structure']);

  // (b) init smoke — scaffold films/smoke.json
  bunxDocent('bunx docent init smoke', ['init', 'smoke']);
  if (results.at(-1)?.status === 'pass') {
    const expected = join(root, 'films', 'smoke.json');
    if (!existsSync(expected)) {
      results.push({
        name: 'init smoke wrote films/smoke.json',
        status: 'fail',
        durationMs: 0,
        output: '',
        error: `expected ${expected} to exist`,
      });
    }
  }

  // (c) validate
  bunxDocent('bunx docent validate smoke', ['validate', 'smoke']);

  // (d) depthcheck
  bunxDocent('bunx docent depthcheck smoke', ['depthcheck', 'smoke']);

  // (e) build --skip-tts (first time — cold)
  bunxDocent('bunx docent build smoke --skip-tts (cold)', [
    'build',
    'smoke',
    '--skip-tts',
  ]);
  if (results.at(-1)?.status === 'pass') {
    const mp4 = join(root, 'out', 'smoke.mp4');
    if (!existsSync(mp4)) {
      results.push({
        name: 'build smoke produced out/smoke.mp4',
        status: 'fail',
        durationMs: 0,
        output: '',
        error: `expected ${mp4} to exist`,
      });
    } else {
      // ffprobe must report a non-zero duration AND a valid video stream.
      try {
        const probe = execFileSync(
          'ffprobe',
          ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4],
          {encoding: 'utf-8'},
        ).trim();
        const dur = Number(probe);
        if (!Number.isFinite(dur) || dur <= 0) {
          results.push({
            name: 'out/smoke.mp4 has non-zero duration',
            status: 'fail',
            durationMs: 0,
            output: probe,
            error: `ffprobe reported duration "${probe}"`,
          });
        }
      } catch (err) {
        results.push({
          name: 'ffprobe out/smoke.mp4',
          status: 'fail',
          durationMs: 0,
          output: '',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // (f) assert --update — capture goldens
  bunxDocent('bunx docent assert smoke --update', ['assert', 'smoke', '--update']);

  // (g) build again (warm — should be quick)
  bunxDocent('bunx docent build smoke --skip-tts (warm)', [
    'build',
    'smoke',
    '--skip-tts',
  ]);

  // (h) assert against captured goldens — must pass
  bunxDocent('bunx docent assert smoke', ['assert', 'smoke']);

  // (i) build --lang es — noop translation, falls back to source narration
  bunxDocent('bunx docent build smoke --skip-tts --lang es', [
    'build',
    'smoke',
    '--skip-tts',
    '--lang',
    'es',
  ]);
  if (results.at(-1)?.status === 'pass') {
    const mp4es = join(root, 'out', 'smoke-es.mp4');
    if (!existsSync(mp4es)) {
      results.push({
        name: 'build --lang es produced out/smoke-es.mp4',
        status: 'fail',
        durationMs: 0,
        output: '',
        error: `expected ${mp4es} to exist`,
      });
    }
  }

  // (j) Portrait variant — jq-edit meta.aspect to '9:16', build, ffprobe 1080x1920.
  if (!args.skipPortrait && results.at(-1)?.status === 'pass') {
    results.push(
      runStep('author smoke-portrait (meta.aspect=9:16)', () => {
        const src = join(root, 'films', 'smoke.json');
        const spec = JSON.parse(readFileSync(src, 'utf-8')) as {
          meta: Record<string, unknown>;
        } & Record<string, unknown>;
        spec.meta = {...spec.meta, id: 'smoke-portrait', aspect: '9:16'};
        writeFileSync(
          join(root, 'films', 'smoke-portrait.json'),
          JSON.stringify(spec, null, 2),
          'utf-8',
        );
        return {output: 'wrote films/smoke-portrait.json'};
      }),
    );
    bunxDocent('bunx docent build smoke-portrait --skip-tts', [
      'build',
      'smoke-portrait',
      '--skip-tts',
    ]);
    if (results.at(-1)?.status === 'pass') {
      results.push(
        runStep('ffprobe out/smoke-portrait.mp4 == 1080x1920', () => {
          const mp4 = join(root, 'out', 'smoke-portrait.mp4');
          if (!existsSync(mp4)) throw new Error(`missing ${mp4}`);
          const {w, h} = ffprobeDimensions(mp4);
          if (w !== 1080 || h !== 1920) {
            throw new Error(`expected 1080x1920, got ${w}x${h}`);
          }
          return {output: `${w}x${h}`};
        }),
      );
    }
  }

  // Summary.
  const totalMs = Date.now() - ciStart;
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.length - passed;
  log('');
  log(cyan('──── docent ci summary ────'));
  for (const r of results) {
    const mark = r.status === 'pass' ? green('✓') : red('✗');
    const dur = `(${(r.durationMs / 1000).toFixed(1)}s)`;
    log(`  ${mark} ${r.name} ${dim(dur)}`);
    if (r.status === 'fail' && r.error) {
      log(dim(`      ${r.error.split('\n')[0]}`));
    }
  }
  log('');
  log(
    failed === 0
      ? green(`✓ docent ci GREEN — ${passed}/${results.length} in ${(totalMs / 1000).toFixed(1)}s`)
      : red(`✗ docent ci FAILED — ${passed}/${results.length} in ${(totalMs / 1000).toFixed(1)}s`),
  );

  if (failed > 0) {
    leaveTmpdir = true;
    log(yellow(`  tmpdir kept for debugging: ${root}`));
  } else if (leaveTmpdir) {
    log(dim(`  tmpdir kept (--keep): ${root}`));
  } else {
    try {
      rmSync(root, {recursive: true, force: true});
    } catch {
      // Cleanup is best-effort.
    }
  }

  return failed === 0 ? 0 : 2;
};
