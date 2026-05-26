// @docent/core — `map` scene plugin.
//
// The spatial-argument move: position carries information. Cluster:
// `connection` — alongside structure, walkthrough, tree, the map argues
// from how the parts relate to each other in space (where they sit, what
// reaches what, what is near and what is far).
//
// Migrated from packages/engine/src/scenes/MapScene.tsx as part of the
// v3.0 plugin-architecture rip-and-replace. See ./component.tsx for the
// renderer, ./schema.ts for the spec branch, ./validate.ts for the
// structural validator, ./depth-rules.ts for the depthcheck contract
// (position-meaningful), ./judge-dimensions.ts for the judge's
// space-is-load-bearing dimension.

import type {ScenePlugin} from '@docent/kit';

import {MapSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {MapScene} from './validate';
import {validate} from './validate';

export const mapPlugin: ScenePlugin<MapScene> = {
  kind: 'scene',
  name: 'map',
  version: '1.0.0',
  sceneType: 'map',
  cluster: 'connection',
  schema,
  component: MapSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — map renders region labels and
  // narration; the default chunk-level alignment every TTS provider
  // supports is sufficient. No word-level karaoke needed.
};

export type {
  MapConnection,
  MapConnectionKind,
  MapLayout,
  MapMarker,
  MapMarkerKind,
  MapRegion,
  MapScene,
} from './validate';
export default mapPlugin;
