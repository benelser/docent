// JSON Schema fragment for the `frame` scene's per-type spec branch.
//
// Contributed to the computed film schema by the frame plugin. The kit
// assembles the discriminated-union film schema at `Engine.schema()` call
// time from each registered ScenePlugin's `schema` field — there is no
// hand-written film schema after the rip-and-replace.
//
// The frame scene is the opening chrome of every film: a faux-prompt
// kicker, a large title, an optional tagline divider, and an optional
// footnote. It performs no cognitive move (cluster: null) — its job is
// to set up the subject before the cognitive scenes begin.
//
// The v2.5.x renderer reads `title` (required — the load-bearing visual),
// `tagline` (the subtitle below the divider, auto-shrunk for length), and
// `footnote` (a small mono-typed footer, auto-shrunk for length). The
// scene's `kicker` (the chrome-level label like "DOCENT // FILM") lives
// on the common scene shape and is consumed by SceneFrame.

import type {JSONSchema7} from 'json-schema';

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    'frame scenes — the opening chrome of every film. Sets up the subject before the cognitive scenes begin: a faux-prompt with the film id, a large hero title, an optional tagline below a divider, and an optional small footnote. Performs no cognitive move (the chrome cluster). The renderer auto-shrinks long titles, taglines, and footnotes to stay inside the safe band.',
  required: ['title'],
  properties: {
    title: {
      type: 'string',
      minLength: 1,
      description:
        'the load-bearing hero title — the subject of the film, set large and centered. The renderer auto-shrinks long titles in tiered steps (158 → 132 → 108 → 88 → 72 px) so a multi-clause subject does not blow through the safe band.',
    },
    tagline: {
      type: 'string',
      description:
        'optional subtitle, rendered below an animated divider beneath the title. The renderer auto-shrinks long taglines in tiered steps (41 → 34 → 28 → 24 → 21 px) and clamps the width so the line stays centered against the title above.',
    },
    footnote: {
      type: 'string',
      description:
        'optional small mono-typed footer (e.g. a date, an author, a context note). The renderer auto-shrinks long footnotes in tiered steps (23 → 19 → 16 → 14 px) and clamps the width inside the safe band.',
    },
    kicker: {
      type: 'string',
      description: "the section label rendered in the scene chrome (e.g. 'DOCENT // FILM').",
    },
  },
};

export default schema;
