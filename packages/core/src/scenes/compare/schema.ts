// JSON Schema fragment for the `compare` scene's per-type spec branch.
//
// Contributed to the computed film schema by the compare plugin. The kit
// assembles the discriminated-union film schema at `Engine.schema()` call
// time from each registered ScenePlugin's `schema` field — there is no
// hand-written film schema after the rip-and-replace.
//
// compare is a judgement table: options across the top (columns),
// criteria down the left gutter (rows), cells in the grid. A `win` cell
// is accent-tinted, a `lose` cell is dimmed, `neutral` (or undefined) is
// the default. Rows reveal top-to-bottom via the `reveal: <count>` beat
// directive (numeric reveal); a beat's `focus: [rowId]` spotlights one
// row by id and dims the others.
//
// Sprint B (compositional grammar): a cell may carry an `embed` — a
// static sub-scene tableau rendered inside the cell tile. The compare
// host's embed allowlist is {quantities, chart, venn} (enforced by the
// engine-wide embed validator; we restate it here as a description for
// IDE completion).
//
// Ported from packages/engine/schema/film.schema.json's `compare-column`,
// `compare-row`, and `compare-cell` $defs (plus the parent scene's
// `columns` / `rows` properties).

import type {JSONSchema7} from 'json-schema';

const compareColumn: JSONSchema7 = {
  type: 'object',
  description:
    'compare scenes — one column header (an option being judged). `sub` is an optional one-line gloss drawn under the column label in mono.',
  required: ['id', 'label'],
  additionalProperties: false,
  properties: {
    id: {type: 'string', description: 'unique within the scene; beats reference this column by id'},
    label: {type: 'string'},
    sub: {type: 'string', description: 'one-line gloss under the column label'},
  },
};

const compareCell: JSONSchema7 = {
  type: 'object',
  description:
    'compare scenes — one cell in the judgement table. `verdict: win` accent-tints the cell with a check glyph; `verdict: lose` dims it; `neutral` (or undefined) is the default. Sprint B: `embed` (optional) attaches a static sub-scene tableau rendered inside the cell tile; the allowlist is quantities | chart | venn.',
  required: ['text'],
  additionalProperties: false,
  properties: {
    text: {type: 'string', description: 'the cell\'s body — what this option says against this criterion'},
    verdict: {enum: ['win', 'lose', 'neutral']},
    embed: {
      type: 'object',
      description:
        'Sprint B compositional grammar — a static sub-scene tableau attached to this cell. Allowlist: quantities | chart | venn.',
      // The embed shape is the kit-owned `embedded-scene` $def assembled
      // into the computed film schema at Engine.schema() time; we leave
      // it as an open object here (the central allowlist validator
      // enforces type membership cross-scene).
      additionalProperties: true,
    },
  },
};

const compareRow: JSONSchema7 = {
  type: 'object',
  description:
    'compare scenes — one row (a criterion judged across columns). `cells[]` carries one cell per column in declared order; the renderer reads cells positionally.',
  required: ['id', 'label', 'cells'],
  additionalProperties: false,
  properties: {
    id: {type: 'string', description: 'unique within the scene; beats reference this row by id (for `focus`)'},
    label: {type: 'string'},
    cells: {
      type: 'array',
      description: 'one cell per column, in the column order declared on the parent scene',
      items: compareCell,
    },
  },
};

/**
 * The plugin's contributed JSON Schema branch. The kit unions this with
 * every other registered scene plugin's `schema` into the computed film
 * schema. Only compare-specific fields (`columns`, `rows`) are declared
 * here; the common scene fields (`id`, `type`, `beats`, `style`,
 * `kicker`, `heading`, etc.) live in the shared base scene schema the
 * kit owns.
 */
export const schema: JSONSchema7 = {
  type: 'object',
  required: ['type', 'columns', 'rows'],
  properties: {
    type: {const: 'compare'},
    columns: {
      type: 'array',
      description:
        'compare scenes — the options (column headers of the judgement table). At least one column is required.',
      minItems: 1,
      items: compareColumn,
    },
    rows: {
      type: 'array',
      description:
        'compare scenes — the criteria (rows of the judgement table); each row carries one cell per column. At least one row is required.',
      minItems: 1,
      items: compareRow,
    },
    kicker: {
      type: 'string',
      description: "the section label rendered in the scene chrome (e.g. '03 // THE OPTIONS').",
    },
    heading: {
      type: 'string',
      description: 'the scene heading drawn beneath the kicker.',
    },
  },
};

export default schema;
