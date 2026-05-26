// JSON Schema fragment for the `recap` scene's per-type spec branch.
//
// Contributed to the computed film schema by the recap plugin. The kit
// assembles the discriminated-union film schema at `Engine.schema()` call
// time from each registered ScenePlugin's `schema` field — there is no
// hand-written film schema after the rip-and-replace.
//
// The recap scene is a CHROME move: the closing summary that formalizes
// what the film argued. It's not a cognitive move on its own; it
// brackets the film alongside `frame` (cluster: null). The body is
// `points` — the ruling claims the narration speaks to as each one
// reveals. The v2.5.x structural validator (see ./validate.ts) requires
// at least 3 points (anything thinner is a list, not a recap).
//
// Per-beat `reveal` on a recap is a NUMERIC index — the beat reveals
// points 1..N (the first beat whose `reveal` reaches i+1 is the reveal
// frame for the i-th point). This is the legacy v2.5.x shape; the kit's
// `Beat.reveal` field is typed `string[]`, so films target this via the
// open index signature on Beat. The validator below does NOT enforce
// shape on beat.reveal because the kit-level Beat schema owns beats.

import type {JSONSchema7} from 'json-schema';

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    'recap scenes — the closing chrome move that formalizes what the film argued. `points` are the ruling claims (≥ 3); each one reveals on the beat whose numeric `reveal` index reaches it. The renderer auto-fits each point so long claims shrink rather than wrap out of the safe area. The footer carries the "surveyed from source · docent" attribution that lands as the film closes.',
  required: ['points'],
  properties: {
    points: {
      type: 'array',
      minItems: 3,
      description:
        'the ruling claims the recap formalizes. ≥ 3 entries — a recap with fewer is a list, not a synthesis. Each entry is rendered as a numbered row; long entries auto-shrink (basePx steps 32 → 28 → 25 by length, then FittedText shrink-wraps further).',
      items: {
        type: 'string',
        minLength: 1,
      },
    },
    kicker: {
      type: 'string',
      description: "the section label rendered in the scene chrome (e.g. '08 // THE RECAP').",
    },
    heading: {
      type: 'string',
      description: 'the scene heading drawn beneath the kicker.',
    },
  },
};

export default schema;
