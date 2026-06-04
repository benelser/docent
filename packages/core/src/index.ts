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

// ---------- Distribution adapters (R4 drip) --------------------------------
//
// The platform adapters the CLI's `docent drip tick` calls into. Exported
// from the package's main entry so a third-party tool can import the
// dispatcher (`runPlatformAdapter`) or a single adapter directly.

export {
  runPlatformAdapter,
  docentStudioAdapter,
  youtubeAdapter,
  vimeoAdapter,
  mastodonAdapter,
  blueskyAdapter,
} from './distribution';

export type {
  AdapterContext,
  AdapterResult,
  PlatformAdapter,
  NamedAdapter,
} from './distribution';

// ---------- Narrative-quality cascade (R2 assert --narrative) --------------
//
// Deterministic regex linter + LLM judges behind `docent assert --narrative`.
// Surfaced from the package main so a third-party tool can import the lint
// runner or wire its own judge provider via `@bjelser/core`.
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

// ---------- Score prompt (R9 — timeline-annotated music-gen) ----------------
//
// `buildScorePrompt` + the four provider adapters + the content-filter
// validator. The CLI's `docent score` and any third-party music-gen
// integration import from here.
export {
  buildScorePrompt,
  wordsInFilm,
  validatePromptBody,
  autofixPromptBody,
  renderTemplate,
  renderAiva,
  renderUdio,
  renderSuno,
  renderScorePrompt,
} from './score';
