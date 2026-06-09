// @bjelser/core — `live-browser` scene plugin. R16.1.
//
// The docent move that *drives a real browser at render time*. Where
// `demonstrate` plays a pre-baked clip from disk, `live-browser` declares a
// URL + action script and lets the cascade's `live-capture-stage` spawn a
// headless Playwright session BEFORE the Remotion render — fresh capture
// every build. Cluster: `narrative` — same cluster as `demonstrate`, since
// the move is the same ("show the phenomenon"); the difference is in where
// the captured bytes came from.
//
// See ./component.tsx for the renderer (same window-style panel as
// demonstrate), ./schema.ts for the spec branch, ./validate.ts for the
// structural checks, and packages/kit/src/cascade/live-capture-stage.ts
// for the Playwright sidecar the cascade runs.

import type {ScenePlugin} from '@bjelser/kit';

import {LiveBrowserSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {LiveBrowserScene} from './validate';
import {validate} from './validate';

export const liveBrowserPlugin: ScenePlugin<LiveBrowserScene> = {
  kind: 'scene',
  name: 'live-browser',
  version: '1.0.0',
  sceneType: 'live-browser',
  cluster: 'narrative',
  schema,
  component: LiveBrowserSceneComponent,
  validate,
  depthRules,
  judgeDimensions,

  cue: 'show the live system itself — Playwright drives a real browser at render time, no stale recording.',
  signals: [
    {needle: 'live capture', weight: 4},
    {needle: 'live browser', weight: 4},
    {needle: 'computer use', weight: 4},
    {needle: 'playwright', weight: 3},
    {needle: 'real-time dashboard', weight: 3},
    {needle: 'drive the ui', weight: 2},
  ],
};

export type {LiveBrowserScene} from './validate';
export default liveBrowserPlugin;
