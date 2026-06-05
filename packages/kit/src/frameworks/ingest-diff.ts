// Ingest diff — the round-trip ingest stage's diff engine (R11.4).
//
// Given the docent spec (the truth before the editor touched it) + the
// FrameSchedule (the engine's view of the spec's frame windows) + the
// parsed FCPXML (the editor's cut), compute what the editor changed.
//
// The change taxonomy this surfaces:
//   1. reorderedScenes      — a scene id appears at a different position
//   2. removedScenes        — a scene id was deleted from the spine
//   3. durationChanges      — a scene's frame length grew or shrank
//   4. foreignClips         — a clip in the spine isn't one of our scenes
//                              (b-roll the editor dropped between scenes,
//                              or splits of one of our scenes)
//
// What is NOT surfaced (yet):
//   - Per-beat re-cuts. The spec's beats are inside-the-scene; FCPXML only
//     gives us scene-level boundaries unless R11.1 chooses to encode beats
//     as separate clips. R11.4's contract is at the scene level.
//   - Marker drift. Markers ride along on the parsed FCPXML and the apply
//     stage can choose to preserve them; the diff structure deliberately
//     does not enumerate them (Friction #4).
//
// **Friction #1 (annotation contract)**: scene matching prefers the
// `docent:sceneId=…` annotation R11.1 is expected to write. When absent,
// we fall back to positional matching (clip N → scene N). The fallback
// path is unsafe under heavy editing; the docent ingest CLI warns when it
// triggers.

import type {FrameSchedule} from '../remotion/schedule';
import type {FilmSpec} from '../types/spec';
import type {ParsedFcpxml, ParsedFcpxmlClip} from '../cascade/fcpxml-parse';

/**
 * The diff output — everything the ingest stage knows about what the
 * editor changed. Designed to be JSON-serialisable so the CLI can render
 * it as either a human summary or as a `--json` blob for tooling.
 *
 * Frames are FILM-relative (the FrameSchedule's `startFrame`/`endFrame`
 * units). Match-by-id is the primary mechanism; the diff surfaces
 * `matchedByPosition: true` per-scene when we fell back to position.
 */
export interface IngestDiff {
  /** Where the original spec lived (informational only; for the CLI banner). */
  readonly originalSpecPath?: string;
  /** Where the FCPXML lived (informational only). */
  readonly fcpxmlPath?: string;
  /** Frames-per-second resolved from the FCPXML's sequence header. */
  readonly fps: number;
  /** Scenes that survived but moved in the spine. */
  readonly reorderedScenes: ReadonlyArray<{
    readonly sceneId: string;
    readonly originalIndex: number;
    readonly newIndex: number;
  }>;
  /** Scenes the editor deleted from the spine. */
  readonly removedScenes: ReadonlyArray<{
    readonly sceneId: string;
    readonly originalIndex: number;
  }>;
  /** Scenes whose duration the editor trimmed or extended. */
  readonly durationChanges: ReadonlyArray<{
    readonly sceneId: string;
    readonly originalFrames: number;
    readonly newFrames: number;
    /** Positive = extended; negative = shortened. */
    readonly deltaFrames: number;
  }>;
  /**
   * Clips in the spine that don't map to any of our scenes — the editor's
   * b-roll, or splits of a docent clip that introduced foreign segments.
   * These cannot be encoded in a docent spec (the spec drives generated
   * visuals, not arbitrary video files) — the apply stage warns about
   * them instead.
   */
  readonly foreignClips: ReadonlyArray<{
    readonly spineIndex: number;
    readonly startFrame: number;
    readonly endFrame: number;
    readonly refUri?: string;
  }>;
  /**
   * Warnings the matching algorithm raised — surfaced separately from the
   * change list so the CLI can flag low-confidence diffs.
   */
  readonly warnings: ReadonlyArray<string>;
}

/**
 * Tolerance for the "did the duration change?" check. The FCPXML emitter and
 * the FrameSchedule may both round at the rational-to-frame boundary; a
 * one-frame drift over a 600-frame clip is noise, not an edit. Two frames
 * gives a comfortable margin without masking a real trim (the shortest
 * deliberate trim a human makes — a single beat — is dozens of frames).
 */
const DURATION_NOISE_FRAMES = 2;

/**
 * Build a position-by-position fallback: each unmatched clip at spine index
 * N gets paired with the spec scene at index N when no scene id annotation
 * resolves it. Returns the inferred scene id (or `undefined` if the spec is
 * also exhausted at that index).
 */
const positionalFallback = (
  spineIndex: number,
  spec: FilmSpec,
): string | undefined => {
  const scene = spec.scenes[spineIndex];
  return scene?.id;
};

/**
 * The diff engine. Pure: given the three inputs, returns the diff. No fs,
 * no logging — the CLI shell turns this into stdout.
 *
 * The match strategy:
 *   1. For each parsed clip, prefer its embedded `sceneId` annotation.
 *   2. If absent, fall back to positional matching (clip N → scene N) and
 *      raise a warning that the diff is low-confidence.
 *   3. Build the reverse map (newIndexBySceneId).
 *   4. For each spec scene, compute reorder / remove / duration-change.
 *   5. Any parsed clip whose resolved sceneId is `null` or doesn't appear
 *      in the spec becomes a foreignClip.
 *
 * The `originalSpecPath` / `fcpxmlPath` are passthroughs the CLI fills in
 * for its banner.
 */
export const diffIngest = (
  spec: FilmSpec,
  parsed: ParsedFcpxml,
  schedule: FrameSchedule,
  banner?: {originalSpecPath?: string; fcpxmlPath?: string},
): IngestDiff => {
  const warnings: string[] = [];

  // Map sceneId → spec index. Skip scenes without ids — they cannot be
  // diff-matched and the spec author should give them ids if they want
  // reorder/remove tracking. (Position fallback still handles them.)
  const specIndexById = new Map<string, number>();
  spec.scenes.forEach((scene, i) => {
    if (scene.id !== undefined) specIndexById.set(scene.id, i);
  });

  // Map sceneId → schedule entry (for original frame counts).
  const scheduleBySceneId = new Map<string, (typeof schedule.scenes)[number]>();
  for (const s of schedule.scenes) {
    if (s.scene.id !== undefined) scheduleBySceneId.set(s.scene.id, s);
  }

  // Resolve each spine clip to a scene id. Two-pass to make foreign clip
  // detection robust:
  //   Pass 1: take every clip with an explicit `docent:sceneId` annotation
  //           and mark those scenes as "claimed".
  //   Pass 2: for clips without annotation, attempt positional fallback
  //           — but only if the spec scene at that index isn't already
  //           claimed by an annotated clip elsewhere. If it IS claimed, the
  //           unannotated clip is foreign (the editor's b-roll).
  //
  // This keeps the positional fallback safe under the common "every clip
  // annotated" path while not letting a single foreign clip wreck the
  // alignment of every clip after it.
  type Resolved = {clip: ParsedFcpxmlClip; sceneId: string | undefined};
  const resolved: Resolved[] = parsed.clips.map((clip) => ({
    clip,
    sceneId: clip.sceneId,
  }));
  const annotatedClipsExist = resolved.some((r) => r.sceneId !== undefined);
  const claimedSceneIds = new Set(
    resolved
      .filter((r) => r.sceneId !== undefined)
      .map((r) => r.sceneId as string),
  );
  let usedFallback = false;
  resolved.forEach((r) => {
    if (r.sceneId !== undefined) return;
    const fallback = positionalFallback(r.clip.spineIndex, spec);
    // If at least one clip carries an annotation and the positional
    // candidate is already claimed by another clip, leave this clip
    // unmatched — it'll be surfaced as a foreign clip below. This is the
    // "editor inserted b-roll between our scenes" guard.
    if (
      fallback !== undefined &&
      annotatedClipsExist &&
      claimedSceneIds.has(fallback)
    ) {
      return;
    }
    if (fallback !== undefined) {
      usedFallback = true;
      r.sceneId = fallback;
    }
  });
  if (usedFallback) {
    warnings.push(
      'one or more FCPXML clips lacked a docent:sceneId annotation — ' +
        'positional fallback used (clip N → scene N). The diff may be ' +
        'low-confidence if the editor reordered clips.',
    );
  }

  // For each surviving (non-foreign) clip, build the new-index lookup.
  const newIndexBySceneId = new Map<string, number>();
  let kitIndex = 0;
  resolved.forEach(({sceneId}) => {
    if (sceneId !== undefined && specIndexById.has(sceneId)) {
      // Only count clips that match a real spec scene toward the "new index"
      // — foreign clips don't shift our own scene positions in the spec
      // sense (they'd be flagged separately).
      newIndexBySceneId.set(sceneId, kitIndex);
      kitIndex += 1;
    }
  });

  // Walk the spec scenes; classify each.
  const reordered: IngestDiff['reorderedScenes'][number][] = [];
  const removed: IngestDiff['removedScenes'][number][] = [];
  const durationChanges: IngestDiff['durationChanges'][number][] = [];

  spec.scenes.forEach((scene, originalIndex) => {
    const sceneId = scene.id;
    if (sceneId === undefined) {
      // No id → no match possible; rely on positional alignment if every
      // scene is unannotated (handled by `positionalFallback`).
      return;
    }
    const newIndex = newIndexBySceneId.get(sceneId);
    if (newIndex === undefined) {
      removed.push({sceneId, originalIndex});
      return;
    }
    if (newIndex !== originalIndex) {
      reordered.push({sceneId, originalIndex, newIndex});
    }

    // Duration change — match against the schedule's original frame count.
    const origScheduled = scheduleBySceneId.get(sceneId);
    if (origScheduled !== undefined) {
      const originalFrames = origScheduled.frames;
      // The matching clip's frames (find by scanning resolved; small N).
      const matchedClip = resolved.find((r) => r.sceneId === sceneId)?.clip;
      if (matchedClip !== undefined) {
        const newFrames = matchedClip.frames;
        const delta = newFrames - originalFrames;
        if (Math.abs(delta) > DURATION_NOISE_FRAMES) {
          durationChanges.push({
            sceneId,
            originalFrames,
            newFrames,
            deltaFrames: delta,
          });
        }
      }
    }
  });

  // Foreign clips: any parsed clip whose resolved sceneId is undefined OR
  // whose sceneId doesn't appear in the spec. (A clip annotated with a
  // sceneId for a scene we DON'T have was probably authored against a
  // different spec — surface it as foreign rather than silently drop.)
  const foreignClips: IngestDiff['foreignClips'][number][] = [];
  resolved.forEach(({clip, sceneId}) => {
    if (sceneId === undefined || !specIndexById.has(sceneId)) {
      foreignClips.push({
        spineIndex: clip.spineIndex,
        startFrame: clip.startFrame,
        endFrame: clip.endFrame,
        ...(clip.refUri !== undefined ? {refUri: clip.refUri} : {}),
      });
    }
  });

  return {
    ...(banner?.originalSpecPath !== undefined
      ? {originalSpecPath: banner.originalSpecPath}
      : {}),
    ...(banner?.fcpxmlPath !== undefined ? {fcpxmlPath: banner.fcpxmlPath} : {}),
    fps: parsed.fps,
    reorderedScenes: reordered,
    removedScenes: removed,
    durationChanges,
    foreignClips,
    warnings,
  };
};
