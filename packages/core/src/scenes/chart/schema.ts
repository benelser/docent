// JSON Schema fragment for the `chart` scene's per-type spec branch.
//
// Contributed to the computed film schema by the chart plugin. The kit
// assembles the discriminated-union film schema at `Engine.schema()` call
// time from each registered ScenePlugin's `schema` field — there is no
// hand-written film schema after the rip-and-replace.
//
// The chart scene is the `comparison` cluster's plotted-coordinate move: a
// pair of labelled axes (the numeric axis variant — `kind: 'chart'`, the
// discriminator that narrows `Scene.xAxis`/`yAxis` from the widened
// `axis | landscape-axis` union at the renderer) with one or more `series`
// drawn on the plane. A series is `line`, `bars`, or `point`:
//
//   - `line`  — a curve, either a named `fn` from the closed allowlist
//               ('linear', 'x^2', 'sqrt', 'sin', 'exp', 'log',
//               'reciprocal') or explicit `points`; drawn on with
//               evolvePath across its reveal beat.
//   - `bars`  — a bar per datum {label, value}; each bar's height is a
//               tweened value (drives via beats' `set` keyed
//               `chart:<seriesId>:<i>`), or grows 0 → datum on the
//               series' reveal beat by default. Capped at 8 for legibility.
//   - `point` — a marker that rides a curve: its x is a `set` key named
//               by `bind`, its y is read off the line series named by
//               `along`.
//
// The `fn` allowlist and `kind` enums are CLOSED — a value outside them is
// rejected. This is the chart analogue of the intent knobs: an author
// names a shape, the engine owns the math; never an arbitrary expression.
//
// Migrated from packages/engine/schema/film.schema.json — the `axis`,
// `series` $defs plus the `xAxis`/`yAxis`/`series` properties from the
// scene shell, lifted out of the god-schema.

import type {JSONSchema7} from 'json-schema';

const axisSchema: JSONSchema7 = {
  type: 'object',
  description:
    "a chart axis — a labelled domain the engine maps onto STAGE pixels. `kind: 'chart'` is the discriminator that narrows Scene.xAxis/yAxis from axis | landscape-axis.",
  required: ['kind', 'label', 'min', 'max'],
  additionalProperties: false,
  properties: {
    kind: {
      const: 'chart',
      description:
        'the discriminator that narrows Scene.xAxis/yAxis from axis | landscape-axis',
    },
    label: {type: 'string'},
    min: {type: 'number'},
    max: {type: 'number', description: 'must be greater than min'},
    ticks: {
      type: 'integer',
      minimum: 2,
      maximum: 10,
      description: 'tick marks along the axis; capped at 10 for legibility',
    },
  },
};

const seriesSchema: JSONSchema7 = {
  type: 'object',
  description:
    'a plotted chart series. `kind` picks the geometry; a `line` names a `fn` from the closed allowlist or gives explicit `points`, `bars` carries `data`, `point` is a marker bound to a curve.',
  required: ['id', 'kind'],
  additionalProperties: false,
  properties: {
    id: {type: 'string'},
    kind: {enum: ['line', 'bars', 'point']},
    accent: {enum: ['blue', 'cyan', 'green', 'amber', 'rose', 'violet']},
    fn: {
      enum: ['linear', 'x^2', 'sqrt', 'sin', 'exp', 'log', 'reciprocal'],
      description:
        'line series — a named function from the closed allowlist; never an arbitrary expression',
    },
    points: {
      type: 'array',
      description: 'line series — an explicit polyline, an alternative to `fn`',
      minItems: 2,
      items: {
        type: 'array',
        items: {type: 'number'},
        minItems: 2,
        maxItems: 2,
      },
    },
    data: {
      type: 'array',
      description: 'bars series — one datum per bar; capped at 8 for legibility',
      minItems: 1,
      items: {
        type: 'object',
        required: ['label', 'value'],
        additionalProperties: false,
        properties: {
          label: {type: 'string'},
          value: {type: 'number'},
        },
      },
    },
    bind: {
      type: 'string',
      description: "point series — a `set` key giving the marker's x",
    },
    along: {
      type: 'string',
      description:
        "point series — the line series id whose curve gives the marker's y",
    },
  },
};

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    "chart scenes — a plotted coordinate graph. Axes are labelled numeric domains (`kind: 'chart'`); series are line / bars / point, drawn on the plane. The `fn` allowlist is closed: the author names a shape, the engine owns the math.",
  required: ['series'],
  properties: {
    xAxis: {
      ...axisSchema,
      description:
        'the horizontal axis domain (numeric). When omitted, falls back to {kind: "chart", label: "x", min: 0, max: 10, ticks: 5}.',
    },
    yAxis: {
      ...axisSchema,
      description:
        'the vertical axis domain (numeric). When omitted, falls back to {kind: "chart", label: "y", min: 0, max: 10, ticks: 5}.',
    },
    series: {
      type: 'array',
      description: 'the plotted series (line / bars / point). At least one required.',
      minItems: 1,
      items: seriesSchema,
    },
    kicker: {
      type: 'string',
      description: "the section label rendered in the scene chrome (e.g. '02 // THE SHAPE').",
    },
    heading: {
      type: 'string',
      description: 'the scene heading drawn beneath the kicker.',
    },
  },
};

export default schema;
