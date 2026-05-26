// JSON Schema fragment for the `structure` scene's per-type spec branch.
//
// Contributed to the computed film schema by the structure plugin. The kit
// assembles the discriminated-union film schema at `Engine.schema()` call
// time from each registered ScenePlugin's `schema` field.
//
// The structure scene is the load-bearing template most architecture films
// rest on: a node-and-edge diagram, revealed and focused beat by beat, with
// optional flow pulses and per-node morphs. The schema describes:
//   - `nodes`: the component boxes (id, label, grid coordinates, optional
//             sub/tag/accent/weight/wide/kind, plus the morph fields
//             as/cells/expr, and an optional embed sub-scene).
//   - `edges`: the lines between nodes (id/from/to, plus kind asserting
//             relation/feedback/entails/causes and the strength qualifier
//             on a `causes` edge).
//   - `grid`: optional layout grid (cols/rows; defaults to 3×3).

import type {JSONSchema7} from 'json-schema';

const nodeSchema: JSONSchema7 = {
  type: 'object',
  description:
    'a component box in a structure diagram. `as` is its representation (default `box`, the labelled Card); a transform beat can morph one node into another representation. Sprint B: `embed` (optional) attaches a static sub-scene tableau inside the card — allowlist mechanism | chart | venn.',
  required: ['id', 'label', 'col', 'row'],
  additionalProperties: false,
  properties: {
    id: {type: 'string', description: 'unique within the scene; beats reveal/focus this id and edges reference it'},
    label: {type: 'string'},
    sub: {type: 'string'},
    tag: {type: 'string', description: 'a corner kind marker (e.g. `trait`, `×27`)'},
    col: {type: 'number'},
    row: {type: 'number'},
    accent: {
      type: 'string',
      enum: ['blue', 'cyan', 'green', 'amber', 'rose', 'violet'],
    },
    emphasis: {
      type: 'boolean',
      description: 'legacy — superseded by `weight: hero`',
    },
    weight: {
      type: 'string',
      enum: ['hero', 'primary', 'normal', 'recede'],
      description: 'the emphasis gradient — hero is the point of the scene; recede sits as quiet context',
    },
    wide: {type: 'boolean', description: 'when true, the box spans the next column over'},
    kind: {
      type: 'string',
      enum: ['risk', 'rejected'],
      description: 'tension-scene shorthand carried on a structure node — a flagged risk or a rejected alternative',
    },
    as: {
      type: 'string',
      enum: ['box', 'matrix', 'vector', 'grid', 'code', 'equation'],
      description:
        "the node's representation — `box` is the Card; matrix/vector/grid draw `cells`; `code` draws a code window; `equation` typesets `expr`",
    },
    cells: {
      type: 'array',
      description: 'matrix/vector/grid contents, row-major',
      items: {
        type: 'array',
        items: {type: ['string', 'number']},
      },
    },
    expr: {
      type: 'string',
      description:
        "as: equation — the mathematical markup the engine typesets. Intent-level and never evaluated; morphing one equation node into another is a derivation step",
    },
    embed: {
      type: 'object',
      description:
        'Sprint B — a static sub-scene tableau rendered inside this node. Allowlist: mechanism, chart, venn. The host owns timing (reveal/focus on the slot id); the embed renders one resting visual state.',
      required: ['type'],
      properties: {
        type: {type: 'string'},
        caption: {type: 'string', maxLength: 24},
      },
    },
  },
};

const edgeSchema: JSONSchema7 = {
  type: 'object',
  description:
    "a line between two nodes in a structure diagram. `kind` types what the line asserts: a plain association (relation), a returning loop (feedback), a logical 'therefore' (entails), or a causal claim (causes). `strength` qualifies a `causes` edge — a `necessary` cause is drawn visibly heavier than a `contributing` one.",
  required: ['id', 'from', 'to'],
  additionalProperties: false,
  properties: {
    id: {type: 'string'},
    from: {type: 'string', description: 'the id of the source node'},
    to: {type: 'string', description: 'the id of the target node'},
    kind: {
      type: 'string',
      enum: ['relation', 'feedback', 'entails', 'causes'],
    },
    strength: {
      type: 'string',
      enum: ['necessary', 'contributing'],
      description: 'qualifies a `causes` edge; has no meaning on any other kind',
    },
    label: {type: 'string'},
  },
};

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    'structure scenes — a node-and-edge diagram, the load-bearing template most architecture films rest on. Nodes are placed on a grid (default 3×3); edges assert the relationship (relation/feedback/entails/causes). Beats reveal/focus nodes and edges, may flow pulses along edges, and may morph a node into a new representation (box → matrix → equation, etc.) via a `transform` directive.',
  required: ['nodes'],
  properties: {
    nodes: {
      type: 'array',
      minItems: 1,
      description: 'the component boxes of the diagram',
      items: nodeSchema,
    },
    edges: {
      type: 'array',
      description: 'the lines between nodes',
      items: edgeSchema,
    },
    grid: {
      type: 'object',
      description: 'the layout grid; defaults to {cols: 3, rows: 3}',
      additionalProperties: false,
      properties: {
        cols: {type: 'number', minimum: 1},
        rows: {type: 'number', minimum: 1},
      },
    },
    kicker: {
      type: 'string',
      description: "the section label rendered in the scene chrome (e.g. '02 // THE SYSTEM')",
    },
    heading: {
      type: 'string',
      description: 'the scene heading drawn beneath the kicker',
    },
  },
};

export default schema;
