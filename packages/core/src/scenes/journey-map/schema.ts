// JSON Schema fragment for the `journey-map` scene's per-type spec branch.
//
// Contributed to the computed film schema by the journey-map plugin. The kit
// assembles the discriminated-union film schema at `Engine.schema()` call
// time from each registered ScenePlugin's `schema` field — there is no
// hand-written film schema after the rip-and-replace.
//
// journey-map is the UX/service-design primitive — a person's emotional arc
// across 3-8 stages. Per stage: an emotional indicator drawn from a closed
// allowlist (delight / curiosity / satisfaction / neutral / fatigue /
// frustration / pain), a `curveValue` y-position on the scene's continuous
// emotion curve (1 = top / best, 0 = bottom / worst), and the optional
// specifics (`touchpoints` — what the person encounters; `painPoints` —
// what goes wrong). A journey-map with no specifics is just a list of
// feelings; the depthcheck rule enforces ≥50% of stages carry one or the
// other. The structural HARD constraints (3-8 stages, unique ids, curveValue
// in [0..1], emotion in the allowlist) live below; the cross-stage shape
// rules (visibly rising AND falling curve) live in ./depth-rules.ts.
//
// Sprint B added an optional `embed` field — a static sub-scene tableau
// attached to the stage tile (allowlist: causal-loop, mechanism, compare).
// The kit treats `embed` as opaque here; the component renders it through a
// colocated stub until the shared EmbeddedScene primitive migrates.

import type {JSONSchema7} from 'json-schema';

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    "journey-map scenes — a person's emotional arc across 3-8 stages. Each stage carries an `emotion` chip (drawn from the JourneyEmotion allowlist), a `curveValue` (the y-position on a continuous emotion curve, normalized [0..1] — 1=best, 0=worst), and the optional specifics: `touchpoints` (what the person encounters) and `painPoints` (what goes wrong). A continuous Catmull-Rom-ish curve smooths between the stages' curveValues; the depthcheck rule enforces a real arc (visibly rises ≥0.7 AND falls ≤0.3) and that ≥50% of stages name touchpoints or pain-points.",
  required: ['journeyStages'],
  properties: {
    journeyStages: {
      type: 'array',
      minItems: 3,
      maxItems: 8,
      description:
        "3-8 stages along the journey (fewer than 3 has no arc; more than 8 ceases to read). Each stage has a unique `id`, a `label`, a closed-enum `emotion`, a `curveValue` in [0..1], and optionally `sub`/`touchpoints`/`painPoints`/`embed`.",
      items: {
        type: 'object',
        required: ['id', 'label', 'emotion', 'curveValue'],
        properties: {
          id: {
            type: 'string',
            minLength: 1,
            description: 'unique within the scene; beats reveal/focus this id',
          },
          label: {
            type: 'string',
            minLength: 1,
            description: "the stage's name (e.g. 'evaluate', 'first month')",
          },
          sub: {
            type: 'string',
            minLength: 1,
            description: "a one-line gloss (e.g. 'a week of trial')",
          },
          emotion: {
            type: 'string',
            enum: [
              'delight',
              'curiosity',
              'satisfaction',
              'neutral',
              'fatigue',
              'frustration',
              'pain',
            ],
            description:
              "the local feeling — drives the chip's colour and label. Closed allowlist.",
          },
          curveValue: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description:
              'the y-value on the emotion curve, normalized [0..1] (1 = top / best emotion, 0 = bottom / worst).',
          },
          touchpoints: {
            type: 'array',
            description:
              'short bullets — what the person encounters in this stage (docs they read, screens they see, people they talk to).',
            items: {type: 'string', minLength: 1},
          },
          painPoints: {
            type: 'array',
            description:
              'short bullets — what goes wrong in this stage (the specific frictions, blockers, confusions).',
            items: {type: 'string', minLength: 1},
          },
          embed: {
            type: 'object',
            description:
              "Sprint B compositional grammar — a static sub-scene tableau attached to this stage. Allowlist: causal-loop | mechanism | compare. Treated as opaque here; the component's embed renderer is a colocated stub until the shared EmbeddedScene primitive migrates.",
          },
        },
      },
    },
    kicker: {
      type: 'string',
      description: "the section label rendered in the scene chrome (e.g. '02 // THE ARC').",
    },
    heading: {
      type: 'string',
      description: 'the scene heading drawn beneath the kicker.',
    },
  },
};

export default schema;
