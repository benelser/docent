// JSON Schema fragment for the `tree` scene's per-type spec branch.
//
// Contributed to the computed film schema by the tree plugin. The kit
// assembles the discriminated-union film schema at `Engine.schema()` call
// time from each registered ScenePlugin's `schema` field — there is no
// hand-written film schema after the rip-and-replace.
//
// The tree scene is the *classification* shape: a rooted hierarchy where
// depth carries meaning (kingdom→phylum→class, model→toolset→orchestrator,
// org-chart parent→child). The schema declares the root node shape and
// flags `children` as a recursive array of the same; the per-scene
// structural validator (see ./validate.ts) walks the recursion to enforce
// depth ≤ 5 levels, ≤ 30 nodes, and id uniqueness — graph-shape
// invariants JSON Schema can't express.
//
// Note on recursion: the kit's schema composer (`from-registry.ts`)
// shallow-merges this fragment into each scene-type branch of the
// top-level film schema. A `definitions`/`$ref` self-reference inside a
// scene-branch's schema would resolve against the composed top-level
// schema, not against this fragment, so we deliberately do NOT use
// `$ref`. Instead `root.properties.children` is declared with `items` as
// an open-shape `{type: 'object', additionalProperties: true}` — the
// structural validator does the deep checking.

import type {JSONSchema7} from 'json-schema';

// One level of node-shape constraints. JSON Schema enforces the leaf
// shape (id/label string-ness, sub/accent typing); the recursive `walk`
// in ./validate.ts enforces the graph-shape invariants (depth ceiling,
// node-count ceiling, id uniqueness) at every level.
const nodeShape: JSONSchema7 = {
  type: 'object',
  required: ['id', 'label'],
  properties: {
    id: {
      type: 'string',
      minLength: 1,
      description:
        "the node's stable id — used by beat `reveal` arrays, beat `focus`, and by edge auto-reveal. Must be unique across the entire tree.",
    },
    label: {
      type: 'string',
      minLength: 1,
      description: "the node's primary line — the headline drawn in the card.",
    },
    sub: {
      type: 'string',
      description:
        'optional secondary line drawn beneath the label — 2-line clamped subtitle for type, role, or quantity.',
    },
    accent: {
      type: 'string',
      enum: ['blue', 'cyan', 'green', 'amber', 'rose', 'violet'],
      description:
        "optional per-node accent key. Overrides the scene-spread default so one branch reads in a different colour.",
    },
    children: {
      type: 'array',
      description:
        'the recursive child list. A node with no children is a leaf; a node with children is an interior level. Items are tree-nodes (same shape as the root). The structural validator walks the recursion to check id uniqueness, depth ≤ 5, and node count ≤ 30.',
      // Open shape on the recursive item — the per-scene validator owns
      // the deep walk; the composer would not resolve a $ref correctly
      // here. additionalProperties: true so the embed slot survives.
      items: {type: 'object', additionalProperties: true},
    },
    embed: {
      type: 'object',
      description:
        'Sprint B compositional grammar — a static embedded scene rendered next to the node tile. Allowlisted to tree (recursive), compare, quantities. The root cannot carry an embed (the root is the tree spine). The renderer places the embed opposite the depth-axis growth direction: above the card in vertical trees, left of the card in horizontal trees.',
      additionalProperties: true,
    },
  },
  additionalProperties: true,
};

export const schema: JSONSchema7 = {
  type: 'object',
  description:
    'tree scenes — a rooted hierarchy where depth encodes a classification axis. The renderer walks the `root` and its `children` recursively, using a Reingold–Tilford-style placement so each interior node centres over its subtree. `orientation` picks the depth axis: `vertical` (root at top, growing downward — the org-chart shape) or `horizontal` (root at left, growing rightward — the taxonomy shape). Beat `reveal` arrays name node ids; edges to children auto-reveal with their child. Depth ≤ 5 levels and node count ≤ 30 are hard ceilings the structural validator enforces (the renderer cannot fit a wider/deeper tree legibly).',
  required: ['root'],
  properties: {
    root: {
      ...nodeShape,
      description:
        'the root node of the hierarchy — the top of the org chart, the trunk of the taxonomy. Required. The root must carry at least one child (a single node is not a hierarchy). The root cannot carry an `embed` (an embed inside the spine would collide with the chrome).',
    },
    orientation: {
      type: 'string',
      enum: ['vertical', 'horizontal'],
      description:
        "`vertical` (default) puts the root at the top and grows downward — the org-chart shape. `horizontal` puts the root at the left and grows rightward — the taxonomy shape.",
    },
    kicker: {
      type: 'string',
      description: "the section label rendered in the scene chrome (e.g. '03 // THE TAXONOMY').",
    },
    heading: {
      type: 'string',
      description: 'the scene heading drawn beneath the kicker.',
    },
  },
};

export default schema;
