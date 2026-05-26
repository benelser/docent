// JSON Schema fragment for the `causal-loop` scene's per-type spec branch.
//
// Contributed to the computed film schema by the causal-loop plugin. The
// kit assembles the discriminated-union film schema at `Engine.schema()`
// call time from each registered ScenePlugin's `schema` field — there is
// no hand-written film schema after the rip-and-replace.
//
// The causal-loop scene is the system-dynamics primitive — feedback
// diagrams. Variables sit as labelled discs arranged in a ring; directed
// edges between them carry a polarity glyph (+/-); one or more loops
// overlay the diagram and are labelled reinforcing (R, even number of '-'
// edges) or balancing (B, odd number). The labelling math is enforced by
// the structural validator — the label cannot lie.
//
// Ported byte-equivalently from packages/engine/schema/film.schema.json's
// `causal-variable`, `causal-edge`, and `causal-loop` $defs plus the
// per-scene `variables`/`causalEdges`/`loops` fields.

import type {JSONSchema7} from 'json-schema';

const causalVariableSchema: JSONSchema7 = {
  type: 'object',
  description:
    'causal-loop scenes — one variable of the system, drawn as a labelled disc on the ring. The variables are the *nouns* of the feedback diagram.',
  required: ['id', 'label'],
  additionalProperties: false,
  properties: {
    id: {
      type: 'string',
      description:
        'unique within the scene; beats reveal/focus this id and edges reference it',
    },
    label: {
      type: 'string',
      description: "the variable's short name (e.g. 'Debt', 'Interest payments')",
    },
    sub: {
      type: 'string',
      description: 'an optional one-line gloss shown under the label',
    },
  },
};

const causalEdgeSchema: JSONSchema7 = {
  type: 'object',
  description:
    "causal-loop scenes — one directed edge between variables. `polarity` is the line's *assertion*: '+' means an increase in `from` drives an increase in `to`; '-' means an increase in `from` drives a decrease.",
  required: ['id', 'from', 'to', 'polarity'],
  additionalProperties: false,
  properties: {
    id: {
      type: 'string',
      description: 'unique within the scene; beats reveal/focus this id',
    },
    from: {type: 'string', description: 'the source variable id'},
    to: {type: 'string', description: 'the target variable id'},
    polarity: {
      enum: ['+', '-'],
      description: '+ reinforcing influence; - opposing influence',
    },
    label: {
      type: 'string',
      description: 'an optional one-liner describing the influence',
    },
  },
};

const causalLoopSchema: JSONSchema7 = {
  type: 'object',
  description:
    "causal-loop scenes — one closed cycle of variables. `kind` MUST match the parity of '-' edges along the path: an even count = reinforcing (R, the loop compounds); odd = balancing (B, the loop self-corrects). The validator enforces this — the labelling cannot lie.",
  required: ['id', 'path', 'kind'],
  additionalProperties: false,
  properties: {
    id: {
      type: 'string',
      description:
        'unique within the scene; beats reveal/focus this id (the centre R/B label lands when the loop is revealed)',
    },
    label: {
      type: 'string',
      description:
        "an optional name for the loop (e.g. 'vicious cycle of debt')",
    },
    path: {
      type: 'array',
      description:
        "the loop's variable ids in cycle order. Consecutive pairs (and the wrap from last → first) must each have a corresponding causal edge.",
      minItems: 2,
      items: {type: 'string'},
    },
    kind: {
      enum: ['reinforcing', 'balancing'],
      description:
        "R (reinforcing) or B (balancing) — the labelling parity-matched against the path's '-' edges",
    },
  },
};

/**
 * The plugin's contributed JSON Schema branch. The kit unions this with
 * every other registered scene plugin's `schema` into the computed film
 * schema.
 *
 * Only causal-loop-specific fields are declared here — the common scene
 * fields (`id`, `type`, `beats`, `style`, `kicker`, `heading`, etc.) live
 * in the shared base scene schema the kit owns.
 */
export const schema: JSONSchema7 = {
  type: 'object',
  required: ['type', 'variables', 'loops'],
  properties: {
    type: {const: 'causal-loop'},
    variables: {
      type: 'array',
      description:
        'causal-loop scenes — the variables of the system, drawn as labelled discs arranged in a ring (3-8 read cleanly)',
      minItems: 3,
      maxItems: 8,
      items: causalVariableSchema,
    },
    causalEdges: {
      type: 'array',
      description:
        'causal-loop scenes — directed edges between variables, each carrying a polarity glyph (+/-). + means an increase in `from` drives an increase in `to`; - means an increase in `from` drives a decrease.',
      items: causalEdgeSchema,
    },
    loops: {
      type: 'array',
      description:
        "causal-loop scenes — closed cycles of variables. Each is reinforcing (R, even number of '-' edges along its path — the loop compounds) or balancing (B, odd number — the loop self-corrects). The validator enforces the labelling math.",
      minItems: 1,
      items: causalLoopSchema,
    },
    kicker: {
      type: 'string',
      description:
        "the section label rendered in the scene chrome (e.g. '02 // THE FEEDBACK').",
    },
    heading: {
      type: 'string',
      description: 'the scene heading drawn beneath the kicker.',
    },
  },
};

export default schema;
