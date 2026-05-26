// JSON Schema fragment for the `demonstrate` scene's per-type spec
// branch.
//
// Contributed to the computed film schema by the demonstrate plugin.
// The kit assembles the discriminated-union film schema at
// `Engine.schema()` call time from each registered ScenePlugin's
// `schema` field — there is no hand-written film schema after the
// rip-and-replace.
//
// The demonstrate scene is the docent move that shows the phenomenon
// itself: an embedded screen-capture clip, framed in a device-style
// panel, with the narration playing over it. The `clip` field is the
// load-bearing reference — a path relative to `public/clips/<filmId>/`
// the renderer resolves via Remotion's `staticFile`. When the clip is
// absent the scene degrades to a centered placeholder panel (no
// crash on a missing file), but a spec author should always supply a
// clip — the validator surfaces a missing clip as an error.

import type {JSONSchema7} from 'json-schema';

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    'demonstrate scenes — *play the phenomenon itself*. The renderer embeds the clip referenced by `clip` (a path relative to `public/clips/<filmId>/`) inside a device-style window panel — title bar with traffic-light dots, accented border, soft glow — and lays the per-beat narration audio over it. When no clip is supplied the scene degrades to a centered placeholder (a play-icon and a "clip unavailable" caption) rather than crashing. The clip caption is rendered inside the title bar; `kicker` and `heading` populate the parent SceneFrame chrome.',
  required: ['clip'],
  properties: {
    clip: {
      type: 'string',
      minLength: 1,
      description:
        'path to the clip file, relative to `public/clips/<filmId>/`. The renderer resolves it via Remotion\'s `staticFile`. The clip filename also doubles as the caption drawn in the panel\'s title bar.',
    },
    kicker: {
      type: 'string',
      description: "the section label rendered in the scene chrome (e.g. '04 // SEE IT IN MOTION').",
    },
    heading: {
      type: 'string',
      description: 'the scene heading drawn beneath the kicker.',
    },
  },
};

export default schema;
