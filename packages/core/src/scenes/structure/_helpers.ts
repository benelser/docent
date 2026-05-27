// Structure scene–local helpers — the morph timeline / morph resolver /
// transform-detector. The shared chrome (glow, activeBeatIndex, the cadence
// helpers, the palette resolvers, ACCENTS, SceneFrame, Narration,
// FittedText, fonts, code-theme) now imports from `@docent/core/_shared`.
//
// These three helpers — `morphTimeline`, `resolveMorph`, `hasTransform` —
// implement cross-beat object identity: a structure node can be re-bound by
// a later beat's `transform` directive (box → matrix, vector → matrix,
// equation → equation). The helpers resolve, at a given frame, which
// definition the node is in and how far it has eased between the
// bracketing pair. Pure reads over the beat timeline; deterministic,
// no state. The engine implements the same morph timeline in
// `packages/engine/src/scenes/StructureScene.tsx`; this is the kit-adapted
// port (walks `BeatTimelineSlot[]` rather than the legacy `TimedBeat[]`).

import {spring} from 'remotion';
import type {Beat, BeatTimelineSlot} from '@docent/kit';

import type {StructureNode, StructureTransform} from './_types';

export type MorphState = {fromFrame: number; node: StructureNode};

/**
 * Read a beat's structure-owned `transform` directive list off the open
 * index signature on `Beat`. The kit's `Beat` declares a generic
 * `transform?: ReadonlyArray<BeatTransformDirective>`; structure's per-node
 * morph shape is wider (carries a full `into: Partial<StructureNode>`), so
 * we read it back as the structure-owned shape. When absent or shaped
 * differently, returns `undefined`.
 */
const beatTransforms = (beat: Beat): ReadonlyArray<StructureTransform> | undefined => {
  const v = (beat as {transform?: unknown}).transform;
  if (!Array.isArray(v)) return undefined;
  return v as ReadonlyArray<StructureTransform>;
};

/**
 * The ordered definition timeline for one node: its base definition (from
 * frame 0), then each `transform.into` merged onto the prior definition, in
 * timeline order. A node with no transform has a single-state timeline.
 */
export const morphTimeline = (
  base: StructureNode,
  beats: ReadonlyArray<BeatTimelineSlot>,
): MorphState[] => {
  const states: MorphState[] = [{fromFrame: 0, node: base}];
  for (const slot of beats) {
    const ts = beatTransforms(slot.beat);
    const t = ts?.find((tr) => tr.node === base.id);
    if (!t) continue;
    // states[length-1] non-null: we seeded with one element above and only
    // push onto it from here.
    const prev = states[states.length - 1]!.node;
    // `into` is a partial Node — only named fields change; the id is fixed.
    states.push({fromFrame: slot.startFrame, node: {...prev, ...t.into, id: base.id}});
  }
  return states;
};

/**
 * At `frame`, the bracketing (from, to) definitions and the eased progress
 * `p` between them. Before/at the last transition's start `p` climbs 0→1
 * across that transition beat's own duration, then rests. A node with a
 * single-state timeline is always {from: base, to: base, p: 1} — no morph.
 */
export const resolveMorph = (
  states: MorphState[],
  beats: ReadonlyArray<BeatTimelineSlot>,
  frame: number,
  fps: number,
): {from: StructureNode; to: StructureNode; p: number} => {
  // states[*] non-null in every reach below: length is ≥ 1 throughout, and
  // `active` was set inside `states[i]` traversal so it indexes a real slot.
  if (states.length === 1) {
    return {from: states[0]!.node, to: states[0]!.node, p: 1};
  }
  let active = 0;
  for (let i = states.length - 1; i >= 0; i--) {
    if (frame >= states[i]!.fromFrame) {
      active = i;
      break;
    }
  }
  if (active === 0) {
    return {from: states[0]!.node, to: states[0]!.node, p: 1};
  }
  const fromDef = states[active - 1]!.node;
  const toDef = states[active]!.node;
  // The transition beat owns the morph — `p` eases across its duration, then
  // rests at 1.
  const tBeat = beats.find((b) => b.startFrame === states[active]!.fromFrame);
  const dur = tBeat?.frames ?? 1;
  const local = frame - states[active]!.fromFrame;
  const p =
    local <= 0
      ? 0
      : local >= dur
        ? 1
        : spring({frame: local, fps, config: {damping: 200, mass: 1.1}});
  return {from: fromDef, to: toDef, p};
};

/**
 * Whether any beat in this scene transforms any node — the fast-path guard.
 * When false, StructureScene takes the existing unchanged code path: every
 * node renders as the byte-identical Card with no morph machinery.
 */
export const hasTransform = (
  beats: ReadonlyArray<BeatTimelineSlot>,
): boolean =>
  beats.some((b) => {
    const ts = beatTransforms(b.beat);
    return Array.isArray(ts) && ts.length > 0;
  });
