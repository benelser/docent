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
 * can override (per `Beat.pace`). The `register` knob is the overall mood —
 * see the docent grammar doc for semantics.
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
   * The mode tag — used by the agent layer's prompts; the engine itself
   * doesn't branch on it but it survives in the spec.
   */
  mode?: 'pr' | 'ar' | 'ex' | string;
  /** A subsystem name passed through to scene components. */
  subsystem?: string;
}

/** The film-level mood knob. Defaults to 'neutral'. */
export type FilmRegister =
  | 'grave'
  | 'neutral'
  | 'calm'
  | 'urgent'
  | 'playful';

/**
 * TTS configuration carried on `meta.tts`. `provider` matches a registered
 * `TtsProviderPlugin.providerId`. `strict: true` makes capability mismatches
 * hard-fail rather than warn.
 */
export interface FilmTtsConfig {
  provider?: string;
  model?: string;
  providerOptions?: Record<string, unknown>;
  /**
   * When `true`, an unsatisfied `ScenePlugin.requiresTtsCapabilities` causes
   * resolution to throw. When `false` (default), it emits a warning.
   */
  strict?: boolean;
}

// ----- scenes --------------------------------------------------------------

/**
 * The minimum shape every scene honours. `type` is the registry key. Every
 * other per-scene-type field is owned by the registered `ScenePlugin` and
 * validated by its `schema` / `validate` hooks.
 *
 * The `[key: string]: unknown` index signature is deliberate: plugins
 * contribute open shape; the kit refuses to bake in per-type fields. The
 * top-level shape stays stable forever; the union of scene branches grows
 * as plugins register.
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
 * The beat-level shape every scene's beats honour. Like `Scene`, plugin-owned
 * fields are opaque to the kit. The optional `set` and `transform` directives
 * are the engine's animated-values surface (per the docent grammar): `set`
 * drives a quantities metric, `transform` re-binds a structure node's
 * representation.
 *
 * `pace` and `shot` are the rhythm/camera knobs the engine reads at frame
 * schedule time.
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

export type BeatPace = 'hold' | 'settle' | 'normal' | 'brisk';
export type BeatShot = 'wide' | 'follow' | 'push' | 'hold';
export type BeatCadence = 'together' | 'cascade' | 'snap';

/**
 * Drive a metric (or any numeric value) toward a target. The engine tweens.
 * `to` is the target value; `path` is the dot-delimited address of the metric
 * inside the scene spec.
 */
export interface BeatSetDirective {
  path: string;
  to: number | string;
  /** Optional duration override in frames. Defaults to the beat's own. */
  durationFrames?: number;
}

/** Re-bind a structure node's representation. The engine morphs old → new. */
export interface BeatTransformDirective {
  /** The node id (in `structure.nodes`) to re-bind. */
  nodeId: string;
  /** New representation. */
  as: 'box' | 'matrix' | 'vector' | 'grid' | 'code' | 'equation';
  /** Optional duration override in frames. */
  durationFrames?: number;
}

// ----- film spec -----------------------------------------------------------

/**
 * The top-level film spec. The shape every film validates against.
 *
 * Per the strategy doc §11.5, the *top-level* keys are CLOSED: `meta`,
 * `scenes`, `style`, `tts`. Plugins add scene-type branches via
 * `scenes[].type` discriminators, not new top-level fields.
 *
 * Note: `tts` here is the legacy mirror of `meta.tts`; new specs put TTS
 * under `meta`. Both are accepted; the resolver normalizes.
 */
export interface FilmSpec {
  meta: FilmMeta;
  scenes: Scene[];
  /** Film-level style input — preset, intent, token overrides. */
  style?: RenderStyleInput;
  /**
   * Legacy top-level TTS slot. Prefer `meta.tts`. The resolver merges,
   * `meta.tts` wins on conflict.
   */
  tts?: FilmTtsConfig;
}
