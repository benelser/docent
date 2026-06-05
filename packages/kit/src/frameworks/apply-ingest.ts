// Ingest diff → spec — the round-trip ingest stage's spec rewriter (R11.4).
//
// Given the original spec and an {@link IngestDiff}, produce a new spec that
// honours the editor's cut at scene granularity:
//   1. drop every scene in `removedScenes`,
//   2. reorder surviving scenes per `reorderedScenes`,
//   3. surface duration changes as a per-scene `_ingestDurationHint` field
//      on the modified scene so the spec author can see them (we can't
//      faithfully apply a duration trim — beat narration drives schedule
//      length, and the spec author has to decide which beats to cut),
//   4. drop foreign clips (the spec can't represent them) and surface them
//      as a top-level note (`_ingestForeignClips`) for the spec author.
//
// **Friction #2 (foreign clips)**: this stage chooses to DROP the b-roll
// rather than insert a placeholder scene. A placeholder would render as a
// blank clip and confuse downstream pipelines; surfacing the foreign clip
// in a top-level note keeps the spec valid and tells the author what was
// excluded. The CLI prints the same warning at apply time.
//
// **Friction #3 (frame quantization)**: the hint we surface is the editor's
// new frame count *as reported by the FCPXML parser*, with whatever rounding
// the parser applied. The spec author re-narrates / re-times beats from the
// hint; we never silently truncate beats here.

import type {FilmSpec, Scene} from '../types/spec';
import type {IngestDiff} from './ingest-diff';

/**
 * The output of `applyIngest` — the new spec plus a parallel `warnings`
 * array the CLI can surface.
 */
export interface AppliedIngest {
  readonly spec: FilmSpec;
  readonly warnings: ReadonlyArray<string>;
}

/**
 * Apply an {@link IngestDiff} to a spec. Pure: no fs.
 *
 * The new spec:
 *   - Has the same `meta` (we never touch metadata; the editor's cut doesn't
 *     change the film's id or voice).
 *   - Has the surviving scenes in the editor's order.
 *   - Surfaces `durationChanges` as a per-scene `_ingestDurationHint` field
 *     (the kit's scene shape allows arbitrary index-signature fields per
 *     the `Scene` type's `[key: string]: unknown`).
 *   - Surfaces dropped foreign clips on a top-level `_ingestForeignClips`
 *     field (also unknown to the kit; the spec author can inspect, then
 *     remove the field before re-rendering).
 */
export const applyIngest = (
  spec: FilmSpec,
  diff: IngestDiff,
): AppliedIngest => {
  const warnings: string[] = [];

  // 1. Cull removed scenes.
  const removedIds = new Set(diff.removedScenes.map((r) => r.sceneId));
  const survivors = spec.scenes.filter(
    (s) => s.id === undefined || !removedIds.has(s.id),
  );

  // 2. Build the new order. Scenes with explicit reorder entries land at
  //    the editor's `newIndex`; everything else keeps its relative position.
  //    Scenes without an id can't be reordered — they ride along where the
  //    spec put them.
  const reorderMap = new Map<string, number>();
  diff.reorderedScenes.forEach((r) => reorderMap.set(r.sceneId, r.newIndex));

  // Decorate, sort, then strip the sort key. Stable sort handles ties.
  type Indexed = {scene: Scene; key: number; original: number};
  const indexed: Indexed[] = survivors.map((scene, original) => {
    const newIdx =
      scene.id !== undefined ? reorderMap.get(scene.id) : undefined;
    return {
      scene,
      key: newIdx ?? original,
      original,
    };
  });
  indexed.sort((a, b) => {
    if (a.key !== b.key) return a.key - b.key;
    return a.original - b.original;
  });

  // 3. Surface duration hints.
  const durationMap = new Map<
    string,
    {originalFrames: number; newFrames: number; deltaFrames: number}
  >();
  diff.durationChanges.forEach((d) =>
    durationMap.set(d.sceneId, {
      originalFrames: d.originalFrames,
      newFrames: d.newFrames,
      deltaFrames: d.deltaFrames,
    }),
  );

  const newScenes: Scene[] = indexed.map(({scene}) => {
    if (scene.id === undefined) return scene;
    const hint = durationMap.get(scene.id);
    if (hint === undefined) return scene;
    warnings.push(
      `scene "${scene.id}" duration changed by ${hint.deltaFrames > 0 ? '+' : ''}${hint.deltaFrames} frames — surfaced as _ingestDurationHint; review beat narration / pace to honour the editor's cut.`,
    );
    return {...scene, _ingestDurationHint: hint};
  });

  // 4. Foreign clips become a top-level note.
  let withForeign: FilmSpec = {
    ...spec,
    scenes: newScenes,
  };
  if (diff.foreignClips.length > 0) {
    warnings.push(
      `${diff.foreignClips.length} foreign clip(s) in the FCPXML cannot be encoded in a docent spec — dropped from the output. See _ingestForeignClips for the list.`,
    );
    withForeign = {
      ...withForeign,
      _ingestForeignClips: diff.foreignClips,
    } as FilmSpec & {_ingestForeignClips: IngestDiff['foreignClips']};
  }

  // 5. Surface the warnings the diff itself collected (e.g. positional
  //    fallback) — they bubble up so the CLI can decide whether to noise
  //    the human about them.
  diff.warnings.forEach((w) => warnings.push(w));

  return {spec: withForeign, warnings};
};
