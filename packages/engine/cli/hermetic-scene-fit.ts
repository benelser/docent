// `docent hermetic-scene-fit` — pinned fixtures for the scene-fit
// recommendation surface.
//
// Each fixture is one synthetic survey file plus an expected scene type
// (the "ground truth" mapping) plus the signal needle the rationale must
// cite. The harness:
//   1) writes the survey into a tmp analysis/ slot (hermetic — does not
//      touch the real analysis/ tree),
//   2) calls recommendScenes on it and asserts the expected scene is in
//      the top N (configurable per fixture, default 3),
//   3) asserts the rationale cites the expected signal needle,
//   4) cleans up.
//
// The fixtures live under tests/fixtures-scene-fit/<id>.md — committed,
// the truth. An in-memory string would not survive a re-run in a CI
// matrix that diff-checks the artefact.
//
// The 10 fixtures cover one cognitive cluster each — the harness exists to
// prove the recommender is not overfitting on the default rut
// (frame/structure/compare/tension/recap) when the subject genuinely demands
// one of the specific primitives.

import {existsSync, readFileSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {REPO_ROOT, paths} from './paths';
import {recommendScenes, type SceneType} from './scene-fit';

const C = {ok: '\x1b[32m✓\x1b[0m', no: '\x1b[31m✗\x1b[0m'};

export type SceneFitFixture = {
  id: string;
  description: string;
  // The scene type that MUST appear in the top N recommendations.
  expectScene: SceneType;
  // Optional second expectation — e.g. rhetorical fixtures expect both
  // epigraph AND objection. If null, only the primary expectation runs.
  expectAlsoScene?: SceneType;
  // How many top recommendations to scan for the expected scene. Default 3.
  topN?: number;
  // The signal needle(s) the rationale must cite. The harness asserts at
  // least one of these substrings appears in the matched needles list.
  // Drawn directly from the SIGNALS table in scene-fit.ts.
  expectNeedles: string[];
};

const FIXTURES: SceneFitFixture[] = [
  {
    id: 'scene-fit-feedback-loop',
    description: 'self-reinforcing two-sided marketplace dynamic',
    expectScene: 'causal-loop',
    expectNeedles: ['feedback loop', 'self-reinforcing', 'reinforcing loop', 'positive feedback', 'compounds'],
  },
  {
    id: 'scene-fit-tradeoff-plane',
    description: 'database engines on a 2-D consistency × latency plane',
    expectScene: 'landscape',
    expectNeedles: ['two-dimensional', 'two axes', 'trade-off plane', 'quadrant'],
  },
  {
    id: 'scene-fit-temporal',
    description: 'the AI winter — dated milestones over fifty years',
    expectScene: 'timeline',
    expectNeedles: ['timeline', 'chronological', 'dated milestones', 'time axis'],
  },
  {
    id: 'scene-fit-hierarchy',
    description: 'Linnaean taxonomy — parent-child levels',
    expectScene: 'tree',
    expectNeedles: ['parent-child', 'taxonomy', 'hierarchy', 'rooted tree', 'classification'],
  },
  {
    id: 'scene-fit-geographic',
    description: 'John Snow\'s cholera map — geography is the argument',
    expectScene: 'map',
    expectNeedles: ['geography', 'geographic', 'regional topology', 'transmission paths', 'topology'],
  },
  {
    id: 'scene-fit-experience',
    description: 'first-hour Postgres onboarding — emotional arc × touchpoints',
    expectScene: 'journey-map',
    expectNeedles: ['user journey', 'customer journey', 'stages of experience', 'onboarding', 'emotional arc', 'touchpoint'],
  },
  {
    id: 'scene-fit-set-overlap',
    description: 'the lethal trifecta — only the triple intersection is dangerous',
    expectScene: 'venn',
    expectNeedles: ['intersection of', 'overlap', 'in the intersection', 'trifecta', 'set intersection'],
  },
  {
    id: 'scene-fit-prose-essay',
    description: 'Orwell close reading — the source text annotated by phrase',
    expectScene: 'passage',
    expectNeedles: ['close reading', 'close-reading', 'prose passage', 'the source text', 'annotated by phrase'],
  },
  {
    id: 'scene-fit-rhetorical-stance',
    description: 'compatibilism — contested topic needs epigraph + objection',
    expectScene: 'epigraph',
    expectAlsoScene: 'objection',
    expectNeedles: ['cited authority', 'opens the film', 'anchor in a tradition'],
    topN: 5,
  },
  {
    id: 'scene-fit-mechanism-driven',
    description: 'four-stroke engine cycle — motion IS the argument',
    expectScene: 'mechanism',
    expectNeedles: ['working motion', 'cycle through phases', 'state cycle', 'in continuous motion', 'how it operates', 'animated mechanism', 'state machine'],
  },
];

type FixtureResult = {
  id: string;
  pass: boolean;
  checks: {name: string; pass: boolean; detail: string}[];
};

export const hermeticSceneFit = async (opts: {json: boolean}): Promise<number> => {
  const fixturesDir = join(REPO_ROOT, 'tests', 'fixtures-scene-fit');
  if (!existsSync(fixturesDir)) {
    process.stderr.write(`\x1b[31m✗\x1b[0m ${fixturesDir} missing — fixtures not pinned\n`);
    return 1;
  }

  mkdirSync(paths.analysis, {recursive: true});

  const results: FixtureResult[] = [];
  process.stdout.write(
    `\x1b[1mdocent hermetic-scene-fit\x1b[0m — scene-recommendation gallery\n\n`,
  );

  for (const fx of FIXTURES) {
    const checks: FixtureResult['checks'] = [];
    const srcPath = join(fixturesDir, `${fx.id}.md`);
    const stagePath = join(paths.analysis, `${fx.id}.md`);
    const topN = fx.topN ?? 3;

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

      // We recommend with top=8 (the default for a film) and then assert
      // the expected scene appears in the top `topN` body picks. The body
      // picks are everything between `frame` (index 0) and `recap` (last);
      // we strip those before applying the topN cut.
      const rec = recommendScenes(fx.id, body, 8);
      const body_picks = rec.recommendations.filter(
        (r) => r.scene !== 'frame' && r.scene !== 'recap',
      );
      const topBody = body_picks.slice(0, topN);

      // (1) expected scene in top N
      const found = topBody.find((r) => r.scene === fx.expectScene);
      checks.push({
        name: `expected "${fx.expectScene}" in top ${topN}`,
        pass: !!found,
        detail: found
          ? `at rank ${topBody.indexOf(found) + 1} with score ${found.score}`
          : `top ${topN}: [${topBody.map((r) => `${r.scene}@${r.score}`).join(', ')}]`,
      });

      // (1b) optional secondary scene
      if (fx.expectAlsoScene) {
        const foundAlso = topBody.find((r) => r.scene === fx.expectAlsoScene);
        checks.push({
          name: `expected also "${fx.expectAlsoScene}" in top ${topN}`,
          pass: !!foundAlso,
          detail: foundAlso
            ? `at rank ${topBody.indexOf(foundAlso) + 1} with score ${foundAlso.score}`
            : `top ${topN}: [${topBody.map((r) => `${r.scene}@${r.score}`).join(', ')}]`,
        });
      }

      // (2) rationale cites at least one expected signal needle
      if (found) {
        const citedNeedle = fx.expectNeedles.find((n) =>
          found.matched.some((m) => m.toLowerCase().includes(n.toLowerCase())),
        );
        checks.push({
          name: 'rationale cites an expected needle',
          pass: !!citedNeedle,
          detail: citedNeedle
            ? `matched "${citedNeedle}" (full set: ${found.matched.slice(0, 4).join(', ')})`
            : `expected one of [${fx.expectNeedles.join(', ')}], got matched=[${found.matched.join(', ')}]`,
        });
      }

      // (3) warningOnDefault must NOT trip — every fixture has at least one
      // specific signal driving a non-rut scene. If the flag DOES trip, the
      // mapper failed even though the fixture survey is unambiguous.
      checks.push({
        name: 'warningOnDefault NOT raised',
        pass: !rec.warningOnDefault,
        detail: rec.warningOnDefault
          ? `unexpected — survey contains specific signals but mapper collapsed`
          : 'specific signals drove the recommendation',
      });
    } finally {
      if (staged) {
        try {
          rmSync(stagePath);
        } catch {
          // tolerate — next run overwrites.
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

  // Extra check — the anti-overfit flag itself. A fully empty body survey
  // (no signals at all) MUST trip warningOnDefault. This proves the flag is
  // not vestigial.
  process.stdout.write(`\x1b[1manti-overfit-flag\x1b[0m — empty-survey collapse test\n`);
  const emptyChecks: FixtureResult['checks'] = [];
  const empty = recommendScenes(
    'scene-fit-empty',
    '# survey\nthis survey has no scene-specific signals at all.',
    8,
  );
  emptyChecks.push({
    name: 'empty survey raises warningOnDefault',
    pass: empty.warningOnDefault,
    detail: empty.warningOnDefault
      ? 'flag tripped as expected on a signal-less survey'
      : 'flag did NOT trip — anti-overfit detection is broken',
  });
  const emptyPass = emptyChecks.every((c) => c.pass);
  results.push({id: 'anti-overfit-flag', pass: emptyPass, checks: emptyChecks});
  for (const c of emptyChecks) {
    process.stdout.write(`  ${c.pass ? C.ok : C.no} ${c.name} — ${c.detail}\n`);
  }
  process.stdout.write(
    `  ${emptyPass ? '\x1b[32m✔ pass\x1b[0m' : '\x1b[31m✗ fail\x1b[0m'}\n\n`,
  );

  const allPass = results.every((r) => r.pass);
  const passed = results.filter((r) => r.pass).length;
  process.stdout.write(
    allPass
      ? `\x1b[32m✔ hermetic-scene-fit — ${passed}/${results.length} cases validated\x1b[0m\n`
      : `\x1b[31m✗ hermetic-scene-fit — ${passed}/${results.length} cases passed\x1b[0m\n`,
  );

  if (opts.json) {
    process.stdout.write(JSON.stringify({allPass, results}, null, 2) + '\n');
  }

  return allPass ? 0 : 1;
};
