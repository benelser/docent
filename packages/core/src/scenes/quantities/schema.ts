// JSON Schema fragment for the `quantities` scene type.
//
// MIGRATED from `packages/engine/schema/film.schema.json` — the per-type
// fields (`figures`, `matrix`, `metrics`) plus the per-type `metric`
// definition, lifted out of the god-schema. The COMMON scene fields (`id`,
// `type`, `beats`, `kicker`, `heading`, `cut`, `style`, …) live in the kit's
// base scene schema and are unioned in by `Engine.schema()` at runtime.
//
// `quantities` scenes — magnitudes as either:
//   - **figures**: a centred grid of big-number figure cards (label / value /
//     unit / note), revealed progressively across beats.
//   - **matrix**: a labelled numeric grid (rowLabels × colLabels with cell
//     entries), revealed in row-major order.
//   - **metrics**: figure cards whose displayed number IS a tweened value
//     driven by beats' `set` directives — counts up to a target across beats.
//
// At least one of `figures`, `matrix.cells`, or `metrics` must be present
// (enforced by `validate.ts`, not by JSON Schema, because the constraint is
// a disjunction across fields).

import type {JSONSchema7} from 'json-schema';

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    'quantities scenes — magnitudes as a grid of figure cards, a labelled numeric matrix, or `metrics` (figure cards whose displayed number is a tweened, counting value driven by beats `set` directives).',
  properties: {
    figures: {
      type: 'array',
      description:
        'quantities scenes — a centred grid of big-number figure cards (label / value / unit / note).',
      items: {
        type: 'object',
        required: ['id', 'label', 'value'],
        additionalProperties: false,
        properties: {
          id: {type: 'string'},
          label: {type: 'string'},
          value: {type: 'string'},
          unit: {type: 'string'},
          note: {type: 'string'},
        },
      },
    },
    matrix: {
      type: 'object',
      description:
        'quantities scenes — a labelled numeric grid (rowLabels × colLabels with `cells` as a 2-D string matrix).',
      required: ['rowLabels', 'colLabels', 'cells'],
      additionalProperties: false,
      properties: {
        rowLabels: {type: 'array', items: {type: 'string'}},
        colLabels: {type: 'array', items: {type: 'string'}},
        cells: {
          type: 'array',
          items: {
            type: 'array',
            items: {type: 'string'},
          },
        },
      },
    },
    metrics: {
      type: 'array',
      description:
        'quantities scenes — figure cards whose displayed number is a tweened value that counts up across beats. `bind` names the `set` key the metric reads from; `col`/`row` place it on a grid; `format` controls numeric rendering.',
      items: {
        type: 'object',
        required: ['id', 'label', 'col', 'row', 'bind'],
        additionalProperties: false,
        properties: {
          id: {type: 'string'},
          label: {type: 'string'},
          col: {type: 'integer', minimum: 0},
          row: {type: 'integer', minimum: 0},
          bind: {
            type: 'string',
            description: 'the `set` key this metric reads from',
          },
          format: {enum: ['int', 'float1', 'percent']},
          unit: {type: 'string'},
          accent: {
            enum: ['blue', 'cyan', 'green', 'amber', 'rose', 'violet'],
          },
        },
      },
    },
  },
};

export default schema;
