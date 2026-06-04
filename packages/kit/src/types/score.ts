// Score prompt IR — the cross-provider intermediate representation a docent
// film exports to a music-generation API.
//
// R9 lives downstream of the schedule + the (optional) persisted TTS
// manifest: given the same inputs every other cascade stage already sees,
// the engine emits a *timeline-annotated* prompt — "at 12 s the strings
// layer; at 47 s a single thundering boom; resolve at 88 s." Provider
// adapters render the IR into the dialect each music-gen API accepts.
//
// The IR is intentionally provider-agnostic. It speaks in seconds, scene
// archetypes, and rhetorical moves — never in AIVA's mood enum, never in
// Udio's tag vocabulary. The dialect translation lives in the adapter.

/**
 * The closed set of providers the engine knows how to dialect-translate
 * the IR for. New providers register their own adapter; the IR stays
 * stable.
 *
 * - `template` — the generic 250-prompt shape. Plain prose. The lowest
 *   common denominator every music-gen API accepts. Default.
 * - `aiva`     — JSON envelope with `moods`, `key`, `tempo`, `genre`.
 * - `udio`     — plain prose + a tags array + structural section labels.
 * - `suno`     — JSON `{prompt, tags, makeInstrumental: true}`.
 */
export type ScoreProvider = 'template' | 'aiva' | 'udio' | 'suno';

/**
 * One scene's contribution to the score timeline. A `ScoreCue` is the
 * load-bearing unit the IR carries: where in the film, what's happening
 * cognitively, and what the music should DO there.
 *
 * `kind` discriminates the rhetorical move:
 *  - `open`        — film opening, the very first cue.
 *  - `develop`     — a scene that builds (structure, walkthrough).
 *  - `quantify`    — a measured claim arrives (quantities, chart).
 *  - `inflect`     — a cluster transition (e.g. tension → big-idea).
 *  - `boom`        — the single most rhetorically important moment.
 *  - `pull-back`   — a quiet beat before/after the boom.
 *  - `resolve`     — recap, fade.
 *  - `sustain`     — the default mid-film state.
 */
export type ScoreCueKind =
  | 'open'
  | 'develop'
  | 'quantify'
  | 'inflect'
  | 'boom'
  | 'pull-back'
  | 'resolve'
  | 'sustain';

/**
 * A single time-stamped cue. Absolute seconds, scene-anchored.
 */
export interface ScoreCue {
  /** Seconds from the start of the film. */
  readonly atSeconds: number;
  /** Cue type — drives the prompt phrase + adapter section tag. */
  readonly kind: ScoreCueKind;
  /** Scene index this cue is anchored to (for cross-reference). */
  readonly sceneIndex: number;
  /** Scene `type` from the spec (e.g. `'tension'`, `'big-idea'`). */
  readonly sceneType: string;
  /**
   * Optional cluster from the registered ScenePlugin — null for chrome-only
   * scenes (`frame`, `recap`). Used by adapters to bias dialect.
   */
  readonly cluster: string | null;
  /**
   * The natural-language action the prompt should say happens at this
   * moment. Content-filter-safe (no ALL-CAPS, no banned terms). e.g.
   * `"strings slowly layer and build with growing momentum"`.
   */
  readonly action: string;
  /**
   * One-line rationale — the WHY behind the cue. Surfaced in `--verbose`
   * output and in comments inside JSON envelopes. e.g.
   * `"tension scene resolving into commitment — earn the boom"`.
   */
  readonly rationale: string;
}

/**
 * Film-level tone hint, derived from `style.intent.tone` (or `register`
 * when intent is absent). Drives the opening clause + the adapter's
 * mood/genre tag.
 *
 * - `grave`         — slow, deep brass, low strings, sparse.
 * - `urgent`        — driving rhythm, percussive.
 * - `calm`          — soft strings, sparse piano, no percussion.
 * - `playful`       — light, marimba/pizzicato, woodwinds.
 * - `cinematic`     — the default; full orchestra, hybrid drama.
 */
export type ScoreTone =
  | 'grave'
  | 'urgent'
  | 'calm'
  | 'playful'
  | 'cinematic';

/**
 * The full IR — every provider adapter consumes exactly this shape.
 * No provider-specific fields leak in.
 */
export interface ScorePrompt {
  /** Stable film id (matches `meta.id`). */
  readonly filmId: string;
  /** Film title — surfaced in adapter envelopes. */
  readonly title: string;
  /** Total film duration in seconds. */
  readonly durationSeconds: number;
  /** Frames-per-second of the source schedule. */
  readonly fps: number;
  /** Derived tone — drives instrument palette + opening clause. */
  readonly tone: ScoreTone;
  /** Ordered list of cues, ascending `atSeconds`. */
  readonly cues: ReadonlyArray<ScoreCue>;
  /**
   * Cluster transitions — pairs of `(prev, next)` cluster ids walked by
   * the cue stream. Used by adapters that want to emit explicit section
   * markers (Udio) and by the boom-alignment heuristic.
   */
  readonly clusterPath: ReadonlyArray<string>;
  /**
   * The single seconds-mark the boom lands on. Adapters MUST honour this
   * — Suno's `tags` includes `boom-{seconds}s`, Udio's section list pins
   * a `[peak]` here. `null` when the film has no eligible boom (no
   * `tension → big-idea | recap` transition exists).
   */
  readonly boomAtSeconds: number | null;
}

/**
 * One finding from the content-filter validator — the lesson set the
 * /250 trailer-music POC learned the hard way. A `severity: 'error'`
 * finding gates emission; `'warning'` is advisory.
 */
export interface ScoreFinding {
  /** Severity — `error` blocks emit, `warning` is advisory. */
  readonly severity: 'error' | 'warning';
  /** Short rule id (e.g. `'all-caps'`, `'banned-term'`). */
  readonly rule: string;
  /** Human-readable explanation of the finding. */
  readonly message: string;
  /** The offending substring, when locatable. */
  readonly span?: string;
  /** Suggested replacement, when one is available. */
  readonly suggestion?: string;
}

/**
 * The output of a single adapter's `render(prompt)` call. `body` is the
 * text the caller will paste into the provider's UI (or POST as JSON to
 * its API). `wordCount` is the narrative's word count — exposed so the
 * smoke tests can assert "< 500 words" without re-counting.
 *
 * `narrative` is the natural-language portion the content-filter
 * validator screens — for `template` it's the full body; for
 * `aiva`/`suno`/`udio` it's the prose paragraph inside the JSON
 * envelope. The validator MUST screen `narrative` rather than `body` so
 * legitimate JSON fields (e.g. AIVA's `forbid: ["vocals"]`) don't
 * trip the banned-term rule.
 */
export interface RenderedScorePrompt {
  /** Provider id this was rendered for. */
  readonly provider: ScoreProvider;
  /** The IR this was rendered from. */
  readonly prompt: ScorePrompt;
  /** The rendered body — plain prose for `template`, JSON for `aiva`/`udio`/`suno`. */
  readonly body: string;
  /** The natural-language portion of the body — what the validator screens. */
  readonly narrative: string;
  /** Word count of the narrative (the API-cap KPI). */
  readonly wordCount: number;
}
