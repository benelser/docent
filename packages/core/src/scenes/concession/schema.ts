// JSON Schema fragment for the `concession` scene's per-type fields.
//
// `concession` is the rhetorical scene where the film draws the line —
// what it does NOT cover. Every film that argues something narrow ought
// to draw the line; most don't, because the spec author doesn't think to
// add one. The concession scene is the move that strengthens every other
// claim by saying what the film is choosing not to fight about.
//
// Per-type fields:
//   - scope       — non-empty array of strings (IN SCOPE column; what the
//                   film argues about).
//   - outOfScope  — array with ≥ 2 strings (OUT OF SCOPE column; what the
//                   film sets aside — a single set-aside is a footnote;
//                   the cut needs to be visible as a cut).
//   - reason      — optional single line beneath both columns ("the cut");
//                   when present, must be non-empty.
//
// Only the per-type fields belong here. Common scene fields (`id`, `type`,
// `beats`, `kicker`, `heading`, `cut`, `style`) are owned by the kit and
// merged in by `Engine.schema()` at compose time.

import type {JSONSchema7} from 'json-schema';

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    "concession scenes — what the film does NOT cover. Two columns: IN SCOPE (kept, lit in the film's accent) and OUT OF SCOPE (set aside, dimmed, with a strike-through ledger mark). An optional `reason` sits beneath both columns as a single quiet line — the editor's cut, naming why the line lands where it does.",
  properties: {
    type: {const: 'concession'},
    scope: {
      type: 'array',
      items: {type: 'string', minLength: 1},
      minItems: 1,
      description:
        'concession scenes — the IN SCOPE column; non-empty array of concrete things the film argues about. Each item is what the film does cover.',
    },
    outOfScope: {
      type: 'array',
      items: {type: 'string', minLength: 1},
      minItems: 2,
      description:
        'concession scenes — the OUT OF SCOPE column; ≥ 2 concrete things the film deliberately sets aside. A single set-aside is a footnote; the cut needs to be visible as a cut. Each item should name what is left out by NAME (e.g. "historical OS forks before 2018"), not a tautological filler ("not relevant", "out of scope").',
    },
    reason: {
      type: 'string',
      minLength: 1,
      description:
        'concession scenes — optional single quiet line beneath both columns. The editor\'s cut: a non-empty string saying why the line lands where it does. Arrives on the second beat so the narration walks the columns first.',
    },
    kicker: {
      type: 'string',
      description: "the section label rendered in the scene chrome (e.g. '03 // WHAT THIS IS NOT').",
    },
    heading: {
      type: 'string',
      description: 'the scene heading drawn beneath the kicker.',
    },
  },
  required: ['type', 'scope', 'outOfScope'],
};

export default schema;
