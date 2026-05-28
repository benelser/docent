// @bjelser/core — `concession` scene plugin.
//
// The film draws the line — what it does NOT cover. Cluster: `narrative`
// (a rhetorical move; the film commits editorially to what it is and is
// not arguing about, the way a piece of prose names its frame before it
// makes its case).
//
// Migrated from packages/engine/src/scenes/ConcessionScene.tsx as part of
// the v3.0 plugin-architecture rip-and-replace. See ./component.tsx for
// the renderer, ./schema.ts for the spec branch, ./validate.ts for the
// structural validator, ./depth-rules.ts for the `concession-non-trivial`
// depth rule, and ./judge-dimensions.ts for the `scope-honest` judge
// dimension.

import type {ScenePlugin} from '@bjelser/kit';

import {ConcessionSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {ConcessionScene} from './validate';
import {validate} from './validate';

export const concessionPlugin: ScenePlugin<ConcessionScene> = {
  kind: 'scene',
  name: 'concession',
  version: '1.0.0',
  sceneType: 'concession',
  cluster: 'narrative',
  schema,
  component: ConcessionSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — concession renders prose chunks,
  // not karaoke-aligned passage text; the default chunk-level alignment
  // every TTS provider supports is sufficient.

  cue: 'the film argues something narrow — IN SCOPE / OUT OF SCOPE columns sharpen every claim.',
  signals: [
    {needle: 'out of scope', weight: 4},
    {needle: 'in scope', weight: 2},
    {needle: 'in scope / out of scope', weight: 4},
    {needle: 'explicit scope cut', weight: 4},
    {needle: 'scope cuts', weight: 3},
    {needle: 'set aside explicitly', weight: 3},
    {needle: 'content boundary', weight: 2},
  ],
};

export type {ConcessionScene} from './validate';
export default concessionPlugin;
