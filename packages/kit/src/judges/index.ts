// @bjelser/kit — narrative-quality judges (the prompt scaffolds the
// providers consume).
//
// What lives here: PROMPTS + SHAPES. The kit ships no LLM client and no
// network code; it just declares what a judge call looks like and
// supplies the system prompt + user-prompt builders a provider plugs
// into its model of choice. Both the noop provider (@bjelser/core) and
// the real openai provider (@bjelser/tts-openai) read these.
//
// Why split it out: the prompts are part of the *contract*. If they
// live in the openai provider, the noop provider drifts; if they live
// in core, third-party providers can't read them. The kit is the
// neutral place.

import type {
  JudgeInput,
  JudgeVoiceOutput,
  JudgeAccuracyOutput,
  JudgeVizPlacementOutput,
} from '../protocols';

// ----- system prompts ------------------------------------------------------

export const VOICE_JUDGE_SYSTEM = `You are a voice authenticity judge for short documentary-register narration. Read one beat at a time. Score whether it matches the surrounding cluster's register. The drift dimensions are: 'casual' (too chatty for the register), 'academic' (too dry), 'breathless' (too many exclamation-y intensifiers), 'flat' (no rhythm). Respond as compact JSON with shape: {"authentic": boolean, "drift": "casual"|"academic"|"breathless"|"flat"|null, "evidence": [<short quoted phrase from the beat>]}.`;

export const ACCURACY_JUDGE_SYSTEM = `You are a numeric-accuracy judge. Given a beat's narration and the surrounding scene's structured data (JSON), check whether numbers, names, and claims in the narration match the data. Respond as compact JSON with shape: {"consistent": boolean, "mismatches": [{"narrationClaim": string, "sceneTruth": string}]}. If there are no numeric claims in the narration, return consistent=true and empty mismatches.`;

export const VIZ_PLACEMENT_JUDGE_SYSTEM = `You are a redundancy judge. Given a beat's narration and the scene type (e.g. "structure", "quantities", "chart"), decide whether the narrator is saying what the visual already shows on screen. Return compact JSON: {"redundant": boolean, "redundantPhrase": string|null, "suggestion": string|null}. Be conservative — only mark redundant when the narration restates the diagram's labels rather than adding meaning on top.`;

// ----- user-prompt builders ------------------------------------------------

export const buildVoiceJudgePrompt = (input: JudgeInput): string => {
  const cluster = (input.sceneCluster ?? [])
    .filter((s) => s.trim() !== input.narration.trim())
    .slice(0, 4)
    .map((s, i) => `  ${i + 1}. ${s}`)
    .join('\n');
  const domain = input.domain
    ? `Film mode: ${input.domain.mode ?? '(unset)'} · register: ${input.domain.register ?? '(unset)'} · subject: ${input.domain.subject ?? '(unset)'}`
    : '';
  return `${domain}
Scene type: ${input.sceneType}${input.sceneHeading ? ` — "${input.sceneHeading}"` : ''}

Sibling beat narrations (the register to match):
${cluster || '  (no sibling beats)'}

Beat to judge:
  ${input.narration}
`;
};

export const buildAccuracyJudgePrompt = (input: JudgeInput): string => {
  const data = input.sceneData
    ? JSON.stringify(input.sceneData, null, 2)
    : '(no structured data on this scene)';
  return `Scene type: ${input.sceneType}${input.sceneHeading ? ` — "${input.sceneHeading}"` : ''}

Structured scene data the narration must match:
${data}

Beat narration to check for accuracy:
  ${input.narration}
`;
};

export const buildVizPlacementJudgePrompt = (input: JudgeInput): string =>
  `Scene type: ${input.sceneType}${input.sceneHeading ? ` — "${input.sceneHeading}"` : ''}

Beat narration:
  ${input.narration}

The visual for this scene type carries its own labels and structure.
Decide whether the narrator restates the on-screen labels (REDUNDANT) or
adds something the visual cannot say on its own (NOT REDUNDANT).
`;

// ----- response parsers ----------------------------------------------------

const tryParseJson = (raw: string): unknown => {
  // Models sometimes wrap JSON in ```json fences. Strip them.
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(stripped);
  } catch {
    // Try to find a JSON object inside the response.
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
};

/**
 * Parse a voice-judge model response into the typed output. Defensive —
 * a malformed JSON returns a "skipped" warn shape rather than throwing.
 */
export const parseVoiceJudge = (raw: string, input: JudgeInput): JudgeVoiceOutput => {
  const parsed = tryParseJson(raw) as Partial<JudgeVoiceOutput> | null;
  if (!parsed || typeof parsed.authentic !== 'boolean') {
    return {
      kind: 'voice',
      skipped: true,
      skippedReason: 'judge returned malformed JSON',
      authentic: true,
      drift: null,
      evidence: [],
      note: raw.slice(0, 200),
    };
  }
  const driftRaw = parsed.drift;
  const drift =
    driftRaw === 'casual' || driftRaw === 'academic' || driftRaw === 'breathless' || driftRaw === 'flat'
      ? driftRaw
      : null;
  return {
    kind: 'voice',
    authentic: parsed.authentic,
    drift,
    evidence: Array.isArray(parsed.evidence) ? parsed.evidence.slice(0, 3).map(String) : [],
  };
};

export const parseAccuracyJudge = (raw: string, input: JudgeInput): JudgeAccuracyOutput => {
  const parsed = tryParseJson(raw) as Partial<JudgeAccuracyOutput> | null;
  if (!parsed || typeof parsed.consistent !== 'boolean') {
    return {
      kind: 'accuracy',
      skipped: true,
      skippedReason: 'judge returned malformed JSON',
      consistent: true,
      mismatches: [],
      note: raw.slice(0, 200),
    };
  }
  const mismatches = Array.isArray(parsed.mismatches)
    ? parsed.mismatches
        .filter(
          (m): m is {narrationClaim: string; sceneTruth: string} =>
            !!m &&
            typeof (m as {narrationClaim?: unknown}).narrationClaim === 'string' &&
            typeof (m as {sceneTruth?: unknown}).sceneTruth === 'string',
        )
        .slice(0, 5)
    : [];
  return {kind: 'accuracy', consistent: parsed.consistent, mismatches};
};

export const parseVizPlacementJudge = (raw: string, input: JudgeInput): JudgeVizPlacementOutput => {
  const parsed = tryParseJson(raw) as Partial<JudgeVizPlacementOutput> | null;
  if (!parsed || typeof parsed.redundant !== 'boolean') {
    return {
      kind: 'viz-placement',
      skipped: true,
      skippedReason: 'judge returned malformed JSON',
      redundant: false,
      note: raw.slice(0, 200),
    };
  }
  const out: JudgeVizPlacementOutput = {
    kind: 'viz-placement',
    redundant: parsed.redundant,
    ...(typeof parsed.redundantPhrase === 'string' ? {redundantPhrase: parsed.redundantPhrase} : {}),
    ...(typeof parsed.suggestion === 'string' ? {suggestion: parsed.suggestion} : {}),
  };
  return out;
};
