// depth-rules — the AR-mode-only depth contract for prior-art.
//
// MIGRATED from `packages/engine/cli/depthcheck.ts` (v2.5.x) — the
// `if (isAr(spec)) { const priorArt = spec.scenes.find(... 'prior-art') ...}`
// block. Behaviour preserved: same rule ids, same labels, same regex.
//
// Two scene-scoped rules (run on every `prior-art` scene; the engine's
// depthcheck aggregator dispatches by `scope: 'scene'`):
//   - `novelty-dimension`  — the novelty rides a real dimension in this scene.
//   - `novelty-dimensional` — the novelty statement is dimensional, not
//                             evaluative ("better"/"wins"/etc.).
//
// AR-mode gating: a non-AR film (an `explainer` or PR) is not arguing
// against a lineage; for those modes the rules return `null` and the
// aggregator surfaces nothing. The gating lives INSIDE each rule (rather
// than at registration time) so the rule is preserved if a future mode
// extension wants to honor it.

import type {DepthRule, Scene} from '@docent/kit';

/**
 * Reject evaluative novelty statements — the trap the brief calls out:
 * "X is better than Y" is a fail; "X is a runtime decision, Y was
 * admission-time" is a pass. The pattern looks for the verdict-shaped
 * vocabulary that betrays an evaluation, not a dimensional difference.
 *
 * Verbatim from `packages/engine/cli/depthcheck.ts`.
 */
const EVALUATIVE_NOVELTY =
  /\b(better|worse|best|worst|inferior|superior|stronger|weaker|faster than|slower than|wins?\b|beats?\b|outperforms?|defeats?|the right (choice|answer)|the wrong (choice|answer))\b/i;

// AR mode — the hyphenated string the cascade emits. A non-AR film is not
// arguing against a lineage, so prior-art depth checks no-op for it.
const isAr = (mode: string | undefined): boolean =>
  /^architecture[- ]review$/i.test((mode ?? '').trim());

/**
 * The novelty rides a real dimension — the row the film argues from is
 * one of its own. A novelty.dimension that doesn't match any of the
 * scene's `dimensions[].id` is the soft trap: the row never lights up
 * because it doesn't exist.
 */
const noveltyDimension: DepthRule<Scene> = {
  id: 'novelty-dimension',
  description:
    'The novelty rides a real dimension — the row the film argues from is one of its own',
  severity: 'error',
  scope: 'scene',
  check(scene, ctx) {
    // The mode lives on `meta.prompt` in v2.5.x; in v3 it'll likely move to
    // `meta.mode` but the legacy field is what the existing depthcheck
    // reads. We honor whichever is set.
    const mode =
      (ctx.filmSpec.meta as {prompt?: string; mode?: string}).prompt ??
      ctx.filmSpec.meta.mode;
    if (!isAr(mode)) return null;
    const sc = scene as unknown as Record<string, unknown>;
    if (sc.type !== 'prior-art') return null;

    const dimensions = Array.isArray(sc.dimensions)
      ? (sc.dimensions as Array<{id?: unknown}>)
      : [];
    const dimensionIds = dimensions
      .map((d) => d.id)
      .filter((id): id is string => typeof id === 'string');
    const novelty = sc.novelty as {dimension?: unknown} | undefined;
    const noveltyDim = novelty?.dimension;
    const noveltyInDims =
      typeof noveltyDim === 'string' && dimensionIds.includes(noveltyDim);

    if (noveltyInDims) return null;
    return {
      ruleId: 'novelty-dimension',
      path: `scenes[${ctx.sceneIndex ?? '?'}].novelty.dimension`,
      severity: 'error',
      message:
        typeof noveltyDim === 'string'
          ? `novelty.dimension "${noveltyDim}" is not among the scene's dimensions [${dimensionIds.join(', ') || '(none)'}]`
          : `novelty.dimension "(unset)" is not among the scene's dimensions [${dimensionIds.join(', ') || '(none)'}]`,
    };
  },
};

/**
 * The novelty statement is dimensional, not evaluative — what was traded,
 * not what is "better". An evaluative novelty ("X beats Y", "X wins") is
 * the failure mode the brief explicitly calls out: it admires the subject
 * instead of placing it.
 */
const noveltyDimensional: DepthRule<Scene> = {
  id: 'novelty-dimensional',
  description:
    'The novelty statement is dimensional, not evaluative — what was traded, not what is "better"',
  severity: 'error',
  scope: 'scene',
  check(scene, ctx) {
    const mode =
      (ctx.filmSpec.meta as {prompt?: string; mode?: string}).prompt ??
      ctx.filmSpec.meta.mode;
    if (!isAr(mode)) return null;
    const sc = scene as unknown as Record<string, unknown>;
    if (sc.type !== 'prior-art') return null;

    const novelty = sc.novelty as {statement?: unknown} | undefined;
    const statement =
      typeof novelty?.statement === 'string' ? novelty.statement : '';
    const trimmed = statement.trim();
    const evaluative = EVALUATIVE_NOVELTY.test(statement);

    if (trimmed && !evaluative) return null;
    return {
      ruleId: 'novelty-dimensional',
      path: `scenes[${ctx.sceneIndex ?? '?'}].novelty.statement`,
      severity: 'error',
      message: !trimmed
        ? 'novelty.statement is empty'
        : `novelty reads as evaluative ("better"/"wins"/etc.) — restate as a trade-off: "X is a runtime decision; Y was admission-time"`,
    };
  },
};

export const depthRules: ReadonlyArray<DepthRule<Scene>> = [
  noveltyDimension,
  noveltyDimensional,
];
