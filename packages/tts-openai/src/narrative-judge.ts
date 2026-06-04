// openaiNarrativeJudgeProvider — the real (LLM-backed) judge provider for
// `docent assert --narrative --judges`.
//
// Defaults to gpt-4o-mini (cheap, fast, accurate enough for this surface;
// see friction notes on per-render cost). The prompts + parsers live in
// `@bjelser/kit/judges` so a third-party provider can reuse them rather
// than re-derive them.
//
// Credentials: OPENAI_API_KEY env var. Without it, `judge()` returns
// `skipped: true` so the CLI can keep running.

import type {
  JudgeInput,
  JudgeOutput,
  NarrativeJudgeProvider,
} from '@bjelser/kit';
import {
  VOICE_JUDGE_SYSTEM,
  ACCURACY_JUDGE_SYSTEM,
  VIZ_PLACEMENT_JUDGE_SYSTEM,
  buildVoiceJudgePrompt,
  buildAccuracyJudgePrompt,
  buildVizPlacementJudgePrompt,
  parseVoiceJudge,
  parseAccuracyJudge,
  parseVizPlacementJudge,
} from '@bjelser/kit';

// Lazy-load the openai client — keeps the kit boot fast when only the
// lint half runs.
let _openaiClient: any | null = null;
let _openaiApiKey: string | null = null;

const loadOpenAI = async (apiKey: string, baseURL?: string): Promise<any> => {
  if (_openaiClient && _openaiApiKey === apiKey) return _openaiClient;
  let mod: any;
  try {
    mod = await import('openai');
  } catch {
    throw new Error('openai npm package required — bun add openai');
  }
  const OpenAI = mod.OpenAI ?? mod.default;
  if (!OpenAI) throw new Error('openai sdk does not export OpenAI constructor');
  _openaiClient = new OpenAI({apiKey, ...(baseURL ? {baseURL} : {})});
  _openaiApiKey = apiKey;
  return _openaiClient;
};

export interface OpenAINarrativeJudgeOptions {
  /** Defaults to env `OPENAI_API_KEY`. */
  readonly apiKey?: string;
  /** Defaults to `'gpt-4o-mini'`. */
  readonly model?: string;
  /** Defaults to env `OPENAI_BASE_URL`. */
  readonly baseURL?: string;
}

export const createOpenAINarrativeJudge = (
  opts: OpenAINarrativeJudgeOptions = {},
): NarrativeJudgeProvider => {
  const apiKey =
    opts.apiKey ?? (typeof process !== 'undefined' ? process.env.OPENAI_API_KEY : undefined);
  const baseURL =
    opts.baseURL ?? (typeof process !== 'undefined' ? process.env.OPENAI_BASE_URL : undefined);
  const model = opts.model ?? 'gpt-4o-mini';

  return {
    providerId: 'openai',
    displayName: `openai-${model}`,
    async judge(input: JudgeInput): Promise<JudgeOutput> {
      if (!apiKey) {
        // Skip cleanly when no API key is configured; the verdict
        // aggregator treats this as a warn, not a pass.
        if (input.kind === 'voice') {
          return {
            kind: 'voice',
            skipped: true,
            skippedReason: 'OPENAI_API_KEY not set',
            authentic: true,
            drift: null,
            evidence: [],
          };
        }
        if (input.kind === 'accuracy') {
          return {
            kind: 'accuracy',
            skipped: true,
            skippedReason: 'OPENAI_API_KEY not set',
            consistent: true,
            mismatches: [],
          };
        }
        return {
          kind: 'viz-placement',
          skipped: true,
          skippedReason: 'OPENAI_API_KEY not set',
          redundant: false,
        };
      }

      const client = await loadOpenAI(apiKey, baseURL);
      const system =
        input.kind === 'voice'
          ? VOICE_JUDGE_SYSTEM
          : input.kind === 'accuracy'
            ? ACCURACY_JUDGE_SYSTEM
            : VIZ_PLACEMENT_JUDGE_SYSTEM;
      const user =
        input.kind === 'voice'
          ? buildVoiceJudgePrompt(input)
          : input.kind === 'accuracy'
            ? buildAccuracyJudgePrompt(input)
            : buildVizPlacementJudgePrompt(input);

      let raw = '';
      try {
        const resp = await client.chat.completions.create({
          model,
          messages: [
            {role: 'system', content: system},
            {role: 'user', content: user},
          ],
          response_format: {type: 'json_object'},
          temperature: 0,
          max_tokens: 300,
        });
        raw = resp.choices?.[0]?.message?.content ?? '';
      } catch (err) {
        // Network / quota failure — surface as a skip, do not throw.
        const reason = err instanceof Error ? err.message : String(err);
        if (input.kind === 'voice') {
          return {
            kind: 'voice',
            skipped: true,
            skippedReason: `openai error: ${reason}`,
            authentic: true,
            drift: null,
            evidence: [],
          };
        }
        if (input.kind === 'accuracy') {
          return {
            kind: 'accuracy',
            skipped: true,
            skippedReason: `openai error: ${reason}`,
            consistent: true,
            mismatches: [],
          };
        }
        return {
          kind: 'viz-placement',
          skipped: true,
          skippedReason: `openai error: ${reason}`,
          redundant: false,
        };
      }

      if (input.kind === 'voice') return parseVoiceJudge(raw, input);
      if (input.kind === 'accuracy') return parseAccuracyJudge(raw, input);
      return parseVizPlacementJudge(raw, input);
    },
  };
};

export const openaiNarrativeJudgeProvider = createOpenAINarrativeJudge();
