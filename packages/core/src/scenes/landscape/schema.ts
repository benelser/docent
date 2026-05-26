// JSON Schema fragment for the `landscape` scene's per-type spec branch.
//
// Contributed to the computed film schema by the landscape plugin. The
// kit assembles the discriminated-union film schema at `Engine.schema()`
// call time from each registered ScenePlugin's `schema` field — there is
// no hand-written film schema after the rip-and-replace.
//
// landscape — N options plotted on M dimensions in 2-D, the quadrant-
// analysis primitive. The classic strategic / tool-survey shape: "cost
// vs value", "simplicity vs power", "latency vs throughput". The axes
// are not a numeric domain — they are TRADE-OFFS, each with a phrase at
// its low end and a phrase at its high end. The subjects sit at
// normalized {x, y} ∈ [0..1]²; the engine maps them to pixels. Four
// optional quadrant labels pin a phrase to TL / TR / BL / BR so the
// cells of the quadrant analysis can be named.
//
// The xAxis/yAxis shape is the LANDSCAPE-axis variant
// (`kind: 'landscape'`), not the chart-axis numeric domain. The
// validator pins the discriminator on every landscape scene's axes; the
// renderer narrows the widened `Axis | LandscapeAxis` union with a
// `kind === 'landscape'` check.

import type {JSONSchema7} from 'json-schema';

const landscapeAxisSchema: JSONSchema7 = {
  type: 'object',
  description:
    "landscape scenes — one of the two trade-off axes. NOT a numeric domain: the axis names a tension whose ends are *phrases*, the low end on the left/bottom, the high end on the right/top. `kind: 'landscape'` is the discriminator that narrows `Scene.xAxis`/`yAxis` from the widened `Axis | LandscapeAxis` union.",
  required: ['kind', 'label', 'lowLabel', 'highLabel'],
  additionalProperties: false,
  properties: {
    kind: {
      const: 'landscape',
      description:
        "the discriminator that narrows the axis to the landscape variant (versus `'chart'`).",
    },
    label: {
      type: 'string',
      minLength: 1,
      description: 'the axis title — the trade-off being named.',
    },
    lowLabel: {
      type: 'string',
      minLength: 1,
      description: 'the phrase pinned to the axis low end.',
    },
    highLabel: {
      type: 'string',
      minLength: 1,
      description: 'the phrase pinned to the axis high end.',
    },
  },
};

const landscapeSubjectSchema: JSONSchema7 = {
  type: 'object',
  description:
    "landscape scenes — one option plotted on the 2-D plane. `x`/`y` are normalized to [0..1]² (the engine maps them to plot pixels); `id` is the handle the beats reveal/focus; `label`/`sub` are the marker prose; `accent` optionally overrides the scene's chrome colour. A subject may carry an `embed`: a static sub-scene tableau (mechanism / venn / chart / quantities) sitting adjacent to the marker.",
  required: ['id', 'label', 'x', 'y'],
  properties: {
    id: {
      type: 'string',
      minLength: 1,
      description:
        'unique within the scene; beat reveal/focus reference this id.',
    },
    label: {
      type: 'string',
      minLength: 1,
      description: 'the marker label drawn beside the dot.',
    },
    sub: {
      type: 'string',
      minLength: 1,
      description: 'optional one-line gloss drawn under the label.',
    },
    x: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'normalized horizontal position; 0 = left axis, 1 = right.',
    },
    y: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'normalized vertical position; 0 = bottom axis, 1 = top.',
    },
    accent: {
      type: 'string',
      description:
        "optional override of the scene's chrome accent key ('blue', 'cyan', 'green', 'amber', 'rose', 'violet').",
    },
    embed: {
      description:
        'optional static sub-scene tableau pinned beside the marker. Allowlist: mechanism / venn / chart / quantities.',
    },
  },
};

const landscapeQuadrantsSchema: JSONSchema7 = {
  type: 'object',
  description:
    'landscape scenes — optional labels pinned to the four corners of the plane (TL / TR / BL / BR), naming the four cells of the quadrant analysis.',
  additionalProperties: false,
  properties: {
    tl: {type: 'string', minLength: 1, description: 'top-left corner phrase'},
    tr: {type: 'string', minLength: 1, description: 'top-right corner phrase'},
    bl: {type: 'string', minLength: 1, description: 'bottom-left corner phrase'},
    br: {type: 'string', minLength: 1, description: 'bottom-right corner phrase'},
  },
};

/**
 * The plugin's contributed JSON Schema branch. The kit unions this with
 * every other registered scene plugin's `schema` into the computed film
 * schema.
 *
 * Only landscape-specific fields are declared here — the common scene
 * fields (`id`, `type`, `beats`, `style`, `kicker`, `heading`, etc.) live
 * in the shared base scene schema the kit owns.
 */
export const schema: JSONSchema7 = {
  type: 'object',
  description:
    "landscape scenes — N options plotted on M dimensions in 2-D, the quadrant-analysis primitive. The axes are TRADE-OFFS (not numeric domains), each with a phrase at the low end and a phrase at the high end. Subjects sit at normalized {x, y} ∈ [0..1]². Beats reveal subject ids and focus subsets to walk the narration's eye across the plane.",
  required: ['type', 'xAxis', 'yAxis', 'subjects'],
  properties: {
    type: {const: 'landscape'},
    xAxis: {
      ...landscapeAxisSchema,
      description:
        'landscape scenes — the horizontal trade-off axis (landscape-axis variant, `kind: "landscape"`).',
    },
    yAxis: {
      ...landscapeAxisSchema,
      description:
        'landscape scenes — the vertical trade-off axis (landscape-axis variant, `kind: "landscape"`).',
    },
    subjects: {
      type: 'array',
      description:
        'landscape scenes — the markers plotted on the plane (2-8 entries).',
      minItems: 2,
      maxItems: 8,
      items: landscapeSubjectSchema,
    },
    quadrants: {
      ...landscapeQuadrantsSchema,
      description:
        'landscape scenes — optional labels pinned to the four corners, naming the cells of the quadrant analysis.',
    },
    kicker: {
      type: 'string',
      description: "the section label rendered in the scene chrome (e.g. '03 // THE LANDSCAPE').",
    },
    heading: {
      type: 'string',
      description: 'the scene heading drawn beneath the kicker.',
    },
  },
};

export default schema;
