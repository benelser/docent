// JSON Schema fragment for the `tension` scene's per-type spec branch.
//
// Contributed to the computed film schema by the tension plugin. The kit
// assembles the discriminated-union film schema at `Engine.schema()` call
// time from each registered ScenePlugin's `schema` field — there is no
// hand-written film schema after the rip-and-replace.
//
// The tension scene is the trade-off ledger — the *choice* the film makes
// legible. The renderer reads `nodes[]` and sorts each into one of three
// sworn lanes based on `nodes[].kind`:
//
//   - `kind: 'rejected'` — the path the author chose AGAINST (right column,
//     strikethrough, graphite ink, ✕ verdict mark).
//   - `kind: 'risk'`     — a fragility the chosen path did NOT resolve
//                          (bottom band, rose ink, ! verdict mark).
//   - kind absent        — the chosen path (left column, accent ink, ◆
//                          verdict mark). The CHOSEN lane has no explicit
//                          discriminator; the absence of `kind` is the
//                          discriminator.
//
// The grid (`grid.cols`, `nodes[].col`, `nodes[].row`) is honored at the
// resolveLayout boundary for parity with other diagram scene types (a
// malformed grid is still made safe), but the tension renderer ignores
// `col`/`row` — kind owns lane assignment.

import type {JSONSchema7} from 'json-schema';

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    'tension scenes — the trade-off ledger. Each node is sorted into one of three lanes by its `kind`: CHOSEN (no `kind`) on the left, REJECTED (`kind: "rejected"`) on the right, RISKS (`kind: "risk"`) in a band below. The renderer maps `kind` onto the ledger lane; `col`/`row` are ignored. The verdict marks (◆ on CHOSEN, ✕ on REJECTED, ! on RISK) and the column headers carry the meaning.',
  required: ['nodes'],
  properties: {
    kicker: {
      type: 'string',
      description:
        "the section label rendered in the scene chrome (e.g. '04 // THE TRADE-OFF').",
    },
    heading: {
      type: 'string',
      description:
        'the scene heading drawn beneath the kicker — typically the one-line statement of the choice.',
    },
    nodes: {
      type: 'array',
      minItems: 1,
      description:
        'the ledger items. At least one is required (the structural validator hard-fails on an empty `nodes`). `kind` decides the lane: omit it for the CHOSEN path, set "rejected" for an alternative the film argues against, set "risk" for a fragility the chosen path did not resolve.',
      items: {
        type: 'object',
        required: ['id', 'label'],
        properties: {
          id: {
            type: 'string',
            minLength: 1,
            description:
              'stable id, referenced by `beats[].reveal` and `beats[].focus`.',
          },
          label: {
            type: 'string',
            minLength: 1,
            description:
              "the card's primary line — the option, the rejection, or the risk named in one phrase.",
          },
          sub: {
            type: 'string',
            description:
              "the card's secondary line — the trade-off note, the rejection reason, or the residual hazard. Wraps to 2 lines.",
          },
          tag: {
            type: 'string',
            description: 'optional micro-tag rendered on the card.',
          },
          kind: {
            type: 'string',
            enum: ['risk', 'rejected'],
            description:
              "the lane discriminator: 'rejected' for an alternative the film argues against (right column, strikethrough, ✕ mark), 'risk' for a fragility the chosen path did not resolve (bottom band, rose ink, ! mark). Omit for the CHOSEN path (left column, accent ink, ◆ mark).",
          },
          accent: {
            type: 'string',
            description:
              "accent key (resolves against the active preset's accent table). Only the CHOSEN cards consume this — rejected and risk cards take the lane ink directly.",
          },
          col: {
            type: 'number',
            description:
              'grid column. Kept for cross-scene parity; the tension renderer ignores it (kind owns lane assignment).',
          },
          row: {
            type: 'number',
            description:
              'grid row. Kept for cross-scene parity; the tension renderer ignores it (kind owns lane assignment).',
          },
          wide: {
            type: 'boolean',
            description:
              'wide-cell flag. Honored only at the resolveLayout boundary for parity; the tension renderer lays cards in lanes.',
          },
          weight: {
            type: 'string',
            enum: ['hero', 'primary', 'normal', 'recede'],
            description: 'emphasis gradient (engine-wide, honored by other scenes).',
          },
          emphasis: {
            type: 'boolean',
            description: 'legacy emphasis flag — superseded by `weight: "hero"`.',
          },
        },
      },
    },
    grid: {
      type: 'object',
      description:
        'grid sizing for the scene. The tension renderer honors `cols` only as a pass-through into resolveLayout (for `wide`-cell collision safety); column/row placement is ignored.',
      properties: {
        cols: {type: 'number', minimum: 1},
        rows: {type: 'number', minimum: 1},
      },
    },
  },
};

export default schema;
