// JSON Schema fragment for the `walkthrough` scene's per-type spec branch.
//
// Contributed to the computed film schema by the walkthrough plugin. The
// kit assembles the discriminated-union film schema at `Engine.schema()`
// call time from each registered ScenePlugin's `schema` field — there is
// no hand-written film schema after the rip-and-replace.
//
// A walkthrough is a sequence diagram: a small cast of `actors` (named
// participants in the system — a service, a queue, a client) with
// vertical lifelines, and `messages` that hop between them one beat at a
// time. The native shape for showing a request, a unit of data, or a
// control signal moving through a system over time.
//
// `messages` are NOT carried as a scene-level array — they live on the
// beats themselves (each beat may carry one `message: {from, to, label,
// kind}`). The scene's body is the actor cast; the beats are the
// sequence. The migration brief lists `messages` in the schema for
// completeness so spec authors know the field exists; it is described as
// a `Beat`-level field, not a scene-level array.

import type {JSONSchema7} from 'json-schema';

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    'walkthrough scenes — a sequence diagram. `actors` are the named participants with vertical lifelines; each beat may carry one `message: {from, to, label, kind}` that draws a wire between two actors (a request, a reply, an aside). The native cluster: `connection` — *who talks to whom*, over time. Requires at least 2 actors (a single lifeline has nothing to message). Messages are beat-level (see `Beat.message`), not a scene-level array.',
  required: ['actors'],
  properties: {
    actors: {
      type: 'array',
      minItems: 2,
      description:
        'the cast of the sequence. Each actor is a named lane with a vertical lifeline. Lane order is declaration order, distributed evenly between the stage margins. At least 2 actors — a walkthrough with one lifeline has nothing to message.',
      items: {
        type: 'object',
        required: ['id', 'label'],
        additionalProperties: false,
        properties: {
          id: {
            type: 'string',
            description:
              "the stable identifier referenced by beats' `message.from` / `message.to`.",
          },
          label: {
            type: 'string',
            description:
              "the actor's display name (drawn in the actor pill above the lifeline).",
          },
          sub: {
            type: 'string',
            description:
              'optional sub-label (drawn under the actor name in mono — typically a role or type, e.g. "service", "queue").',
          },
        },
      },
    },
    messages: {
      type: 'array',
      description:
        'OPTIONAL convenience mirror. The renderer reads messages from each beat\'s `message` field, not from this array. Present in the schema so spec authors can declare the message cast in one place when authoring; the renderer ignores it. The load-bearing surface is `Beat.message: {from, to, label, kind}`.',
      items: {
        type: 'object',
        required: ['from', 'to', 'label'],
        additionalProperties: false,
        properties: {
          from: {
            type: 'string',
            description: 'the originating actor id (matches an `actors[].id`).',
          },
          to: {
            type: 'string',
            description: 'the receiving actor id (matches an `actors[].id`); a self-message has from === to.',
          },
          label: {
            type: 'string',
            description:
              'the message label drawn on the wire (a method name, a payload tag, a control signal).',
          },
          kind: {
            type: 'string',
            enum: ['forward', 'reply', 'aside'],
            description:
              "wire style: `forward` (default — solid, with an arrowhead), `reply` (dashed return), `aside` (a soft cross-talk).",
          },
        },
      },
    },
    kicker: {
      type: 'string',
      description: "the section label rendered in the scene chrome (e.g. '03 // THE CONVERSATION').",
    },
    heading: {
      type: 'string',
      description: 'the scene heading drawn beneath the kicker.',
    },
  },
};

export default schema;
