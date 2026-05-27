// @docent/core — `walkthrough` scene plugin.
//
// The sequence-diagram move: a small cast of actors with vertical
// lifelines, and messages that hop between them one beat at a time — a
// request, a reply, a unit of data moving through the system over time.
// Cluster: `connection` — *who talks to whom*, the native shape for
// message-passing topology.
//
// Migrated from packages/engine/src/scenes/WalkthroughScene.tsx as part
// of the v3.0 plugin-architecture rip-and-replace. See ./component.tsx
// for the renderer, ./schema.ts for the spec branch, and ./validate.ts
// for the structural validator.

import type {ScenePlugin} from '@docent/kit';

import {WalkthroughSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {WalkthroughScene} from './validate';
import {validate} from './validate';

export const walkthroughPlugin: ScenePlugin<WalkthroughScene> = {
  kind: 'scene',
  name: 'walkthrough',
  version: '1.0.0',
  sceneType: 'walkthrough',
  cluster: 'connection',
  schema,
  component: WalkthroughSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — walkthrough renders message
  // labels and actor pills, not karaoke word-aligned passage text; the
  // default chunk-level alignment every TTS provider supports is
  // sufficient.

  cue: 'the argument depends on WHO passes WHAT to WHOM and WHEN (actors over time).',
  signals: [
    {needle: 'sequence diagram', weight: 4},
    {needle: 'actors exchange', weight: 4},
    {needle: 'protocol exchange', weight: 3},
    {needle: 'handshake', weight: 2},
    {needle: 'request/response', weight: 2},
    {needle: 'step by step', weight: 1},
    {needle: 'who passes what', weight: 4},
    {needle: 'message exchange', weight: 3},
    {needle: 'over a sequence', weight: 2},
  ],
};

export type {WalkthroughScene} from './validate';
export default walkthroughPlugin;
