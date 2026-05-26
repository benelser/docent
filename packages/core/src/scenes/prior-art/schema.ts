// schema — the JSON Schema fragment contributed by the prior-art scene
// plugin.
//
// MIGRATED from `packages/engine/schema/film.schema.json` (v2.5.x). Fields
// preserved verbatim from the per-type properties + the per-type $defs so
// the computed schema produced by `Engine.schema()` is byte-equivalent to
// the hand-written `film.schema.json` for prior-art scenes.
//
// Per the strategy doc §4.2: the kit assembles one branch of the
// discriminated-union film schema by `oneOf`-ing every registered
// ScenePlugin's `schema` field. This file is THIS scene's branch — the
// per-type fields only (not the common Scene shell `kicker`, `heading`,
// `beats`, `cut`, which the kit owns).

import type {JSONSchema7} from 'json-schema';

/**
 * One prior system — a column of the comparison table. `year` is optional
 * version/release context (e.g. '2014', 'v3.x'); without it the judge will
 * flag the survey as 'older systems' rather than named ones.
 */
const priorArtSystem: JSONSchema7 = {
  type: 'object',
  description:
    "prior-art scenes — one prior system (a column of the comparison table). `year` is optional version/release context (e.g. '2014', 'v3.x'); without it the judge will flag the survey as 'older systems' rather than named ones.",
  required: ['id', 'label'],
  additionalProperties: false,
  properties: {
    id: {
      type: 'string',
      description:
        'unique within the scene; beats reveal/focus this id',
    },
    label: {type: 'string', description: "the system's name"},
    sub: {type: 'string', description: 'a one-line gloss'},
    year: {
      type: 'string',
      description: "version or year context (e.g. '2014', 'v3.x')",
    },
  },
};

/**
 * One trade-off dimension — a row of the comparison table. The label should
 * name a *choice*, not a quality — "storage layout" not "speed".
 */
const priorArtDimension: JSONSchema7 = {
  type: 'object',
  description:
    "prior-art scenes — one trade-off dimension (a row of the comparison table). The label should name a *choice*, not a quality — 'storage layout' not 'speed'.",
  required: ['id', 'label'],
  additionalProperties: false,
  properties: {
    id: {
      type: 'string',
      description:
        'unique within the scene; the novelty dimension references this id',
    },
    label: {
      type: 'string',
      description:
        'the dimension\'s name — a trade-off the field has made differently',
    },
  },
};

/**
 * One (system, dimension) cell. `mark` is `same` (the system makes the
 * same choice as the subject) or `diverges` (a different choice). `note`
 * is a short dimensional claim, ≤ ~10 words; not "X is better" but
 * "X traded A for B".
 */
const priorArtCell: JSONSchema7 = {
  type: 'object',
  description:
    "prior-art scenes — one (system, dimension) cell. `mark` is `same` (the system makes the same choice as the subject) or `diverges` (a different choice). `note` is a short dimensional claim, ≤ ~10 words; not 'X is better' but 'X traded A for B'.",
  required: ['system', 'dimension', 'mark', 'note'],
  additionalProperties: false,
  properties: {
    system: {
      type: 'string',
      description: "a system id from this scene's `systems`",
    },
    dimension: {
      type: 'string',
      description: "a dimension id from this scene's `dimensions`",
    },
    mark: {enum: ['same', 'diverges']},
    note: {
      type: 'string',
      minLength: 1,
      description: 'the dimensional claim — a trade-off, not a verdict',
    },
  },
};

/**
 * The named novelty — which of this scene's dimensions the film argues
 * from, and the one-line statement of what is new. The statement must be
 * dimensional ("X is a runtime decision, Y was admission-time"), never
 * evaluative ("X is better than Y"). `kind: 'prior-art'` is the
 * discriminator that narrows the widened `PriorArtNovelty | VennNovelty`
 * union at the renderer.
 */
const priorArtNovelty: JSONSchema7 = {
  type: 'object',
  description:
    "prior-art scenes — the named novelty: which of this scene's dimensions the film argues from, and the one-line statement of what is new. The statement must be dimensional ('X is a runtime decision, Y was admission-time'), never evaluative ('X is better than Y'). `kind: 'prior-art'` is the discriminator that narrows the widened `prior-art-novelty | venn-novelty` union at the renderer.",
  required: ['kind', 'dimension', 'statement'],
  additionalProperties: false,
  properties: {
    kind: {
      const: 'prior-art',
      description:
        'the discriminator that narrows Scene.novelty from prior-art-novelty | venn-novelty',
    },
    dimension: {
      type: 'string',
      description:
        "a dimension id from this scene's `dimensions` — the row the film lights up",
    },
    statement: {
      type: 'string',
      minLength: 1,
      description: 'the one-line novelty: what is new, dimensionally',
    },
  },
};

/**
 * The prior-art scene's per-type fields. Contributed to the computed film
 * schema as one branch of the discriminated `oneOf` union (the engine
 * keys it off `scene.type === 'prior-art'`).
 *
 * The novelty union here intentionally also accepts `VennNovelty` shapes —
 * the engine's spec models `Scene.novelty` as the widened
 * `PriorArtNovelty | VennNovelty` union; the structural validator pins
 * `novelty.kind === 'prior-art'` for prior-art scenes (see ./validate.ts).
 */
export const schema: JSONSchema7 = {
  type: 'object',
  required: ['type', 'systems', 'dimensions', 'cells', 'novelty'],
  properties: {
    type: {const: 'prior-art'},
    systems: {
      type: 'array',
      description:
        'prior-art scenes — the 2-4 prior systems compared against (columns of the table)',
      minItems: 2,
      maxItems: 4,
      items: priorArtSystem,
    },
    dimensions: {
      type: 'array',
      description:
        'prior-art scenes — the 2-4 trade-off dimensions compared on (rows of the table)',
      minItems: 2,
      maxItems: 4,
      items: priorArtDimension,
    },
    cells: {
      type: 'array',
      description:
        'prior-art scenes — one cell per (system, dimension) pair; each marks same/diverges with a short claim',
      items: priorArtCell,
    },
    novelty: {
      description:
        'prior-art scenes — which dimension carries the novelty, and the one-liner the film argues from. The structural validator narrows on `novelty.kind`.',
      oneOf: [
        priorArtNovelty,
        // VennNovelty shape — the renderer narrows on `kind`. The structural
        // validator (see ./validate.ts) hard-fails any prior-art scene whose
        // novelty.kind !== 'prior-art', so this branch is structurally
        // present but semantically rejected for prior-art scenes.
        {
          type: 'object',
          required: ['kind', 'regionId', 'claim'],
          additionalProperties: false,
          properties: {
            kind: {const: 'venn'},
            regionId: {type: 'string'},
            claim: {type: 'string', minLength: 1},
          },
        },
      ],
    },
  },
};

// Re-exports for the validator + future consumers — the per-type defs are
// useful as standalone references (the agent's prompts include them).
export {priorArtSystem, priorArtDimension, priorArtCell, priorArtNovelty};
