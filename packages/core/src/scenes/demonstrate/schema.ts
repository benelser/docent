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
//
// Two optional overlay primitives turn a passive playback into a
// guided demo: `cursor` and `pins`. Both are layered ABOVE the video
// in the active-video rect (the area the clip actually paints inside
// `objectFit: 'contain'` letterboxing). Coordinates are pixels in the
// clip's native canvas (the film's `meta.width` x `meta.height`); the
// renderer scales them into the active rect. `at` is frames relative
// to the scene's window (not the clip's own playhead) — most scenes
// start the video at scene-frame 0, but a kicker-into-clip transition
// can push the video start; the `at: { videoFrame: N }` form expresses
// timing in clip frames so the author thinks in "what's happening in
// the recording" not "what's happening in the scene".

import type {JSONSchema7} from 'json-schema';

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    'demonstrate scenes — *play the phenomenon itself*. The renderer embeds the clip referenced by `clip` (a path relative to `public/clips/<filmId>/`) inside a device-style window panel — title bar with traffic-light dots, accented border, soft glow — and lays the per-beat narration audio over it. When no clip is supplied the scene degrades to a centered placeholder (a play-icon and a "clip unavailable" caption) rather than crashing. The clip caption is rendered inside the title bar; `kicker` and `heading` populate the parent SceneFrame chrome. Optional `cursor` waypoints draw a moving pointer over the clip (with optional click ripples), and optional `pins` drop floating callout cards anchored at a point in the clip with a leader line — both turn a passive playback into a guided demo.',
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
    cursorStyle: {
      type: 'string',
      enum: ['mac', 'windows'],
      description:
        "the pointer glyph to draw for `cursor` waypoints. `mac` (default) draws a macOS-style arrow; `windows` draws a Windows-style chevron.",
    },
    cursor: {
      type: 'array',
      description:
        "ordered cursor waypoints. The cursor element tweens between them with an ease-in-out spring. Each waypoint's `at` is frames into the scene's window (or `{ videoFrame: N }` to express it in clip-frames — useful when authoring against a recording). A `click` waypoint fires a concentric-ring ripple at its (x, y) for ~250ms in the accent color; `hover` and `move` (the default) just sit. Coordinates are pixels in the clip's native canvas (the film's width x height) — the renderer scales them into the active video rect, so letterboxing from `objectFit: 'contain'` is handled automatically.",
      items: {
        type: 'object',
        required: ['at', 'x', 'y'],
        additionalProperties: false,
        properties: {
          at: {
            oneOf: [
              {type: 'number', minimum: 0},
              {
                type: 'object',
                required: ['videoFrame'],
                additionalProperties: false,
                properties: {
                  videoFrame: {
                    type: 'number',
                    minimum: 0,
                    description:
                      "frames into the clip's own playhead. Resolved against the scene window's video-start offset (0 today; reserved for a future kicker-into-clip transition).",
                  },
                },
              },
            ],
            description:
              "when the waypoint lands. A number is frames into the scene window. An object `{ videoFrame: N }` is frames into the clip's playhead.",
          },
          x: {
            type: 'number',
            description:
              "pixel X in the clip's native canvas (the film's `meta.width`). Mapped into the active video rect at render.",
          },
          y: {
            type: 'number',
            description:
              "pixel Y in the clip's native canvas (the film's `meta.height`). Mapped into the active video rect at render.",
          },
          action: {
            type: 'string',
            enum: ['move', 'click', 'hover'],
            description:
              "what happens AT this waypoint. `move` (default) is a transit point — no extra paint. `click` fires a concentric-ring ripple in the accent color for ~250ms. `hover` is a deliberate pause — the same visual as `move` but reads as intent in spec review.",
          },
        },
      },
    },
    pins: {
      type: 'array',
      description:
        'floating callout cards anchored at a point in the clip with a leader line. Each pin fades in at `at`, holds for `durationFrames`, then fades out. The card sits to one corner of the anchor (`anchor`) so it stays inside the active video rect; `leader: false` suppresses the connecting line for a pure floating label. Coordinates use the same clip-native pixel system as `cursor`.',
      items: {
        type: 'object',
        required: ['at', 'durationFrames', 'x', 'y', 'text'],
        additionalProperties: false,
        properties: {
          at: {
            oneOf: [
              {type: 'number', minimum: 0},
              {
                type: 'object',
                required: ['videoFrame'],
                additionalProperties: false,
                properties: {
                  videoFrame: {type: 'number', minimum: 0},
                },
              },
            ],
            description:
              "when the pin appears. A number is frames into the scene window. An object `{ videoFrame: N }` is frames into the clip's playhead.",
          },
          durationFrames: {
            type: 'number',
            minimum: 1,
            description: 'how long the pin stays on screen, in frames.',
          },
          x: {
            type: 'number',
            description: "pixel X in the clip's native canvas.",
          },
          y: {
            type: 'number',
            description: "pixel Y in the clip's native canvas.",
          },
          text: {
            type: 'string',
            minLength: 1,
            description:
              "the callout text. 1-2 short lines; wraps at the card's ~360px content width. Long copy (>60 chars) shrinks to fit rather than overflows.",
          },
          anchor: {
            type: 'string',
            enum: ['tl', 'tr', 'bl', 'br'],
            description:
              "which corner of the (x, y) anchor the card sits in. `tl` = card up-and-left, `tr` = card up-and-right, `bl` = card down-and-left, `br` = card down-and-right (default).",
          },
          leader: {
            type: 'boolean',
            description:
              'whether to draw a connecting leader line from the anchor point to the card. Default true.',
          },
        },
      },
    },
  },
};

export default schema;
