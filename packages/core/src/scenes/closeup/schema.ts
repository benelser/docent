// JSON Schema fragment for the `closeup` scene's per-type spec branch.
//
// Contributed to the computed film schema by the closeup plugin. The kit
// assembles the discriminated-union film schema at `Engine.schema()` call
// time from each registered ScenePlugin's `schema` field — there is no
// hand-written film schema after the rip-and-replace.
//
// The closeup scene is the "annotate a code artifact" move: a deep-dive
// on real source. The `code` string is the listing the renderer
// syntax-highlights via Prism; `lang` drives the Prism token grammar
// (default `'rust'`); `file` is the path drawn in the macOS-style window
// chrome. Beats spotlight a line range via `highlight: [firstLine,
// lastLine]` (1-indexed) and pin an annotation via `note` — both
// surfaced through the open Beat index signature in the kit.
//
// The v2.5.x engine's requiredBody table requires either `code` or
// `file`; the JSON Schema can't express the OR cleanly, so we mark both
// optional here and pin the cross-field invariant in ./validate.ts.

import type {JSONSchema7} from 'json-schema';

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    'closeup scenes — a deep-dive on a code artifact. `code` is the source listing the renderer syntax-highlights via Prism; `lang` drives the Prism token grammar (default `rust`); `file` is the path drawn in the macOS-style window chrome. Either `code` or `file` is required (the validator enforces the OR). Beats spotlight a 1-indexed line range via `highlight: [first, last]` and pin a single-line accent annotation under the window via `note`.',
  properties: {
    code: {
      type: 'string',
      description:
        'the source listing. Each line is highlighted by Prism; non-active beats de-emphasize unspotlighted lines without making them illegible. Trailing whitespace is trimmed before render.',
    },
    lang: {
      type: 'string',
      description:
        "the Prism language id for syntax highlighting (e.g. 'go', 'rust', 'ts', 'tsx', 'python'). Defaults to 'rust' when absent.",
    },
    file: {
      type: 'string',
      description:
        'the file path drawn in the window chrome (the macOS-style title bar). FittedText shrinks single-line with ellipsis when the path is wide.',
    },
    kicker: {
      type: 'string',
      description: "the section label rendered in the scene chrome (e.g. '02 // THE REDESIGN').",
    },
    heading: {
      type: 'string',
      description: 'the scene heading drawn beneath the kicker.',
    },
  },
};

export default schema;
