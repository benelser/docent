// epigraph — schema fragment.
//
// The cited authority that opens a film. A short quote (≤ 60 words) in large
// serif type, an attribution beneath it. Position contracts (at most one per
// film; at index 0 or immediately after the `frame` scene) are enforced
// film-wide by the engine's cross-scene validator — not in this fragment.
//
// Migrated from `packages/engine/schema/film.schema.json` (`$defs/epigraph-shape`,
// plus the per-field descriptions on the scene-union branch).

import type {JSONSchema7} from 'json-schema';

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    'epigraph scenes — a cited authority opens the film. The author writes a quote and its attribution; the engine renders a quiet typographic scene (large serif quote, mono attribution). Position contract: a film with an epigraph must have it at index 0 or immediately after the `frame` scene; at most one per film.',
  required: ['quote', 'attribution'],
  properties: {
    quote: {
      type: 'string',
      minLength: 1,
      description:
        'the cited passage — ≤ 60 words (depthcheck floor). Renders in large serif type as the visual centre of the scene.',
    },
    attribution: {
      type: 'string',
      minLength: 1,
      description:
        "who said it. Renders beneath the quote in smaller mono caps (e.g. 'Karl Popper, 1934', 'Aristotle, Metaphysics').",
    },
    epigraphTreatment: {
      enum: ['block', 'pull'],
      description:
        '`block` (default) centers the quote on its own panel; `pull` is inline-marginal with a leading rule — more editorial.',
    },
  },
};
