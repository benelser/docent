// Per-scene structural validator for `tension`.
//
// Ported behaviorally from the `tension` line in
// packages/engine/cli/validate.ts (line 2531):
//
//   tension: () => (
//     arrLen(sc.nodes) < 1
//       ? 'tension requires at least 1 node (chosen/rejected/risk)'
//       : null
//   )
//
// The hard contract is one: there must be at least one node. The renderer
// lays whatever it gets — a CHOSEN-only scene, a CHOSEN-vs-REJECTED scene, a
// CHOSEN-with-RISKS band, or all three — into the ledger; the lane is
// decided by each node's `kind` (`risk` | `rejected` | absent).
//
// We additionally surface a warning when a node's `kind` is set to anything
// outside the closed `{'risk', 'rejected'}` set — the v2.5.x renderer treats
// any unknown kind as `chosen` (because `laneOf` only branches on the two
// named values), but a typo like `kind: 'rejcted'` should not silently
// promote a card into the wrong lane.

import type {Scene, SceneIssue, SceneValidationContext} from '@docent/kit';

/**
 * One ledger item. `kind` decides the lane:
 *   - 'rejected' — right column, strikethrough, ✕ mark
 *   - 'risk'     — bottom band, rose ink, ! mark
 *   - absent     — left column (the CHOSEN path), accent ink, ◆ mark
 */
export interface TensionNode {
  id: string;
  label: string;
  sub?: string;
  tag?: string;
  col?: number;
  row?: number;
  accent?: string;
  emphasis?: boolean;
  weight?: 'hero' | 'primary' | 'normal' | 'recede';
  wide?: boolean;
  kind?: 'risk' | 'rejected';
}

/** The tension scene's per-type spec branch. */
export interface TensionScene extends Scene {
  type: 'tension';
  kicker?: string;
  heading?: string;
  nodes?: TensionNode[];
  grid?: {cols?: number; rows?: number};
}

const KNOWN_KINDS = new Set<string>(['risk', 'rejected']);

export const validate = (
  scene: TensionScene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = `scenes[${ctx.sceneIndex}]`;

  const nodes = Array.isArray(scene.nodes) ? scene.nodes : [];

  // The single v2.5.x hard contract: at least one node. The renderer needs
  // *something* in the ledger — an empty tension scene is a blank canvas
  // with column headers.
  if (nodes.length < 1) {
    issues.push({
      path: `${at}.nodes`,
      severity: 'error',
      message:
        'tension requires at least 1 node (chosen/rejected/risk)',
      code: 'tension/missing-nodes',
    });
    return issues;
  }

  // Belt-and-braces — flag nodes with an unrecognised `kind`. The renderer
  // silently treats unknown kinds as CHOSEN; we surface the typo so the
  // author doesn't ship a misfiled card.
  nodes.forEach((n, i) => {
    if (n == null || typeof n !== 'object') {
      issues.push({
        path: `${at}.nodes[${i}]`,
        severity: 'error',
        message: 'node must be an object {id, label, kind?}',
        code: 'tension/bad-node',
      });
      return;
    }
    if (typeof n.id !== 'string' || !n.id.trim()) {
      issues.push({
        path: `${at}.nodes[${i}].id`,
        severity: 'error',
        message: 'node requires a non-empty string `id`',
        code: 'tension/missing-id',
      });
    }
    if (typeof n.label !== 'string' || !n.label.trim()) {
      issues.push({
        path: `${at}.nodes[${i}].label`,
        severity: 'error',
        message: 'node requires a non-empty string `label`',
        code: 'tension/missing-label',
      });
    }
    if (n.kind !== undefined && !KNOWN_KINDS.has(n.kind as string)) {
      issues.push({
        path: `${at}.nodes[${i}].kind`,
        severity: 'warning',
        message: `tension node \`kind\` should be 'risk' or 'rejected' (or omitted for the CHOSEN lane); got ${JSON.stringify(n.kind)} — the renderer will treat this card as CHOSEN`,
        code: 'tension/unknown-kind',
      });
    }
  });

  return issues;
};

export default validate;
