// @bjelser/core/narrative-quality — the deterministic + LLM cascade
// for `docent assert --narrative`. The cascade has two halves:
//
//   - lint-rules.ts  — the regex linter (zero tokens, runs in CI).
//   - noop-judge.ts  — the safe-default judge provider.
//
// Real judge providers live in their own packages (e.g.
// `@bjelser/tts-openai/judges`) and register through a feature plugin.

export * from './lint-rules';
export {noopJudgeProvider} from './noop-judge';
