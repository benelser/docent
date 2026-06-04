// narrative-quality lint rules — the deterministic half of the narrative
// gate (`docent assert --narrative`).
//
// Pattern source: /ventures/gt/scripts/lib/eval (Metagame's essay linter).
// Adapted to docent's beat-level narration (one or two short sentences per
// beat, documentary register) and surfaced as a typed catalogue so the
// engine + CLI can iterate without baking the rule shapes into each
// caller.
//
// Two flavours of rule:
//   - BeatRule: runs on one beat's narration in isolation. Emits one or
//     more findings per rule per beat.
//   - SceneRule: runs across a scene's beats (cross-beat tics that no
//     single-beat check can see — repeated openers, anaphora across
//     consecutive beat narrations).
//
// Quote-exemption: every word-level matcher uses a word-boundary regex
// and strips ASCII (and curly) quoted spans first. That is the cheapest
// way to honour "actually" in a direct quote without flagging the
// narrator using "actually" as a filler. Tradeoff documented in the
// friction notes of the task spec.

// ----- types ---------------------------------------------------------------

export type Severity = 'error' | 'warn' | 'info';

export interface BeatLintFinding {
  readonly ruleId: string;
  readonly severity: Severity;
  readonly sceneIndex: number;
  readonly beatIndex: number;
  readonly /** The matched text (or short summary for non-string rules). */ match: string;
  readonly /** Deterministic suggested fix when available; otherwise empty. */ suggestion: string;
}

export interface BeatLintInput {
  readonly sceneIndex: number;
  readonly beatIndex: number;
  readonly narration: string;
}

export interface SceneLintInput {
  readonly sceneIndex: number;
  readonly beats: ReadonlyArray<{readonly beatIndex: number; readonly narration: string}>;
}

export interface BeatRule {
  readonly id: string;
  readonly description: string;
  readonly severity: Severity;
  /** Returns zero, one, or many findings per beat. */
  readonly check: (input: BeatLintInput) => BeatLintFinding[];
}

export interface SceneRule {
  readonly id: string;
  readonly description: string;
  readonly severity: Severity;
  readonly check: (input: SceneLintInput) => BeatLintFinding[];
}

// ----- quote-stripping helper ---------------------------------------------

/**
 * Strip ASCII + curly-quoted spans. The deterministic exemption: a beat
 * that *quotes* a banned word is not a beat that *uses* it. The matcher
 * works at the character level (greedy match on the open-close pair) so
 * a beat like `the engineer said "actually, totally agree"` survives the
 * `actually` / `totally` checks but still gets matched on any banned
 * words *outside* the quotes.
 */
export const stripQuotes = (text: string): string =>
  text
    .replace(/"[^"]*"/g, ' ')
    .replace(/“[^”]*”/g, ' ')
    .replace(/‘[^’]*’/g, ' ');

// ----- pattern catalogues --------------------------------------------------

const FILLER_TRANSITIONS_WORDS = [
  'totally',
  'obviously',
  'actually',
  'literally',
  'frankly',
  'essentially',
  'basically',
] as const;

const HEDGE_WORDS_PATTERNS: Array<{readonly word: string; readonly pattern: RegExp}> = [
  {word: 'kind of', pattern: /\bkind of\b/gi},
  {word: 'sort of', pattern: /\bsort of\b/gi},
  {word: 'i think', pattern: /\bi think\b/gi},
  {word: 'maybe', pattern: /\bmaybe\b/gi},
  {word: 'perhaps', pattern: /\bperhaps\b/gi},
  {word: 'might be', pattern: /\bmight be\b/gi},
];

const BANNED_INTENSIFIER_WORDS: Array<{readonly word: string; readonly pattern: RegExp}> = [
  // Caveat: the pattern is conservative — it flags every occurrence and
  // leaves the human to confirm. "very large" is the case it catches;
  // "every very" (which would be a typo) it never sees.
  {word: 'very', pattern: /\bvery\b/gi},
  {word: 'really', pattern: /\breally\b/gi},
  {word: 'just', pattern: /\bjust\b/gi},
];

const FILLER_OPENERS: ReadonlyArray<{readonly opener: string; readonly pattern: RegExp}> = [
  {opener: 'This is', pattern: /^This is\b/},
  {opener: 'It is', pattern: /^It is\b/},
  {opener: 'It was', pattern: /^It was\b/},
  {opener: 'Let me explain', pattern: /^Let me explain\b/i},
  {opener: 'Now,', pattern: /^Now,/i},
];

// ----- helpers -------------------------------------------------------------

const allMatches = (text: string, pattern: RegExp): string[] => {
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[0]);
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
};

const trim = (s: string, n = 80): string => (s.length <= n ? s : s.slice(0, n - 3) + '...');

const firstWord = (s: string): string | null => {
  const m = s.trim().match(/^([A-Za-z][\w'-]*)/);
  return m ? m[1]!.toLowerCase() : null;
};

const splitSentences = (s: string): string[] =>
  s
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

// ----- the beat rules ------------------------------------------------------

export const fillerTransitionsRule: BeatRule = {
  id: 'filler-transitions',
  description:
    'Flag filler intensifiers (totally, obviously, actually, ...) outside of quoted speech.',
  severity: 'warn',
  check({sceneIndex, beatIndex, narration}) {
    const stripped = stripQuotes(narration);
    const findings: BeatLintFinding[] = [];
    for (const word of FILLER_TRANSITIONS_WORDS) {
      // word-boundary, case-insensitive
      const pattern = new RegExp(`\\b${word}\\b`, 'gi');
      for (const m of allMatches(stripped, pattern)) {
        findings.push({
          ruleId: 'filler-transitions',
          severity: 'warn',
          sceneIndex,
          beatIndex,
          match: m,
          suggestion: `delete "${m}" — adds no information`,
        });
      }
    }
    return findings;
  },
};

export const hedgeWordsRule: BeatRule = {
  id: 'hedge-words',
  description: 'Flag hedge phrases that soften a claim without earning it (kind of, sort of, ...).',
  severity: 'info',
  check({sceneIndex, beatIndex, narration}) {
    const stripped = stripQuotes(narration);
    const findings: BeatLintFinding[] = [];
    for (const {word, pattern} of HEDGE_WORDS_PATTERNS) {
      for (const m of allMatches(stripped, pattern)) {
        findings.push({
          ruleId: 'hedge-words',
          severity: 'info',
          sceneIndex,
          beatIndex,
          match: m,
          suggestion: `commit or cut — "${word}" weakens the line`,
        });
      }
    }
    return findings;
  },
};

export const bannedIntensifiersRule: BeatRule = {
  id: 'banned-words',
  description: 'Flag low-content intensifiers (very, really, just) used as throat-clearing.',
  severity: 'info',
  check({sceneIndex, beatIndex, narration}) {
    const stripped = stripQuotes(narration);
    const findings: BeatLintFinding[] = [];
    for (const {word, pattern} of BANNED_INTENSIFIER_WORDS) {
      for (const m of allMatches(stripped, pattern)) {
        findings.push({
          ruleId: 'banned-words',
          severity: 'info',
          sceneIndex,
          beatIndex,
          match: m,
          suggestion: `consider deleting "${word}" — the next noun usually carries the weight on its own`,
        });
      }
    }
    return findings;
  },
};

export const fillerOpenersRule: BeatRule = {
  id: 'filler-openers',
  description:
    'Flag beats that start with throat-clearing openers ("This is", "Let me explain", "Now,").',
  severity: 'warn',
  check({sceneIndex, beatIndex, narration}) {
    const trimmedStart = narration.trimStart();
    if (!trimmedStart) return [];
    for (const {opener, pattern} of FILLER_OPENERS) {
      if (pattern.test(trimmedStart)) {
        return [
          {
            ruleId: 'filler-openers',
            severity: 'warn',
            sceneIndex,
            beatIndex,
            match: trim(trimmedStart, 60),
            suggestion: `start with the subject; "${opener}" eats the opening slot`,
          },
        ];
      }
    }
    return [];
  },
};

export const exclamationMarksRule: BeatRule = {
  id: 'exclamation-marks',
  description: 'Flag exclamation marks — they break the documentary register.',
  severity: 'warn',
  check({sceneIndex, beatIndex, narration}) {
    const stripped = stripQuotes(narration);
    const matches = allMatches(stripped, /!/g);
    if (matches.length === 0) return [];
    return [
      {
        ruleId: 'exclamation-marks',
        severity: 'warn',
        sceneIndex,
        beatIndex,
        match: `${matches.length} exclamation mark${matches.length === 1 ? '' : 's'}`,
        suggestion: 'let the sentence land without the punctuation cue',
      },
    ];
  },
};

export const anaphoraOverloadRule: BeatRule = {
  id: 'anaphora-overload',
  description: '3+ consecutive sentences in one beat starting with the same word.',
  severity: 'warn',
  check({sceneIndex, beatIndex, narration}) {
    const sentences = splitSentences(narration);
    if (sentences.length < 3) return [];
    // Skip common articles / connectives that aren't true anaphora.
    const skip = new Set([
      'the',
      'a',
      'an',
      'it',
      'this',
      'that',
      'you',
      'we',
      'they',
      'i',
      'and',
      'but',
      'or',
      'if',
      'when',
      'in',
      'on',
      'for',
      'to',
      'no',
    ]);
    const findings: BeatLintFinding[] = [];
    for (let i = 0; i <= sentences.length - 3; i++) {
      const w1 = firstWord(sentences[i]!);
      const w2 = firstWord(sentences[i + 1]!);
      const w3 = firstWord(sentences[i + 2]!);
      if (!w1 || !w2 || !w3) continue;
      if (w1 === w2 && w2 === w3 && !skip.has(w1)) {
        findings.push({
          ruleId: 'anaphora-overload',
          severity: 'warn',
          sceneIndex,
          beatIndex,
          match: `3 sentences open with "${w1}"`,
          suggestion: 'vary the openings — anaphora as accident reads as a tic',
        });
        break; // one finding per beat
      }
    }
    return findings;
  },
};

// ----- the scene rules -----------------------------------------------------

export const structuralTicsRule: SceneRule = {
  id: 'structural-tics',
  description:
    'Consecutive beats opening with the same connective ("So", "But", "Now") inside one scene.',
  severity: 'warn',
  check({sceneIndex, beats}) {
    if (beats.length < 2) return [];
    const findings: BeatLintFinding[] = [];
    // Only flag the *connectives* — true rhetorical tics. "the" / "it" are
    // load-bearing in legitimate prose; ignore them.
    const TIC_OPENERS = new Set(['so', 'but', 'now', 'and', 'or', 'also', 'then']);
    for (let i = 1; i < beats.length; i++) {
      const prev = firstWord(beats[i - 1]!.narration);
      const here = firstWord(beats[i]!.narration);
      if (prev && here && prev === here && TIC_OPENERS.has(here)) {
        findings.push({
          ruleId: 'structural-tics',
          severity: 'warn',
          sceneIndex,
          beatIndex: beats[i]!.beatIndex,
          match: `beat opens with "${here}" — same as beat ${beats[i - 1]!.beatIndex}`,
          suggestion: 'vary the connective — repeated openers read as a tic',
        });
      }
    }
    return findings;
  },
};

// ----- registries ----------------------------------------------------------

export const BEAT_LINT_RULES: ReadonlyArray<BeatRule> = [
  fillerTransitionsRule,
  hedgeWordsRule,
  bannedIntensifiersRule,
  fillerOpenersRule,
  exclamationMarksRule,
  anaphoraOverloadRule,
];

export const SCENE_LINT_RULES: ReadonlyArray<SceneRule> = [structuralTicsRule];

// ----- the runner ----------------------------------------------------------

export interface LintFilmInput {
  readonly scenes: ReadonlyArray<{
    readonly sceneIndex: number;
    readonly type?: string;
    readonly heading?: string;
    readonly beats: ReadonlyArray<{readonly beatIndex: number; readonly narration: string}>;
  }>;
}

export interface LintFilmResult {
  readonly findings: ReadonlyArray<BeatLintFinding>;
  readonly totalBeats: number;
  readonly perRule: Readonly<Record<string, number>>;
}

/**
 * Run every beat rule + every scene rule over the supplied film. Returns a
 * flat list of findings and a per-rule tally for the verdict aggregator.
 */
export const lintFilmNarration = (input: LintFilmInput): LintFilmResult => {
  const findings: BeatLintFinding[] = [];
  let totalBeats = 0;
  for (const scene of input.scenes) {
    for (const beat of scene.beats) {
      if (!beat.narration) continue;
      totalBeats++;
      for (const rule of BEAT_LINT_RULES) {
        findings.push(...rule.check({sceneIndex: scene.sceneIndex, beatIndex: beat.beatIndex, narration: beat.narration}));
      }
    }
    for (const rule of SCENE_LINT_RULES) {
      findings.push(
        ...rule.check({
          sceneIndex: scene.sceneIndex,
          beats: scene.beats.filter((b) => Boolean(b.narration)),
        }),
      );
    }
  }
  const perRule: Record<string, number> = {};
  for (const f of findings) perRule[f.ruleId] = (perRule[f.ruleId] ?? 0) + 1;
  return {findings, totalBeats, perRule};
};
