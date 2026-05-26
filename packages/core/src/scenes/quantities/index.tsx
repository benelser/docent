// @docent/core/scenes/quantities — the `quantities` ScenePlugin.
//
// Per the Phase B migration brief (Template 1), `quantities` is one of the
// 29 reference scenes carved out of the monolithic `packages/engine/` into
// `@docent/core`'s plugin manifest.
//
// Cognitive cluster: `comparison` — quantified claims, measurements,
// magnitudes plotted as figures, a matrix, or a tweened counting metric.
//
// What ships here:
//   - The ScenePlugin export (`quantitiesPlugin`).
//   - The component (the kit-shaped renderer in `./component.tsx`).
//   - The schema fragment (the per-scene fields `figures`, `matrix`,
//     `metrics`, lifted from `packages/engine/schema/film.schema.json`).
//   - The structural validator (the `requiredBody.quantities` rule lifted
//     from `packages/engine/cli/validate.ts`).
//   - Empty `depthRules` and `judgeDimensions` arrays — quantities has no
//     scene-specific depthcheck rules or judge dimensions in v2.5.x; the
//     arrays are slots for future rules.
//
// The component speaks the kit's `SceneRenderProps<Scene>` envelope
// directly — no adapter needed. Wave B2 of the v3.0 stabilization sprint
// retired the `@docent-engine-bridge/*` back-channel and the engine-shaped
// `ts: TimedScene` prop bag that depended on it.

import type {CognitiveCluster, ScenePlugin, Scene} from '@docent/kit';

import {QuantitiesScene} from './component';
import {schema} from './schema';
import {validate} from './validate';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';

const cluster: CognitiveCluster = 'comparison';

export const quantitiesPlugin: ScenePlugin<Scene> = {
  kind: 'scene',
  name: 'quantities',
  version: '1.0.0',
  sceneType: 'quantities',
  cluster,
  schema,
  component: QuantitiesScene,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — quantities does NOT need word-level
  // alignment. Its rendering is driven by beats' set directives and the
  // numeric reveal map; the narration plays alongside without per-word
  // synchronization.
};

export default quantitiesPlugin;
