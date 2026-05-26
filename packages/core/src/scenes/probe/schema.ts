// JSON Schema fragment for the `probe` scene's per-type spec branch.
//
// Contributed to the computed film schema by the probe plugin. The kit
// assembles the discriminated-union film schema at `Engine.schema()` call
// time from each registered ScenePlugin's `schema` field — there is no
// hand-written film schema after the rip-and-replace.
//
// The probe scene is a sensitivity probe: a baseline (its label → its
// outcome) pinned at the top, then a row per variation — the perturbed
// input, an arrow, the resulting outcome, and a flip indicator. Variations
// reveal one beat at a time (the numeric `reveal` form of `Beat.reveal`).
// `flips: true` lights a bold rose "flipped" marker; otherwise a muted
// "held" tag. The interrogation move: vary one input, follow the
// consequence.
//
// Per-type fields lifted from `packages/engine/src/engine/spec.ts` (the
// `baseline` and `variations` fields on the wide `Scene` shape) and from
// the engine's `Variation` type definition. The engine's hand-written
// `film.schema.json` (v2.5.x) did NOT include the probe-specific fields in
// its per-type properties block — only the cross-cutting fields (kicker,
// heading, beats, cut) — so this is the first formal schema declaration of
// the probe spec branch. The shape mirrors the runtime contract exactly.

import type {JSONSchema7} from 'json-schema';

/**
 * One variation — a perturbation of the baseline. `change` is the input
 * that is perturbed (rendered in the mono column); `outcome` is the
 * resulting consequence (the prose column); `flips: true` lights the
 * load-bearing rose "flipped" marker — the signal that this perturbation
 * tipped the outcome to the opposite sign of the baseline. Beats can
 * `focus` a variation by its `id`.
 */
const probeVariation: JSONSchema7 = {
  type: 'object',
  description:
    "probe scenes — one variation: a perturbation of the baseline. `change` is the input that is perturbed; `outcome` is the resulting consequence; `flips: true` lights the rose 'flipped' marker (the signal that this perturbation tipped the outcome). Beats can `focus` this variation by its `id`.",
  required: ['id', 'label', 'change', 'outcome'],
  additionalProperties: false,
  properties: {
    id: {
      type: 'string',
      minLength: 1,
      description:
        'unique within the scene; beats reveal/focus this id',
    },
    label: {
      type: 'string',
      minLength: 1,
      description: "the variation's name (a short identifier)",
    },
    change: {
      type: 'string',
      minLength: 1,
      description:
        'the perturbed input — rendered in the mono column (left of the arrow)',
    },
    outcome: {
      type: 'string',
      minLength: 1,
      description:
        'the resulting consequence — rendered in the prose column (right of the arrow)',
    },
    flips: {
      type: 'boolean',
      description:
        "whether the outcome flipped from the baseline. `true` lights a bold rose 'flipped' marker (the signal); falsy/absent renders a muted 'held' tag",
    },
  },
};

/**
 * The optional baseline — the reference row pinned at the top of the
 * probe. The variations are interrogations against this row. A probe
 * without a baseline still renders (variations stand alone), but the
 * scene reads strongest when the reader can see the unchanged reference
 * before the perturbations land.
 */
const probeBaseline: JSONSchema7 = {
  type: 'object',
  description:
    'probe scenes — the optional baseline: the reference row pinned at the top, against which the variations are interrogated. The accent ring and BASELINE tag mark it as the unchanged reference.',
  required: ['label', 'outcome'],
  additionalProperties: false,
  properties: {
    label: {
      type: 'string',
      minLength: 1,
      description: 'the baseline input — rendered in the mono column',
    },
    outcome: {
      type: 'string',
      minLength: 1,
      description: 'the baseline outcome — rendered in the prose column',
    },
  },
};

/**
 * The probe scene's per-type fields. Contributed to the computed film
 * schema as one branch of the discriminated `oneOf` union (the engine
 * keys it off `scene.type === 'probe'`).
 */
export const schema: JSONSchema7 = {
  type: 'object',
  description:
    "probe scenes — a sensitivity probe. A baseline (label → outcome) pinned at the top, then a row per variation: the perturbed input, an arrow, the resulting outcome, and a flip indicator. Variations reveal one beat at a time (numeric `reveal`); a `cadence: 'cascade'` beat staggers the entrance of the items it brings in. The interrogation move: vary one input, follow the consequence.",
  required: ['type', 'variations'],
  properties: {
    type: {const: 'probe'},
    kicker: {
      type: 'string',
      description: "the section label rendered in the scene chrome (e.g. '04 // THE PROBE').",
    },
    heading: {
      type: 'string',
      description: 'the scene heading drawn beneath the kicker.',
    },
    baseline: {
      ...probeBaseline,
      description:
        probeBaseline.description ??
        'probe scenes — the optional baseline reference row pinned at the top.',
    },
    variations: {
      type: 'array',
      description:
        'probe scenes — the ordered list of variations interrogated against the baseline. At least 1; each carries a unique id beats can focus.',
      minItems: 1,
      items: probeVariation,
    },
  },
};

// Re-exports for the validator + future consumers.
export {probeVariation, probeBaseline};
export default schema;
