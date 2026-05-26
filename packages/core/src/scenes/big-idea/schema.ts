// big-idea — schema fragment.
//
// The takeaway scene. The single sentence the viewer should leave with — the
// claim that survives if everything else is forgotten. Pure breathing room:
// one accent, one anchor, one long held pause. Not a verdict (the recap
// rules), not a summary; a takeaway.
//
// The contract: ≤ 20 words, ends with a period, must not start with 'This is'
// / 'It is' (a filler opening). The shape contract (≤ 20 words / period /
// no-filler) is enforced by depth-rules.ts; the structural contract (non-
// empty statement, anchor.kind in the closed allowlist, anchor.value non-
// empty) is enforced by validate.ts. The film-wide position contract
// (exactly one in every explainer film; sits immediately before the recap)
// lives in the engine's cross-scene validator.
//
// Migrated from `packages/engine/schema/film.schema.json` (the `statement` and
// `anchor` fields on the scene-union branch).

import type {JSONSchema7} from 'json-schema';

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    "big-idea scenes — the single sentence the viewer should leave with. ≤ 20 words, ends with a period, must not start with 'This is' / 'It is' (a filler opening). Pairs the statement with one visual anchor (a glyph, an equation fragment, an image, or a chart fragment). Position contract: exactly one per explainer film, sits immediately before the recap; mutually exclusive with `provocation`.",
  required: ['statement'],
  properties: {
    statement: {
      type: 'string',
      minLength: 1,
      description:
        "the takeaway sentence. ≤ 20 words, ends with a period, must not start with 'This is' / 'It is'. The renderer auto-fits the line — a step-down tier keeps it inside the safe band even at the legal upper bound.",
    },
    anchor: {
      type: 'object',
      description:
        "the visual that lands the statement. `kind` picks the geometry — `glyph` (a typographic mark / symbol), `equation` (a typeset fragment), `image` (a public/figures path, like figure scenes), or `chart-fragment` (a stripped sparkline-style polyline; the value encodes points as 'x1,y1; x2,y2; ...' in [0..1] space). The author picks the kind; the engine owns the pixels.",
      required: ['kind', 'value'],
      properties: {
        kind: {
          enum: ['glyph', 'equation', 'image', 'chart-fragment'],
          description:
            'which anchor geometry to draw. `glyph` — a large typographic mark in the accent ink. `equation` — a typeset fragment inside a small framed panel. `image` — a public/figures path (a bare filename resolves under public/figures/). `chart-fragment` — a decorative polyline from "x1,y1; x2,y2; ..." pairs in [0..1] space.',
        },
        value: {
          type: 'string',
          minLength: 1,
          description:
            'the anchor body. A glyph string (e.g. "∞", "λ"), an equation fragment (e.g. "E = mc²"), an image path (e.g. "decision-tree.png"), or a sparkline pairs string (e.g. "0,0.2; 0.5,0.9; 1,0.4").',
        },
      },
    },
    kicker: {
      type: 'string',
      description: "the section label rendered in the scene chrome (e.g. '07 // THE TAKEAWAY').",
    },
    heading: {
      type: 'string',
      description: 'the scene heading drawn beneath the kicker.',
    },
  },
};

export default schema;
