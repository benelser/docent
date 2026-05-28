// Spec types — the per-scene shape this plugin owns.
//
// These mirror packages/engine/src/engine/spec.ts: Node, Edge, EmbeddedScene,
// Transform — the structure scene's branch of the open spec union. The kit's
// `Scene` and `Beat` carry an open index signature; this file narrows the
// shape the structure plugin reads from it.
//
// Keeping the types colocated keeps the plugin self-contained: a downstream
// consumer (Film.tsx after Phase D, or a third-party engine wrapping these
// plugins) reads `StructureScene` and `StructureNode` straight off this
// scene's index.ts. No engine import needed.

import type {Scene} from '@bjelser/kit';

/**
 * A node's representation — how its content is drawn inside its box. The
 * default `box` is the labelled Card; `matrix`/`vector`/`grid` draw `cells`
 * as a grid of mono cells; `code` draws a small code window; `equation`
 * typesets a mathematical expression.
 */
export type NodeRepr =
  | 'box'
  | 'matrix'
  | 'vector'
  | 'grid'
  | 'code'
  | 'equation';

/**
 * A component box in a structure diagram. The discriminator is the parent
 * scene's `type === 'structure'`; this is the per-node shape the renderer
 * consumes.
 */
export interface StructureNode {
  id: string;
  label: string;
  sub?: string;
  tag?: string;
  col: number;
  row: number;
  accent?: string;
  /** legacy — superseded by `weight: 'hero'`. */
  emphasis?: boolean;
  weight?: 'hero' | 'primary' | 'normal' | 'recede';
  wide?: boolean;
  /** tension scenes: a node can be a flagged risk or a rejected alternative. */
  kind?: 'risk' | 'rejected';
  /** representation — `box` (default) is the Card; others draw cells/code/expr. */
  as?: NodeRepr;
  cells?: (string | number)[][];
  expr?: string;
  /** Sprint B — an embedded sub-scene tableau rendered statically inside the card. */
  embed?: StructureEmbeddedScene;
}

/**
 * An edge between two nodes. `kind` types the relationship the line asserts;
 * `strength` qualifies a `causes` edge — a `necessary` cause is drawn visibly
 * heavier than a `contributing` one.
 */
export interface StructureEdge {
  id: string;
  from: string;
  to: string;
  kind?: 'relation' | 'feedback' | 'entails' | 'causes';
  strength?: 'necessary' | 'contributing';
  label?: string;
}

/**
 * A morph directive — re-binds an existing node to a new definition. The
 * engine eases old→new across the beat that carries the transform: the
 * bounding box tweens continuously, the representations cross-fade. This is
 * cross-beat object identity — a node can *become* something else, the same
 * `id` carrying a redefined geometry and content. `into` is a partial Node:
 * only the fields it names change; everything else inherits.
 */
export interface StructureTransform {
  node: string;
  into: Partial<StructureNode>;
}

/**
 * Sprint B — compositional grammar. An embedded sub-scene rendered statically
 * inside a host node's card. Shape mirrors the engine's `EmbeddedScene`: the
 * Scene shape minus parent-owned chrome (beats, kicker, heading, cut, cam,
 * style) plus an optional caption. Allowlist for the structure host:
 * mechanism | chart | venn.
 */
export interface StructureEmbeddedScene {
  type: string;
  caption?: string;
  // Open shape for the embed body — the renderer reads whichever fields the
  // embed type carries (nodes/edges for structure, parts/motion for
  // mechanism, sets/regions for venn, series/xAxis/yAxis for chart, …).
  [key: string]: unknown;
}

/**
 * The structure scene's branch of the FilmSpec.scenes[] discriminated union.
 * Inherits the kit's `Scene` (id/type/beats/style + the open index signature)
 * and narrows the structure-owned fields.
 */
export interface StructureScene extends Scene {
  type: 'structure';
  kicker?: string;
  heading?: string;
  grid?: {cols: number; rows: number};
  nodes?: StructureNode[];
  edges?: StructureEdge[];
}

/**
 * Per-beat structure directives — the structure-owned fields a beat carries
 * on top of the kit's `Beat` minimum. The kit's `Beat` declares a small set
 * (id, narration, pace, shot, cadence, reveal, set, transform); structure
 * widens `reveal` to `string[]` (the ids it reveals), reuses `focus` (the
 * subset of revealed nodes to spotlight), `pulse` (the flow comets along
 * edges this beat), and re-defines `transform` as the morph directive array.
 */
export interface StructureBeatDirectives {
  reveal?: readonly string[];
  focus?: readonly string[];
  pulse?: ReadonlyArray<[string, string]>;
  transform?: ReadonlyArray<StructureTransform>;
  cadence?: 'cascade' | 'together' | 'snap';
  shot?: 'wide' | 'follow' | 'push' | 'hold';
}
