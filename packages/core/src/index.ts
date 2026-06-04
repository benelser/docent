// @bjelser/core — the default implementation of @bjelser/kit.
//
// The plugin manifest lives in `index.generated.ts` and is produced by
// `scripts/gen-manifest.ts`. This file is a thin re-export so callers can
// keep importing `@bjelser/core` (the package's main export). Regenerate
// after adding/removing a plugin directory:
//
//   bun packages/core/scripts/gen-manifest.ts
//
// CI guards staleness — see the gen:manifest:check script in package.json.
//
// Loading:
//
//   import {Engine} from '@bjelser/kit';
//   import {corePlugins} from '@bjelser/core';
//   const engine = new Engine().use(corePlugins);

export {corePlugins} from './index.generated';
export * from './index.generated';
export {default} from './index.generated';

// Narrative-quality cascade — the deterministic + LLM checks behind
// `docent assert --narrative`. Surfaced as a sub-namespace so consumers
// can `import {lintFilmNarration, noopJudgeProvider} from '@bjelser/core'`
// without going through a deep path.
export {
  // lint rules
  BEAT_LINT_RULES,
  SCENE_LINT_RULES,
  lintFilmNarration,
  stripQuotes,
  fillerTransitionsRule,
  hedgeWordsRule,
  bannedIntensifiersRule,
  fillerOpenersRule,
  exclamationMarksRule,
  anaphoraOverloadRule,
  structuralTicsRule,
  // judge
  noopJudgeProvider,
} from './narrative-quality';

export type {
  Severity as NarrativeLintSeverity,
  BeatLintFinding,
  BeatLintInput,
  SceneLintInput,
  BeatRule,
  SceneRule,
  LintFilmInput,
  LintFilmResult,
} from './narrative-quality/lint-rules';
