// JSON Schema fragment for the `provocation` scene's per-type fields.
//
// `provocation` is the rhetorical scene where the film deliberately closes
// with an open question. The right ending for a research-frontier or
// open-policy film: "and this is where we don't know yet." A provocation is
// mutually exclusive with the big-idea — a film either COMMITS to a takeaway
// or HANDS OFF an open question. The position contract (last scene of the
// film) and the mutual exclusion with big-idea are enforced film-wide by
// the kit's cross-scene validator (not by this per-scene schema).
//
// Per-type fields:
//   - unresolved — the question the film deliberately doesn't answer.
//                  Renders display-size; the renderer strips trailing
//                  punctuation and appends an em-ellipsis (the typography
//                  IS the openness).
//   - why        — why the film leaves this open; an italic mono kicker
//                  ("why this stays open") + sans body.
//   - invitation — what the viewer is invited to do with the open
//                  question; the accent-coloured "your turn" kicker + a
//                  sans body, the closing breath of the film.
//
// Only the per-type fields belong here. Common scene fields (`id`, `type`,
// `beats`, `kicker`, `heading`, `cut`, `style`) are owned by the kit and
// merged in by `Engine.schema()` at compose time.

import type {JSONSchema7} from 'json-schema';

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    "provocation scenes — an incomplete closing that hands the open question to the viewer. The right ending for a research-frontier or open-policy film. Mutually exclusive with big-idea: a film either COMMITS to a takeaway (big-idea) or HANDS OFF an open question (provocation), never both. Must be the absolute last scene of the film.",
  properties: {
    type: {const: 'provocation'},
    unresolved: {
      type: 'string',
      minLength: 1,
      description:
        "provocation scenes — the question the film deliberately doesn't answer. Must be a SPECIFIC question (≥ 8 words, starts with an interrogative — Whether/How/Why/What/Under what/To what extent), not a vague gesture (\"more research is needed\"). The renderer strips trailing punctuation and appends an em-ellipsis.",
    },
    why: {
      type: 'string',
      minLength: 1,
      description:
        'provocation scenes — why the film leaves this open. Rendered beneath the unresolved as an italic body under the "why this stays open" mono kicker.',
    },
    invitation: {
      type: 'string',
      minLength: 1,
      description:
        'provocation scenes — what the viewer is invited to do with the open question. The closing breath of the film, rendered beneath the why under the accent-coloured "your turn" mono kicker.',
    },
    kicker: {
      type: 'string',
      description: "the section label rendered in the scene chrome (e.g. '07 // WHAT WE DON\\'T KNOW').",
    },
    heading: {
      type: 'string',
      description: 'the scene heading drawn beneath the kicker.',
    },
  },
  required: ['type', 'unresolved', 'why', 'invitation'],
};

export default schema;
