// `docent preflight` — the Go Live readiness gate.
//
// `docent hermetic` validates the render cascade against pinned fixtures —
// the deterministic half. `preflight` extends that coverage to the WHOLE
// user-facing surface so we know docent is ready for real users hitting it:
// the environment, every committed spec's contract + depth floor, the quality
// cycle's surface (judge/reviseLoop callable, every verdict well-shaped), the
// flywheel's outer-loop dashboard, and README ↔ registry hygiene.
//
// Each check reports PASS / WARN / FAIL with a one-line reason. The final
// verdict aggregates: GREEN (all pass), YELLOW (any warn, no fail), RED (any
// fail). Exit code 0 for GREEN/YELLOW, 1 for RED.

import {existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {REPO_ROOT, paths} from './paths';
import {runChecks} from './doctor';
import {validateSpec} from './validate';
import {runDepthCheck, depthSummary} from './depthcheck';
import * as judgeModule from './judge';
import {flywheel} from './flywheel';

// Films that are kitchen-sink test fixtures, not gallery items. They exercise
// the engine's scene grammar end to end; they are not authored to clear the
// depth contract, and they do not belong in the README's sample-films list.
const FIXTURES = new Set(['grammar-check']);

type Status = 'pass' | 'warn' | 'fail';
type CheckResult = {name: string; status: Status; detail: string};

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

const printCheck = (r: CheckResult): void => {
  console.log(`  ${GLYPH[r.status]} ${LABEL[r.status]}  ${r.name} — ${r.detail}`);
};

const printSection = (title: string): void => {
  console.log(`\x1b[1m${title}\x1b[0m`);
};

// --- (1) environment ---------------------------------------------------------

const checkEnvironment = async (): Promise<CheckResult> => {
  const outcomes = await runChecks();
  const requiredFails = outcomes.filter((o) => o.status === 'fail' && o.required);
  const optionalIssues = outcomes.filter(
    (o) => (o.status === 'fail' && !o.required) || o.status === 'warn',
  );

  if (requiredFails.length > 0) {
    const names = requiredFails.map((o) => o.label).join(', ');
    return {
      name: 'environment',
      status: 'fail',
      detail: `${requiredFails.length} required check(s) failing — ${names}`,
    };
  }
  if (optionalIssues.length > 0) {
    return {
      name: 'environment',
      status: 'warn',
      detail: `${optionalIssues.length} optional check(s) not ideal — run docent doctor`,
    };
  }
  return {
    name: 'environment',
    status: 'pass',
    detail: `all ${outcomes.length} doctor checks green`,
  };
};

// --- (2) every committed film validates --------------------------------------

const knownFilmIds = (): string[] => {
  if (!existsSync(paths.films)) return [];
  return readdirSync(paths.films)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
};

const checkFilmsValid = async (): Promise<CheckResult[]> => {
  const ids = knownFilmIds();
  if (ids.length === 0) {
    return [{name: 'films present', status: 'fail', detail: 'no films/*.json found'}];
  }

  const results: CheckResult[] = [];
  let contractFails = 0;
  let depthFails = 0;
  let depthWarns = 0;
  const failingIds: string[] = [];
  const warningIds: string[] = [];

  for (const id of ids) {
    const specPath = join(paths.films, `${id}.json`);
    let spec: unknown;
    try {
      spec = await Bun.file(specPath).json();
    } catch (e) {
      contractFails++;
      failingIds.push(`${id} (not JSON)`);
      continue;
    }
    const issues = validateSpec(spec);
    const hardIssues = issues.filter((i) => i.severity !== 'warning');
    if (hardIssues.length > 0) {
      contractFails++;
      failingIds.push(`${id} (${hardIssues.length} contract issue${hardIssues.length === 1 ? '' : 's'})`);
      continue;
    }
    // Depth contract — fail is FAIL, warn is WARN. Skip for fixtures (they
    // exercise the grammar end to end; they are not authored to clear the bar).
    if (FIXTURES.has(id)) continue;
    try {
      const ds = depthSummary(
        runDepthCheck(spec as Parameters<typeof runDepthCheck>[0]),
      );
      if (ds.fail > 0) {
        depthFails++;
        failingIds.push(`${id} (${ds.fail} depth fail)`);
      } else if (ds.warn > 0) {
        depthWarns++;
        warningIds.push(`${id} (${ds.warn} depth warn)`);
      }
    } catch (e) {
      contractFails++;
      failingIds.push(`${id} (depth check threw)`);
    }
  }

  if (contractFails > 0 || depthFails > 0) {
    results.push({
      name: 'films validate',
      status: 'fail',
      detail: `${failingIds.length}/${ids.length} fail — ${failingIds.join('; ')}`,
    });
  } else if (depthWarns > 0) {
    results.push({
      name: 'films validate',
      status: 'warn',
      detail: `${ids.length}/${ids.length} contract-clean; depth warnings on ${warningIds.join(', ')}`,
    });
  } else {
    const fixtureCount = ids.filter((id) => FIXTURES.has(id)).length;
    const galleryCount = ids.length - fixtureCount;
    const fixtureNote = fixtureCount > 0
      ? ` (${fixtureCount} fixture${fixtureCount === 1 ? '' : 's'} excluded from depth)`
      : '';
    results.push({
      name: 'films validate',
      status: 'pass',
      detail: `${ids.length}/${ids.length} clear contract; ${galleryCount}/${galleryCount} clear depth${fixtureNote}`,
    });
  }
  return results;
};

// --- (3) cycle surface -------------------------------------------------------

const checkCycleSurface = async (): Promise<CheckResult[]> => {
  const results: CheckResult[] = [];

  // 3a — judge / reviseLoop are callable functions.
  const judgeOk = typeof judgeModule.judge === 'function';
  const reviseOk = typeof judgeModule.reviseLoop === 'function';
  if (!judgeOk || !reviseOk) {
    const missing: string[] = [];
    if (!judgeOk) missing.push('judge');
    if (!reviseOk) missing.push('reviseLoop');
    results.push({
      name: 'cycle exports',
      status: 'fail',
      detail: `cli/judge.ts missing exports: ${missing.join(', ')}`,
    });
  } else {
    results.push({
      name: 'cycle exports',
      status: 'pass',
      detail: 'cli/judge.ts exports judge + reviseLoop',
    });
  }

  // 3b — every reviews/*.json (excluding .round-N.json) matches the verdict
  // schema: scores[] of {dimension, score}, boolean pass, critiques[].
  const reviewsDir = join(REPO_ROOT, 'reviews');
  if (!existsSync(reviewsDir)) {
    results.push({
      name: 'verdict shape',
      status: 'warn',
      detail: 'no reviews/ directory yet — no judge has run',
    });
    return results;
  }
  const files = readdirSync(reviewsDir)
    .filter((f) => f.endsWith('.json') && !/\.round-\d+\.json$/.test(f))
    .sort();
  if (files.length === 0) {
    results.push({
      name: 'verdict shape',
      status: 'warn',
      detail: 'no per-film verdicts in reviews/ yet',
    });
    return results;
  }

  const malformed: string[] = [];
  for (const f of files) {
    let raw: unknown;
    try {
      raw = await Bun.file(join(reviewsDir, f)).json();
    } catch {
      malformed.push(`${f} (not JSON)`);
      continue;
    }
    if (typeof raw !== 'object' || raw === null) {
      malformed.push(`${f} (not an object)`);
      continue;
    }
    const v = raw as Record<string, unknown>;
    const problems: string[] = [];
    if (typeof v.pass !== 'boolean') problems.push('no boolean pass');
    if (!Array.isArray(v.scores)) {
      problems.push('no scores array');
    } else {
      // every score must have dimension + score
      const bad = v.scores.findIndex(
        (s) =>
          typeof s !== 'object' ||
          s === null ||
          typeof (s as Record<string, unknown>).dimension !== 'string' ||
          typeof (s as Record<string, unknown>).score !== 'number',
      );
      if (bad >= 0) problems.push(`scores[${bad}] missing dimension/score`);
    }
    if (!Array.isArray(v.critiques)) problems.push('no critiques array');
    if (problems.length > 0) {
      malformed.push(`${f} (${problems.join(', ')})`);
    }
  }

  if (malformed.length > 0) {
    results.push({
      name: 'verdict shape',
      status: 'fail',
      detail: `${malformed.length}/${files.length} out of shape — ${malformed.join('; ')}`,
    });
  } else {
    results.push({
      name: 'verdict shape',
      status: 'pass',
      detail: `${files.length}/${files.length} verdicts match the schema`,
    });
  }
  return results;
};

// --- (4) flywheel ------------------------------------------------------------

// Run flywheel() with its stdout/stderr captured so the preflight output stays
// a clean one-line-per-check report. We care that it exits 0 without throwing.
const checkFlywheel = async (): Promise<CheckResult> => {
  const origLog = console.log;
  const origErr = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    const code = await flywheel();
    if (code === 0) {
      return {
        name: 'flywheel',
        status: 'pass',
        detail: 'outer-loop dashboard runs clean',
      };
    }
    return {
      name: 'flywheel',
      status: 'warn',
      detail: `flywheel exited ${code} — likely no reviews yet`,
    };
  } catch (e) {
    return {
      name: 'flywheel',
      status: 'fail',
      detail: `flywheel threw: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`,
    };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
};

// --- (5) README ↔ registry hygiene ------------------------------------------

const readReadmeFilmIds = async (): Promise<string[]> => {
  const readmePath = join(REPO_ROOT, 'README.md');
  if (!existsSync(readmePath)) return [];
  const text = await Bun.file(readmePath).text();
  // Match `### \`<film-id>\`` headings — the documented films section.
  const ids: string[] = [];
  const re = /^###\s+`([^`]+)`/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) ids.push(m[1]);
  return ids;
};

const readRegistryFilmIds = async (): Promise<string[]> => {
  // Read the generated registry as text and pull the keys out — importing it
  // here would force the engine bundle through this CLI module.
  const regPath = join(
    REPO_ROOT,
    'packages',
    'engine',
    'src',
    'engine',
    'films.generated.ts',
  );
  if (!existsSync(regPath)) return [];
  const text = await Bun.file(regPath).text();
  // The FILMS object — pull keys of the form `'<id>': <var> as FilmSpec`.
  const ids: string[] = [];
  const re = /'([^']+)':\s*\w+\s+as\s+FilmSpec/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) ids.push(m[1]);
  return ids;
};

const checkReadmeRegistry = async (): Promise<CheckResult> => {
  const readmeIds = new Set(await readReadmeFilmIds());
  const registryIds = new Set(await readRegistryFilmIds());

  if (registryIds.size === 0) {
    return {
      name: 'README ↔ registry',
      status: 'warn',
      detail: 'could not parse the films registry — hygiene check skipped',
    };
  }

  const inReadmeNotRegistry = [...readmeIds].filter((id) => !registryIds.has(id));
  // Fixtures live in the registry but never in the gallery — exclude them.
  const inRegistryNotReadme = [...registryIds].filter(
    (id) => !readmeIds.has(id) && !FIXTURES.has(id),
  );
  if (inReadmeNotRegistry.length === 0 && inRegistryNotReadme.length === 0) {
    return {
      name: 'README ↔ registry',
      status: 'pass',
      detail: `${registryIds.size} films, README and registry agree`,
    };
  }
  const parts: string[] = [];
  if (inRegistryNotReadme.length > 0) {
    parts.push(`README missing: ${inRegistryNotReadme.join(', ')}`);
  }
  if (inReadmeNotRegistry.length > 0) {
    parts.push(`README extra: ${inReadmeNotRegistry.join(', ')}`);
  }
  return {
    name: 'README ↔ registry',
    status: 'warn',
    detail: `docs drift — ${parts.join('; ')}`,
  };
};

// --- driver ------------------------------------------------------------------

export const preflight = async (): Promise<number> => {
  console.log('\x1b[1mdocent preflight\x1b[0m — Go Live readiness\n');

  const all: CheckResult[] = [];

  printSection('Environment');
  const env = await checkEnvironment();
  printCheck(env);
  all.push(env);
  console.log('');

  printSection('Contracts — every committed film validates');
  const filmChecks = await checkFilmsValid();
  for (const r of filmChecks) printCheck(r);
  all.push(...filmChecks);
  console.log('');

  printSection('Cycle surface — judge, reviseLoop, verdicts');
  const cycleChecks = await checkCycleSurface();
  for (const r of cycleChecks) printCheck(r);
  all.push(...cycleChecks);
  console.log('');

  printSection('Flywheel — outer-loop dashboard runs');
  const fly = await checkFlywheel();
  printCheck(fly);
  all.push(fly);
  console.log('');

  printSection('Hygiene — README ↔ films registry');
  const hygiene = await checkReadmeRegistry();
  printCheck(hygiene);
  all.push(hygiene);
  console.log('');

  const passes = all.filter((r) => r.status === 'pass').length;
  const warns = all.filter((r) => r.status === 'warn').length;
  const fails = all.filter((r) => r.status === 'fail').length;

  const verdict: 'GREEN' | 'YELLOW' | 'RED' =
    fails > 0 ? 'RED' : warns > 0 ? 'YELLOW' : 'GREEN';
  const color =
    verdict === 'GREEN' ? '\x1b[32m' : verdict === 'YELLOW' ? '\x1b[33m' : '\x1b[31m';
  const summary = `${passes} pass · ${warns} warn · ${fails} fail`;

  console.log(`${color}\x1b[1m${verdict}\x1b[0m  ${summary}`);
  if (verdict === 'GREEN') {
    console.log('\x1b[32m✔ docent is Go Live ready\x1b[0m');
  } else if (verdict === 'YELLOW') {
    console.log('\x1b[33m⚠ docent is launchable — address the warnings before broad rollout\x1b[0m');
  } else {
    console.log('\x1b[31m✗ docent is NOT ready — fix the failures above before Go Live\x1b[0m');
  }

  return verdict === 'RED' ? 1 : 0;
};
