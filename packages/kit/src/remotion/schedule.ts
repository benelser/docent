// schedule — turn a `FilmSpec` + an `Engine` into a frame timeline.
//
// Phase A.9: the kit owns the contract between a declarative film and Remotion's
// frame-based render model. `buildFrameSchedule` walks `spec.scenes`, computes
// each scene's `[startFrame, endFrame)` window, and the per-beat sub-windows
// inside it.
//
// What this file does NOT do:
//   - resolve audio (Phase A.5/A.7 owns the TTS cascade — when a beat carries
//     a synthesized clip, the cascade fills in `seconds`; here we fall back to
//     a word-count estimator so `remotion studio` is usable on a fresh spec).
//   - resolve style (`resolveStyle` is upstream; this file is style-blind).
//   - render anything (composition.tsx threads a schedule entry into each
//     scene's React component).
//
// The shape is closed: `SceneSchedule` carries everything `<DocentFilm>` needs
// to seek to scene N at frame F.

import type {
  Beat,
  BeatPace,
  FilmSpec,
  Scene,
} from '../types/spec';
import type {Engine} from '../engine';

/** Default film resolution when `meta.resolution` is absent. */
export const DEFAULT_FPS = 30;
export const DEFAULT_WIDTH = 1920;
export const DEFAULT_HEIGHT = 1080;

/** Seconds of quiet at the head of every scene before its first beat. */
const LEAD_SECONDS = 0.15;
/** Seconds of breath after each beat at the default `pace`. */
const TAIL_SECONDS = 0.55;
/** Default cross-fade between scenes, in frames at the film's fps. */
export const DEFAULT_TRANSITION_FRAMES = 16;

/**
 * Per-beat-`pace` multiplier applied to the trailing-silence budget.
 * `hold` lets a verdict land; `brisk` rushes an enumeration. Sourced from
 * the v2 engine's PACE table so a kit-driven render produces the same
 * cadence on a fresh spec.
 */
const PACE_MULTIPLIER: Record<BeatPace, number> = {
  hold: 3,
  settle: 1.8,
  normal: 1,
  brisk: 0.35,
};

/**
 * Words-per-second floor for the narration estimator. Matches the v2 engine's
 * `estimateSeconds` so a film without synthesized audio still times sensibly.
 * 2.6 wps ≈ a measured speaking pace.
 */
const WORDS_PER_SECOND = 2.6;
const MIN_BEAT_SECONDS = 2.6;

/** One beat's slot inside its scene's window. Absolute (film-relative) frames. */
export interface BeatSchedule {
  readonly beatIndex: number;
  readonly beat: Beat;
  readonly startFrame: number;
  readonly frames: number;
}

/** One scene's slot inside the film's timeline. Absolute frames. */
export interface SceneSchedule {
  readonly sceneIndex: number;
  readonly scene: Scene;
  readonly startFrame: number;
  /** Frame at which this scene's window ends (exclusive). */
  readonly endFrame: number;
  /** `endFrame - startFrame`. The Remotion `Sequence`'s `durationInFrames`. */
  readonly frames: number;
  /** Transition frames the engine reserves for the cross-fade INTO the next scene. */
  readonly transitionOutFrames: number;
  readonly beats: ReadonlyArray<BeatSchedule>;
}

/** The full schedule + film-level totals. */
export interface FrameSchedule {
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  /** Total duration in frames — the composition's `durationInFrames`. */
  readonly totalFrames: number;
  readonly scenes: ReadonlyArray<SceneSchedule>;
}

/**
 * Estimate a beat's clip length in seconds from its narration text.
 *
 * This is the fallback the engine uses when the TTS cascade has not yet
 * filled in real audio durations. Matches the v2 engine's `estimateSeconds`
 * — at the (deliberately conservative) `WORDS_PER_SECOND` floor a 26-word
 * line lands at 10 s; an empty line still gets `MIN_BEAT_SECONDS` so a beat
 * never collapses to zero frames.
 */
const estimateBeatSeconds = (beat: Beat): number => {
  const text = (beat.narration ?? '').trim();
  if (text.length === 0) return MIN_BEAT_SECONDS;
  const words = text.split(/\s+/).length;
  return Math.max(MIN_BEAT_SECONDS, words / WORDS_PER_SECOND);
};

/** Frames-per-scene transition. Reads optional `cut` knob if the spec carries one. */
const transitionFrames = (scene: Scene): number => {
  // The kit's `Scene` type allows index-signature plugin fields; an authored
  // film may pin `cut` per scene (v2 grammar). We respect it when present.
  const cut = (scene as Scene & {cut?: string}).cut;
  if (cut === 'hold') return 28;
  if (cut === 'continue') return 8;
  return DEFAULT_TRANSITION_FRAMES;
};

/** A scene's beat list — empty when the scene is chrome-only (e.g. `frame`/`recap`). */
const beatsOf = (scene: Scene): ReadonlyArray<Beat> =>
  Array.isArray(scene.beats) ? scene.beats : [];

/**
 * Compute the frame schedule for a film. The single entry point Phase A.9's
 * `<DocentFilm>` and `mountComposition` both consume.
 *
 * The flow:
 *   1. resolve fps / width / height from `meta.resolution` (with defaults);
 *   2. for each scene, walk beats and assign absolute start/end frames using
 *      the narration estimator + the pace knob;
 *   3. compute each scene's window as `[lead + Σbeat.frames, …)`;
 *   4. subtract per-scene `transitionOutFrames` from the running cursor so
 *      cross-fades overlap, mirroring v2's `buildTimeline`.
 *
 * The engine instance is accepted so future phases (per-scene `resolveBeat`
 * hooks, R5 cross-bind warnings) have a hook; the current implementation
 * reads only what the spec carries.
 */
export const buildFrameSchedule = (
  spec: FilmSpec,
  engine: Engine,
): FrameSchedule => {
  const res = spec.meta.resolution;
  const fps = res?.fps ?? DEFAULT_FPS;
  const width = res?.width ?? DEFAULT_WIDTH;
  const height = res?.height ?? DEFAULT_HEIGHT;
  const leadFrames = Math.round(LEAD_SECONDS * fps);

  const scenes: SceneSchedule[] = [];
  let cursor = 0;

  spec.scenes.forEach((scene, sceneIndex) => {
    const sceneStart = cursor;
    let beatCursor = sceneStart + leadFrames;
    const beatSlots: BeatSchedule[] = [];

    // If a scene plugin is registered we let it shape each beat first — the
    // R2 `resolveBeat` hook lets a scene compute derived beat fields before
    // schedule reads them. Unknown sceneTypes (validation surfaces these
    // elsewhere) fall through; the schedule still produces a timeline so a
    // partial-validation surface remains usable.
    const plugin = engine.scenes.get(scene.type);

    beatsOf(scene).forEach((rawBeat, beatIndex) => {
      const beat: Beat = plugin?.resolveBeat
        ? plugin.resolveBeat(rawBeat, {
            sceneType: scene.type,
            sceneIndex,
            beatIndex,
            register: spec.meta.register,
          })
        : rawBeat;
      const pace: BeatPace = beat.pace ?? 'normal';
      const clipSeconds = estimateBeatSeconds(beat);
      const tail = TAIL_SECONDS * PACE_MULTIPLIER[pace];
      const frames = Math.max(1, Math.round((clipSeconds + tail) * fps));
      beatSlots.push({
        beatIndex,
        beat,
        startFrame: beatCursor,
        frames,
      });
      beatCursor += frames;
    });

    // Chrome-only scenes (no beats) still get a minimum slot — long enough
    // for the entrance and the cut. One second is the v2 floor.
    if (beatSlots.length === 0) {
      beatCursor = sceneStart + Math.max(leadFrames, Math.round(fps));
    }

    const sceneEnd = beatCursor;
    const transitionOut =
      sceneIndex < spec.scenes.length - 1 ? transitionFrames(scene) : 0;

    scenes.push({
      sceneIndex,
      scene,
      startFrame: sceneStart,
      endFrame: sceneEnd,
      frames: sceneEnd - sceneStart,
      transitionOutFrames: transitionOut,
      beats: beatSlots,
    });

    // Advance the cursor, overlapping the cross-fade with the next scene's
    // head — mirrors v2 `buildTimeline`. The total is recomputed below so
    // the composition's `durationInFrames` exactly matches the timeline.
    cursor = sceneEnd - transitionOut;
  });

  // The film's total = the last scene's end frame (transitions overlap, so
  // cursor at the tail is the truthful total).
  const totalFrames =
    scenes.length === 0
      ? 1
      : Math.max(1, scenes[scenes.length - 1]!.endFrame);

  return {fps, width, height, totalFrames, scenes};
};
