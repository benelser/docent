// Judge dimensions for the `map` scene.
//
// MIGRATED from packages/engine/cli/judge.ts:81-83 — the
// `space-is-load-bearing` dimension. When the film carries a `map` scene,
// the position arrangement must carry information, not just be a decorative
// spatial layout. The depthcheck rule catches the regex-shaped failure
// (regions without `sub` annotations); this judge dimension catches what
// only judgement can — a map whose region positions *could* have been
// shuffled with no loss of meaning, where the geometry is decoration.
//
// Films with no `map` scene mark this dimension n/a (the judge framework
// handles that — a per-scene plugin's dimensions only fire when scenes of
// that type are present).

import type {JudgeDimension} from '@bjelser/kit';

export const judgeDimensions: ReadonlyArray<JudgeDimension> = [
  {
    id: 'space-is-load-bearing',
    title:
      'Space is load-bearing — position carries information, not just decoration',
    description:
      'When the film carries a map scene, the arrangement of regions must carry argument, not just be a decorative spatial layout. A region\'s place on the stage should say WHY this place — its role, its trade-off, what is true here that is not true elsewhere. A map whose regions could be reshuffled with no loss of meaning fails this dimension.',
    rubric:
      'Inspect every map scene. Grade against these questions:\n' +
      '  1. Could you swap two regions\' positions without changing what the scene argues? If yes — the geometry is decoration.\n' +
      '  2. Does each region\'s `sub` annotation name what makes ITS position load-bearing (its role, its trade-off, the local truth)? Or is it merely a descriptor that would read identically on any other region?\n' +
      '  3. If markers / connections are present, do they argue from the spatial relationships (proximity, hops, flow), or are they decoration on top of the position-as-decoration?\n' +
      '\n' +
      '  Pass: the position arrangement is the argument; reshuffling would destroy meaning.\n' +
      '  Fail: the regions could have been a list; position adds nothing.',
  },
];

export default judgeDimensions;
