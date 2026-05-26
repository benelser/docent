// JSON Schema fragment for the `objection` scene's per-type fields.
//
// `objection` is the rhetorical scene where the film argues against itself,
// then refutes. The strong version is a steelman the author has not invented
// to beat: a real counterposition the film answers, partially or in full.
//
// Per-type fields:
//   - claim              — what the film has been arguing (lit panel).
//   - objection          — the steelman against the claim (rose panel).
//   - evidence           — optional supporting bullets under the objection.
//   - refutation         — the film's response (lit panel, overlays objection).
//   - refutationStrength — `partial` (admits the objection partly holds) or
//                          `full` (the film's whole answer).
//
// Only the per-type fields belong here. Common scene fields (`id`, `type`,
// `beats`, `kicker`, `heading`, `cut`, `style`) are owned by the kit and
// merged in by `Engine.schema()` at compose time.

import type {JSONSchema7} from 'json-schema';

export const schema: JSONSchema7 = {
  type: 'object',
  properties: {
    type: {const: 'objection'},
    claim: {
      type: 'string',
      description:
        'objection scenes — the load-bearing claim the film has been arguing (the lit panel above the objection)',
    },
    objection: {
      type: 'string',
      description:
        'objection scenes — the steelman counterargument the film anticipates; must be ≥ 12 words and name a mechanism, not deliver an evaluative verdict',
    },
    evidence: {
      type: 'array',
      items: {type: 'string', minLength: 1},
      description:
        'objection scenes — optional supporting bullets under the objection panel; each item the objection cites',
    },
    refutation: {
      type: 'string',
      description:
        'objection scenes — the film\'s response that overlays (but does not delete) the objection',
    },
    refutationStrength: {
      type: 'string',
      enum: ['partial', 'full'],
      description:
        'objection scenes — `partial` admits the objection partly holds (refutation must carry concession markers); `full` is the film\'s whole answer',
    },
  },
  required: ['type', 'claim', 'objection', 'refutation', 'refutationStrength'],
};

export default schema;
