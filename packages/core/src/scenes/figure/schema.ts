// JSON Schema fragment for the `figure` scene's per-type spec branch.
//
// Contributed to the computed film schema by the figure plugin. The kit
// assembles the discriminated-union film schema at `Engine.schema()` call
// time from each registered ScenePlugin's `schema` field — there is no
// hand-written film schema after the rip-and-replace.
//
// The figure scene annotates a still image (a painting, a map, a
// photograph, an experimental stimulus). `image` is the file path,
// resolved via Remotion `staticFile` (a bare filename resolves under
// `public/figures/`; an explicit path is taken verbatim). `callouts` are
// labelled markers pinned to normalized 0..1 (x, y) regions of the
// image. Beats activate callout ids through the existing reveal/focus
// model (reveal brings a marker on, focus narrows to a subset).
//
// The shape mirrors the v2.5.x engine's film.schema.json definitions for
// `image`, `callouts` (top-level), and the `$defs/callout` object.

import type {JSONSchema7} from 'json-schema';

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    "figure scenes — annotate a still image (a painting, a map, a photograph, an experimental stimulus). `image` is resolved via Remotion `staticFile` (a bare filename resolves under `public/figures/`). `callouts` pin labelled markers to normalized 0..1 (x, y) regions of the image; beats activate callout ids through reveal/focus. If the image file is absent the scene degrades gracefully to a labelled panel — the type is always renderable.",
  required: ['image'],
  properties: {
    image: {
      type: 'string',
      minLength: 1,
      description:
        'the still image, resolved via Remotion `staticFile`. A bare filename resolves under `public/figures/`; an explicit path is taken verbatim. The author pins regions; the engine owns the pixels.',
    },
    callouts: {
      type: 'array',
      description:
        "labelled markers pinned to normalized regions of `image`, activated by beats' reveal/focus. Each callout carries a unique id, a normalized 0..1 (x, y) `at` point, a `label`, and an optional longer `note`.",
      items: {
        type: 'object',
        description:
          'one labelled marker pinned to a region of the image. `at` is a normalized 0..1 (x, y) position. A beat activates the callout by id through reveal/focus.',
        required: ['id', 'at', 'label'],
        additionalProperties: false,
        properties: {
          id: {
            type: 'string',
            minLength: 1,
            description:
              "unique within the scene; beats reveal/focus this id.",
          },
          at: {
            type: 'array',
            description:
              'normalized [x, y] position over the image, each in 0..1.',
            minItems: 2,
            maxItems: 2,
            items: {type: 'number', minimum: 0, maximum: 1},
          },
          label: {
            type: 'string',
            minLength: 1,
            description: "the marker's label.",
          },
          note: {
            type: 'string',
            minLength: 1,
            description: 'an optional longer note under the label.',
          },
          accent: {
            type: 'string',
            minLength: 1,
            description:
              "optional accent key from the resolved style's accent palette (e.g. 'violet', 'green', 'rose'). When set, this callout renders its marker, ring glow, and label-card border in this color instead of the scene's default accent. Lets a single figure carry span-typed callouts (purple plan_step, green llm_call, brown tool_call, red hallucination) without splitting into multiple scenes. Falls back to the scene default when absent or when the key isn't in the resolved accent palette.",
          },
        },
      },
    },
    kicker: {
      type: 'string',
      description:
        "the section label rendered in the scene chrome (e.g. '02 // THE FIGURE').",
    },
    heading: {
      type: 'string',
      description: 'the scene heading drawn beneath the kicker.',
    },
  },
};

export default schema;
