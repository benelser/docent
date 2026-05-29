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
   * Beat list. Required only when the scene type actually beats; chrome-only
   * scenes (e.g. `frame`, `recap`) may carry one synthetic beat or none.
   */
  beats?: Beat[];
  /** Plugin-owned fields. The kit treats these as opaque. */
  [key: string]: unknown;
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
