// schema — the JSON Schema fragment contributed by the venn scene plugin.
//
// MIGRATED from `packages/engine/schema/film.schema.json` (v2.5.x). Fields
// preserved verbatim from the per-type properties + the per-type $defs so
// the computed schema produced by `Engine.schema()` is byte-equivalent to
// the hand-written `film.schema.json` for venn scenes.
//
// Per the strategy doc §4.2: the kit assembles one branch of the
// discriminated-union film schema by `oneOf`-ing every registered
// ScenePlugin's `schema` field. This file is THIS scene's branch — the
// per-type fields only (not the common Scene shell `kicker`, `heading`,
// `beats`, `cut`, which the kit owns).

import type {JSONSchema7} from 'json-schema';

/**
 * One named set — a circle of the diagram. Two or three sets per scene.
 * `id` is referenced by `regions[].in` and (for set-level reveals) by
 * `beats[].reveal`. `sub` is an optional one-liner under the label.
 */
const vennSet: JSONSchema7 = {
  type: 'object',
  description:
    'venn scenes — one named set (a circle of the diagram). 2 or 3 sets per scene. `id` is referenced by `regions[].in` and (for set-level reveals) by `beats[].reveal`.',
  required: ['id', 'label'],
  additionalProperties: false,
  properties: {
    id: {
      type: 'string',
      description:
        "unique within the scene; named like 'A','B','C' or 'data','tools','untrusted'",
    },
    label: {
      type: 'string',
      description: "the set's name (e.g. 'private data', 'outbound tools')",
    },
    sub: {
      type: 'string',
      description: 'optional one-liner under the label',
    },
  },
};

/**
 * One addressable region — a stable id beats reveal/focus. `in` lists
 * which set ids the region falls inside; for 3 sets {A,B,C} the seven
 * addressable regions are {A}, {B}, {C}, {A,B}, {A,C}, {B,C}, {A,B,C}.
 * The implicit "outside all" region {} is NOT addressable: a film does
 * not argue about what lies outside every set.
 */
const vennRegion: JSONSchema7 = {
  type: 'object',
  description:
    "venn scenes — one addressable region (a petal or the central intersection). `in` lists which set ids the region falls inside. The implicit 'outside all' region {} is NOT addressable.",
  required: ['id', 'in'],
  additionalProperties: false,
  properties: {
    id: {
      type: 'string',
      description:
        'unique within the scene; beats reveal/focus this id, and novelty references it',
    },
    in: {
      type: 'array',
      description: 'the set ids this region falls inside (must be non-empty)',
      minItems: 1,
      items: {type: 'string'},
    },
    label: {
      type: 'string',
      description: 'what lives in this region (a one-liner)',
    },
    note: {
      type: 'string',
      description: 'an annotation that surfaces when the region is focused',
    },
  },
};

/**
 * The intersection the film argues from — the dangerous region. `claim`
 * is the one-line statement of what the overlap PROVES (not "X is
 * dangerous", but "X plus Y plus Z together exfiltrate because no token
 * has provenance"). `kind: 'venn'` is the discriminator that narrows
 * `Scene.novelty` from the widened `PriorArtNovelty | VennNovelty` union
 * at the renderer.
 */
const vennNovelty: JSONSchema7 = {
  type: 'object',
  description:
    "venn scenes — the named novelty: which region the film argues from, and the one-line claim of what the overlap PROVES. The claim must name a mechanism inside the overlap, never deliver a verdict about its character. `kind: 'venn'` is the discriminator that narrows the widened `prior-art-novelty | venn-novelty` union at the renderer.",
  required: ['kind', 'regionId', 'claim'],
  additionalProperties: false,
  properties: {
    kind: {
      const: 'venn',
      description:
        'the discriminator that narrows Scene.novelty from prior-art-novelty | venn-novelty',
    },
    regionId: {
      type: 'string',
      description:
        "a region id from this scene's `regions` — the dangerous intersection",
    },
    claim: {
      type: 'string',
      minLength: 1,
      description:
        'the one-liner the film argues from — what the overlap PROVES, dimensionally',
    },
  },
};

/**
 * The venn scene's per-type fields. Contributed to the computed film
 * schema as one branch of the discriminated `oneOf` union (the engine
 * keys it off `scene.type === 'venn'`).
 */
export const schema: JSONSchema7 = {
  type: 'object',
  required: ['type', 'sets', 'regions', 'novelty'],
  properties: {
    type: {const: 'venn'},
    sets: {
      type: 'array',
      description:
        'venn scenes — the 2 or 3 named sets (the circles of the diagram). A 1-circle Venn is not a Venn; 4+ has no clean planar layout.',
      minItems: 2,
      maxItems: 3,
      items: vennSet,
    },
    regions: {
      type: 'array',
      description:
        'venn scenes — the addressable regions (each "petal" plus the central intersection). Each has a stable id beats reveal/focus.',
      items: vennRegion,
    },
    novelty: {
      description:
        'venn scenes — the dangerous intersection: which region the film argues from, and the one-line claim of what the overlap PROVES.',
      ...vennNovelty,
    } as JSONSchema7,
    kicker: {
      type: 'string',
      description: "the section label rendered in the scene chrome (e.g. '03 // THE OVERLAP').",
    },
    heading: {
      type: 'string',
      description: 'the scene heading drawn beneath the kicker.',
    },
  },
};

// Re-exports for the validator + future consumers — the per-type defs are
// useful as standalone references (the agent's prompts include them).
export {vennSet, vennRegion, vennNovelty};

export default schema;
