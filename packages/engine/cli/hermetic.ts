// `docent hermetic` — end-to-end validation of the engine cascade in a pinned
// environment.
//
// For each fixture (a committed film spec) the harness asserts: doctor is
// green, the spec passes the contract, the cascade renders, and the output is
// a valid video of the expected shape. Wall time is recorded per fixture.
//
// What is hermetic here: the spec, the engine, and the doctor manifest — all
// pinned in-repo. What is NOT yet pinned: the survey stage (the agent authors
// the spec). That arrives with the docent-agent APM package; until then this
// harness validates the deterministic half — the cascade. It is also the eval
// rig the depth-prompt work will reuse.

import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {REPO_ROOT, paths} from './paths';
import {runChecks} from './doctor';
import {validateSpec} from './validate';
import {runCascade} from './cascade';
import {runDepthCheck, depthSummary} from './depthcheck';

type Fixture = {
  id: string;
  mode: string;
  subject: string;
  expect: {minScenes: number; minSeconds: number};
};

type CaseCheck = {name: string; pass: boolean; detail: string};
type CaseResult = {
  id: string;
  pass: boolean;
  checks: CaseCheck[];
  warnings: string[];
  wallSeconds: number;
};

const ffprobe = async (
  file: string,
): Promise<{width: number; height: number; codec: string; duration: number} | null> => {
  const proc = Bun.spawn(
    [
      'ffprobe', '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,codec_name',
      '-show_entries', 'format=duration', '-of', 'json', file,
    ],
    {stdout: 'pipe', stderr: 'pipe'},
  );
  if ((await proc.exited) !== 0) return null;
  try {
    const j = JSON.parse(await new Response(proc.stdout).text());
    const s = j.streams?.[0] ?? {};
    return {
      width: s.width ?? 0,
      height: s.height ?? 0,
      codec: s.codec_name ?? '',
      duration: Number(j.format?.duration ?? 0),
    };
  } catch {
    return null;
  }
};

const C = {ok: '\x1b[32m✓\x1b[0m', no: '\x1b[31m✗\x1b[0m'};

export const hermetic = async (opts: {
  fixtureId?: string;
  scale: number;
  json: boolean;
}): Promise<number> => {
  const fixturesPath = join(REPO_ROOT, 'tests', 'fixtures.json');
  if (!existsSync(fixturesPath)) {
    console.error('\x1b[31m✗\x1b[0m tests/fixtures.json not found');
    return 1;
  }
  let {fixtures} = (await Bun.file(fixturesPath).json()) as {fixtures: Fixture[]};
  if (opts.fixtureId) fixtures = fixtures.filter((f) => f.id === opts.fixtureId);
  if (fixtures.length === 0) {
    console.error(`\x1b[31m✗\x1b[0m no fixture matching "${opts.fixtureId}"`);
    return 1;
  }

  console.log(`\x1b[1mdocent hermetic\x1b[0m — engine cascade · scale ${opts.scale}\n`);

  // doctor gate — the environment must be cascade-ready before anything runs.
  const checks = await runChecks();
  const doctorFails = checks.filter((c) => c.status === 'fail' && c.required);
  if (doctorFails.length) {
    console.log(`\x1b[31m✗\x1b[0m doctor: ${doctorFails.length} required check(s) failing — aborting\n`);
    return 1;
  }
  console.log(`${C.ok} doctor: cascade-ready\n`);

  const results: CaseResult[] = [];
  for (const fx of fixtures) {
    const checks: CaseCheck[] = [];
    const warnings: string[] = [];
    const t0 = performance.now();
    const specPath = join(paths.films, `${fx.id}.json`);
    let spec: {meta: {width: number; height: number}; scenes: unknown[]} | null = null;

    if (!existsSync(specPath)) {
      checks.push({name: 'spec present', pass: false, detail: `films/${fx.id}.json missing`});
    } else {
      spec = await Bun.file(specPath).json();
      // Mirror cascade.ts — only `severity !== 'warning'` issues are hard
      // fails. Warnings (e.g. box-overlap on a `nodes` grid that resolveLayout
      // handles at render time) are surfaced but do NOT block the verdict.
      const issues = validateSpec(spec);
      const hardFails = issues.filter((i) => i.severity !== 'warning');
      const softWarns = issues.filter((i) => i.severity === 'warning');
      for (const w of softWarns) warnings.push(`${w.path || '(root)'}: ${w.message}`);
      checks.push({
        name: 'spec valid',
        pass: hardFails.length === 0,
        detail: hardFails.length
          ? `${hardFails.length} contract issue(s)`
          : softWarns.length
            ? `passes the contract (${softWarns.length} warning${softWarns.length === 1 ? '' : 's'})`
            : 'passes the contract',
      });
      checks.push({
        name: 'scene count',
        pass: spec!.scenes.length >= fx.expect.minScenes,
        detail: `${spec!.scenes.length} scenes (≥ ${fx.expect.minScenes})`,
      });
      const ds = depthSummary(runDepthCheck(spec as Parameters<typeof runDepthCheck>[0]));
      checks.push({
        name: 'depth contract',
        pass: ds.fail === 0,
        detail:
          ds.fail === 0
            ? `${ds.ok}/${ds.total} met${ds.warn ? `, ${ds.warn} warn` : ''}`
            : `${ds.fail} depth failure(s)`,
      });
    }

    let output = '';
    if (spec && checks.every((c) => c.pass)) {
      try {
        const res = await runCascade({film: fx.id, scale: opts.scale});
        output = res.output;
        checks.push({name: 'cascade renders', pass: true, detail: output});
      } catch (e) {
        checks.push({
          name: 'cascade renders',
          pass: false,
          detail: e instanceof Error ? e.message.split('\n')[0] : String(e),
        });
      }
    }

    if (output) {
      const probe = await ffprobe(output);
      if (!probe) {
        checks.push({name: 'valid video', pass: false, detail: 'ffprobe could not read it'});
      } else {
        const expW = Math.round(spec!.meta.width * opts.scale);
        const expH = Math.round(spec!.meta.height * opts.scale);
        checks.push({name: 'codec', pass: probe.codec === 'h264', detail: probe.codec});
        checks.push({
          name: 'dimensions',
          pass: Math.abs(probe.width - expW) <= 2 && Math.abs(probe.height - expH) <= 2,
          detail: `${probe.width}×${probe.height} (expect ${expW}×${expH})`,
        });
        checks.push({
          name: 'duration',
          pass: probe.duration >= fx.expect.minSeconds,
          detail: `${probe.duration.toFixed(1)}s (≥ ${fx.expect.minSeconds}s)`,
        });
      }
    }

    const wallSeconds = (performance.now() - t0) / 1000;
    const pass = checks.every((c) => c.pass);
    results.push({id: fx.id, pass, checks, warnings, wallSeconds});

    console.log(`\x1b[1m${fx.id}\x1b[0m — ${fx.subject}`);
    for (const c of checks) console.log(`  ${c.pass ? C.ok : C.no} ${c.name} — ${c.detail}`);
    if (warnings.length) {
      console.log(
        `  \x1b[33m⚠ ${warnings.length} warning(s)\x1b[0m — resolveLayout handles the visual; non-blocking:`,
      );
      for (const w of warnings) console.log(`    \x1b[33m⚠\x1b[0m ${w}`);
    }
    console.log(
      `  ${pass ? '\x1b[32m✔ pass\x1b[0m' : '\x1b[31m✗ fail\x1b[0m'}  ·  wall ${wallSeconds.toFixed(1)}s\n`,
    );
  }

  const allPass = results.every((r) => r.pass);
  const report = {
    timestamp: new Date().toISOString(),
    scale: opts.scale,
    doctorReady: true,
    allPass,
    cases: results,
  };
  await Bun.write(
    join(REPO_ROOT, 'tests', 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  if (opts.json) console.log(JSON.stringify(report, null, 2));

  const passed = results.filter((r) => r.pass).length;
  const withWarnings = results.filter((r) => r.warnings.length > 0);
  if (withWarnings.length) {
    const total = withWarnings.reduce((n, r) => n + r.warnings.length, 0);
    console.log(
      `\x1b[33m⚠ ${total} warning(s) across ${withWarnings.length} fixture(s): ${withWarnings
        .map((r) => `${r.id} (${r.warnings.length})`)
        .join(', ')} — non-blocking\x1b[0m`,
    );
  }
  console.log(
    allPass
      ? `\x1b[32m✔ hermetic — ${passed}/${results.length} fixtures validated end-to-end\x1b[0m`
      : `\x1b[31m✗ hermetic — ${passed}/${results.length} fixtures passed\x1b[0m`,
  );
  return allPass ? 0 : 1;
};
