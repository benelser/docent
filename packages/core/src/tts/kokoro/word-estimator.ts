// kokoroWordEstimator — R5 fallback that estimates word boundaries from a
// clip's overall duration. Kokoro does not return native alignment (its
// capability declares `nativeAlignment: 'none'`), but the silence-trim path
// gives us a clean `clipSeconds` for the spoken portion. This estimator
// splits the input text into words and assigns each word a proportional
// slice of that interval, weighted by syllable count + a small pause budget
// at punctuation breaks.
//
// KPI from the research DAG: estimated boundaries within ±50ms of true
// boundaries for most words. This is a v1 approximation — not WhisperX —
// but it is enough for the karaoke-style passage reveal where the eye
// tolerates a few hundred milliseconds of slop and the word's reveal "just
// before the speaker says it" reads as anticipatory rather than wrong.
//
// Limitations (logged in friction notes):
//   - Latin / space-delimited scripts only. CJK, Thai, Khmer (no inter-word
//     whitespace) fall back to a single "word" spanning the whole clip.
//   - No per-syllable for Japanese / Chinese — the morphology layer needed
//     to do that is out of scope for v1.

import type {WordAlignment} from '@bjelser/kit';

/** Heuristic syllable count — vowel-group runs in a word.
 * Latin-script approximation; lower-bounds at 1 for short words. */
const estimateSyllables = (word: string): number => {
  const cleaned = word.toLowerCase().replace(/[^a-zà-ÿ]/gi, '');
  if (cleaned.length === 0) return 1;
  const groups = cleaned.match(/[aeiouyà-ÿ]+/g);
  let count = groups ? groups.length : 1;
  // Silent trailing e — "bake" is 1 syllable, not 2.
  if (cleaned.length > 3 && cleaned.endsWith('e')) {
    count = Math.max(1, count - 1);
  }
  return Math.max(1, count);
};

/** Tokenise input text into words while preserving punctuation as trailing
 * markers (so we can weight a comma / period with a pause budget). */
interface Token {
  /** The bare word text (no punctuation). */
  text: string;
  /** Whether this token is followed by sentence-final punctuation. */
  hardPause: boolean;
  /** Whether this token is followed by clause-internal punctuation. */
  softPause: boolean;
}

const tokenise = (text: string): Token[] => {
  const tokens: Token[] = [];
  // Match runs of non-whitespace, then look at the trailing punctuation.
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    // Strip leading/trailing punctuation, recording its presence.
    const bareMatch = raw.match(/^[^\w'’-]*([\w'’-]+(?:[\w'’-]+)*)([^\w'’-]*)$/);
    let bare: string;
    let trailing: string;
    if (bareMatch) {
      bare = bareMatch[1] ?? raw;
      trailing = bareMatch[2] ?? '';
    } else {
      bare = raw;
      trailing = '';
    }
    if (bare.length === 0) continue;
    const hardPause = /[.!?]/.test(trailing);
    const softPause = !hardPause && /[,;:—–\-]/.test(trailing);
    tokens.push({text: bare, hardPause, softPause});
  }
  return tokens;
};

/** Options accepted by {@link kokoroWordEstimator}. */
export interface KokoroWordEstimatorOptions {
  /**
   * The leading silence in ms the silence-trim path reports; word timings
   * start AT clip-zero (post-trim), so this is informational. We keep the
   * signature in case a future revision wants to anchor.
   */
  readonly leadingSilenceMs?: number;
  /** ms of breath at a hard sentence break. Default 220. */
  readonly hardPauseMs?: number;
  /** ms of breath at a clause-internal break. Default 90. */
  readonly softPauseMs?: number;
}

const DEFAULT_HARD_PAUSE = 220;
const DEFAULT_SOFT_PAUSE = 90;

/**
 * Estimate word-level boundaries for a kokoro-synthesised clip.
 *
 * Returns an empty array when:
 *   - `text` is empty or whitespace-only;
 *   - `clipMs` is non-positive (a no-audio beat);
 *   - the text contains no space-delimited words (likely CJK input).
 *
 * Otherwise returns one {@link WordAlignment} per word with `startMs`/`endMs`
 * in clip-relative milliseconds.
 */
export const kokoroWordEstimator = (
  text: string,
  clipMs: number,
  opts: KokoroWordEstimatorOptions = {},
): WordAlignment[] => {
  if (!text || clipMs <= 0) return [];
  const tokens = tokenise(text);
  if (tokens.length === 0) return [];
  // CJK escape hatch — if the text is mostly non-Latin and tokenise found
  // exactly one token spanning everything (no internal whitespace), bail.
  const nonLatin = /[　-鿿가-힯]/;
  if (tokens.length === 1 && nonLatin.test(text)) return [];

  const hardPauseMs = opts.hardPauseMs ?? DEFAULT_HARD_PAUSE;
  const softPauseMs = opts.softPauseMs ?? DEFAULT_SOFT_PAUSE;

  // First pass — compute the unweighted "work" per token (syllables) +
  // the pause budget claimed by trailing punctuation.
  const syllables = tokens.map((t) => estimateSyllables(t.text));
  const totalSyllables = syllables.reduce((a, b) => a + b, 0);

  // Pause budget — sum across all tokens.
  let pauseBudget = 0;
  for (const t of tokens) {
    if (t.hardPause) pauseBudget += hardPauseMs;
    else if (t.softPause) pauseBudget += softPauseMs;
  }
  // Floor the pause budget at <=40% of clip so we never starve speech.
  pauseBudget = Math.min(pauseBudget, clipMs * 0.4);
  const speechBudget = Math.max(1, clipMs - pauseBudget);

  // Per-syllable ms — the rate the model is speaking at.
  const msPerSyllable = speechBudget / totalSyllables;

  const result: WordAlignment[] = [];
  let cursor = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const duration = Math.max(1, Math.round(syllables[i]! * msPerSyllable));
    const startMs = Math.round(cursor);
    const endMs = Math.round(cursor + duration);
    result.push({text: t.text, startMs, endMs});
    cursor += duration;
    if (t.hardPause) cursor += hardPauseMs;
    else if (t.softPause) cursor += softPauseMs;
  }
  // Clamp the last endMs to clipMs so a small accumulation error doesn't
  // run past the audio.
  const last = result[result.length - 1];
  if (last && last.endMs > clipMs) {
    result[result.length - 1] = {...last, endMs: Math.round(clipMs)};
  }
  return result;
};
