// @docent/core — `objection` scene plugin.
//
// The rhetorical scene where the film argues against itself, then refutes.
// Per the cognitive-cluster taxonomy, objection belongs to the `narrative`
// cluster — story, argument, commitment, the rhetorical "we chose X because
// of Y". This is where the film makes a stand against itself, partially or
// in full.
//
// This is the plugin export — the manifest entry @docent/core's index.ts
// imports and registers. All Phase B mechanics live in the sibling files:
// component.tsx (the renderer), schema.ts (the per-type JSON Schema
// fragment), validate.ts (cross-field structural checks), depth-rules.ts
// (objection-steelmanned), judge-dimensions.ts (objection-real).

import type {ScenePlugin} from '@docent/kit';

import {ObjectionSceneComponent, type ObjectionSpec} from './component';
import {schema} from './schema';
import {validate} from './validate';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';

export const objectionPlugin: ScenePlugin<ObjectionSpec> = {
  kind: 'scene',
  name: 'objection',
  version: '1.0.0',
  sceneType: 'objection',
  // `narrative` — objection makes a rhetorical stand (the film argues
  // against itself, then refutes). Per the cluster table in
  // docs/design/migration-brief-templates.md.
  cluster: 'narrative',
  schema,
  component: ObjectionSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // No `requiresTtsCapabilities` — objection plays narration like any
  // other scene but does not depend on word-level alignment.
};

export type {ObjectionSpec};
export default objectionPlugin;
