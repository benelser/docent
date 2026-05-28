// validate — per-scene structural validation for prior-art.
//
// MIGRATED from `packages/engine/cli/validate.ts` (v2.5.x) — the
// `sc.type === 'prior-art'` block. Behaviour preserved: same hard-fail
// conditions, same error messages.
//
// Per the strategy doc §4.2: each ScenePlugin owns its structural
// validator; the engine's `validate()` aggregates issues across all
// registered plugins. The per-type block that used to live in the
// monolithic engine validator becomes THIS function — keyed off the
// scene's `type === 'prior-art'`.
//
// The film-level position contracts (exactly one prior-art scene, sitting
// immediately after the frame and before the first structure, in AR-mode
// films) live at the film-level checker, not here.

import type {Scene, SceneIssue, SceneValidationContext} from '@bjelser/kit';

/**
 * Validate a `prior-art` scene structurally. The kit handles common-shell
 * fields (`type`, `kicker`, `heading`, `beats`); this checks the per-type
 * fields the plugin's schema carries: systems, dimensions, cells, novelty.
 *
 * HARD-FAIL contracts (verbatim from the engine validator):
 *   - 2-4 systems with unique non-empty ids and labels.
 *   - 2-4 dimensions with unique non-empty ids and labels.
 *   - cells reference real (system, dimension) ids — orphan cells fail.
 *   - mark ∈ {'same', 'diverges'}; note is a non-empty string.
 *   - every system has at least one `diverges` cell — a system that's
 *     "same" on every dimension isn't prior art, it's the same system.
 *   - novelty is required, with `kind: 'prior-art'`, a dimension id that
 *     exists in the scene's dimensions, and a non-empty statement.
 */
export const validate = (
  scene: Scene,
  ctx: SceneValidationContext,
): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  const at = ``;
  // The kit hands us a plain `Scene` (open shape); narrow per-type fields
  // through a record cast — every read is shape-checked locally.
  const sc = scene as unknown as Record<string, unknown>;

  // ---- systems ------------------------------------------------------------
  const systemIds = new Set<string>();
  if (
    !Array.isArray(sc.systems) ||
    sc.systems.length < 2 ||
    sc.systems.length > 4
  ) {
    issues.push({
      path: `${at}.systems`,
      message:
        'prior-art requires 2-4 systems (the columns of the comparison)',
      severity: 'error',
    });
  } else {
    sc.systems.forEach((rawP: unknown, k: number) => {
      const pAt = `${at}.systems[${k}]`;
      if (!rawP || typeof rawP !== 'object') {
        issues.push({
          path: pAt,
          message: 'system must be an object {id, label, sub?, year?}',
          severity: 'error',
        });
        return;
      }
      const p = rawP as Record<string, unknown>;
      if (typeof p.id !== 'string' || !p.id.trim()) {
        issues.push({
          path: `${pAt}.id`,
          message: 'missing or empty string',
          severity: 'error',
        });
      } else if (systemIds.has(p.id)) {
        issues.push({
          path: `${pAt}.id`,
          message: `duplicate system id "${p.id}"`,
          severity: 'error',
        });
      } else {
        systemIds.add(p.id);
      }
      if (typeof p.label !== 'string' || !p.label.trim()) {
        issues.push({
          path: `${pAt}.label`,
          message: 'missing or empty string',
          severity: 'error',
        });
      }
      if (p.sub !== undefined && (typeof p.sub !== 'string' || !p.sub.trim())) {
        issues.push({
          path: `${pAt}.sub`,
          message: 'sub must be a non-empty string when present',
          severity: 'error',
        });
      }
      if (p.year !== undefined && (typeof p.year !== 'string' || !p.year.trim())) {
        issues.push({
          path: `${pAt}.year`,
          message: 'year must be a non-empty string when present',
          severity: 'error',
        });
      }
    });
  }

  // ---- dimensions ---------------------------------------------------------
  const dimensionIds = new Set<string>();
  if (
    !Array.isArray(sc.dimensions) ||
    sc.dimensions.length < 2 ||
    sc.dimensions.length > 4
  ) {
    issues.push({
      path: `${at}.dimensions`,
      message:
        'prior-art requires 2-4 dimensions (the rows of the comparison)',
      severity: 'error',
    });
  } else {
    sc.dimensions.forEach((rawD: unknown, k: number) => {
      const dAt = `${at}.dimensions[${k}]`;
      if (!rawD || typeof rawD !== 'object') {
        issues.push({
          path: dAt,
          message: 'dimension must be an object {id, label}',
          severity: 'error',
        });
        return;
      }
      const d = rawD as Record<string, unknown>;
      if (typeof d.id !== 'string' || !d.id.trim()) {
        issues.push({
          path: `${dAt}.id`,
          message: 'missing or empty string',
          severity: 'error',
        });
      } else if (dimensionIds.has(d.id)) {
        issues.push({
          path: `${dAt}.id`,
          message: `duplicate dimension id "${d.id}"`,
          severity: 'error',
        });
      } else {
        dimensionIds.add(d.id);
      }
      if (typeof d.label !== 'string' || !d.label.trim()) {
        issues.push({
          path: `${dAt}.label`,
          message: 'missing or empty string',
          severity: 'error',
        });
      }
    });
  }

  // ---- cells --------------------------------------------------------------
  // Every cell must reference a real (system, dimension) pair.
  const divergesBySystem = new Map<string, number>();
  if (sc.cells === undefined || !Array.isArray(sc.cells)) {
    issues.push({
      path: `${at}.cells`,
      message: 'prior-art requires a cells array',
      severity: 'error',
    });
  } else {
    sc.cells.forEach((rawC: unknown, k: number) => {
      const cAt = `${at}.cells[${k}]`;
      if (!rawC || typeof rawC !== 'object') {
        issues.push({
          path: cAt,
          message: 'cell must be an object {system, dimension, mark, note}',
          severity: 'error',
        });
        return;
      }
      const c = rawC as Record<string, unknown>;
      if (typeof c.system !== 'string' || !c.system.trim()) {
        issues.push({
          path: `${cAt}.system`,
          message: 'missing or empty system id',
          severity: 'error',
        });
      } else if (!systemIds.has(c.system)) {
        issues.push({
          path: `${cAt}.system`,
          message: `orphan cell — system "${c.system}" is not a system in this scene`,
          severity: 'error',
        });
      }
      if (typeof c.dimension !== 'string' || !c.dimension.trim()) {
        issues.push({
          path: `${cAt}.dimension`,
          message: 'missing or empty dimension id',
          severity: 'error',
        });
      } else if (!dimensionIds.has(c.dimension)) {
        issues.push({
          path: `${cAt}.dimension`,
          message: `orphan cell — dimension "${c.dimension}" is not a dimension in this scene`,
          severity: 'error',
        });
      }
      if (c.mark !== 'same' && c.mark !== 'diverges') {
        issues.push({
          path: `${cAt}.mark`,
          message: 'mark must be "same" or "diverges"',
          severity: 'error',
        });
      }
      if (typeof c.note !== 'string' || !c.note.trim()) {
        issues.push({
          path: `${cAt}.note`,
          message: 'missing or empty string',
          severity: 'error',
        });
      }
      if (c.mark === 'diverges' && typeof c.system === 'string') {
        divergesBySystem.set(
          c.system,
          (divergesBySystem.get(c.system) ?? 0) + 1,
        );
      }
    });
  }

  // Every system needs at least one `diverges` cell — a system that's
  // "same" on every dimension isn't prior art, it's the same system. The
  // table would make no claim against it.
  for (const sid of systemIds) {
    if ((divergesBySystem.get(sid) ?? 0) === 0) {
      issues.push({
        path: `${at}.cells`,
        message: `system "${sid}" has no diverges cell — a prior system that's "same" on every dimension is the same system, not prior art`,
        severity: 'error',
      });
    }
  }

  // ---- novelty ------------------------------------------------------------
  // `kind: 'prior-art'` is the discriminator that narrows `Scene.novelty`
  // from the widened `PriorArtNovelty | VennNovelty` union at the renderer.
  if (!sc.novelty || typeof sc.novelty !== 'object') {
    issues.push({
      path: `${at}.novelty`,
      message:
        'prior-art requires a novelty {kind: "prior-art", dimension, statement}',
      severity: 'error',
    });
  } else {
    const nv = sc.novelty as Record<string, unknown>;
    if (nv.kind !== 'prior-art') {
      issues.push({
        path: `${at}.novelty.kind`,
        message:
          'prior-art scene requires `novelty.kind: "prior-art"` (the discriminator that narrows the union)',
        severity: 'error',
      });
    }
    if (typeof nv.dimension !== 'string' || !nv.dimension.trim()) {
      issues.push({
        path: `${at}.novelty.dimension`,
        message: 'missing or empty dimension id',
        severity: 'error',
      });
    } else if (!dimensionIds.has(nv.dimension)) {
      issues.push({
        path: `${at}.novelty.dimension`,
        message: `novelty references dimension "${nv.dimension}", which is not a dimension in this scene`,
        severity: 'error',
      });
    }
    if (typeof nv.statement !== 'string' || !nv.statement.trim()) {
      issues.push({
        path: `${at}.novelty.statement`,
        message: 'missing or empty statement',
        severity: 'error',
      });
    }
  }

  return issues;
};
