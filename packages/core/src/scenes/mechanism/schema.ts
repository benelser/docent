// JSON Schema fragment for the mechanism scene type.
//
// Ported byte-equivalently from packages/engine/schema/film.schema.json's
// per-scene `mechanism-part`, `mechanism-motion`, and `mechanism-phase-freeze`
// $defs, recomposed as ONE plugin-owned branch.
//
// The branch declares only the per-type fields (parts / motion / freezes) and
// constrains `type: const 'mechanism'`. The kit assembles this with every
// other scene branch into the discriminated union at Engine.schema() time
// (Phase C); no hand-written `film.schema.json`.

import type {JSONSchema7} from 'json-schema';

const mechanismPartSchema: JSONSchema7 = {
  type: 'object',
  description:
    "mechanism scenes — one named position on the stage the motion visits. `kind` picks the visual: `node` is the labelled card (default), `value` a numeric readout (used by oscillate), `token` a small accent puck (used by motion paths).",
  required: ['id', 'label', 'pos'],
  additionalProperties: false,
  properties: {
    id: {
      type: 'string',
      description: 'unique within the scene; motion paths reference this id',
    },
    label: {type: 'string'},
    sub: {
      type: 'string',
      description: 'a one-line gloss, or the numeric value when `kind: value`',
    },
    pos: {
      type: 'object',
      description: 'normalized 0..1 position on the stage',
      required: ['x', 'y'],
      additionalProperties: false,
      properties: {
        x: {type: 'number', minimum: 0, maximum: 1},
        y: {type: 'number', minimum: 0, maximum: 1},
      },
    },
    kind: {enum: ['node', 'value', 'token']},
  },
};

const mechanismMotionSchema: JSONSchema7 = {
  description:
    'mechanism scenes — the procedural motion primitive. `cycle` carries a token around a closed loop, `oscillate` bounces a value between two parts, `descend` walks a marker from one part to another, `iterate` ticks through named phases each highlighting a subset of parts.',
  oneOf: [
    {
      type: 'object',
      required: ['kind', 'path', 'period'],
      additionalProperties: false,
      properties: {
        kind: {const: 'cycle'},
        path: {
          type: 'array',
          description:
            'ordered list of part ids the token visits, closing back to the first',
          minItems: 2,
          items: {type: 'string'},
        },
        period: {
          type: 'number',
          exclusiveMinimum: 0,
          exclusiveMaximum: 600,
          description: 'frames per full loop',
        },
      },
    },
    {
      type: 'object',
      required: ['kind', 'between', 'period'],
      additionalProperties: false,
      properties: {
        kind: {const: 'oscillate'},
        between: {
          type: 'array',
          description: 'two part ids the value bounces between',
          minItems: 2,
          maxItems: 2,
          items: {type: 'string'},
        },
        period: {type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 600},
      },
    },
    {
      type: 'object',
      required: ['kind', 'from', 'to', 'period'],
      additionalProperties: false,
      properties: {
        kind: {const: 'descend'},
        from: {type: 'string', description: 'part id the marker starts at'},
        to: {type: 'string', description: 'part id the marker descends to'},
        period: {type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 600},
      },
    },
    {
      type: 'object',
      required: ['kind', 'phases', 'period'],
      additionalProperties: false,
      properties: {
        kind: {const: 'iterate'},
        phases: {
          type: 'array',
          description:
            'ordered list of named phases; each highlights a subset of part ids',
          minItems: 2,
          items: {
            type: 'object',
            required: ['label', 'show'],
            additionalProperties: false,
            properties: {
              label: {type: 'string'},
              show: {
                type: 'array',
                minItems: 1,
                items: {type: 'string'},
              },
            },
          },
        },
        period: {type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 600},
      },
    },
  ],
};

const mechanismPhaseFreezeSchema: JSONSchema7 = {
  type: 'object',
  description:
    'mechanism scenes — a beat-level pause on a named phase. The motion freezes at phase `phase` for the duration of the beat named by `beatId`; the next beat resumes it.',
  required: ['beatId', 'phase'],
  additionalProperties: false,
  properties: {
    beatId: {
      type: 'string',
      description: 'the id of the beat whose duration freezes the motion',
    },
    phase: {
      type: 'integer',
      minimum: 0,
      description: 'the integer step in [0, length-of-loop) to freeze on',
    },
  },
};

/**
 * The plugin's contributed JSON Schema branch. The kit unions this with every
 * other registered scene plugin's `schema` into the computed film schema.
 *
 * Only mechanism-specific fields are declared here — the common scene fields
 * (`id`, `type`, `beats`, `style`, `kicker`, `heading`, etc.) live in the
 * shared base scene schema the kit owns.
 */
export const schema: JSONSchema7 = {
  type: 'object',
  required: ['type', 'parts', 'motion'],
  properties: {
    type: {const: 'mechanism'},
    parts: {
      type: 'array',
      description:
        'mechanism scenes — the named positions on the stage the motion visits (2-10 entries)',
      minItems: 2,
      maxItems: 10,
      items: mechanismPartSchema,
    },
    motion: {
      ...mechanismMotionSchema,
      description:
        'mechanism scenes — the procedural motion primitive that loops over the parts',
    },
    freezes: {
      type: 'array',
      description:
        'mechanism scenes — per-beat pauses on a named phase, so the narration can call out what is happening before the motion resumes',
      items: mechanismPhaseFreezeSchema,
    },
  },
};

export default schema;
