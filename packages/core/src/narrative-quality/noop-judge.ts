// noopJudgeProvider — the safe default. Every call returns a "skipped"
// warning carrying its kind so the verdict aggregator can tally "no
// judge configured" rather than silently passing.
//
// Why this exists: the lint cascade should run end-to-end even when the
// user has not configured an LLM provider. The CLI prints
// "voice: SKIP (no judge provider configured)" instead of "voice: PASS"
// — the difference matters for CI gating.

import type {JudgeInput, JudgeOutput, NarrativeJudgeProvider} from '@bjelser/kit';

const SKIP_REASON = 'no judge provider configured — pass --judge-provider <id> to enable';

export const noopJudgeProvider: NarrativeJudgeProvider = {
  providerId: 'noop',
  displayName: 'noop',
  async judge(input: JudgeInput): Promise<JudgeOutput> {
    if (input.kind === 'voice') {
      return {
        kind: 'voice',
        skipped: true,
        skippedReason: SKIP_REASON,
        authentic: true,
        drift: null,
        evidence: [],
      };
    }
    if (input.kind === 'accuracy') {
      return {
        kind: 'accuracy',
        skipped: true,
        skippedReason: SKIP_REASON,
        consistent: true,
        mismatches: [],
      };
    }
    return {
      kind: 'viz-placement',
      skipped: true,
      skippedReason: SKIP_REASON,
      redundant: false,
    };
  },
};
