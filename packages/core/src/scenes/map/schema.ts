// JSON Schema fragment for the `map` scene's per-type spec branch.
//
// Contributed to the computed film schema by the map plugin. The kit
// assembles the discriminated-union film schema at `Engine.schema()` call
// time from each registered ScenePlugin's `schema` field — there is no
// hand-written film schema after the rip-and-replace.
//
// The map scene is the spatial argument: position carries information.
// `layout` picks the mode — `topology` (default) is abstract named blobs
// at normalized 0..1 positions, `grid` is a rectangular grid of labelled
// cells (`gridSize` required). `regions` are the named places, `markers`
// pin labelled points to regions, `connections` draw arcs/lines between
// regions (routes, transmission paths, supply chains).
//
// Mirrors packages/engine/schema/film.schema.json — the map-region,
// map-marker, map-connection $defs are inlined here as the schema fragment
// the plugin contributes. Cross-field invariants (e.g. marker.at must
// reference a real region) live in ./validate.ts, not in JSON Schema.

import type {JSONSchema7} from 'json-schema';

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    'map scenes — a spatial / topological / geographic layout. `layout` picks the mode: `topology` (default) is abstract named blobs at normalized 0..1 positions; `grid` is a rectangular grid of labelled cells. `gridSize` is required only when layout === "grid". `regions` are the named places (2-12), `markers` pin labelled points to regions, `connections` draw arcs/lines between regions (routes, transmission paths, supply chains).',
  required: ['regions'],
  properties: {
    layout: {
      enum: ['topology', 'grid'],
      description:
        'the layout mode. `topology` (default) is abstract named blobs at normalized 0..1 positions; `grid` is a rectangular grid of labelled cells.',
    },
    gridSize: {
      type: 'object',
      description:
        'required when layout is `grid`; the cell-grid the regions snap to.',
      required: ['cols', 'rows'],
      additionalProperties: false,
      properties: {
        cols: {type: 'integer', minimum: 1},
        rows: {type: 'integer', minimum: 1},
      },
    },
    regions: {
      type: 'array',
      minItems: 2,
      maxItems: 12,
      description:
        'the named places (2-12 regions). Position is the argument: for `topology` layout, `pos` is normalized [0..1] (x, y) with optional (w, h); for `grid` layout, `pos.x` and `pos.y` are integer (col, row) on the scene\'s gridSize. `sub` is the per-region annotation that makes the position load-bearing — why this place.',
      items: {
        type: 'object',
        required: ['id', 'label', 'pos'],
        additionalProperties: false,
        properties: {
          id: {type: 'string'},
          label: {type: 'string'},
          sub: {
            type: 'string',
            description:
              "the per-region annotation — what the position MEANS (a role, a trade-off, the place's argument)",
          },
          pos: {
            type: 'object',
            required: ['x', 'y'],
            additionalProperties: false,
            properties: {
              x: {type: 'number'},
              y: {type: 'number'},
              w: {
                type: 'number',
                description:
                  'topology layout — optional normalized width (default ~0.18)',
              },
              h: {
                type: 'number',
                description:
                  'topology layout — optional normalized height (default ~0.18)',
              },
            },
          },
        },
      },
    },
    markers: {
      type: 'array',
      description:
        'labelled points pinned AT regions (cities, hops, sensors). `at` references a region id. `kind` picks the glyph: pin (a teardrop), dot (a circle), flag (a triangle on a stick).',
      items: {
        type: 'object',
        required: ['id', 'at', 'label'],
        additionalProperties: false,
        properties: {
          id: {type: 'string'},
          at: {type: 'string', description: 'a region id'},
          label: {type: 'string'},
          kind: {enum: ['pin', 'dot', 'flag']},
        },
      },
    },
    connections: {
      type: 'array',
      description:
        'lines/arcs between regions (routes, transmission paths, supply chains). `kind` picks the stroke style: route (steady line), transmission (animated dash, the signal in motion), supply (thicker arrowed flow).',
      items: {
        type: 'object',
        required: ['id', 'from', 'to'],
        additionalProperties: false,
        properties: {
          id: {type: 'string'},
          from: {type: 'string', description: 'a region id'},
          to: {type: 'string', description: 'a region id'},
          label: {type: 'string'},
          kind: {enum: ['route', 'transmission', 'supply']},
        },
      },
    },
    kicker: {
      type: 'string',
      description:
        "the section label rendered in the scene chrome (e.g. '03 // THE TOPOLOGY').",
    },
    heading: {
      type: 'string',
      description: 'the scene heading drawn beneath the kicker.',
    },
  },
};

export default schema;
