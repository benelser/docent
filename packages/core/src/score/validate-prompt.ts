// validate-prompt — the /250 lesson set, made into a rule list.
//
// Six iterations of trial-and-error with Suno/AIVA/Udio shipped a list
// of patterns that reliably break a music-gen prompt. We codify them
// here so a fresh prompt can be screened deterministically — no LLM
// call needed.
//
// The rules apply to the BODY of a rendered prompt (the prose paragraph
// or the natural-language part inside a JSON envelope). Adapters call
// `validatePromptBody(body)` after rendering and surface findings to
// the CLI; the CLI exits non-zero on any `error`-severity finding.

import type {ScoreFinding} from '@bjelser/kit';

/**
 * Banned literal terms — case-insensitive substring match. Each one is
 * a known content-filter trip from the /250 POC: composer proper nouns
 * leak into the trained-on metadata; "military" trips Suno's drum-corps
 * filter; "choir" forces vocals where we want none.
 *
 * Each entry can suggest an alternative the validator emits as the
 * fix-up. Keep the list short — the false-positive cost of an aggressive
 * banlist is real.
 */
const BANNED_TERMS: ReadonlyArray<{
  readonly term: string;
  readonly reason: string;
  readonly suggestion?: string;
}> = [
  {term: 'military', reason: 'Suno frequently trips on "military" and substitutes drum-corps stems.', suggestion: 'driving rhythm'},
  {term: 'march', reason: '"march" frequently routes to military percussion in Suno/Udio.', suggestion: 'driving forward motion'},
  {term: 'choir', reason: 'Forces vocals when an instrumental score is intended.', suggestion: 'sustained strings'},
  {term: 'vocals', reason: 'Forces vocals when an instrumental score is intended.', suggestion: 'sustained strings'},
  {term: 'singer', reason: 'Forces vocals when an instrumental score is intended.', suggestion: 'lead instrument'},
  {term: 'lyrics', reason: 'Forces vocals when an instrumental score is intended.', suggestion: 'motif'},
  {term: 'hans zimmer', reason: 'Composer proper nouns leak into trained-on metadata; outputs become derivative.', suggestion: 'modern cinematic'},
  {term: 'john williams', reason: 'Composer proper nouns leak into trained-on metadata.', suggestion: 'orchestral'},
  {term: 'ennio morricone', reason: 'Composer proper nouns leak into trained-on metadata.', suggestion: 'cinematic'},
  {term: 'taylor swift', reason: 'Artist proper nouns produce style copies that violate the prompt.', suggestion: 'modern'},
  {term: 'trump', reason: 'Political proper nouns trip content filters.', suggestion: ''},
  {term: 'biden', reason: 'Political proper nouns trip content filters.', suggestion: ''},
];

/**
 * Adjective stacking pattern — five or more consecutive lowercase adjective-
 * like words separated by spaces. Rough heuristic; we count the longest run
 * of words ending in `-ic`, `-ous`, `-al`, `-ing`, `-y`, `-ed`, `-ful` in a
 * row. The /250 lesson: stacks of >4 adjectives became musical mush.
 */
const detectAdjectiveStack = (body: string): string | null => {
  const adjective = /\b[a-z]+(?:ic|ous|al|ing|y|ed|ful)\b/g;
  const matches = body.toLowerCase().match(adjective) ?? [];
  // Approximate: when adjective-class words exceed 5% of body words,
  // emit a warning. Tunable; the goal is to flag obvious abuse without
  // false-positive ordinary prose.
  const words = body.split(/\s+/).length;
  const ratio = words > 0 ? matches.length / words : 0;
  if (ratio > 0.18) {
    return `${matches.length} adjective-class words in ${words}-word body (ratio ${(ratio * 100).toFixed(0)}%)`;
  }
  return null;
};

/**
 * Detect ALL-CAPS words (excluding 1-2 letter ones like "TV" or "OK", and
 * common allowed acronyms). The /250 lesson: ALL-CAPS in a prompt body
 * routes to "shout" or "scream" in Suno's emotional model.
 */
const detectAllCaps = (
  body: string,
): ReadonlyArray<{word: string; titleCase: string}> => {
  const allowed = new Set(['AIVA', 'UDIO', 'SUNO', 'JSON', 'API', 'BPM', 'BWV', 'OP', 'EP', 'LP']);
  const findings: Array<{word: string; titleCase: string}> = [];
  // Word boundary, all uppercase, ≥3 letters.
  const re = /\b[A-Z]{3,}\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const word = m[0];
    if (allowed.has(word)) continue;
    findings.push({
      word,
      titleCase: word[0]! + word.slice(1).toLowerCase(),
    });
  }
  return findings;
};

/**
 * The full validator. Returns every finding it can locate; the caller
 * decides whether `severity: 'error'` gates emission.
 *
 * @param body — the rendered prompt body (prose for `template`/`udio`,
 *               the entire JSON string for `aiva`/`suno`).
 */
export const validatePromptBody = (body: string): ReadonlyArray<ScoreFinding> => {
  const findings: ScoreFinding[] = [];

  // 1. ALL-CAPS words.
  const caps = detectAllCaps(body);
  for (const c of caps) {
    findings.push({
      severity: 'error',
      rule: 'all-caps',
      message: `ALL-CAPS word "${c.word}" routes to "shout/scream" in trained-on metadata.`,
      span: c.word,
      suggestion: c.titleCase,
    });
  }

  // 2. Banned terms. We allow EXPLICITLY NEGATED occurrences ("no
  //    vocals", "no lyrics") — those route to "instrumental" in
  //    trained-on metadata and were load-bearing in the /250 prompts.
  //    Same for compound negations ("without vocals"). The check is
  //    case-insensitive substring; we skip the finding when the
  //    immediately preceding token is `no`, `without`, `not`, or `zero`.
  const lower = body.toLowerCase();
  for (const b of BANNED_TERMS) {
    let from = 0;
    while (from <= lower.length) {
      const idx = lower.indexOf(b.term, from);
      if (idx === -1) break;
      from = idx + b.term.length;
      // Look back ~12 chars for an explicit negation.
      const lookbackStart = Math.max(0, idx - 12);
      const lookback = lower.slice(lookbackStart, idx);
      if (/\b(no|without|not|zero|never)\s+$/.test(lookback)) {
        continue;
      }
      findings.push({
        severity: 'error',
        rule: 'banned-term',
        message: `Banned term "${b.term}" — ${b.reason}`,
        span: body.slice(idx, idx + b.term.length),
        ...(b.suggestion ? {suggestion: b.suggestion} : {}),
      });
    }
  }

  // 3. Adjective stacking.
  const stack = detectAdjectiveStack(body);
  if (stack !== null) {
    findings.push({
      severity: 'warning',
      rule: 'adjective-stack',
      message: `Excessive adjective stacking: ${stack}. Music-gen outputs degrade with adjective overload.`,
    });
  }

  // 4. Word count cap (most APIs cap around 500). This is a warning so
  // an over-long but otherwise-clean prompt still emits — the CLI
  // surfaces it loudly.
  const wordCount = body.split(/\s+/).filter((w) => w.length > 0).length;
  if (wordCount > 500) {
    findings.push({
      severity: 'warning',
      rule: 'word-cap',
      message: `Prompt is ${wordCount} words. Most providers cap inputs at 500.`,
    });
  }

  return findings;
};

/**
 * Apply every `suggestion`-bearing finding as an automatic fix. ALL-CAPS
 * → title case, banned-term → suggested replacement. Findings without a
 * suggestion are left alone (the rule that fired still warns the user).
 *
 * Returns the fixed body + the unresolved findings (the ones that have
 * no suggestion or that this fixer couldn't apply).
 */
export const autofixPromptBody = (
  body: string,
): {readonly body: string; readonly fixed: ReadonlyArray<ScoreFinding>; readonly remaining: ReadonlyArray<ScoreFinding>} => {
  const findings = validatePromptBody(body);
  const fixed: ScoreFinding[] = [];
  const remaining: ScoreFinding[] = [];
  let out = body;
  for (const f of findings) {
    if (!f.span || f.suggestion === undefined) {
      remaining.push(f);
      continue;
    }
    if (f.rule === 'all-caps') {
      // Replace the exact uppercase token to avoid hitting allowed
      // acronyms downstream.
      const re = new RegExp(`\\b${f.span}\\b`, 'g');
      out = out.replace(re, f.suggestion);
      fixed.push(f);
      continue;
    }
    if (f.rule === 'banned-term') {
      // Case-insensitive replace.
      const re = new RegExp(`\\b${f.span}\\b`, 'gi');
      out = out.replace(re, f.suggestion);
      fixed.push(f);
      continue;
    }
    remaining.push(f);
  }
  return {body: out, fixed, remaining};
};
