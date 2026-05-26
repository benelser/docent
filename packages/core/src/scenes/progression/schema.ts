// JSON Schema fragment for the `progression` scene's per-type spec branch.
//
// Contributed to the computed film schema by the progression plugin. The
// kit assembles the discriminated-union film schema at `Engine.schema()`
// call time from each registered ScenePlugin's `schema` field — there is
// no hand-written film schema after the rip-and-replace.
//
// The progression scene is an ordered timeline track: stages laid along a
// path, each a marker with a label, sub, and optional segment duration. A
// `gate` stage is preceded by a milestone diamond. The `flow` field picks
// the track topology:
//   - `linear`  (default) — one path, stages left-to-right.
//   - `cycle`   — the track curves back to its start; a loop.
//   - `braided` — two parallel lanes (each stage's `track` 0 or 1 picks).
//   - `iterate` — a cycle drawn so it visibly repeats and converges.
//
// Fields lifted from packages/engine/schema/film.schema.json. The stage
// shape and the `flow` enum are the per-type fields the kit's `Scene`
// envelope does not own; everything else (id, beats, style override) lives
// on the common Scene shape.

import type {JSONSchema7} from 'json-schema';

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    "progression scenes — an ordered timeline track. Stages are laid along a path, each a marker with a label, sub, and optional segment duration. A `gate` stage is preceded by a milestone diamond. The `flow` field picks the track topology: `linear` (one path, default), `cycle` (the path curves back to its start), `braided` (two parallel lanes — non-linear narrative), `iterate` (a converging cycle).",
  required: ['stages'],
  properties: {
    stages: {
      type: 'array',
      minItems: 1,
      description:
        "the ordered progression markers. At least one is required (a progression with no stages renders a void with audio playing over it). Each stage carries an `id`, `label`, optional `sub`, optional `duration` (shown on the stage's outgoing segment, e.g. '4 years'), optional `gate` (a milestone diamond before the stage), and optional `track` (0 or 1, only meaningful when `flow: 'braided'`).",
      items: {
        type: 'object',
        required: ['id', 'label'],
        additionalProperties: false,
        properties: {
          id: {
            type: 'string',
            description: "stable id used by beats' `focus` lists to spotlight the stage.",
          },
          label: {
            type: 'string',
            description: "the stage's primary label, drawn large on its card.",
          },
          sub: {
            type: 'string',
            description: "an optional sub-label drawn under the primary label in mono.",
          },
          duration: {
            type: 'string',
            description:
              "shown as a pill on the segment between this stage and the next, e.g. '4 years'. The last stage's duration is ignored (no outgoing segment).",
          },
          gate: {
            type: 'boolean',
            description:
              'when true, a milestone diamond is drawn just before this stage — a gate / checkpoint / exam separating it from the prior stage.',
          },
          track: {
            enum: [0, 1],
            description:
              "braided flow only — which of the two parallel lanes (0 = above the centre line, 1 = below). Ignored by `linear`/`cycle`/`iterate`.",
          },
        },
      },
    },
    flow: {
      enum: ['linear', 'cycle', 'braided', 'iterate'],
      description:
        "the track topology. `linear` (default) lays stages left-to-right along one path; `cycle` curves the track back to its start (a loop); `braided` runs two parallel lanes — non-linear narrative, with each stage's `track` picking the lane; `iterate` draws a cycle so it visibly repeats and converges (nested return arcs of shrinking radius settling toward an equilibrium point).",
    },
    kicker: {
      type: 'string',
      description: "the section label rendered in the scene chrome (e.g. '02 // THE TRACK').",
    },
    heading: {
      type: 'string',
      description: 'the scene heading drawn beneath the kicker.',
    },
  },
};

export default schema;
