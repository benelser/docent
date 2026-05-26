// JSON Schema fragment for the `passage` scene's per-type spec branch.
//
// Contributed to the computed film schema by the passage plugin. The kit
// assembles the discriminated-union film schema at `Engine.schema()` call
// time from each registered ScenePlugin's `schema` field — there is no
// hand-written film schema after the rip-and-replace.
//
// The passage scene annotates a plain-text artifact — a poem, prose, a
// primary-source document. NOT code: no syntax highlighter, no gutter,
// no file-path window chrome. The artifact is `text`, typeset as prose
// or verse in a serif face with line breaks preserved. The annotation
// unit is a `mark` — a span (`quote`) located in the text,
// underlined/highlighted, with a short `note` pinned beside it. Beats
// activate marks through the existing reveal/focus model: `reveal`
// brings marks in, `focus` narrows attention to a subset. Several marks
// can be live at once.
//
// Mirrors the `passage`-specific fields from
// packages/engine/schema/film.schema.json (the `text` and `marks`
// properties on the scene, plus the `mark` $def for items in the marks
// array).

import type {JSONSchema7} from 'json-schema';

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    'passage scenes — annotate a plain-text artifact (a poem, prose, a primary source). `text` is typeset as prose/verse with line breaks preserved; `marks` are the annotatable spans, each pinning a `note` to an exact `quote` substring of the text. A beat activates marks by id through reveal/focus.',
  required: ['text'],
  properties: {
    text: {
      type: 'string',
      minLength: 1,
      description:
        'the plain-text artifact, typeset as prose/verse with line breaks preserved. Renders in the resolved serif family — preset-driven (e.g. editorial, paper swap in their own serif).',
    },
    marks: {
      type: 'array',
      description:
        'the annotatable spans of `text`, activated by beats through reveal/focus. Several marks can be live at once. Each mark pins a `note` to an exact `quote` substring; a quote that is not a substring of `text` is rejected at validation time.',
      items: {
        type: 'object',
        description:
          'one annotatable span. `quote` is the exact substring of the scene\'s `text` to highlight; the engine underlines/highlights it and pins `note` beside it. A beat activates marks by id through reveal/focus.',
        required: ['id', 'quote', 'note'],
        additionalProperties: false,
        properties: {
          id: {
            type: 'string',
            minLength: 1,
            description: 'unique within the scene; beats reveal/focus this id',
          },
          quote: {
            type: 'string',
            minLength: 1,
            description: 'the exact substring of `text` to locate and highlight',
          },
          note: {
            type: 'string',
            minLength: 1,
            description: 'the short annotation pinned to the span',
          },
        },
      },
    },
    kicker: {
      type: 'string',
      description: "the section label rendered in the scene chrome (e.g. '02 // THE SOURCE').",
    },
    heading: {
      type: 'string',
      description: 'the scene heading drawn beneath the kicker.',
    },
  },
};

export default schema;
