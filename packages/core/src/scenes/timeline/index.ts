// @docent/core — `timeline` scene plugin.
//
// Events plotted on a real date axis: the gaps between events are part of
// the argument. Cluster: `time` (time-as-load-bearing — alongside
// `progression`, the other scene whose native shape is *the axis of when*).
//
// Migrated from packages/engine/src/scenes/TimelineScene.tsx and
// packages/engine/src/engine/time.ts as part of the v3.0
// plugin-architecture rip-and-replace. See ./component.tsx for the
// renderer, ./schema.ts for the spec branch, ./validate.ts for the
// structural validator, ./_time.ts for the date parser, ./depth-rules.ts
// for the timeline-dates-real soft-warn, and ./judge-dimensions.ts for
// the time-is-load-bearing axis.

import type {ScenePlugin} from '@docent/kit';

import {TimelineSceneComponent} from './component';
import {depthRules} from './depth-rules';
import {judgeDimensions} from './judge-dimensions';
import {schema} from './schema';
import type {TimelineScene} from './validate';
import {validate} from './validate';

export const timelinePlugin: ScenePlugin<TimelineScene> = {
  kind: 'scene',
  name: 'timeline',
  version: '1.0.0',
  sceneType: 'timeline',
  cluster: 'time',
  schema,
  component: TimelineSceneComponent,
  validate,
  depthRules,
  judgeDimensions,
  // requiresTtsCapabilities: undefined — timeline renders dated cards and
  // span bars, not karaoke word-aligned passage text; the default
  // chunk-level alignment every TTS provider supports is sufficient.

  cue: 'the GAPS between dates are part of the argument (real date axis, proportional spacing).',
  signals: [
    {needle: 'timeline', weight: 3},
    {needle: 'date axis', weight: 4},
    {needle: 'chronological', weight: 3},
    {needle: 'chronology', weight: 3},
    {needle: 'dated milestones', weight: 4},
    {needle: 'gaps between', weight: 2},
    {needle: 'years between', weight: 2},
    {needle: 'months between', weight: 2},
    {needle: 'time axis', weight: 3},
    {needle: 'historical record', weight: 2},
    {needle: 'milestone dates', weight: 3},
    {needle: 'arc of', weight: 1},
  ],
};

export type {
  EmbeddedSceneSpec,
  TimelineAxis,
  TimelineEvent,
  TimelineScene,
  TimelineSpan,
} from './validate';
export default timelinePlugin;
