// `docent hermetic-style` — pinned fixtures for the style-recommendation
// surface.
//
// Each fixture is one synthetic survey file plus an expected preset (the
// "ground truth" mapping). The harness:
//   1) writes the survey into a tmp analysis/ slot (hermetic — does not touch
//      the real analysis/ tree),
//   2) calls recommendForSurvey on it and asserts the preset matches,
//   3) calls resolveStyle({preset}) and asserts it returns cleanly (a WCAG
//      audit-failure would throw a StyleValidationError here),
//   4) cleans up.
//
// The fixtures are committed as raw markdown under
// `tests/fixtures-style/<id>.md` — that is what the brief calls "pinning". A
// committed file is the truth; an in-memory string would not survive a re-run
// of the harness in a CI matrix that diff-checks the artefact.

import {existsSync, readFileSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {REPO_ROOT, paths} from './paths';
import {recommendForSurvey} from './style';
import {resolveStyle, StyleValidationError, type StylePreset} from '../src/style';

const C = {ok: '\x1b[32m✓\x1b[0m', no: '\x1b[31m✗\x1b[0m'};

export type StyleFixture = {
  id: string;
  description: string;
  expectPreset: StylePreset;
};

const FIXTURES: StyleFixture[] = [
  {
    id: 'style-recommend-code',
    description: 'a code-heavy PR survey (Kubernetes-shape)',
    expectPreset: 'engineering',
  },
  {
    id: 'style-recommend-prose',
    description: 'an essay / close-reading explainer',
    expectPreset: 'editorial',
  },
  {
    id: 'style-recommend-paper',
    description: 'an arXiv-PDF academic-paper explainer',
    expectPreset: 'paper',
  },
];

type FixtureResult = {
  id: string;
  pass: boolean;
  checks: {name: string; pass: boolean; detail: string}[];
};

export const hermeticStyle = async (opts: {json: boolean}): Promise<number> => {
  const fixturesDir = join(REPO_ROOT, 'tests', 'fixtures-style');
  if (!existsSync(fixturesDir)) {
    process.stderr.write(`\x1b[31m✗\x1b[0m ${fixturesDir} missing — fixtures not pinned\n`);
    return 1;
  }

  // The recommend command reads from paths.analysis/<id>.md. We stage each
  // fixture's markdown to that location for the duration of the check and
  // delete it after. No real analysis is touched (the fixture ids are
  // distinct from any production film id).
  mkdirSync(paths.analysis, {recursive: true});

  const results: FixtureResult[] = [];
  process.stdout.write(`\x1b[1mdocent hermetic-style\x1b[0m — style-recommendation gallery\n\n`);

  for (const fx of FIXTURES) {
    const checks: FixtureResult['checks'] = [];
    const srcPath = join(fixturesDir, `${fx.id}.md`);
    const stagePath = join(paths.analysis, `${fx.id}.md`);

    if (!existsSync(srcPath)) {
      checks.push({name: 'fixture present', pass: false, detail: `${srcPath} missing`});
      results.push({id: fx.id, pass: false, checks});
      continue;
    }

    let staged = false;
    try {
      const body = readFileSync(srcPath, 'utf8');
      writeFileSync(stagePath, body);
      staged = true;
      checks.push({name: 'fixture staged', pass: true, detail: `analysis/${fx.id}.md`});

      // (1) recommend — body in, preset out.
      const rec = recommendForSurvey(fx.id, body);
      const recOk = rec.preset === fx.expectPreset;
      checks.push({
        name: 'recommend → expected preset',
        pass: recOk,
        detail: recOk
          ? `${rec.preset} (rationale: ${rec.rationale})`
          : `got ${rec.preset}, expected ${fx.expectPreset}`,
      });

      // (2) resolve — the chosen preset must resolve cleanly.
      try {
        const resolved = resolveStyle({preset: rec.preset, intent: rec.intent});
        checks.push({
          name: 'resolve cleanly (no WCAG fail)',
          pass: true,
          detail: `preset=${resolved.preset} intent=${JSON.stringify(resolved.intent)}`,
        });
      } catch (e) {
        const msg =
          e instanceof StyleValidationError
            ? e.details.map((d) => `${d.path}: ${d.message}`).join('; ')
            : e instanceof Error
              ? e.message
              : String(e);
        checks.push({name: 'resolve cleanly (no WCAG fail)', pass: false, detail: msg});
      }

      // (3) resolve --preset <expected> — sanity check the preset by itself
      // (independent of the recommend output).
      try {
        resolveStyle({preset: fx.expectPreset});
        checks.push({
          name: `resolve --preset ${fx.expectPreset}`,
          pass: true,
          detail: 'preset resolves end-to-end',
        });
      } catch (e) {
        const msg =
          e instanceof StyleValidationError
            ? e.details.map((d) => `${d.path}: ${d.message}`).join('; ')
            : e instanceof Error
              ? e.message
              : String(e);
        checks.push({
          name: `resolve --preset ${fx.expectPreset}`,
          pass: false,
          detail: msg,
        });
      }
    } finally {
      if (staged) {
        try {
          rmSync(stagePath);
        } catch {
          // tolerate — the next run will overwrite anyway.
        }
      }
    }

    const pass = checks.every((c) => c.pass);
    results.push({id: fx.id, pass, checks});

    process.stdout.write(`\x1b[1m${fx.id}\x1b[0m — ${fx.description}\n`);
    for (const c of checks) {
      process.stdout.write(`  ${c.pass ? C.ok : C.no} ${c.name} — ${c.detail}\n`);
    }
    process.stdout.write(
      `  ${pass ? '\x1b[32m✔ pass\x1b[0m' : '\x1b[31m✗ fail\x1b[0m'}\n\n`,
    );
  }

  const allPass = results.every((r) => r.pass);
  const passed = results.filter((r) => r.pass).length;
  process.stdout.write(
    allPass
      ? `\x1b[32m✔ hermetic-style — ${passed}/${results.length} fixtures validated\x1b[0m\n`
      : `\x1b[31m✗ hermetic-style — ${passed}/${results.length} fixtures passed\x1b[0m\n`,
  );

  if (opts.json) {
    process.stdout.write(JSON.stringify({allPass, results}, null, 2) + '\n');
  }

  return allPass ? 0 : 1;
};
