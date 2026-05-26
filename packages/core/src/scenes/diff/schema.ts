// JSON Schema fragment for the `diff` scene's per-type spec branch.
//
// Contributed to the computed film schema by the diff plugin. The kit
// assembles the discriminated-union film schema at `Engine.schema()` call
// time from each registered ScenePlugin's `schema` field — there is no
// hand-written film schema after the rip-and-replace.
//
// The diff scene is the PR-review move: a unified diff. The `code` string
// is the diff body where each line begins with a marker — `+` added,
// `-` removed, ` ` context — which the renderer strips, tints, and counts
// (the green/rose hunk stats in the window chrome). `lang` drives the
// Prism syntax tokens; `file` is the path drawn in the window chrome.
// Beats may spotlight a hunk via `highlight: [startLine, endLine]`.
//
// Note: the migration brief named the schema fields `before`/`after`. The
// actual v2.5.x DiffScene component reads `code` (a unified diff) plus
// `lang` and `file`. The migration template's hard constraint is
// "behavior unchanged from packages/engine/src/scenes/DiffScene.tsx" — so
// the schema describes what the component actually renders. The two
// existing diff scenes in films/ (kubernetes-pr, grammar-check) match
// this shape.

import type {JSONSchema7} from 'json-schema';

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    'diff scenes — a unified diff. `code` contains the diff body where each line begins with a marker (`+` added, `-` removed, ` ` context); the engine strips the marker, tints add/remove rows with the preset\'s green/rose accents, and surfaces hunk stats in the window chrome. `lang` drives Prism syntax highlighting; `file` is the path drawn in the window chrome. Beats may spotlight a hunk via `highlight: [startLine, endLine]`.',
  required: ['code'],
  properties: {
    code: {
      type: 'string',
      minLength: 1,
      description:
        "the unified-diff body. Each line begins with a marker — '+' for an added line, '-' for a removed line, ' ' for context. The renderer strips the marker, applies the preset's add/remove tints, and counts the +N/-M stats.",
    },
    lang: {
      type: 'string',
      description:
        "the Prism language id for syntax highlighting (e.g. 'go', 'rust', 'ts'). Defaults to 'rust' when absent.",
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
