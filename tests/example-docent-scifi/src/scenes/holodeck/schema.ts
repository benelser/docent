// HolodeckSceneSpec — the per-scene-type shape declared by this plugin.
//
// Contributed to the engine's union schema via the ScenePlugin's `schema`
// field. The kit's `Engine.schema()` composes this into one branch of the
// discriminated `oneOf` on `scene.type`.

import type {JSONSchema7} from 'json-schema';

import type {Scene} from '@bjelser/kit';

export interface HolodeckSceneSpec extends Scene {
  readonly type: 'holodeck';
  readonly kicker?: string;
  readonly title?: string;
  readonly subtitle?: string;
}

export const holodeckSchema: JSONSchema7 = {
  type: 'object',
  required: ['type'],
  properties: {
    type: {const: 'holodeck'},
    id: {type: 'string'},
    kicker: {type: 'string'},
    title: {type: 'string'},
    subtitle: {type: 'string'},
    beats: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: {type: 'string'},
          narration: {type: 'string'},
        },
      },
    },
  },
};
