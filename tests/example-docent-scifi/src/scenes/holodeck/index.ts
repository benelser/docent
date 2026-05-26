// holodeckPlugin — the third-party `ScenePlugin` the acceptance test mounts.
//
// Registered via `engine.use(scifi)`. The engine's scene registry conflicts
// hard-fail on duplicate sceneType, so `holodeck` is uniquely ours.

import type {ScenePlugin} from '@docent/kit';

import {HolodeckSceneComponent} from './component';
import {holodeckSchema, type HolodeckSceneSpec} from './schema';

export const holodeckPlugin: ScenePlugin<HolodeckSceneSpec> = {
  kind: 'scene',
  name: '@example/docent-scifi/holodeck',
  version: '0.1.0',
  sceneType: 'holodeck',
  cluster: 'experience',
  schema: holodeckSchema,
  component: HolodeckSceneComponent,
  // Permissive validator — the acceptance test bar is "renders end to end",
  // not "exhaustively validates exotic edge cases."
  validate: (scene) => {
    if (!scene || typeof scene !== 'object') {
      return [{path: '', message: 'expected an object', severity: 'error'}];
    }
    return [];
  },
};
