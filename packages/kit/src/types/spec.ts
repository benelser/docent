// FilmSpec / Scene / Beat — the top-level film schema shape.
//
// **Forward-compat by design**: this file declares the SHAPE every film
// honours but is intentionally *blind* to per-scene-type fields. The kit
// never knows what fields a `mechanism` scene has, or a `walkthrough`. Each
// `ScenePlugin` contributes its own JSON Schema fragment and TS shape; the
// engine unions them at runtime via `Engine.schema()`.
//
// What lives here:
//   - `FilmSpec` — top-level shape with `meta`, `scenes`, optional `style`,
//     optional `tts`.
//   - `Scene` — discriminated by `type: string`. The `type` is the only
//     required field the kit knows about; everything else is plugin-owned.
//   - `Beat` — minimum-viable beat shape (id, narration, optional set/transform
//     directives). Scene plugins can refine the beat type they consume via
//     their `resolveBeat` hook.
//   - `FilmMeta` — the rendering-shape constants (id, title, duration,
//     resolution) the engine itself reads.
//
// Per the strategy doc §11.5: "the film spec JSON top-level shape" is
// CLOSED. Plugins add scene-type branches, not top-level keys.

import type {RenderStyleInput} from './style';

// ----- film meta ------------------------------------------------------------

/**
 * Film-level metadata. The pace knob is a film-wide default that any beat
 * can override (per {@link Beat.pace}). The `register` knob is the overall
 * mood — see the docent grammar doc for semantics.
 *
 * Authored by the spec author; consumed by the engine at multiple stages:
 * the schedule resolver reads `resolution` and `fps`; the TTS stage reads
 * `voice` and `tts`; the chrome scenes read `title` / `subtitle` /
 * `author`.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.7
 */
export interface FilmMeta {
  /** Stable id used as the filename and the Remotion composition id. */
  id: string;
  /** Human-readable title rendered in chrome (and in the README film index). */
  title: string;
  /** One-line subtitle; surfaced in the README and in the opening frame. */
  subtitle?: string;
  /** Author surface — credited in the closing recap. */
  author?: string;
  /** Voice id passed to the active TtsProvider. */
  voice?: string;
  /** Overall mood — biases scene defaults. */
  register?: FilmRegister;
  /**
   * Aspect ratio — picks the rendered canvas size:
   *  - `'16:9'`  → 1920x1080 (landscape, the default — every legacy film)
   *  - `'9:16'`  → 1080x1920 (portrait — phone-vertical / TikTok-shape)
   *  - `'1:1'`   → 1080x1080 (square — Instagram-feed shape)
   *
   * The composition reads this and resolves to the canvas dimensions; the
   * `useStage()` hook in `@bjelser/kit` then returns an aspect-aware STAGE
   * rectangle every scene renders inside. When absent, defaults to `'16:9'`
   * so every existing film renders identically.
   */
  aspect?: '16:9' | '9:16' | '1:1';
  /** Resolution overrides; defaults to 1920x1080 at 30fps. */
  resolution?: {
    width: number;
    height: number;
    fps?: number;
  };
  /**
   * TTS provider selection. When absent, the engine resolves to whichever
   * provider is registered with the well-known `kokoro` providerId, and
   * falls back to error if none.
   */
  tts?: FilmTtsConfig;
  /**
   * Translation provider selection + optional default target language.
   * When absent, the cascade falls back to the `'noop'` provider (which
   * passes narration through unchanged + warns once).
   *
   * `RenderOptions.lang` overrides `meta.translation.lang`; this field is
   * a convenience so a spec can declare its preferred target language
   * without requiring the CLI flag on every build.
   */
  translation?: FilmTranslationConfig;
  /**
   * The mode tag — used by the agent layer's prompts; the engine itself
   * doesn't branch on it but it survives in the spec.
   */
  mode?: 'pr' | 'ar' | 'ex' | string;
  /** A subsystem name passed through to scene components. */
  subsystem?: string;
  /**
   * Background-music bed. Read by the `audio-bed` feature plugin. The
   * value is a path resolved under the film's `<publicDir>/audio/` — so
   * `"theme.mp3"` resolves to `<publicDir>/audio/theme.mp3`. Absolute
   * paths under `public/` (e.g. `"audio/scores/sparse.mp3"`) and
   * absolute URLs (`https://…`) are also accepted; the feature passes
   * them to Remotion's `staticFile()` (or directly, for URLs).
   *
   * When absent the audio-bed feature is a no-op. When the path is set
   * but the file is missing, the feature warns at validate time and
   * skips mounting the bed at render time. Volume is film-wide and
   * ducks while per-beat narration is playing (see the feature).
   *
   * @see packages/core/src/features/audio-bed for the consumer.
   */
  music?: string;
  /**
   * **R10.4 — color space management.** The container-level color
   * metadata stamped on the rendered MP4 after Remotion writes it. The
   * kit does NOT change pixel colorimetry; the renderer still draws in
   * sRGB primaries with sRGB transfer. What this knob controls is the
   * tag inside the MP4's metadata block — what every downstream tool
   * believes the file is. Pro workflows (Resolve, Baselight) refuse to
   * trust an untagged file and ask the colorist to re-assign; streaming
   * platforms transcode with the wrong primaries assumed if the tag
   * disagrees with the stream. This field makes the tag explicit.
   *
   * Values:
   *  - `'srgb'` (default) — full-range sRGB, transfer `iec61966-2-1`.
   *    The consumer-tier ship — same as the current behavior.
   *  - `'rec709'` — SDR HD broadcast / streaming. Same primaries as
   *    sRGB but transfer `bt709`. The most common SDR standard.
   *  - `'rec2020'` — wide-gamut for HDR / 4K UHD delivery. With
   *    {@link hdr} false: transfer `bt2020-10`. With {@link hdr} true:
   *    transfer `smpte2084` (PQ) and HDR10 mastering metadata.
   *  - `'p3'` — DCI-P3 theatrical. Primaries `smpte432`, sRGB transfer.
   *
   * Honesty note: this is a **metadata-layer** tag only for v1. The
   * actual gamut of the rendered pixels is still sRGB. Best for pro
   * workflows where the colorist will re-conform anyway, and for
   * streaming platforms that want the right tag to skip a wrong-primaries
   * transcode.
   *
   * @see packages/kit/src/cascade/render-stage.ts for the ffmpeg tag pass.
   */
  colorSpace?: 'srgb' | 'rec709' | 'rec2020' | 'p3';
  /**
   * **R10.4 — HDR10 metadata.** When true AND {@link colorSpace} is
   * `'rec2020'`, the render stage re-encodes the file with x265 + HDR10
   * params: PQ transfer (`smpte2084`), limited range (`tv`), and a
   * mastering-display block + max_cll. Ignored for any other color
   * space (HDR10 is a Rec.2020 concept).
   *
   * Default `false`.
   */
  hdr?: boolean;
}

/**
 * The film-level mood knob. Defaults to `'neutral'`. Biases scene defaults
 * (pace, cadence, palette) at schedule-resolution time.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.7
 */
export type FilmRegister =
  | 'grave'
  | 'neutral'
  | 'calm'
  | 'urgent'
  | 'playful';

/**
 * TTS configuration carried on `meta.tts` (preferred) or top-level
 * `spec.tts` (legacy). The resolver merges; `meta.tts` wins on conflict.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.7
 */
export interface FilmTtsConfig {
  /** Matches a registered {@link TtsProviderPlugin}'s `providerId`. */
  provider?: string;
  /** Provider-specific model id (e.g. `'tts-1-hd'`). */
  model?: string;
  /** Pass-through provider-specific options. */
  providerOptions?: Record<string, unknown>;
  /**
   * When `true`, an unsatisfied `ScenePlugin.requiresTtsCapabilities` causes
   * resolution to throw. When `false` (default), it emits a warning.
   */
  strict?: boolean;
}

/**
 * Translation configuration carried on `meta.translation`. The cascade
 * reads `provider` to pick a TranslationProviderPlugin; `lang` is the
 * default target language when `RenderOptions.lang` is not set.
 *
 * See `docs/translation.md` for the full workflow.
 */
export interface FilmTranslationConfig {
  /** Matches a registered TranslationProviderPlugin's `providerId`. */
  provider?: string;
  /** Provider-specific model id (e.g. `'gpt-4o-mini'`). */
  model?: string;
  /** Default target language (ISO 639-1: `'es'`, `'fr'`, `'ja'`). */
  lang?: string;
  /** Pass-through provider-specific options. */
  providerOptions?: Record<string, unknown>;
}

// ----- scenes --------------------------------------------------------------

/**
 * The minimum shape every scene honours. `type` is the registry key. Every
 * other per-scene-type field is owned by the registered {@link ScenePlugin}
 * and validated by its `schema` / `validate` hooks.
 *
 * The `[key: string]: unknown` index signature is deliberate: plugins
 * contribute open shape; the kit refuses to bake in per-type fields. The
 * top-level shape stays stable forever; the union of scene branches grows
 * as plugins register.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.2 (ScenePlugin)
 */
export interface Scene {
  /** Discriminator value. Must match a registered `ScenePlugin.sceneType`. */
  type: string;
  /** Optional stable id used by inter-scene cross-references. */
  id?: string;
  /** Scene-level style override — Marp's `<style scoped>` analogue. */
  style?: RenderStyleInput;
  /**
   * Rhetorical archetype — the *narrative* function the scene performs,
   * cross-cutting with the scene `type`. Optional; absent = no archetype
   * nudge applied. A spec author tags a scene with the move it is making
   * ("this is a `mirror` — it reflects back what the reader just said")
   * and the engine resolves entrance shape, title scale, and accent
   * strength to honour that intent. Same archetype × different `variant`
   * produces visually distinct frames carrying the same meaning.
   *
   * @see {@link SceneArchetype}
   * @see resolveSceneVariant (in `frameworks/scene-variants.ts`)
   */
  archetype?: SceneArchetype;
  /**
   * Visual variant — the *visual* function (the treatment) the scene wears.
   * Optional; absent = `'standard'`. A `bold` variant cranks up scale and
   * accent; `minimal` strips chrome and softens entrance; `stacked` favours
   * a vertical layout (where the scene component honours it). Cross-cuts
   * with archetype: variant decides *how loud*, archetype decides
   * *what kind of move*.
   *
   * @see {@link SceneVariant}
   * @see resolveSceneVariant
   */
  variant?: SceneVariant;
  /**
   * Visual-regression overrides — read by `docent assert` to vary the
   * diff sensitivity scene-by-scene. The CLI `--threshold` flag is a
   * film-wide default; this knob narrows or widens it for the one scene
   * that needs different treatment.
   *
   * - `threshold` overrides the CLI default for this scene only.
   *   Recap-style text-heavy scenes are typically tightened to ~0.02;
   *   stochastic backgrounds (starfields, particles) are loosened.
   * - `maskRegions` zeroes out rectangles in BOTH the golden and the
   *   candidate before MAE is computed — the way to assert "everything
   *   but this random region" cleanly. Coordinates are in golden-image
   *   pixel space (the same `--compare-width` the differ decodes at).
   *
   * @see {@link SceneAssertConfig}
   */
  assert?: SceneAssertConfig;
  /**
   * Beat list. Required only when the scene type actually beats; chrome-only
   * scenes (e.g. `frame`, `recap`) may carry one synthetic beat or none.
   */
  beats?: Beat[];
  /** Plugin-owned fields. The kit treats these as opaque. */
  [key: string]: unknown;
}

/**
 * The closed set of rhetorical archetypes — the *narrative* moves a scene
 * can declare, orthogonal to its concrete `type`. Borrowed from the prior
 * /ventures/250 creative-work taxonomy and re-anchored to the docent
 * grammar: each archetype names a move ("this is the *turn*"; "this is
 * the *mirror*") that biases entrance shape, title scale, and accent
 * strength via {@link resolveSceneVariant}'s ARCHETYPE_NUDGE table.
 *
 * - `provocation` — the cold open: a claim that should arrest the reader.
 *   Pairs with `bold`/`snap` entrance.
 * - `turn` — the pivot: a "but" or "however" that changes direction.
 * - `question` — the open prompt; invites the reader to predict.
 * - `list` — an enumeration; the engine softens entrance to cascade.
 * - `history` — a backward look; pairs with a slower entrance.
 * - `mirror` — reflects back the reader's likely interpretation; softest
 *   entrance, smallest title.
 */
export type SceneArchetype =
  | 'provocation'
  | 'turn'
  | 'question'
  | 'list'
  | 'history'
  | 'mirror';

/**
 * The closed set of visual variants — the *treatment* a scene wears,
 * orthogonal to its archetype and concrete `type`. Borrowed from the
 * /ventures/250 visualStyle taxonomy.
 *
 * - `standard` — the default look, baseline title scale, fade entrance.
 * - `bold` — large title, opaque accents, snap entrance.
 * - `stacked` — vertical-leaning layout (scene components that honour it
 *   tighten gap density).
 * - `minimal` — small title, soft accent, kicker hidden, fade entrance.
 */
export type SceneVariant = 'standard' | 'bold' | 'stacked' | 'minimal';

/**
 * A rectangular region in compare-image pixel space — read by `docent
 * assert` to zero-out a stochastic patch in both the golden and the
 * candidate before MAE is computed. Coordinates are in the SAME pixel
 * space the differ decodes to (the `--compare-width` flag, default 480),
 * not the rendered 1920x1080.
 *
 * Origin is top-left. A region with `x: 0, y: 0, w: 100, h: 100` masks
 * the top-left 100x100 patch of the compare image.
 */
export interface SceneAssertMaskRegion {
  /** X coordinate, origin top-left. */
  x: number;
  /** Y coordinate, origin top-left. */
  y: number;
  /** Width in compare-image pixels. */
  w: number;
  /** Height in compare-image pixels. */
  h: number;
}

/**
 * Per-scene visual-regression overrides. Read by `docent assert` to vary
 * sensitivity scene-by-scene.
 *
 * @see Scene.assert
 */
export interface SceneAssertConfig {
  /**
   * Mean abs pixel-diff threshold in [0, 1] for THIS scene. Overrides the
   * CLI `--threshold` default. Tighter (e.g. 0.02) for text-heavy
   * scenes; looser (e.g. 0.10) for stochastic backgrounds.
   */
  threshold?: number;
  /**
   * Rectangles in compare-image pixel space that are zeroed out in BOTH
   * the golden and the candidate before MAE is computed. Use to mask
   * regions whose stochastic content (starfields, particle systems,
   * timestamps) is not under regression control.
   */
  maskRegions?: SceneAssertMaskRegion[];
}

// ----- beats ---------------------------------------------------------------

/**
 * The beat-level shape every scene's beats honour. Like {@link Scene},
 * plugin-owned fields are opaque to the kit. The optional `set` and
 * `transform` directives are the engine's animated-values surface (per the
 * docent grammar): `set` drives a quantities metric, `transform` re-binds
 * a structure node's representation.
 *
 * `pace` and `shot` are the rhythm/camera knobs the engine reads at frame
 * schedule time.
 *
 * @see docs/design/plugin-architecture-strategy.md §4.2
 */
export interface Beat {
  /** Stable id used by depthcheck rules and the agent layer. */
  id?: string;
  /** Narration text — the script line the active TtsProvider synthesizes. */
  narration?: string;
  /** Pace of the beat — drives trailing-silence trim and dwell time. */
  pace?: BeatPace;
  /** Camera shot verb — read by the scene component if it honors camera. */
  shot?: BeatShot;
  /** Cadence — how the beat's revealed items enter. */
  cadence?: BeatCadence;
  /** Reveal: an ordered list of node ids the beat introduces. */
  reveal?: readonly string[];
  /**
   * The animated-values directives. `set` drives a `quantities` metric (count
   * up to a target); `transform` re-binds a `structure` node's representation
   * (box → matrix, vector → matrix, equation → equation).
   */
  set?: ReadonlyArray<BeatSetDirective>;
  transform?: ReadonlyArray<BeatTransformDirective>;
  /**
   * Free-text performance direction for the TTS provider. Passed verbatim
   * to providers that support tone steering (OpenAI `gpt-4o-mini-tts`
   * accepts this via its `instructions:` field). Examples:
   *   "speak this with a pause after 'fan-out'"
   *   "ask this rhetorically — rising inflection"
   *   "land this with weight — slow, lower register"
   * Providers that don't support steering ignore the field; nothing breaks.
   * This is the *performance grammar* (how a beat is delivered) — distinct
   * from `pace` (which is timing) and `shot` (which is camera).
   */
  voiceDirection?: string;
  /**
   * Frames of silence to insert BEFORE this beat's narration audio.
   * Default 0. Use sparingly — pauses change the conversational rhythm
   * but cost wall-clock time. Typical values: 6-18 frames (0.2-0.6s
   * at 30 fps) for a breath between thoughts.
   */
  pauseBefore?: number;
  /**
   * Frames of silence to insert AFTER this beat's narration audio.
   * Same units + caveats as `pauseBefore`.
   */
  pauseAfter?: number;
  /** Plugin-owned fields. The kit treats these as opaque. */
  [key: string]: unknown;
}

/**
 * Beat-level pace knob — drives trailing-silence trim and dwell time.
 * - `'hold'` — let the beat *land*; longest dwell.
 * - `'settle'` — gentle dwell.
 * - `'normal'` — default.
 * - `'brisk'` — rush through; shortest dwell.
 */
export type BeatPace = 'hold' | 'settle' | 'normal' | 'brisk';

/**
 * Beat-level camera verb — read by the scene component if it honors camera.
 * - `'wide'` — survey the whole diagram.
 * - `'follow'` — lean toward the focus.
 * - `'push'` — decisive close-in.
 * - `'hold'` — dead-still emphasis frame.
 */
export type BeatShot = 'wide' | 'follow' | 'push' | 'hold';

/**
 * Beat-level cadence — how revealed items enter.
 * - `'together'` — all at once.
 * - `'cascade'` — staggered, in declared order.
 * - `'snap'` — sharp and fast.
 */
export type BeatCadence = 'together' | 'cascade' | 'snap';

/**
 * Drive a metric (or any numeric value) toward a target. The engine tweens
 * from the previous value to the target over the beat's duration.
 *
 * Authored on a `quantities` scene's beat — the metric counts up to its
 * target rather than cutting to it. The "earn a number on screen" move.
 */
export interface BeatSetDirective {
  /** Dot-delimited address of the metric inside the scene spec. */
  path: string;
  /** Target value — the tween's endpoint. */
  to: number | string;
  /** Optional duration override in frames. Defaults to the beat's own. */
  durationFrames?: number;
}

/**
 * Re-bind a `structure` node's representation. The engine morphs old → new
 * across the beat's duration — a vector becoming a matrix, one equation
 * rewriting into the next.
 */
export interface BeatTransformDirective {
  /** The node id (in `structure.nodes`) to re-bind. */
  nodeId: string;
  /** New representation the node morphs into. */
  as: 'box' | 'matrix' | 'vector' | 'grid' | 'code' | 'equation';
  /** Optional duration override in frames. */
  durationFrames?: number;
}

// ----- film spec -----------------------------------------------------------

/**
 * The top-level film spec — the shape every film validates against.
 *
 * Per the strategy doc §11.5, the *top-level* keys are CLOSED: `meta`,
 * `scenes`, `style`, `tts`. Plugins add scene-type branches via
 * `scenes[].type` discriminators, not new top-level fields. The closure
 * is what lets the kit's schema and validator stay stable across version
 * bumps.
 *
 * Note: `tts` here is the legacy mirror of `meta.tts`; new specs put TTS
 * under `meta`. Both are accepted; the resolver normalizes.
 *
 * @see docs/design/plugin-architecture-strategy.md §11.5
 */
export interface FilmSpec {
  /** Film-level metadata (id, title, voice, resolution, register, …). */
  meta: FilmMeta;
  /** The ordered list of scenes — each one validated by its plugin's schema. */
  scenes: Scene[];
  /** Film-level style input — preset, intent, token overrides. */
  style?: RenderStyleInput;
  /**
   * Legacy top-level TTS slot. Prefer `meta.tts`. The resolver merges,
   * `meta.tts` wins on conflict.
   */
  tts?: FilmTtsConfig;
}
