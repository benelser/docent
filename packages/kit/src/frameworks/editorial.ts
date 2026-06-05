// Editorial marker enumerator — Wave R11 shared engine.
//
// `enumerateMarkers(spec, schedule)` walks a frame schedule and emits one
// `EditorialMarker` per meaningful structural moment in the film. It is the
// single place the marker-extraction logic lives: the FCPXML (R11.1) and
// AAF (R11.2) exporters consume this output and serialize to their format.
//
// The function is PURE: no fs, no network, no clock. It reads only the spec
// and the already-resolved schedule. Browser-safe — every import is a type.
//
// What it emits, in declaration order:
//   1. One `'scene'` marker at every scene's `startFrame`.
//   2. One `'big-idea'` marker at the `startFrame` of every `tension`,
//      `recap`, or `closeup` scene.
//   3. For each beat in declaration order:
//      a. One `'beat'` marker at the beat's `startFrame`.
//      b. One `'narration'` marker at the same frame, IF the beat carries
//         non-empty `narration`.
//      c. One `'tension-peak'` marker at the same frame, IF the beat is the
//         LAST beat of a `tension` scene that has ≥2 beats.
//
// Overlap is intentional: the first beat of a `tension` scene fires up to
// FIVE markers at the same frame (scene + big-idea + beat + narration +
// — if it's also the only beat — tension-peak; the ≥2 guard rules out the
// single-beat case). The consumer dedupes if its NLE chokes on stacks; the
// exporter usually wants the redundancy because it surfaces *meaning* (the
// frame is structurally important for many reasons), not just position.
//
// The returned array is sorted by frame ascending, breaking ties by the
// order kinds are documented above (scene < big-idea < beat < narration <
// tension-peak). Stable order makes diffing two markers exports trivial.

import type {FilmSpec, Scene} from '../types/spec';
import type {FrameSchedule, SceneSchedule} from '../remotion/schedule';
import type {
  EditorialMarker,
  EditorialMarkerKind,
} from '../types/editorial';
import {DEFAULT_MARKER_COLORS} from '../types/editorial';

/**
 * Max length of the on-chip label. NLE marker chips render maybe 25–40
 * characters depending on zoom level and color; ~30 hits a readable middle.
 * Longer text survives intact on `note` so the editor never loses the full
 * line — only the chip is shortened.
 */
const LABEL_MAX = 30;

/** Scene types that warrant a `big-idea` marker at their start. */
const BIG_IDEA_SCENE_TYPES: ReadonlySet<string> = new Set([
  'tension',
  'recap',
  'closeup',
]);

/** Tie-breaker order when multiple markers land on the same frame. */
const KIND_ORDER: Record<EditorialMarkerKind, number> = {
  scene: 0,
  'big-idea': 1,
  beat: 2,
  narration: 3,
  'tension-peak': 4,
};

/**
 * Truncate to `LABEL_MAX` chars on a word boundary when possible. Hard-cuts
 * only when there is no whitespace inside the window — the alternative
 * (keep walking until the first space *after* `LABEL_MAX`) produces chips
 * that don't fit, which is worse than a mid-word cut that does.
 *
 * Adds a single trailing `…` when truncation happens so the editor knows
 * the label is a preview, not the full string.
 */
const truncateLabel = (raw: string): string => {
  const text = raw.trim();
  if (text.length <= LABEL_MAX) return text;
  // Look for the last whitespace at or before LABEL_MAX.
  const window = text.slice(0, LABEL_MAX);
  const lastSpace = window.lastIndexOf(' ');
  // Only break on a word boundary if it leaves at least half the chip's
  // budget filled — a 6-char preview of a 200-char line is useless.
  const cut = lastSpace >= LABEL_MAX / 2 ? lastSpace : LABEL_MAX - 1;
  return `${text.slice(0, cut).trimEnd()}…`;
};

/** Best-effort scene label: title → kicker → heading → id → `type`. */
const sceneLabel = (scene: Scene): string => {
  const fields = ['title', 'kicker', 'heading'] as const;
  for (const f of fields) {
    const v = (scene as unknown as Record<string, unknown>)[f];
    if (typeof v === 'string' && v.trim().length > 0) {
      return truncateLabel(v);
    }
  }
  if (typeof scene.id === 'string' && scene.id.trim().length > 0) {
    return truncateLabel(scene.id);
  }
  return scene.type;
};

/** Best-effort beat label: id → first ~30 chars of narration. */
const beatLabel = (
  beatIndex: number,
  rawBeat: {id?: string; narration?: string},
): string => {
  const narration = (rawBeat.narration ?? '').trim();
  if (narration.length > 0) {
    return truncateLabel(narration);
  }
  if (rawBeat.id) return truncateLabel(rawBeat.id);
  return `beat-${beatIndex + 1}`;
};

/**
 * Sort markers by frame ascending, breaking ties by the documented kind
 * order so the array is deterministic across runs. A stable sort would be
 * fine but Array.prototype.sort is not guaranteed stable on every engine
 * — we encode the tie-break explicitly.
 */
const compareMarkers = (a: EditorialMarker, b: EditorialMarker): number => {
  if (a.frame !== b.frame) return a.frame - b.frame;
  const kindDelta = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if (kindDelta !== 0) return kindDelta;
  // Same frame + same kind: order by scene then beat for stability.
  if (a.sceneIndex !== b.sceneIndex) return a.sceneIndex - b.sceneIndex;
  const ba = a.beatIndex ?? -1;
  const bb = b.beatIndex ?? -1;
  return ba - bb;
};

/**
 * Enumerate every editorial marker the film should carry into an NLE.
 *
 * @param spec     The authored film spec — read for scene metadata only.
 * @param schedule The resolved frame schedule from `buildFrameSchedule`.
 *                 Provides per-scene + per-beat `startFrame` windows in
 *                 master-timeline frames.
 * @returns        Frozen, frame-sorted array of markers.
 */
export const enumerateMarkers = (
  spec: FilmSpec,
  schedule: FrameSchedule,
): ReadonlyArray<EditorialMarker> => {
  const markers: EditorialMarker[] = [];

  schedule.scenes.forEach((sceneSlot: SceneSchedule) => {
    const scene = sceneSlot.scene;
    const sceneIndex = sceneSlot.sceneIndex;
    const sceneType = scene.type;

    // 1. The scene boundary itself.
    markers.push({
      frame: sceneSlot.startFrame,
      kind: 'scene',
      color: DEFAULT_MARKER_COLORS.scene,
      label: sceneLabel(scene),
      note: `Scene ${sceneIndex + 1} — ${sceneType}`,
      sceneIndex,
    });

    // 2. The big-idea marker, if this scene is one of the reasoning moves.
    if (BIG_IDEA_SCENE_TYPES.has(sceneType)) {
      markers.push({
        frame: sceneSlot.startFrame,
        kind: 'big-idea',
        color: DEFAULT_MARKER_COLORS['big-idea'],
        label: sceneLabel(scene),
        note: `Big idea (${sceneType}) — ${sceneLabel(scene)}`,
        sceneIndex,
      });
    }

    // 3. Per-beat markers.
    const beatCount = sceneSlot.beats.length;
    sceneSlot.beats.forEach((beatSlot, i) => {
      const isLastBeat = i === beatCount - 1;
      const isTensionPeak =
        sceneType === 'tension' && beatCount >= 2 && isLastBeat;
      const narrationRaw = (beatSlot.beat.narration ?? '').trim();
      const label = beatLabel(i, beatSlot.beat);

      // 3a. Beat boundary.
      markers.push({
        frame: beatSlot.startFrame,
        kind: 'beat',
        color: DEFAULT_MARKER_COLORS.beat,
        label,
        note:
          narrationRaw.length > label.length
            ? narrationRaw
            : `Beat ${i + 1} of scene ${sceneIndex + 1}`,
        sceneIndex,
        beatIndex: i,
      });

      // 3b. Narration start.
      if (narrationRaw.length > 0) {
        markers.push({
          frame: beatSlot.startFrame,
          kind: 'narration',
          color: DEFAULT_MARKER_COLORS.narration,
          label,
          note: narrationRaw,
          sceneIndex,
          beatIndex: i,
        });
      }

      // 3c. Tension peak — the verdict beat of a multi-beat tension scene.
      if (isTensionPeak) {
        markers.push({
          frame: beatSlot.startFrame,
          kind: 'tension-peak',
          color: DEFAULT_MARKER_COLORS['tension-peak'],
          label,
          note:
            narrationRaw.length > 0
              ? `Tension peak — ${narrationRaw}`
              : `Tension peak (scene ${sceneIndex + 1}, beat ${i + 1})`,
          sceneIndex,
          beatIndex: i,
        });
      }
    });
  });

  markers.sort(compareMarkers);
  return Object.freeze(markers);
};
