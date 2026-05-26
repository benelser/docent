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
//   - The component (preserved verbatim from the engine's
//     `QuantitiesScene.tsx`, with engine-private utilities shimmed until
//     they are migrated in their own Phase B tasks).
//   - The schema fragment (the per-scene fields `figures`, `matrix`,
//     `metrics`, lifted from `packages/engine/schema/film.schema.json`).
//   - The structural validator (the `requiredBody.quantities` rule lifted
//     from `packages/engine/cli/validate.ts`).
//   - Empty `depthRules` and `judgeDimensions` arrays — quantities has no
//     scene-specific depthcheck rules or judge dimensions in v2.5.x; the
//     arrays are slots for future rules.
//
// The component-prop adapter (`Component`) bridges the kit's protocol shape
// (`SceneRenderProps<Scene>`, with `scene` + `common: {ts, sceneIndex,
// sceneCount, meta, style}`) to the engine's existing component shape
// (`SceneProps & {style}`, with `ts.scene` and flat `sceneIndex` /
// `sceneCount` / `style`). Phase D rewires `Film.tsx` to dispatch through
// `engine.scenes.get(type).component` with the kit-shaped props; the
// adapter is what makes the verbatim-copy component speak that protocol.

import React from 'react';

import type {
  CognitiveCluster,
  ScenePlugin,
  Scene,
  SceneRenderProps,
} from '@docent/kit';

import {QuantitiesScene} from './component';
import {schema} from './schema';
import {validate} from './validate';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';

const cluster: CognitiveCluster = 'comparison';

// Adapter: kit's `SceneRenderProps<Scene>` → engine's `SceneProps & {style}`.
// The kit passes `{scene, common: {ts, sceneIndex, sceneCount, meta, style}}`.
// The migrated component expects `{ts, sceneIndex, sceneCount, style}` with
// `ts.scene` carrying the spec. We compose the engine-shaped `ts` from the
// kit-shaped `common.ts` plus the scene spec.
const Component: React.ComponentType<SceneRenderProps<Scene>> = (props) => {
  const {scene, common} = props;
  const engineTs = {...(common.ts as object), scene};
  // The engine component uses a wider runtime shape than the kit's protocol
  // types; the conversion at this seam is intentional and limited to v1.
  const ScenePropsAny = QuantitiesScene as unknown as React.FC<{
    ts: unknown;
    sceneIndex: number;
    sceneCount: number;
    style: unknown;
  }>;
  return (
    <ScenePropsAny
      ts={engineTs}
      sceneIndex={common.sceneIndex}
      sceneCount={common.sceneCount}
      style={common.style}
    />
  );
};

export const quantitiesPlugin: ScenePlugin<Scene> = {
  kind: 'scene',
  name: 'quantities',
  version: '1.0.0',
  sceneType: 'quantities',
  cluster,
  schema,
  component: Component,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — quantities does NOT need word-level
  // alignment. Its rendering is driven by beats' set directives and the
  // numeric reveal map; the narration plays alongside without per-word
  // synchronization.
};

export default quantitiesPlugin;
